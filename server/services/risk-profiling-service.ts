/**
 * Risk Profiling Service
 *
 * Manages the full risk profiling lifecycle for Trust OMS Philippines:
 *   - Questionnaire CRUD with maker-checker workflow
 *   - Question / Answer Option / Score Normalization Range management
 *   - Risk Appetite Mapping with bands (maker-checker)
 *   - Asset Allocation Config with lines (maker-checker)
 *   - Risk Score Computation Engine (single-select, multi-select + normalization)
 *   - Customer Risk Assessment (immutable profiles, deviation handling)
 *   - Product Risk Deviation tracking
 *   - Repeat Deviation Escalation (FR-038)
 *   - Cascading Config Validation (FR-040)
 *   - Supervisor Dashboard Data
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, ilike, or, isNull, gt, lt, gte, lte, inArray } from 'drizzle-orm';
import { notificationInboxService } from './notification-inbox-service';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface QuestionScore {
  questionId: number;
  rawScore: number;
  normalizedScore: number;
}

interface ComputedResult {
  totalScore: number;
  riskCategory: string;
  riskCode: number;
  questionScores: QuestionScore[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const riskProfilingService = {
  // ========================================================================
  // 1. Questionnaire CRUD with maker-checker
  // ========================================================================

  async listQuestionnaires(
    entityId: string,
    filters?: {
      search?: string;
      status?: string;
      type?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.questionnaires.entity_id, entityId),
      eq(schema.questionnaires.is_deleted, false),
    ];

    if (filters?.status) {
      conditions.push(eq(schema.questionnaires.authorization_status, filters.status as any));
    }
    if (filters?.type) {
      conditions.push(eq(schema.questionnaires.questionnaire_type, filters.type as any));
    }
    if (filters?.search) {
      const escaped = filters.search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      conditions.push(ilike(schema.questionnaires.questionnaire_name, `%${escaped}%`));
    }

    const rows = await db
      .select()
      .from(schema.questionnaires)
      .where(and(...conditions))
      .orderBy(desc(schema.questionnaires.created_at))
      .limit(pageSize)
      .offset(offset);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.questionnaires)
      .where(and(...conditions));

    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total: countRow?.count ?? 0,
        totalPages: Math.ceil((countRow?.count ?? 0) / pageSize),
      },
    };
  },

  async getQuestionnaire(id: number) {
    const [questionnaire] = await db
      .select()
      .from(schema.questionnaires)
      .where(and(eq(schema.questionnaires.id, id), eq(schema.questionnaires.is_deleted, false)))
      .limit(1);

    if (!questionnaire) throw new Error(`Questionnaire not found: ${id}`);

    // Fetch questions
    const questionRows = await db
      .select()
      .from(schema.questions)
      .where(
        and(
          eq(schema.questions.questionnaire_id, id),
          eq(schema.questions.is_deleted, false),
        ),
      )
      .orderBy(schema.questions.question_number);

    // Fetch answer options and normalization ranges for all questions
    const questionIds = questionRows.map((q: any) => q.id);

    let options: (typeof schema.answerOptions.$inferSelect)[] = [];
    let normRanges: (typeof schema.scoreNormalizationRanges.$inferSelect)[] = [];

    if (questionIds.length > 0) {
      options = await db
        .select()
        .from(schema.answerOptions)
        .where(
          and(
            inArray(schema.answerOptions.question_id, questionIds),
            eq(schema.answerOptions.is_deleted, false),
          ),
        )
        .orderBy(schema.answerOptions.option_number);

      normRanges = await db
        .select()
        .from(schema.scoreNormalizationRanges)
        .where(inArray(schema.scoreNormalizationRanges.question_id, questionIds));
    }

    // Group options / ranges by question
    const questions = questionRows.map((q: any) => ({
      ...q,
      answerOptions: options.filter((o) => o.question_id === q.id),
      scoreNormalizationRanges: normRanges.filter((r) => r.question_id === q.id),
    }));

    return { ...questionnaire, questions };
  },

  async createQuestionnaire(data: {
    questionnaire_name: string;
    customer_category: (typeof schema.customerCategoryEnum.enumValues)[number];
    questionnaire_type: (typeof schema.questionnaireTypeEnum.enumValues)[number];
    effective_start_date: string;
    effective_end_date: string;
    valid_period_years?: number;
    is_score?: boolean;
    warning_text?: string;
    acknowledgement_text?: string;
    disclaimer_text?: string;
    entity_id: string;
    maker_id: number;
  }) {
    // --- Input validation ---
    if (!data.questionnaire_name || data.questionnaire_name.trim().length < 3) {
      throw new Error('questionnaire_name must be at least 3 characters');
    }

    const today = new Date().toISOString().slice(0, 10);
    if (data.effective_start_date < today) {
      throw new Error(`effective_start_date must be >= today (${today})`);
    }
    if (data.effective_end_date <= data.effective_start_date) {
      throw new Error('effective_end_date must be after effective_start_date');
    }

    const validPeriod = data.valid_period_years ?? 2;
    if (validPeriod < 1 || validPeriod > 10) {
      throw new Error('valid_period_years must be between 1 and 10');
    }

    // Uniqueness / overlap check (FR-002.BR1 — G-003)
    const overlapping = await db
      .select({ id: schema.questionnaires.id })
      .from(schema.questionnaires)
      .where(
        and(
          eq(schema.questionnaires.entity_id, data.entity_id),
          eq(schema.questionnaires.customer_category, data.customer_category),
          eq(schema.questionnaires.questionnaire_type, data.questionnaire_type),
          eq(schema.questionnaires.is_deleted, false),
          lte(schema.questionnaires.effective_start_date, data.effective_end_date),
          gte(schema.questionnaires.effective_end_date, data.effective_start_date),
        ),
      )
      .limit(1);

    if (overlapping.length > 0) {
      const err = new Error(
        'A questionnaire with the same entity, category, and type already exists for the overlapping date range',
      );
      (err as any).status = 409;
      (err as any).code = 'DUPLICATE_QUESTIONNAIRE';
      throw err;
    }

    const [inserted] = await db
      .insert(schema.questionnaires)
      .values({
        questionnaire_name: data.questionnaire_name,
        customer_category: data.customer_category,
        questionnaire_type: data.questionnaire_type,
        effective_start_date: data.effective_start_date,
        effective_end_date: data.effective_end_date,
        valid_period_years: data.valid_period_years ?? 2,
        is_score: data.is_score ?? false,
        warning_text: data.warning_text ?? null,
        acknowledgement_text: data.acknowledgement_text ?? null,
        disclaimer_text: data.disclaimer_text ?? null,
        authorization_status: 'UNAUTHORIZED',
        entity_id: data.entity_id,
        maker_id: data.maker_id,
        created_by: String(data.maker_id),
        updated_by: String(data.maker_id),
      })
      .returning();

    return inserted;
  },

  async updateQuestionnaire(
    id: number,
    data: Partial<{
      questionnaire_name: string;
      customer_category: (typeof schema.customerCategoryEnum.enumValues)[number];
      questionnaire_type: (typeof schema.questionnaireTypeEnum.enumValues)[number];
      effective_start_date: string;
      effective_end_date: string;
      valid_period_years: number;
      is_score: boolean;
      warning_text: string;
      acknowledgement_text: string;
      disclaimer_text: string;
      updated_by: string;
      version: number;
    }>,
  ) {
    const expectedVersion = data.version;
    if (expectedVersion == null) {
      const err = new Error('version field is required for optimistic locking');
      (err as any).code = 'VERSION_CONFLICT';
      throw err;
    }

    const { version: _v, ...updateFields } = data;

    const [existing] = await db
      .select()
      .from(schema.questionnaires)
      .where(and(eq(schema.questionnaires.id, id), eq(schema.questionnaires.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Questionnaire not found: ${id}`);

    // Status guard: cannot edit AUTHORIZED or REJECTED questionnaires (FR-003)
    if (existing.authorization_status === 'AUTHORIZED' || existing.authorization_status === 'REJECTED') {
      const err = new Error(`Cannot edit questionnaire in ${existing.authorization_status} status`);
      (err as any).status = 422;
      (err as any).code = 'INVALID_STATUS';
      throw err;
    }

    // Uniqueness / overlap check for new dates (FR-002.BR1)
    const newStart = updateFields.effective_start_date ?? existing.effective_start_date;
    const newEnd = updateFields.effective_end_date ?? existing.effective_end_date;
    if (updateFields.effective_start_date || updateFields.effective_end_date) {
      const overlapping = await db
        .select({ id: schema.questionnaires.id })
        .from(schema.questionnaires)
        .where(
          and(
            eq(schema.questionnaires.entity_id, existing.entity_id),
            eq(schema.questionnaires.customer_category, existing.customer_category),
            eq(schema.questionnaires.questionnaire_type, existing.questionnaire_type),
            eq(schema.questionnaires.is_deleted, false),
            sql`${schema.questionnaires.id} != ${id}`,
            lte(schema.questionnaires.effective_start_date, newEnd),
            gte(schema.questionnaires.effective_end_date, newStart),
          ),
        )
        .limit(1);

      if (overlapping.length > 0) {
        const err = new Error(
          'Updated date range overlaps with an existing questionnaire of the same entity, category, and type',
        );
        (err as any).status = 409;
        (err as any).code = 'DUPLICATE_QUESTIONNAIRE';
        throw err;
      }
    }

    const [updated] = await db
      .update(schema.questionnaires)
      .set({
        ...updateFields,
        authorization_status: 'MODIFIED',
        version: existing.version + 1,
        updated_at: new Date(),
        checker_id: null,
        authorized_at: null,
      })
      .where(
        and(
          eq(schema.questionnaires.id, id),
          eq(schema.questionnaires.version, expectedVersion),
        ),
      )
      .returning();

    if (!updated) {
      const err = new Error(
        `Questionnaire ${id} has been modified by another user. Expected version ${expectedVersion} but found ${existing.version}.`,
      );
      (err as any).code = 'VERSION_CONFLICT';
      throw err;
    }

    return updated;
  },

  async authorizeQuestionnaire(id: number, checkerId: number) {
    const [existing] = await db
      .select()
      .from(schema.questionnaires)
      .where(and(eq(schema.questionnaires.id, id), eq(schema.questionnaires.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Questionnaire not found: ${id}`);
    if (existing.authorization_status === 'AUTHORIZED') {
      throw new Error('Questionnaire is already authorized');
    }
    if (existing.maker_id === checkerId) {
      throw new Error('Maker and checker must be different users');
    }

    const [updated] = await db
      .update(schema.questionnaires)
      .set({
        authorization_status: 'AUTHORIZED',
        checker_id: checkerId,
        authorized_at: new Date(),
        updated_by: String(checkerId),
        updated_at: new Date(),
      })
      .where(eq(schema.questionnaires.id, id))
      .returning();

    // AC-6: Notify the maker on authorization
    if (existing.maker_id) {
      await notificationInboxService.notify({
        recipient_user_id: existing.maker_id,
        type: 'QUESTIONNAIRE_AUTHORIZED',
        title: 'Questionnaire Authorized',
        message: `Questionnaire "${existing.questionnaire_name ?? id}" has been authorized by checker ${checkerId}.`,
        channel: 'IN_APP',
        related_entity_type: 'questionnaire',
        related_entity_id: id,
      });
    }

    return updated;
  },

  async rejectQuestionnaire(id: number, checkerId: number, rejectionReason?: string) {
    const [existing] = await db
      .select()
      .from(schema.questionnaires)
      .where(and(eq(schema.questionnaires.id, id), eq(schema.questionnaires.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Questionnaire not found: ${id}`);
    if (existing.maker_id === checkerId) {
      throw new Error('Maker and checker must be different users');
    }

    const [updated] = await db
      .update(schema.questionnaires)
      .set({
        authorization_status: 'REJECTED',
        checker_id: checkerId,
        updated_by: String(checkerId),
        updated_at: new Date(),
        rejection_reason: rejectionReason ?? null,
      } as any)
      .where(eq(schema.questionnaires.id, id))
      .returning();

    // AC-6: Notify the maker on rejection
    if (existing.maker_id) {
      await notificationInboxService.notify({
        recipient_user_id: existing.maker_id,
        type: 'QUESTIONNAIRE_REJECTED',
        title: 'Questionnaire Rejected',
        message: `Questionnaire "${existing.questionnaire_name ?? id}" has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
        channel: 'IN_APP',
        related_entity_type: 'questionnaire',
        related_entity_id: id,
      });
    }

    return updated;
  },

  async deleteQuestionnaire(id: number) {
    const [existing] = await db
      .select()
      .from(schema.questionnaires)
      .where(and(eq(schema.questionnaires.id, id), eq(schema.questionnaires.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Questionnaire not found: ${id}`);
    if (existing.authorization_status === 'AUTHORIZED') {
      const err = new Error('Cannot delete an AUTHORIZED questionnaire');
      (err as any).status = 422;
      (err as any).code = 'INVALID_STATUS';
      throw err;
    }

    const [updated] = await db
      .update(schema.questionnaires)
      .set({
        is_deleted: true,
        updated_at: new Date(),
      })
      .where(eq(schema.questionnaires.id, id))
      .returning();

    if (!updated) throw new Error(`Questionnaire not found: ${id}`);
    return updated;
  },

  // ========================================================================
  // 2. Question / Option CRUD
  // ========================================================================

  async addQuestion(
    questionnaireId: number,
    data: {
      question_description: string;
      is_mandatory?: boolean;
      is_multi_select?: boolean;
      scoring_type?: (typeof schema.scoringTypeEnum.enumValues)[number];
      computation_type?: (typeof schema.computationTypeEnum.enumValues)[number];
      created_by?: string;
    },
  ) {
    // Auto-increment question_number
    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${schema.questions.question_number}), 0)` })
      .from(schema.questions)
      .where(
        and(
          eq(schema.questions.questionnaire_id, questionnaireId),
          eq(schema.questions.is_deleted, false),
        ),
      );

    const nextNumber = (maxRow?.max ?? 0) + 1;

    // Auto-set scoring_type to NONE for non-multi-select questions (FR-007.BR1)
    const scoringType = (data.is_multi_select ?? false) ? (data.scoring_type ?? 'NONE') : 'NONE';

    const [inserted] = await db
      .insert(schema.questions)
      .values({
        questionnaire_id: questionnaireId,
        question_number: nextNumber,
        question_description: data.question_description,
        is_mandatory: data.is_mandatory ?? true,
        is_multi_select: data.is_multi_select ?? false,
        scoring_type: scoringType,
        computation_type: data.computation_type ?? 'NONE',
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return inserted;
  },

  async updateQuestion(
    id: number,
    data: Partial<{
      question_description: string;
      is_mandatory: boolean;
      is_multi_select: boolean;
      scoring_type: (typeof schema.scoringTypeEnum.enumValues)[number];
      computation_type: (typeof schema.computationTypeEnum.enumValues)[number];
      updated_by: string;
    }>,
  ) {
    const [updated] = await db
      .update(schema.questions)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(and(eq(schema.questions.id, id), eq(schema.questions.is_deleted, false)))
      .returning();

    if (!updated) throw new Error(`Question not found: ${id}`);
    return updated;
  },

  async deleteQuestion(id: number) {
    const [updated] = await db
      .update(schema.questions)
      .set({ is_deleted: true, updated_at: new Date() })
      .where(eq(schema.questions.id, id))
      .returning();

    if (!updated) throw new Error(`Question not found: ${id}`);
    return updated;
  },

  async addAnswerOption(
    questionId: number,
    data: {
      answer_description: string;
      weightage?: string;
      created_by?: string;
    },
  ) {
    // Auto-increment option_number
    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${schema.answerOptions.option_number}), 0)` })
      .from(schema.answerOptions)
      .where(
        and(
          eq(schema.answerOptions.question_id, questionId),
          eq(schema.answerOptions.is_deleted, false),
        ),
      );

    const nextNumber = (maxRow?.max ?? 0) + 1;

    const [inserted] = await db
      .insert(schema.answerOptions)
      .values({
        question_id: questionId,
        option_number: nextNumber,
        answer_description: data.answer_description,
        weightage: data.weightage ?? '0',
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return inserted;
  },

  async updateAnswerOption(
    id: number,
    data: Partial<{
      answer_description: string;
      weightage: string;
      updated_by: string;
    }>,
  ) {
    const [updated] = await db
      .update(schema.answerOptions)
      .set({ ...data, updated_at: new Date() })
      .where(and(eq(schema.answerOptions.id, id), eq(schema.answerOptions.is_deleted, false)))
      .returning();

    if (!updated) throw new Error(`Answer option not found: ${id}`);
    return updated;
  },

  async deleteAnswerOption(id: number) {
    const [updated] = await db
      .update(schema.answerOptions)
      .set({ is_deleted: true, updated_at: new Date() })
      .where(eq(schema.answerOptions.id, id))
      .returning();

    if (!updated) throw new Error(`Answer option not found: ${id}`);
    return updated;
  },

  async setNormalizationRanges(
    questionId: number,
    ranges: { range_from: string; range_to: string; normalized_score: string }[],
  ) {
    if (ranges.length > 0) {
      // Validate each range: from < to, non-negative
      for (const r of ranges) {
        const from = parseFloat(r.range_from);
        const to = parseFloat(r.range_to);
        if (isNaN(from) || isNaN(to)) throw new Error('range_from and range_to must be numeric');
        if (from < 0) throw new Error(`range_from (${from}) must be >= 0`);
        if (from >= to) throw new Error(`range_from (${from}) must be less than range_to (${to})`);
      }
      // Check no overlaps and no gaps
      const sorted = [...ranges].sort((a, b) => parseFloat(a.range_from) - parseFloat(b.range_from));
      for (let i = 0; i < sorted.length - 1; i++) {
        const currentTo = parseFloat(sorted[i].range_to);
        const nextFrom = parseFloat(sorted[i + 1].range_from);
        if (currentTo > nextFrom) {
          throw new Error(`Overlapping normalization ranges: range ending at ${currentTo} overlaps with range starting at ${nextFrom}`);
        }
        if (currentTo < nextFrom) {
          throw new Error(`Gap in normalization ranges: range ending at ${currentTo} does not connect to range starting at ${nextFrom}`);
        }
      }
    }

    // Wrap in a transaction so that the delete + insert are atomic.
    // Without this, a failure during insert would leave the question with no ranges.
    return await db.transaction(async (tx: any) => {
      // Delete existing ranges for this question
      await tx
        .delete(schema.scoreNormalizationRanges)
        .where(eq(schema.scoreNormalizationRanges.question_id, questionId));

      if (ranges.length === 0) return [];

      const inserted = await tx
        .insert(schema.scoreNormalizationRanges)
        .values(
          ranges.map((r) => ({
            question_id: questionId,
            range_from: r.range_from,
            range_to: r.range_to,
            normalized_score: r.normalized_score,
          })),
        )
        .returning();

      return inserted;
    });
  },

  // ========================================================================
  // 3. Risk Appetite Mapping CRUD with maker-checker
  // ========================================================================

  async listRiskAppetiteMappings(entityId: string) {
    return db
      .select()
      .from(schema.riskAppetiteMappings)
      .where(
        and(
          eq(schema.riskAppetiteMappings.entity_id, entityId),
          eq(schema.riskAppetiteMappings.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.riskAppetiteMappings.created_at));
  },

  async createRiskAppetiteMapping(data: {
    mapping_name: string;
    entity_id: string;
    effective_start_date: string;
    effective_end_date: string;
    maker_id: number;
    bands: {
      score_from: string;
      score_to: string;
      risk_category: string;
      risk_code: number;
      description?: string;
    }[];
  }) {
    // --- Band overlap validation ---
    if (data.bands.length > 1) {
      const sorted = [...data.bands].sort(
        (a, b) => parseFloat(a.score_from) - parseFloat(b.score_from),
      );
      for (let i = 0; i < sorted.length; i++) {
        const from = parseFloat(sorted[i].score_from);
        const to = parseFloat(sorted[i].score_to);
        if (to <= from) {
          throw new Error(
            `Band "${sorted[i].risk_category}" has invalid range: score_from (${from}) must be less than score_to (${to})`,
          );
        }
        if (i < sorted.length - 1) {
          const nextFrom = parseFloat(sorted[i + 1].score_from);
          if (to > nextFrom) {
            throw new Error(
              `Overlapping score ranges detected: band "${sorted[i].risk_category}" ends at ${to} ` +
              `but band "${sorted[i + 1].risk_category}" starts at ${nextFrom}`,
            );
          }
        }
      }
    }

    const [mapping] = await db
      .insert(schema.riskAppetiteMappings)
      .values({
        mapping_name: data.mapping_name,
        entity_id: data.entity_id,
        effective_start_date: data.effective_start_date,
        effective_end_date: data.effective_end_date,
        authorization_status: 'UNAUTHORIZED',
        maker_id: data.maker_id,
        created_by: String(data.maker_id),
        updated_by: String(data.maker_id),
      })
      .returning();

    let bands: (typeof schema.riskAppetiteBands.$inferSelect)[] = [];
    if (data.bands.length > 0) {
      bands = await db
        .insert(schema.riskAppetiteBands)
        .values(
          data.bands.map((b) => ({
            mapping_id: mapping.id,
            score_from: b.score_from,
            score_to: b.score_to,
            risk_category: b.risk_category,
            risk_code: b.risk_code,
            description: b.description ?? null,
            created_by: String(data.maker_id),
            updated_by: String(data.maker_id),
          })),
        )
        .returning();
    }

    return { ...mapping, bands };
  },

  async updateRiskAppetiteMapping(
    id: number,
    data: Partial<{
      mapping_name: string;
      effective_start_date: string;
      effective_end_date: string;
      updated_by: string;
      version: number;
      bands: {
        score_from: string;
        score_to: string;
        risk_category: string;
        risk_code: number;
        description?: string;
      }[];
    }>,
  ) {
    const expectedVersion = data.version;
    if (expectedVersion == null) {
      const err = new Error('version field is required for optimistic locking');
      (err as any).code = 'VERSION_CONFLICT';
      throw err;
    }

    const { bands, version: _v, ...mappingData } = data;

    const [existing] = await db
      .select()
      .from(schema.riskAppetiteMappings)
      .where(and(eq(schema.riskAppetiteMappings.id, id), eq(schema.riskAppetiteMappings.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Risk appetite mapping not found: ${id}`);

    // Wrap update + band replacement in a transaction for atomicity
    return await db.transaction(async (tx: any) => {
      const [updated] = await tx
        .update(schema.riskAppetiteMappings)
        .set({
          ...mappingData,
          authorization_status: 'MODIFIED',
          version: existing.version + 1,
          updated_at: new Date(),
          checker_id: null,
          authorized_at: null,
        })
        .where(
          and(
            eq(schema.riskAppetiteMappings.id, id),
            eq(schema.riskAppetiteMappings.version, expectedVersion),
          ),
        )
        .returning();

      if (!updated) {
        const err = new Error(
          `Risk appetite mapping ${id} has been modified by another user. Expected version ${expectedVersion} but found ${existing.version}.`,
        );
        (err as any).code = 'VERSION_CONFLICT';
        throw err;
      }

      // Replace bands if provided
      let updatedBands: (typeof schema.riskAppetiteBands.$inferSelect)[] | undefined;
      if (bands) {
        await tx
          .delete(schema.riskAppetiteBands)
          .where(eq(schema.riskAppetiteBands.mapping_id, id));

        if (bands.length > 0) {
          updatedBands = await tx
            .insert(schema.riskAppetiteBands)
            .values(
              bands.map((b) => ({
                mapping_id: id,
                score_from: b.score_from,
                score_to: b.score_to,
                risk_category: b.risk_category,
                risk_code: b.risk_code,
                description: b.description ?? null,
                updated_by: data.updated_by ?? null,
              })),
            )
            .returning();
        } else {
          updatedBands = [];
        }
      }

      // Band exhaustiveness check (FR-010.BR2 — G-014)
      if (data.bands && data.bands.length > 0) {
        const sorted = [...data.bands].sort((a, b) => parseFloat(a.score_from) - parseFloat(b.score_from));
        const minScore = parseFloat(sorted[0].score_from);
        if (minScore > 0) {
          throw new Error(`Bands must start at 0. First band starts at ${minScore}.`);
        }
        for (let i = 0; i < sorted.length - 1; i++) {
          const currentTo = parseFloat(sorted[i].score_to);
          const nextFrom = parseFloat(sorted[i + 1].score_from);
          if (currentTo !== nextFrom) {
            throw new Error(`Gap in bands between ${currentTo} and ${nextFrom}. Bands must be contiguous.`);
          }
        }
      }

      return { ...updated, bands: updatedBands };
    });
  },

  async authorizeRiskAppetiteMapping(id: number, checkerId: number) {
    const [existing] = await db
      .select()
      .from(schema.riskAppetiteMappings)
      .where(and(eq(schema.riskAppetiteMappings.id, id), eq(schema.riskAppetiteMappings.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Risk appetite mapping not found: ${id}`);
    if (existing.authorization_status === 'AUTHORIZED') {
      throw new Error('Mapping is already authorized');
    }
    if (existing.maker_id === checkerId) {
      throw new Error('Maker and checker must be different users');
    }

    const [updated] = await db
      .update(schema.riskAppetiteMappings)
      .set({
        authorization_status: 'AUTHORIZED',
        checker_id: checkerId,
        authorized_at: new Date(),
        updated_by: String(checkerId),
        updated_at: new Date(),
      })
      .where(eq(schema.riskAppetiteMappings.id, id))
      .returning();

    if (existing.maker_id) {
      await notificationInboxService.notify({
        recipient_user_id: existing.maker_id,
        type: 'RISK_APPETITE_MAPPING_AUTHORIZED',
        title: 'Risk Appetite Mapping Authorized',
        message: `Risk appetite mapping ${id} has been authorized.`,
        channel: 'IN_APP',
        related_entity_type: 'risk_appetite_mapping',
        related_entity_id: id,
      });
    }

    return updated;
  },

  async rejectRiskAppetiteMapping(id: number, checkerId: number) {
    const [existing] = await db
      .select()
      .from(schema.riskAppetiteMappings)
      .where(and(eq(schema.riskAppetiteMappings.id, id), eq(schema.riskAppetiteMappings.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Risk appetite mapping not found: ${id}`);
    if (existing.maker_id === checkerId) {
      throw new Error('Maker and checker must be different users');
    }

    const [updated] = await db
      .update(schema.riskAppetiteMappings)
      .set({
        authorization_status: 'REJECTED',
        checker_id: checkerId,
        updated_by: String(checkerId),
        updated_at: new Date(),
      })
      .where(eq(schema.riskAppetiteMappings.id, id))
      .returning();

    if (existing.maker_id) {
      await notificationInboxService.notify({
        recipient_user_id: existing.maker_id,
        type: 'RISK_APPETITE_MAPPING_REJECTED',
        title: 'Risk Appetite Mapping Rejected',
        message: `Risk appetite mapping ${id} has been rejected.`,
        channel: 'IN_APP',
        related_entity_type: 'risk_appetite_mapping',
        related_entity_id: id,
      });
    }

    return updated;
  },

  // ========================================================================
  // 4. Asset Allocation Config CRUD with maker-checker
  // ========================================================================

  async getAssetAllocationByCategory(riskCategory: string) {
    // Find the most recent AUTHORIZED config that has lines for this category
    const configs = await db
      .select()
      .from(schema.assetAllocationConfigs)
      .where(
        and(
          eq(schema.assetAllocationConfigs.authorization_status, 'AUTHORIZED'),
          eq(schema.assetAllocationConfigs.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.assetAllocationConfigs.created_at))
      .limit(10);

    for (const config of configs) {
      const lines = await db
        .select()
        .from(schema.assetAllocationLines)
        .where(
          and(
            eq(schema.assetAllocationLines.config_id, config.id),
            eq(schema.assetAllocationLines.risk_category, riskCategory),
          ),
        );
      if (lines.length > 0) {
        return { ...config, lines };
      }
    }
    return null;
  },

  async listAssetAllocationConfigs(entityId: string) {
    return db
      .select()
      .from(schema.assetAllocationConfigs)
      .where(
        and(
          eq(schema.assetAllocationConfigs.entity_id, entityId),
          eq(schema.assetAllocationConfigs.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.assetAllocationConfigs.created_at));
  },

  async createAssetAllocationConfig(data: {
    config_name: string;
    entity_id: string;
    effective_start_date: string;
    effective_end_date: string;
    maker_id: number;
    lines: {
      risk_category: string;
      asset_class: string;
      allocation_percentage: string;
      expected_return_pct?: string;
      standard_deviation_pct?: string;
    }[];
  }) {
    const [config] = await db
      .insert(schema.assetAllocationConfigs)
      .values({
        config_name: data.config_name,
        entity_id: data.entity_id,
        effective_start_date: data.effective_start_date,
        effective_end_date: data.effective_end_date,
        authorization_status: 'UNAUTHORIZED',
        maker_id: data.maker_id,
        created_by: String(data.maker_id),
        updated_by: String(data.maker_id),
      })
      .returning();

    let lines: (typeof schema.assetAllocationLines.$inferSelect)[] = [];
    if (data.lines.length > 0) {
      lines = await db
        .insert(schema.assetAllocationLines)
        .values(
          data.lines.map((l) => ({
            config_id: config.id,
            risk_category: l.risk_category,
            asset_class: l.asset_class,
            allocation_percentage: l.allocation_percentage,
            expected_return_pct: l.expected_return_pct ?? null,
            standard_deviation_pct: l.standard_deviation_pct ?? null,
            created_by: String(data.maker_id),
            updated_by: String(data.maker_id),
          })),
        )
        .returning();
    }

    return { ...config, lines };
  },

  async updateAssetAllocationConfig(
    id: number,
    data: Partial<{
      config_name: string;
      effective_start_date: string;
      effective_end_date: string;
      updated_by: string;
      version: number;
      lines: {
        risk_category: string;
        asset_class: string;
        allocation_percentage: string;
        expected_return_pct?: string;
        standard_deviation_pct?: string;
      }[];
    }>,
  ) {
    const expectedVersion = data.version;
    if (expectedVersion == null) {
      const err = new Error('version field is required for optimistic locking');
      (err as any).code = 'VERSION_CONFLICT';
      throw err;
    }

    const { lines, version: _v, ...configData } = data;

    const [existing] = await db
      .select()
      .from(schema.assetAllocationConfigs)
      .where(and(eq(schema.assetAllocationConfigs.id, id), eq(schema.assetAllocationConfigs.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Asset allocation config not found: ${id}`);

    // Wrap update + line replacement in a transaction for atomicity
    return await db.transaction(async (tx: any) => {
      const [updated] = await tx
        .update(schema.assetAllocationConfigs)
        .set({
          ...configData,
          authorization_status: 'MODIFIED',
          version: existing.version + 1,
          updated_at: new Date(),
          checker_id: null,
          authorized_at: null,
        })
        .where(
          and(
            eq(schema.assetAllocationConfigs.id, id),
            eq(schema.assetAllocationConfigs.version, expectedVersion),
          ),
        )
        .returning();

      if (!updated) {
        const err = new Error(
          `Asset allocation config ${id} has been modified by another user. Expected version ${expectedVersion} but found ${existing.version}.`,
        );
        (err as any).code = 'VERSION_CONFLICT';
        throw err;
      }

      let updatedLines: (typeof schema.assetAllocationLines.$inferSelect)[] | undefined;
      if (lines) {
        await tx
          .delete(schema.assetAllocationLines)
          .where(eq(schema.assetAllocationLines.config_id, id));

        if (lines.length > 0) {
          updatedLines = await tx
            .insert(schema.assetAllocationLines)
            .values(
              lines.map((l) => ({
                config_id: id,
                risk_category: l.risk_category,
                asset_class: l.asset_class,
                allocation_percentage: l.allocation_percentage,
                expected_return_pct: l.expected_return_pct ?? null,
                standard_deviation_pct: l.standard_deviation_pct ?? null,
                updated_by: data.updated_by ?? null,
              })),
            )
            .returning();
        } else {
          updatedLines = [];
        }
      }

      return { ...updated, lines: updatedLines };
    });
  },

  async authorizeAssetAllocationConfig(id: number, checkerId: number) {
    const [existing] = await db
      .select()
      .from(schema.assetAllocationConfigs)
      .where(and(eq(schema.assetAllocationConfigs.id, id), eq(schema.assetAllocationConfigs.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Asset allocation config not found: ${id}`);
    if (existing.authorization_status === 'AUTHORIZED') {
      throw new Error('Config is already authorized');
    }
    if (existing.maker_id === checkerId) {
      throw new Error('Maker and checker must be different users');
    }

    const [updated] = await db
      .update(schema.assetAllocationConfigs)
      .set({
        authorization_status: 'AUTHORIZED',
        checker_id: checkerId,
        authorized_at: new Date(),
        updated_by: String(checkerId),
        updated_at: new Date(),
      })
      .where(eq(schema.assetAllocationConfigs.id, id))
      .returning();

    // Check all required risk categories have at least one line (FR-013.BR1 — G-016)
    const REQUIRED_CATEGORIES = [
      'CONSERVATIVE', 'MODERATELY_CONSERVATIVE', 'MODERATE',
      'MODERATELY_AGGRESSIVE', 'AGGRESSIVE', 'VERY_AGGRESSIVE',
    ];
    const lines = await db
      .select({ risk_category: schema.assetAllocationLines.risk_category })
      .from(schema.assetAllocationLines)
      .where(eq(schema.assetAllocationLines.config_id, id));
    const presentCategories = new Set(lines.map((l: any) => l.risk_category));
    const missingCategories = REQUIRED_CATEGORIES.filter((c) => !presentCategories.has(c));
    if (missingCategories.length > 0) {
      console.warn(`[AssetAllocation] Missing risk categories at authorization: ${missingCategories.join(', ')}`);
    }

    if (existing.maker_id) {
      await notificationInboxService.notify({
        recipient_user_id: existing.maker_id,
        type: 'ASSET_ALLOCATION_CONFIG_AUTHORIZED',
        title: 'Asset Allocation Config Authorized',
        message: `Asset allocation config ${id} has been authorized.`,
        channel: 'IN_APP',
        related_entity_type: 'asset_allocation_config',
        related_entity_id: id,
      });
    }

    return updated;
  },

  async rejectAssetAllocationConfig(id: number, checkerId: number) {
    const [existing] = await db
      .select()
      .from(schema.assetAllocationConfigs)
      .where(and(eq(schema.assetAllocationConfigs.id, id), eq(schema.assetAllocationConfigs.is_deleted, false)))
      .limit(1);

    if (!existing) throw new Error(`Asset allocation config not found: ${id}`);
    if (existing.maker_id === checkerId) {
      throw new Error('Maker and checker must be different users');
    }

    const [updated] = await db
      .update(schema.assetAllocationConfigs)
      .set({
        authorization_status: 'REJECTED',
        checker_id: checkerId,
        updated_by: String(checkerId),
        updated_at: new Date(),
      })
      .where(eq(schema.assetAllocationConfigs.id, id))
      .returning();

    if (existing.maker_id) {
      await notificationInboxService.notify({
        recipient_user_id: existing.maker_id,
        type: 'ASSET_ALLOCATION_CONFIG_REJECTED',
        title: 'Asset Allocation Config Rejected',
        message: `Asset allocation config ${id} has been rejected.`,
        channel: 'IN_APP',
        related_entity_type: 'asset_allocation_config',
        related_entity_id: id,
      });
    }

    return updated;
  },

  // ========================================================================
  // 5. Risk Score Computation Engine
  // ========================================================================

  async computeRiskScore(
    questionnaireId: number,
    responses: { questionId: number; answerOptionIds: number[] }[],
  ): Promise<ComputedResult> {
    // Fetch questionnaire with full structure
    const questionnaire = await this.getQuestionnaire(questionnaireId);

    if (questionnaire.authorization_status !== 'AUTHORIZED') {
      throw new Error('Cannot compute score against an unauthorized questionnaire');
    }

    // Fetch the active risk appetite mapping for this entity
    const [riskMapping] = await db
      .select()
      .from(schema.riskAppetiteMappings)
      .where(
        and(
          eq(schema.riskAppetiteMappings.entity_id, questionnaire.entity_id),
          eq(schema.riskAppetiteMappings.authorization_status, 'AUTHORIZED'),
          eq(schema.riskAppetiteMappings.is_deleted, false),
          lte(schema.riskAppetiteMappings.effective_start_date, new Date().toISOString().split('T')[0]),
          gte(schema.riskAppetiteMappings.effective_end_date, new Date().toISOString().split('T')[0]),
        ),
      )
      .orderBy(desc(schema.riskAppetiteMappings.created_at))
      .limit(1);

    if (!riskMapping) {
      throw new Error('No authorized risk appetite mapping found for this entity');
    }

    const bands = await db
      .select()
      .from(schema.riskAppetiteBands)
      .where(eq(schema.riskAppetiteBands.mapping_id, riskMapping.id))
      .orderBy(schema.riskAppetiteBands.score_from);

    if (bands.length === 0) {
      throw new Error('Risk appetite mapping has no bands configured');
    }

    // Build a lookup map for questions
    const questionMap = new Map(
      questionnaire.questions.map((q: any) => [q.id, q]),
    );

    // Build a response lookup: questionId -> answerOptionIds
    const responseMap = new Map(
      responses.map((r) => [r.questionId, r.answerOptionIds]),
    );

    const questionScores: QuestionScore[] = [];
    let totalScore = 0;

    for (const question of questionnaire.questions) {
      const selectedIds = responseMap.get(question.id) ?? [];

      // Non-mandatory questions with no selection contribute 0
      if (selectedIds.length === 0) {
        if (question.is_mandatory) {
          throw new Error(
            `Mandatory question ${question.question_number} (id=${question.id}) has no response`,
          );
        }
        questionScores.push({
          questionId: question.id,
          rawScore: 0,
          normalizedScore: 0,
        });
        continue;
      }

      // Gather selected answer options
      const selectedOptions = question.answerOptions.filter((o: any) =>
        selectedIds.includes(o.id),
      );

      if (selectedOptions.length === 0) {
        throw new Error(
          `No valid answer options found for question ${question.id}`,
        );
      }

      // Validate single-select constraint
      if (!question.is_multi_select && selectedOptions.length > 1) {
        throw new Error(
          `Question ${question.question_number} is single-select but ${selectedOptions.length} options were provided`,
        );
      }

      let rawScore = 0;
      let normalizedScore = 0;

      if (!question.is_multi_select) {
        // Single-select: score = selected option weightage
        rawScore = parseFloat(selectedOptions[0].weightage);
        normalizedScore = rawScore;
      } else {
        // Multi-select: sum all selected option weightages
        rawScore = selectedOptions.reduce(
          (sum: number, opt: any) => sum + parseFloat(opt.weightage),
          0,
        );

        if (question.scoring_type === 'RANGE') {
          // Lookup in normalization ranges to get normalized score
          const matchingRange = question.scoreNormalizationRanges.find((r: any) => {
            const from = parseFloat(r.range_from);
            const to = parseFloat(r.range_to);
            return rawScore >= from && rawScore <= to;
          });

          if (!matchingRange) {
            throw new Error(
              `No normalization range found for raw score ${rawScore} on question ${question.id}`,
            );
          }

          normalizedScore = parseFloat(matchingRange.normalized_score);
        } else {
          // NONE scoring: normalized = raw
          normalizedScore = rawScore;
        }
      }

      questionScores.push({
        questionId: question.id,
        rawScore,
        normalizedScore,
      });

      totalScore += normalizedScore;
    }

    // Lookup total in risk_appetite_bands
    // Inclusive-lower, exclusive-upper (score_from <= total < score_to)
    // Last band is inclusive on both ends
    let matchedBand: (typeof bands)[number] | undefined;

    for (let i = 0; i < bands.length; i++) {
      const band = bands[i];
      const from = parseFloat(band.score_from);
      const to = parseFloat(band.score_to);
      const isLastBand = i === bands.length - 1;

      if (isLastBand) {
        // Last band: inclusive on both ends
        if (totalScore >= from && totalScore <= to) {
          matchedBand = band;
          break;
        }
      } else {
        // Regular band: inclusive-lower, exclusive-upper
        if (totalScore >= from && totalScore < to) {
          matchedBand = band;
          break;
        }
      }
    }

    if (!matchedBand) {
      throw new Error(
        `Total score ${totalScore} does not fall within any risk appetite band`,
      );
    }

    return {
      totalScore,
      riskCategory: matchedBand.risk_category,
      riskCode: matchedBand.risk_code,
      questionScores,
    };
  },

  // ========================================================================
  // 6. Customer Risk Assessment
  // ========================================================================

  async createRiskAssessment(
    customerId: string,
    questionnaireId: number,
    responses: { questionId: number; answerOptionIds: number[] }[],
    assessedBy: number,
    deviation?: {
      deviated_risk_category: string;
      deviated_risk_code: number;
      deviation_reason: string;
    },
    deviceInfo?: {
      device_type?: string;
      user_agent?: string;
      ip_address?: string;
    },
  ) {
    const sessionId = `RSK-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const startTime = Date.now();

    // Compute the risk score
    const computed = await this.computeRiskScore(questionnaireId, responses);

    // Fetch the questionnaire to get valid_period_years
    const [questionnaire] = await db
      .select()
      .from(schema.questionnaires)
      .where(eq(schema.questionnaires.id, questionnaireId))
      .limit(1);

    const today = new Date();
    const assessmentDate = today.toISOString().split('T')[0];
    const expiryDate = new Date(today);
    expiryDate.setFullYear(expiryDate.getFullYear() + (questionnaire.valid_period_years ?? 2));

    const isDeviated = !!deviation;
    const effectiveCategory = isDeviated
      ? deviation!.deviated_risk_category
      : computed.riskCategory;
    const effectiveCode = isDeviated
      ? deviation!.deviated_risk_code
      : computed.riskCode;

    // Wrap all mutations in a transaction to ensure atomicity
    return await db.transaction(async (tx: any) => {
      // Deactivate previous active profile for this customer
      await tx
        .update(schema.customerRiskProfiles)
        .set({
          is_active: false,
          updated_at: new Date(),
          updated_by: String(assessedBy),
        })
        .where(
          and(
            eq(schema.customerRiskProfiles.customer_id, customerId),
            eq(schema.customerRiskProfiles.is_active, true),
          ),
        );

      // Create the immutable CustomerRiskProfile
      const [profile] = await tx
        .insert(schema.customerRiskProfiles)
        .values({
          customer_id: customerId,
          questionnaire_id: questionnaireId,
          assessment_date: assessmentDate,
          expiry_date: expiryDate.toISOString().split('T')[0],
          total_raw_score: String(computed.totalScore),
          computed_risk_category: computed.riskCategory,
          computed_risk_code: computed.riskCode,
          is_deviated: isDeviated,
          deviated_risk_category: deviation?.deviated_risk_category ?? null,
          deviated_risk_code: deviation?.deviated_risk_code ?? null,
          deviation_reason: deviation?.deviation_reason ?? null,
          effective_risk_category: effectiveCategory,
          effective_risk_code: effectiveCode,
          supervisor_approved: isDeviated ? false : null,
          is_active: true,
          assessed_by: assessedBy,
          created_by: String(assessedBy),
          updated_by: String(assessedBy),
        })
        .returning();

      // Create CustomerRiskResponse for each answer
      const responseInserts: {
        risk_profile_id: number;
        question_id: number;
        answer_option_id: number;
        raw_score: string | null;
        normalized_score: string | null;
        created_by: string;
        updated_by: string;
      }[] = [];

      for (const resp of responses) {
        const qScore = computed.questionScores.find(
          (qs) => qs.questionId === resp.questionId,
        );
        for (const optionId of resp.answerOptionIds) {
          responseInserts.push({
            risk_profile_id: profile.id,
            question_id: resp.questionId,
            answer_option_id: optionId,
            raw_score: qScore ? String(qScore.rawScore) : null,
            normalized_score: qScore ? String(qScore.normalizedScore) : null,
            created_by: String(assessedBy),
            updated_by: String(assessedBy),
          });
        }
      }

      let savedResponses: (typeof schema.customerRiskResponses.$inferSelect)[] = [];
      if (responseInserts.length > 0) {
        savedResponses = await tx
          .insert(schema.customerRiskResponses)
          .values(responseInserts)
          .returning();
      }

      // Create audit log entry
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

      await tx.insert(schema.riskProfilingAuditLogs).values({
        session_id: sessionId,
        customer_id: customerId,
        initiated_by: assessedBy,
        initiated_at: new Date(),
        completed_at: new Date(),
        duration_seconds: elapsedSeconds,
        outcome: 'COMPLETED',
        risk_profile_id: profile.id,
        device_type: deviceInfo?.device_type ?? null,
        user_agent: deviceInfo?.user_agent ?? null,
        ip_address: deviceInfo?.ip_address ?? null,
        entity_id: questionnaire.entity_id,
      });

      return {
        profile,
        scoreBreakdown: {
          totalScore: computed.totalScore,
          riskCategory: computed.riskCategory,
          riskCode: computed.riskCode,
          questionScores: computed.questionScores,
        },
        responses: savedResponses,
        sessionId,
      };
    });
  },

  async getCustomerRiskProfile(customerId: string) {
    const [profile] = await db
      .select()
      .from(schema.customerRiskProfiles)
      .where(
        and(
          eq(schema.customerRiskProfiles.customer_id, customerId),
          eq(schema.customerRiskProfiles.is_active, true),
          eq(schema.customerRiskProfiles.is_deleted, false),
        ),
      )
      .limit(1);

    if (!profile) return null;

    // Fetch responses
    const responses = await db
      .select()
      .from(schema.customerRiskResponses)
      .where(eq(schema.customerRiskResponses.risk_profile_id, profile.id));

    return { ...profile, responses };
  },

  async listCustomerAssessments(customerId: string) {
    return db
      .select()
      .from(schema.customerRiskProfiles)
      .where(
        and(
          eq(schema.customerRiskProfiles.customer_id, customerId),
          eq(schema.customerRiskProfiles.is_deleted, false),
        ),
      )
      .orderBy(desc(schema.customerRiskProfiles.created_at));
  },

  async approveDeviation(profileId: number, supervisorId: number) {
    const [profile] = await db
      .select()
      .from(schema.customerRiskProfiles)
      .where(eq(schema.customerRiskProfiles.id, profileId))
      .limit(1);

    if (!profile) throw new Error(`Risk profile not found: ${profileId}`);
    if (!profile.is_deviated) {
      throw new Error('Profile is not deviated; no approval needed');
    }
    if (profile.supervisor_approved) {
      throw new Error('Deviation already approved');
    }
    if (profile.assessed_by === supervisorId) {
      throw new Error('Supervisor cannot be the same as the assessor');
    }

    const [updated] = await db
      .update(schema.customerRiskProfiles)
      .set({
        supervisor_approved: true,
        supervisor_id: supervisorId,
        supervisor_approved_at: new Date(),
        updated_by: String(supervisorId),
        updated_at: new Date(),
      })
      .where(eq(schema.customerRiskProfiles.id, profileId))
      .returning();

    return updated;
  },

  // ========================================================================
  // 7. Product Risk Deviation
  // ========================================================================

  async checkProductRiskDeviation(
    customerId: string,
    productRiskCode: number,
  ): Promise<{
    hasDeviation: boolean;
    customerRiskCode: number | null;
    productRiskCode: number;
    riskCategory: string | null;
    profileId: number | null;
  }> {
    const profile = await this.getCustomerRiskProfile(customerId);

    if (!profile) {
      return {
        hasDeviation: false,
        customerRiskCode: null,
        productRiskCode,
        riskCategory: null,
        profileId: null,
      };
    }

    const customerRiskCode = profile.effective_risk_code;
    const hasDeviation = productRiskCode > customerRiskCode;

    return {
      hasDeviation,
      customerRiskCode,
      productRiskCode,
      riskCategory: profile.effective_risk_category,
      profileId: profile.id,
    };
  },

  async recordProductRiskDeviation(data: {
    customer_id: string;
    risk_profile_id: number;
    product_id: string;
    customer_risk_code: number;
    product_risk_code: number;
    context: (typeof schema.deviationContextEnum.enumValues)[number];
    order_id?: string;
    created_by?: string;
  }) {
    const [inserted] = await db
      .insert(schema.productRiskDeviations)
      .values({
        customer_id: data.customer_id,
        risk_profile_id: data.risk_profile_id,
        product_id: data.product_id,
        customer_risk_code: data.customer_risk_code,
        product_risk_code: data.product_risk_code,
        deviation_acknowledged: false,
        context: data.context,
        order_id: data.order_id ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    // Auto-trigger repeat deviation escalation (FR-038.BR1 — G-064)
    try {
      const threshold = await this.checkRepeatDeviationThreshold(data.customer_id);
      if (threshold.exceedsThreshold) {
        await this.createEscalation(data.customer_id, threshold.deviationIds);
      }
    } catch (escalationErr) {
      // Log but don't fail the main operation
      console.error('[RiskProfiling] Failed to auto-create escalation:', escalationErr);
    }

    return inserted;
  },

  async acknowledgeDeviation(deviationId: number) {
    const [updated] = await db
      .update(schema.productRiskDeviations)
      .set({
        deviation_acknowledged: true,
        acknowledged_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.productRiskDeviations.id, deviationId))
      .returning();

    if (!updated) throw new Error(`Product risk deviation not found: ${deviationId}`);
    return updated;
  },

  // ========================================================================
  // 8. Repeat Deviation Escalation (FR-038)
  // ========================================================================

  async checkRepeatDeviationThreshold(
    customerId: string,
    windowDays: number = 365,
    threshold: number = 5,
  ): Promise<{
    deviationCount: number;
    exceedsThreshold: boolean;
    deviationIds: number[];
    windowStart: string;
    windowEnd: string;
  }> {
    const windowEnd = new Date();
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    const deviations = await db
      .select()
      .from(schema.productRiskDeviations)
      .where(
        and(
          eq(schema.productRiskDeviations.customer_id, customerId),
          eq(schema.productRiskDeviations.is_deleted, false),
          gte(schema.productRiskDeviations.created_at, windowStart),
          lte(schema.productRiskDeviations.created_at, windowEnd),
        ),
      );

    return {
      deviationCount: deviations.length,
      exceedsThreshold: deviations.length >= threshold,
      deviationIds: deviations.map((d: { id: number }) => d.id),
      windowStart: windowStart.toISOString().split('T')[0],
      windowEnd: windowEnd.toISOString().split('T')[0],
    };
  },

  async createEscalation(customerId: string, deviationIds: number[]) {
    const today = new Date();
    const windowStart = new Date();
    windowStart.setFullYear(windowStart.getFullYear() - 1);

    const [inserted] = await db
      .insert(schema.complianceEscalations)
      .values({
        customer_id: customerId,
        escalation_type: 'REPEAT_DEVIATION',
        deviation_count: deviationIds.length,
        window_start_date: windowStart.toISOString().split('T')[0],
        window_end_date: today.toISOString().split('T')[0],
        deviation_ids: deviationIds,
        escalation_status: 'OPEN',
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();

    // G-065: Notify Compliance Officers on escalation creation
    try {
      const complianceOfficers = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq((schema.users as any).role, 'COMPLIANCE_OFFICER'));
      const recipientIds = complianceOfficers.map((u: { id: number }) => u.id);
      if (recipientIds.length > 0) {
        await notificationInboxService.notifyMultiple(recipientIds, {
          type: 'COMPLIANCE_ESCALATION',
          title: 'Risk Deviation Escalation',
          message: `Customer ${customerId} has triggered a repeat deviation escalation with ${deviationIds.length} deviation(s) in the past year.`,
          channel: 'IN_APP',
          related_entity_type: 'compliance_escalation',
          related_entity_id: inserted.id,
        });
      }
    } catch (notifErr) {
      console.error('[RiskProfiling] Failed to notify compliance officers on escalation:', notifErr);
    }

    return inserted;
  },

  // ========================================================================
  // 9. Cascading Config Validation (FR-040)
  // ========================================================================

  async validateCascadingConfig(
    entityId: string,
  ): Promise<{
    valid: boolean;
    issues: string[];
    structured_issues: Array<{ message: string; severity: 'BLOCKING' | 'WARNING' }>;
    has_blocking_issues: boolean;
  }> {
    const issues: string[] = [];
    const structured_issues: Array<{ message: string; severity: 'BLOCKING' | 'WARNING' }> = [];
    const addIssue = (message: string, severity: 'BLOCKING' | 'WARNING') => {
      issues.push(message);
      structured_issues.push({ message, severity });
    };
    const today = new Date().toISOString().split('T')[0];

    // 1. Check for authorized questionnaire
    const questionnaires = await db
      .select()
      .from(schema.questionnaires)
      .where(
        and(
          eq(schema.questionnaires.entity_id, entityId),
          eq(schema.questionnaires.authorization_status, 'AUTHORIZED'),
          eq(schema.questionnaires.is_deleted, false),
          lte(schema.questionnaires.effective_start_date, today),
          gte(schema.questionnaires.effective_end_date, today),
        ),
      );

    if (questionnaires.length === 0) {
      addIssue('No authorized and effective questionnaire found for entity', 'BLOCKING');
    }

    // 2. Check for authorized risk appetite mapping
    const mappings = await db
      .select()
      .from(schema.riskAppetiteMappings)
      .where(
        and(
          eq(schema.riskAppetiteMappings.entity_id, entityId),
          eq(schema.riskAppetiteMappings.authorization_status, 'AUTHORIZED'),
          eq(schema.riskAppetiteMappings.is_deleted, false),
          lte(schema.riskAppetiteMappings.effective_start_date, today),
          gte(schema.riskAppetiteMappings.effective_end_date, today),
        ),
      );

    if (mappings.length === 0) {
      addIssue('No authorized and effective risk appetite mapping found for entity', 'BLOCKING');
    }

    // 3. Check for authorized asset allocation config
    const configs = await db
      .select()
      .from(schema.assetAllocationConfigs)
      .where(
        and(
          eq(schema.assetAllocationConfigs.entity_id, entityId),
          eq(schema.assetAllocationConfigs.authorization_status, 'AUTHORIZED'),
          eq(schema.assetAllocationConfigs.is_deleted, false),
          lte(schema.assetAllocationConfigs.effective_start_date, today),
          gte(schema.assetAllocationConfigs.effective_end_date, today),
        ),
      );

    if (configs.length === 0) {
      addIssue('No authorized and effective asset allocation config found for entity', 'BLOCKING');
    }

    // 4. Cross-validate: every risk category in bands should have asset allocation lines
    if (mappings.length > 0 && configs.length > 0) {
      const bands = await db
        .select()
        .from(schema.riskAppetiteBands)
        .where(eq(schema.riskAppetiteBands.mapping_id, mappings[0].id));

      const allocLines = await db
        .select()
        .from(schema.assetAllocationLines)
        .where(eq(schema.assetAllocationLines.config_id, configs[0].id));

      const bandCategories = new Set(bands.map((b: any) => b.risk_category));
      const allocCategories = new Set(allocLines.map((l: any) => l.risk_category));

      for (const cat of bandCategories) {
        if (!allocCategories.has(cat)) {
          addIssue(
            `Risk category "${cat}" exists in appetite bands but has no asset allocation lines`,
            'WARNING',
          );
        }
      }

      // Check bands have no gaps: score_to of band N should equal score_from of band N+1
      const sortedBands = [...bands].sort(
        (a, b) => parseFloat(a.score_from) - parseFloat(b.score_from),
      );
      for (let i = 0; i < sortedBands.length - 1; i++) {
        const currentTo = parseFloat(sortedBands[i].score_to);
        const nextFrom = parseFloat(sortedBands[i + 1].score_from);
        if (currentTo !== nextFrom) {
          addIssue(
            `Gap in risk appetite bands: band ending at ${currentTo} does not connect to band starting at ${nextFrom}`,
            'WARNING',
          );
        }
      }

      // Check that asset allocation percentages sum to ~100 per risk category
      const allocByCat = new Map<string, number>();
      for (const line of allocLines) {
        const current = allocByCat.get(line.risk_category) ?? 0;
        allocByCat.set(
          line.risk_category,
          current + parseFloat(line.allocation_percentage),
        );
      }
      for (const [cat, total] of allocByCat) {
        if (Math.abs(total - 100) > 0.01) {
          addIssue(
            `Asset allocation for risk category "${cat}" sums to ${total}%, expected 100%`,
            'WARNING',
          );
        }
      }
    }

    // 5. Validate scored questionnaires have questions with answer options
    for (const q of questionnaires) {
      if (q.is_score) {
        const questionRows = await db
          .select()
          .from(schema.questions)
          .where(
            and(
              eq(schema.questions.questionnaire_id, q.id),
              eq(schema.questions.is_deleted, false),
            ),
          );

        if (questionRows.length === 0) {
          addIssue(
            `Scored questionnaire "${q.questionnaire_name}" (id=${q.id}) has no questions`,
            'BLOCKING',
          );
          continue;
        }

        const qIds = questionRows.map((qr: any) => qr.id);
        const options = await db
          .select()
          .from(schema.answerOptions)
          .where(
            and(
              inArray(schema.answerOptions.question_id, qIds),
              eq(schema.answerOptions.is_deleted, false),
            ),
          );

        const optionsByQ = new Map<number, number>();
        for (const opt of options) {
          optionsByQ.set(opt.question_id, (optionsByQ.get(opt.question_id) ?? 0) + 1);
        }

        for (const qr of questionRows) {
          if (!optionsByQ.has(qr.id) || optionsByQ.get(qr.id) === 0) {
            addIssue(
              `Question ${qr.question_number} (id=${qr.id}) in questionnaire "${q.questionnaire_name}" has no answer options`,
              'BLOCKING',
            );
          }

          // Multi-select + RANGE must have normalization ranges
          if (qr.is_multi_select && qr.scoring_type === 'RANGE') {
            const normCount = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(schema.scoreNormalizationRanges)
              .where(eq(schema.scoreNormalizationRanges.question_id, qr.id));

            if ((normCount[0]?.count ?? 0) === 0) {
              addIssue(
                `Multi-select RANGE question ${qr.question_number} (id=${qr.id}) has no normalization ranges`,
                'BLOCKING',
              );
            }
          }
        }
      }
    }

    // G-099: Classify as BLOCKING (prevents profiling) vs WARNING (data quality concern)
    const hasBlocker = structured_issues.some((i) => i.severity === 'BLOCKING');
    return {
      valid: issues.length === 0,
      issues,
      structured_issues,
      has_blocking_issues: hasBlocker,
    };
  },

  // ========================================================================
  // 10. Supervisor Dashboard Data
  // ========================================================================

  async getLeadStatusSummary(supervisorId: number) {
    // Get all RMs in the same branch/department as the supervisor
    const supervisor = await db
      .select({ branch_id: schema.users.branch_id, department: schema.users.department })
      .from(schema.users)
      .where(eq(schema.users.id, supervisorId))
      .limit(1);

    const branchId = supervisor[0]?.branch_id;
    const rms = await db
      .select({ id: schema.users.id, full_name: schema.users.full_name })
      .from(schema.users)
      .where(
        and(
          branchId ? eq(schema.users.branch_id, branchId) : sql`true`,
          eq(schema.users.is_active, true),
        ),
      );

    if (rms.length === 0) return [];

    const rmIds = rms.map((rm: any) => rm.id);

    // Aggregate lead counts per RM per status
    const leadAggregates = await db
      .select({
        assigned_rm_id: schema.leads.assigned_rm_id,
        lead_status: schema.leads.lead_status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.leads)
      .where(
        and(
          inArray(schema.leads.assigned_rm_id, rmIds),
          eq(schema.leads.is_deleted, false),
        ),
      )
      .groupBy(schema.leads.assigned_rm_id, schema.leads.lead_status);

    // Build summary per RM
    const rmMap = new Map(rms.map((rm: any) => [rm.id, rm.full_name]));
    const summary = new Map<
      number,
      { rmId: number; rmName: string | null; statusCounts: Record<string, number>; total: number }
    >();

    for (const rm of rms) {
      summary.set(rm.id, {
        rmId: rm.id,
        rmName: rm.full_name,
        statusCounts: {},
        total: 0,
      });
    }

    for (const row of leadAggregates) {
      const rmId = row.assigned_rm_id;
      if (rmId != null && summary.has(rmId)) {
        const entry = summary.get(rmId)!;
        entry.statusCounts[row.lead_status] = row.count;
        entry.total += row.count;
      }
    }

    return Array.from(summary.values());
  },

  // =========================================================================
  // Compliance Escalations
  // =========================================================================

  async listEscalations(_entityId?: string) {
    const rows = await db
      .select()
      .from(schema.complianceEscalations)
      .where(
        eq(schema.complianceEscalations.escalation_status, 'OPEN'),
      )
      .orderBy(desc(schema.complianceEscalations.created_at));

    return rows;
  },

  async resolveEscalation(id: number, resolutionAction: string, resolutionNotes: string) {
    const [updated] = await db
      .update(schema.complianceEscalations)
      .set({
        resolution_action: resolutionAction as any,
        resolution_notes: resolutionNotes,
        resolved_at: new Date(),
        escalation_status: 'RESOLVED' as any,
      })
      .where(eq(schema.complianceEscalations.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Escalation with id ${id} not found`);
    }

    return updated;
  },

  // ========================================================================
  // 11. Risk Profiling Completion Report (FR-033 — G-056)
  // ========================================================================

  async getRiskProfilingCompletionReport(filters: {
    entityId: string;
    dateFrom?: string;
    dateTo?: string;
    rmId?: number;
    branchId?: number;
  }) {
    const now = new Date();

    // Get all active users (RMs) in the entity
    const conditions: ReturnType<typeof eq>[] = [eq(schema.users.is_active, true)];
    if (filters.rmId) conditions.push(eq(schema.users.id, filters.rmId));
    if (filters.branchId) conditions.push(eq(schema.users.branch_id, filters.branchId));

    const rms = await db
      .select({
        id: schema.users.id,
        full_name: schema.users.full_name,
        branch_id: schema.users.branch_id,
      })
      .from(schema.users)
      .where(and(...conditions));

    if (rms.length === 0) return { entity_id: filters.entityId, report: [], total_rms: 0 };

    const rmIds = rms.map((rm: any) => rm.id);

    // Get all risk profiles assessed by these RMs
    // assessed_by links to users.id (the RM who performed the assessment)
    const profiles = await db
      .select({
        customer_id: schema.customerRiskProfiles.customer_id,
        assessed_by: schema.customerRiskProfiles.assessed_by,
        is_active: schema.customerRiskProfiles.is_active,
        expiry_date: schema.customerRiskProfiles.expiry_date,
      })
      .from(schema.customerRiskProfiles)
      .where(
        inArray(schema.customerRiskProfiles.assessed_by, rmIds),
      );

    // Build per-RM stats based on assessed profiles
    const report = rms.map((rm: any) => {
      const rmProfiles = profiles.filter((p: any) => p.assessed_by === rm.id);
      // Deduplicate by customer_id — keep only the most-relevant profile per customer
      const customerMap = new Map<string, any>();
      for (const p of rmProfiles) {
        const existing = customerMap.get(p.customer_id);
        if (!existing || (p.is_active && !existing.is_active)) {
          customerMap.set(p.customer_id, p);
        }
      }
      const uniqueProfiles = [...customerMap.values()];
      const totalClients = uniqueProfiles.length;
      let profiled = 0;
      let expired = 0;
      const pending = 0; // Cannot compute pending without knowing assigned clients

      for (const profile of uniqueProfiles) {
        if (profile.expiry_date && new Date(profile.expiry_date) < now) {
          expired++;
        } else if (profile.is_active) {
          profiled++;
        }
      }

      const completionPct = totalClients > 0 ? Math.round((profiled / totalClients) * 100) : 0;

      return {
        rm_id: rm.id,
        rm_name: rm.full_name,
        branch_id: rm.branch_id,
        total_clients: totalClients,
        profiled,
        pending,
        expired,
        completion_pct: completionPct,
      };
    });

    return {
      entity_id: filters.entityId,
      generated_at: now.toISOString(),
      report,
      total_rms: rms.length,
      summary: {
        total_clients: report.reduce((s: number, r: any) => s + r.total_clients, 0),
        total_profiled: report.reduce((s: number, r: any) => s + r.profiled, 0),
        total_pending: report.reduce((s: number, r: any) => s + r.pending, 0),
        total_expired: report.reduce((s: number, r: any) => s + r.expired, 0),
      },
    };
  },

  // ========================================================================
  // Audit Log Query (FR-039.BR1 — G-098)
  // Only accessible to COMPLIANCE_OFFICER, BO_HEAD, SYSTEM_ADMIN roles
  // ========================================================================

  async getAuditLogs(filters: {
    customer_id?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.customer_id) {
      conditions.push(eq(schema.riskProfilingAuditLogs.customer_id, filters.customer_id));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select()
      .from(schema.riskProfilingAuditLogs)
      .where(where)
      .orderBy(desc(schema.riskProfilingAuditLogs.initiated_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.riskProfilingAuditLogs)
      .where(where);

    return { data: logs, total, page, pageSize };
  },
};
