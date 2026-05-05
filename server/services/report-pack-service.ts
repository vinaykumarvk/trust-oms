import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { reportGeneratorService } from './report-generator-service';
import { exceptionQueueService } from './exception-queue-service';
import {
  buildReportOutputReference,
  buildReportPackRunId,
  calculateRetentionUntil,
  estimateReportRowCount,
  nextReportPackRetryAt,
  normalizeReportRecipients,
  normalizeStringArray,
  stableReportPayloadHash,
  type ReportPackRecipient,
} from './report-pack-policy';
import { NotFoundError, ValidationError } from './service-errors';

function actorToText(actor: string | number | null | undefined): string | null {
  if (actor === null || actor === undefined || actor === '') return null;
  return String(actor);
}

function maskPayload(value: unknown, maskingPolicy: unknown): unknown {
  const policy = maskingPolicy as Record<string, unknown> | null;
  const fields = Array.isArray(policy?.fields)
    ? policy?.fields.map((field) => String(field).toLowerCase())
    : Array.isArray(policy?.mask_fields)
      ? policy?.mask_fields.map((field) => String(field).toLowerCase())
      : [];

  if (fields.length === 0 || value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => maskPayload(entry, maskingPolicy));
  }

  const masked: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (fields.includes(key.toLowerCase())) {
      masked[key] = '***MASKED***';
    } else {
      masked[key] = maskPayload(entryValue, maskingPolicy);
    }
  }
  return masked;
}

