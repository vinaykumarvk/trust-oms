/**
 * CRM Handover Routes
 *
 * Wraps the HAM (Handover & Assignment Management) module's handover service
 * with CRM-specific logic: multi-entity selection, maker-checker workflow,
 * RM history tracking, and delegation auto-expiry.
 */

import { Router } from 'express';
import { requireCRMRole } from '../../middleware/role-auth';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, lte } from 'drizzle-orm';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();

// Create handover request (maker)
router.post('/', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const {
      handover_type,
      from_rm_id,
      to_rm_id,
      reason,
      effective_date,
      end_date,
      entities,
      pending_issues,
    } = req.body;

    if (!entities || entities.length === 0) {
      return res.status(400).json({ error: 'At least one entity must be selected' });
    }

    // RM users can only create handovers from themselves;
    // supervisors (SENIOR_RM, BO_HEAD, SYSTEM_ADMIN) can handover on behalf of others
    const supervisorRoles = ['SENIOR_RM', 'BO_HEAD', 'SYSTEM_ADMIN'];
    const effectiveFromId = supervisorRoles.includes(req.userRole ?? '')
      ? (from_rm_id || userId)
      : userId;

    // Create HAM handover record
    const [handover] = await db.insert(schema.handovers).values({
      handover_type: handover_type || 'PERMANENT',
      from_user_id: effectiveFromId,
      to_user_id: to_rm_id,
      reason,
      effective_date,
      end_date: end_date || null,
      entity_selection: entities,
      pending_issues: pending_issues || null,
      handover_status: 'PENDING_APPROVAL',
      created_by: String(userId),
    } as any).returning();

    res.status(201).json(handover);
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

// Authorize handover (checker)
router.post('/:id/authorize', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const handoverId = parseInt(req.params.id);
    const { action, rejection_reason } = req.body;

    if (action !== 'APPROVE' && action !== 'REJECT') {
      return res.status(400).json({ error: 'action must be APPROVE or REJECT' });
    }

    const [handover] = await db.select().from(schema.handovers)
      .where(eq(schema.handovers.id, handoverId));
    if (!handover) return res.status(404).json({ error: 'Handover not found' });

    // Prevent self-approval: maker cannot be the checker
    if ((handover as any).created_by === String(userId) || (handover as any).from_user_id?.toString() === String(userId)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot approve your own handover request' } });
    }

    if (action === 'REJECT') {
      if (!rejection_reason) {
        return res.status(400).json({ error: 'rejection_reason required' });
      }
      await db.update(schema.handovers)
        .set({
          handover_status: 'REJECTED',
          approved_by: userId,
          approved_at: new Date(),
          rejection_reason,
        } as any)
        .where(eq(schema.handovers.id, handoverId));

      return res.json({ status: 'REJECTED' });
    }

    // Approve: update entities' assigned_rm and create rm_history records
    await db.update(schema.handovers)
      .set({
        handover_status: 'APPROVED',
        approved_by: userId,
        approved_at: new Date(),
      } as any)
      .where(eq(schema.handovers.id, handoverId));

    const entities = (handover as any).entity_selection || [];
    for (const entity of entities) {
      const { entity_type, entity_id } = entity;

      // Update assigned RM on the entity
      if (entity_type === 'LEAD') {
        await db.update(schema.leads)
          .set({ assigned_rm_id: (handover as any).to_user_id })
          .where(eq(schema.leads.id, entity_id));
      } else if (entity_type === 'PROSPECT') {
        await db.update(schema.prospects)
          .set({ assigned_rm_id: (handover as any).to_user_id })
          .where(eq(schema.prospects.id, entity_id));
      }

      // Create rm_history record
      await db.insert(schema.rmHistory).values({
        entity_type: entity_type.toLowerCase(),
        entity_id,
        previous_rm_id: (handover as any).from_user_id,
        new_rm_id: (handover as any).to_user_id,
        change_type: (handover as any).handover_type === 'TEMPORARY' ? 'DELEGATION' : 'HANDOVER',
        handover_id: handoverId,
        effective_date: (handover as any).effective_date || new Date().toISOString().split('T')[0],
      });
    }

    res.json({ status: 'APPROVED', entities_transferred: entities.length });
  } catch (err: unknown) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
});

// List handovers (scoped for RM — they only see their own)
router.get('/', requireCRMRole(), async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const role = (req as any).userRole ?? (req as any).user?.role;
    const supervisorRoles = ['SENIOR_RM', 'BO_MAKER', 'BO_CHECKER', 'BO_HEAD', 'SYSTEM_ADMIN'];
    const isSupervisor = supervisorRoles.includes(role ?? '');

    const handovers = isSupervisor
      ? await db.select().from(schema.handovers)
          .orderBy(desc(schema.handovers.created_at))
          .limit(50)
      : await db.select().from(schema.handovers)
          .where(sql`${schema.handovers.outgoing_rm_id} = ${userId} OR ${schema.handovers.incoming_rm_id} = ${userId}`)
          .orderBy(desc(schema.handovers.created_at))
          .limit(50);

    res.json(handovers);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single handover
router.get('/:id', requireCRMRole(), async (req, res) => {
  try {
    const [handover] = await db.select().from(schema.handovers)
      .where(eq(schema.handovers.id, parseInt(req.params.id)));
    if (!handover) return res.status(404).json({ error: 'Not found' });
    res.json(handover);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get RM history for an entity
router.get('/rm-history/:entityType/:entityId', requireCRMRole(), async (req, res) => {
  try {
    const history = await db.select().from(schema.rmHistory)
      .where(and(
        eq(schema.rmHistory.entity_type, req.params.entityType),
        eq(schema.rmHistory.entity_id, parseInt(req.params.entityId)),
      ))
      .orderBy(desc(schema.rmHistory.effective_date));
    res.json(history);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
