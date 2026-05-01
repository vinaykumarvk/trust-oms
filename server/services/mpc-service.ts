/**
 * mpc-service.ts — Mortgage Participation Certificate Service
 *
 * PSM-78: MPC issuances and cancellation
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError, ConflictError } from './service-errors';

function generateMpcId(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 999999) + 1;
  return `MPC-${year}-${String(seq).padStart(6, '0')}`;
}

function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 999999) + 1;
  return `CERT-${year}-${String(seq).padStart(6, '0')}`;
}

export const mpcService = {
  // ── List MPCs for a facility ──────────────────────────────────────────────
  async listMpcs(facilityId: string) {
    return db.select().from(schema.mpcs)
      .where(and(
        eq(schema.mpcs.facility_id, facilityId),
        eq(schema.mpcs.is_deleted, false),
      ))
      .orderBy(desc(schema.mpcs.created_at));
  },

  // ── Issue MPC ─────────────────────────────────────────────────────────────
  async issueMpc(facilityId: string, data: any, userId: string) {
    // Validate facility exists
    const [facility] = await db.select().from(schema.loanFacilities)
      .where(eq(schema.loanFacilities.facility_id, facilityId)).limit(1);
    if (!facility) throw new NotFoundError('Loan facility not found');

    // Validate total MPC face value <= facility amount
    const [totalResult] = await db.select({
      total: sql<string>`coalesce(sum(${schema.mpcs.face_value}::numeric), 0)`,
    }).from(schema.mpcs)
      .where(and(
        eq(schema.mpcs.facility_id, facilityId),
        eq(schema.mpcs.is_deleted, false),
        eq(schema.mpcs.mpc_status, 'ACTIVE'),
      ));

    const currentTotal = parseFloat(totalResult?.total ?? '0');
    const newFaceValue = parseFloat(data.face_value);
    const facilityAmount = parseFloat(facility.facility_amount);

    if (currentTotal + newFaceValue > facilityAmount) {
      throw new ValidationError(
        `Total MPC face value (${currentTotal + newFaceValue}) would exceed facility amount (${facilityAmount})`,
      );
    }

    const mpcId = generateMpcId();
    const certificateNumber = data.certificate_number || generateCertificateNumber();

    // Check certificate number uniqueness
    const [existing] = await db.select({ id: schema.mpcs.id })
      .from(schema.mpcs)
      .where(eq(schema.mpcs.certificate_number, certificateNumber)).limit(1);
    if (existing) throw new ConflictError(`Certificate number ${certificateNumber} already exists`);

    // Compute participation percentage
    const participationPct = facilityAmount > 0
      ? ((newFaceValue / facilityAmount) * 100).toFixed(6)
      : '0';

    const [record] = await db.insert(schema.mpcs).values({
      mpc_id: mpcId,
      facility_id: facilityId,
      certificate_number: certificateNumber,
      holder_client_id: data.holder_client_id,
      face_value: data.face_value,
      issue_date: data.issue_date || new Date().toISOString().split('T')[0],
      maturity_date: data.maturity_date,
      interest_rate: data.interest_rate,
      mpc_status: 'ACTIVE',
      participation_percentage: participationPct,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return record;
  },

  // ── Cancel MPC ────────────────────────────────────────────────────────────
  async cancelMpc(mpcId: string, reason: string, userId: string) {
    const [mpc] = await db.select().from(schema.mpcs)
      .where(eq(schema.mpcs.mpc_id, mpcId)).limit(1);
    if (!mpc) throw new NotFoundError('MPC not found');

    if (mpc.mpc_status !== 'ACTIVE') {
      throw new ValidationError('Only ACTIVE MPCs can be cancelled');
    }

    if (!reason || reason.trim().length < 10) {
      throw new ValidationError('Cancellation reason must be at least 10 characters');
    }

    const [updated] = await db.update(schema.mpcs).set({
      mpc_status: 'CANCELLED',
      cancellation_date: new Date().toISOString().split('T')[0],
      cancellation_reason: reason,
      updated_at: new Date(),
      updated_by: userId,
    }).where(eq(schema.mpcs.mpc_id, mpcId))
      .returning();
    return updated;
  },

  // ── Transfer MPC ──────────────────────────────────────────────────────────
  async transferMpc(mpcId: string, newHolderId: string, userId: string) {
    const [mpc] = await db.select().from(schema.mpcs)
      .where(eq(schema.mpcs.mpc_id, mpcId)).limit(1);
    if (!mpc) throw new NotFoundError('MPC not found');

    if (mpc.mpc_status !== 'ACTIVE') {
      throw new ValidationError('Only ACTIVE MPCs can be transferred');
    }

    if (mpc.holder_client_id === newHolderId) {
      throw new ValidationError('Cannot transfer MPC to the same holder');
    }

    const [updated] = await db.update(schema.mpcs).set({
      mpc_status: 'TRANSFERRED',
      transfer_date: new Date().toISOString().split('T')[0],
      transferred_to: newHolderId,
      updated_at: new Date(),
      updated_by: userId,
    }).where(eq(schema.mpcs.mpc_id, mpcId))
      .returning();

    // Create new MPC for the transferee
    const newMpcId = generateMpcId();
    const [newMpc] = await db.insert(schema.mpcs).values({
      mpc_id: newMpcId,
      facility_id: mpc.facility_id,
      certificate_number: generateCertificateNumber(),
      holder_client_id: newHolderId,
      face_value: mpc.face_value,
      issue_date: new Date().toISOString().split('T')[0],
      maturity_date: mpc.maturity_date,
      interest_rate: mpc.interest_rate,
      mpc_status: 'ACTIVE',
      participation_percentage: mpc.participation_percentage,
      remarks: `Transferred from ${mpc.mpc_id} (holder: ${mpc.holder_client_id})`,
      created_by: userId,
      updated_by: userId,
    }).returning();

    return { oldMpc: updated, newMpc };
  },

  // ── Summary for a facility ────────────────────────────────────────────────
  async getFacilityMpcSummary(facilityId: string) {
    const [summary] = await db.select({
      total_active: sql<number>`count(*) filter (where ${schema.mpcs.mpc_status} = 'ACTIVE')`,
      total_cancelled: sql<number>`count(*) filter (where ${schema.mpcs.mpc_status} = 'CANCELLED')`,
      total_transferred: sql<number>`count(*) filter (where ${schema.mpcs.mpc_status} = 'TRANSFERRED')`,
      active_face_value: sql<string>`coalesce(sum(${schema.mpcs.face_value}::numeric) filter (where ${schema.mpcs.mpc_status} = 'ACTIVE'), 0)`,
    }).from(schema.mpcs)
      .where(and(
        eq(schema.mpcs.facility_id, facilityId),
        eq(schema.mpcs.is_deleted, false),
      ));
    return summary;
  },
};