export const reportPackService = {
  async generatePack(
    templateId: number,
    options: {
      params?: Record<string, unknown>;
      requestedBy?: string | number | null;
      recipients?: ReportPackRecipient[];
      deliveryChannels?: string[];
      outputFormats?: string[];
    } = {},
  ) {
    const [template] = await db
      .select()
      .from(schema.reportPackTemplates)
      .where(eq(schema.reportPackTemplates.id, templateId))
      .limit(1);

    if (!template) {
      throw new NotFoundError(`Report pack template not found: ${templateId}`);
    }
    if (!template.is_active) {
      throw new ValidationError('Report pack template is inactive');
    }

    const now = new Date();
    const runId = buildReportPackRunId(templateId, now);
    const reportTypes = normalizeStringArray(template.report_types, []);
    const outputFormats = normalizeStringArray(options.outputFormats ?? template.output_formats, ['JSON']);
    const recipients = options.recipients?.length
      ? options.recipients
      : normalizeReportRecipients(template.default_recipients);
    const deliveryChannels = normalizeStringArray(options.deliveryChannels ?? template.default_delivery_channels, ['IN_APP']);

    if (reportTypes.length === 0) {
      throw new ValidationError('Report pack template has no report types');
    }

    const [run] = await db
      .insert(schema.reportPackRuns)
      .values({
        run_id: runId,
        template_id: templateId,
        pack_name: template.pack_name,
        run_status: 'RUNNING',
        params: options.params ?? {},
        requested_by: actorToText(options.requestedBy),
        requested_at: now,
        started_at: now,
        report_count: reportTypes.length,
        output_count: 0,
        created_by: actorToText(options.requestedBy),
        updated_by: actorToText(options.requestedBy),
      })
      .returning();

    const outputs = [];
    const failures: Array<{ report_type: string; error: string }> = [];
    const retentionUntil = calculateRetentionUntil(template.retention_years ?? 7, now);

    for (const reportType of reportTypes) {
      try {
        const rawReport = await reportGeneratorService.generateReport(reportType, options.params ?? {});
        const maskedReport = maskPayload(rawReport, template.masking_policy);
        const rowCount = estimateReportRowCount(maskedReport);

        for (const outputFormat of outputFormats) {
          const fileReference = buildReportOutputReference(runId, reportType, outputFormat);
          const contentHash = stableReportPayloadHash({ reportType, outputFormat, report: maskedReport });
          const payload = {
            report: maskedReport,
            output_format: outputFormat,
            masking_policy_applied: template.masking_policy ?? {},
          };
          const [output] = await db
            .insert(schema.reportPackOutputs)
            .values({
              run_id: run.id,
              report_type: reportType,
              output_format: outputFormat,
              output_status: 'GENERATED',
              row_count: rowCount,
              file_reference: fileReference,
              file_size_bytes: Buffer.byteLength(JSON.stringify(payload)),
              content_hash: contentHash,
              generation_payload: payload,
              retention_until: retentionUntil,
              generated_at: new Date(),
              delivery_channel: deliveryChannels[0] ?? 'IN_APP',
              recipient_type: recipients[0]?.recipient_type ?? null,
              recipient_id: recipients[0]?.recipient_id ?? null,
              delivery_status: recipients.length > 0 ? 'PENDING' : 'NOT_REQUIRED',
              created_by: actorToText(options.requestedBy),
              updated_by: actorToText(options.requestedBy),
            })
            .returning();
          outputs.push(output);
        }

        await db.insert(schema.reportGenerationLog).values({
          report_type: reportType,
          generated_by: typeof options.requestedBy === 'number' ? options.requestedBy : null,
          params: { ...(options.params ?? {}), report_pack_run_id: runId },
          row_count: rowCount,
          retention_until: retentionUntil,
        });
      } catch (err) {
        failures.push({
          report_type: reportType,
          error: err instanceof Error ? err.message : 'Unknown report generation error',
        });
      }
    }

    const finalStatus = failures.length === 0
      ? 'COMPLETED'
      : outputs.length > 0
        ? 'PARTIAL'
        : 'FAILED';

    let exceptionId: number | null = null;
    if (failures.length > 0) {
      const exception = await exceptionQueueService.createException({
        exception_type: 'OTHER',
        exception_domain: 'REPORT_PACKS',
        severity: finalStatus === 'FAILED' ? 'P1' : 'P2',
        title: `Report pack generation ${finalStatus.toLowerCase()}: ${template.pack_name}`,
        description: failures.map((failure) => `${failure.report_type}: ${failure.error}`).join('; '),
        source_system: 'REPORT_PACK_SERVICE',
        source_object_uri: `report-pack://runs/${runId}`,
        aggregate_type: 'REPORT_PACK_RUN',
        aggregate_id: runId,
        assigned_to_team: 'OPERATIONS',
        client_impact: true,
        details: { run_id: runId, failures },
      });
      exceptionId = exception.id;
    }

    const [updatedRun] = await db
      .update(schema.reportPackRuns)
      .set({
        run_status: finalStatus,
        completed_at: new Date(),
        output_count: outputs.length,
        failure_reason: failures.length > 0 ? JSON.stringify(failures) : null,
        exception_id: exceptionId,
        updated_at: new Date(),
        updated_by: actorToText(options.requestedBy),
      })
      .where(eq(schema.reportPackRuns.id, run.id))
      .returning();

    return { run: updatedRun, outputs, failures };
  },

  async dispatchRun(
    runId: string,
    options: {
      deliveryChannels?: string[];
      recipients?: ReportPackRecipient[];
      actorId?: string | number | null;
    } = {},
  ) {
    const [run] = await db
      .select()
      .from(schema.reportPackRuns)
      .where(eq(schema.reportPackRuns.run_id, runId))
      .limit(1);

    if (!run) {
      throw new NotFoundError(`Report pack run not found: ${runId}`);
    }
    if (run.run_status !== 'COMPLETED' && run.run_status !== 'PARTIAL') {
      throw new ValidationError(`Cannot dispatch report pack run in status ${run.run_status}`);
    }

    const outputs = await db
      .select()
      .from(schema.reportPackOutputs)
      .where(eq(schema.reportPackOutputs.run_id, run.id));

    const deliveryChannels = normalizeStringArray(options.deliveryChannels, ['IN_APP']);
    const recipients = options.recipients?.length ? options.recipients : [];
    const recipient = recipients[0] ?? { recipient_type: 'OPERATIONS', recipient_id: 'BACK_OFFICE' };
    const now = new Date();
    const delivered = [];

    for (const output of outputs) {
      const [updated] = await db
        .update(schema.reportPackOutputs)
        .set({
          delivery_channel: deliveryChannels[0] ?? 'IN_APP',
          recipient_type: recipient.recipient_type,
          recipient_id: recipient.recipient_id,
          delivery_status: 'DELIVERED',
          delivered_at: now,
          delivery_error: null,
          updated_at: now,
          updated_by: actorToText(options.actorId),
        })
        .where(eq(schema.reportPackOutputs.id, output.id))
        .returning();

      await db.insert(schema.notificationLog).values({
        event_type: 'REPORT_PACK_DELIVERED',
        channel: (deliveryChannels[0] ?? 'IN_APP') as any,
        recipient_id: recipient.recipient_id,
        recipient_type: recipient.recipient_type,
        content_hash: output.content_hash,
        sent_at: now,
        delivered_at: now,
        notification_status: 'DELIVERED',
      });
      delivered.push(updated);
    }

    return { run_id: runId, delivered_count: delivered.length, outputs: delivered };
  },

  async retryOutputDelivery(
    outputId: number,
    actorId?: string | number | null,
  ) {
    const [output] = await db
      .select()
      .from(schema.reportPackOutputs)
      .where(eq(schema.reportPackOutputs.id, outputId))
      .limit(1);

    if (!output) {
      throw new NotFoundError(`Report pack output not found: ${outputId}`);
    }

    const retryCount = Number(output.retry_count ?? 0);
    const maxRetries = Number(output.max_retries ?? 3);
    if (retryCount >= maxRetries) {
      const exception = await exceptionQueueService.createException({
        exception_type: 'OTHER',
        exception_domain: 'REPORT_PACKS',
        severity: 'P2',
        title: `Report pack output retry exhausted: ${output.report_type}`,
        description: `Output ${outputId} reached max retry count ${maxRetries}.`,
        source_system: 'REPORT_PACK_SERVICE',
        source_object_uri: `report-pack://outputs/${outputId}`,
        aggregate_type: 'REPORT_PACK_OUTPUT',
        aggregate_id: String(outputId),
        assigned_to_team: 'OPERATIONS',
        client_impact: true,
      });
      const [deadLetter] = await db
        .update(schema.reportPackOutputs)
        .set({
          delivery_status: 'DEAD_LETTER',
          delivery_error: `Max retries exhausted (${maxRetries})`,
          exception_id: exception.id,
          updated_at: new Date(),
          updated_by: actorToText(actorId),
        })
        .where(eq(schema.reportPackOutputs.id, outputId))
        .returning();
      return deadLetter;
    }

    const now = new Date();
    const [updated] = await db
      .update(schema.reportPackOutputs)
      .set({
        delivery_status: 'PENDING',
        retry_count: retryCount + 1,
        last_retry_at: now,
        next_retry_at: nextReportPackRetryAt(retryCount, 15, now),
        delivery_error: null,
        updated_at: now,
        updated_by: actorToText(actorId),
      })
      .where(eq(schema.reportPackOutputs.id, outputId))
      .returning();

    return updated;
  },

  async listRuns(filters: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    const data = await db
      .select()
      .from(schema.reportPackRuns)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.reportPackRuns.requested_at));

    return { data, page, pageSize };
  },
};
