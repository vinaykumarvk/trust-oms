import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createHash } from 'crypto';

export const contentPackService = {
  async create(data: {
    pack_name: string;
    jurisdiction_id: number;
    category: string;
    payload: Record<string, unknown>;
  }) {
    const signatureHash = createHash('sha256')
      .update(JSON.stringify(data.payload))
      .digest('hex');

    const [result] = await db
      .insert(schema.contentPacks)
      .values({
        pack_name: data.pack_name,
        jurisdiction_id: data.jurisdiction_id,
        category: data.category,
        payload: data.payload,
        signature_hash: signatureHash,
        pack_status: 'STAGED',
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();

    return result;
  },

  async stage(id: number) {
    const [result] = await db
      .update(schema.contentPacks)
      .set({
        pack_status: 'STAGED',
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.contentPacks.id, id))
      .returning();

    if (!result) throw new Error(`Content pack not found: ${id}`);
    return result;
  },

  async activate(id: number, userId: number) {
    const pack = await db
      .select()
      .from(schema.contentPacks)
      .where(eq(schema.contentPacks.id, id));

    if (!pack.length) throw new Error(`Content pack not found: ${id}`);
    const target = pack[0];

    // Supersede the currently active pack for same jurisdiction + category
    const activePacks = await db
      .select()
      .from(schema.contentPacks)
      .where(
        and(
          eq(schema.contentPacks.jurisdiction_id, target.jurisdiction_id!),
          eq(schema.contentPacks.category, target.category),
          eq(schema.contentPacks.pack_status, 'ACTIVE'),
        ),
      );

    for (const activePack of activePacks) {
      await db
        .update(schema.contentPacks)
        .set({
          pack_status: 'ARCHIVED',
          superseded_by: id,
          updated_by: String(userId),
          updated_at: new Date(),
        })
        .where(eq(schema.contentPacks.id, activePack.id));
    }

    // Activate the target pack
    const now = new Date();
    const [result] = await db
      .update(schema.contentPacks)
      .set({
        pack_status: 'ACTIVE',
        activated_at: now,
        activated_by: userId,
        updated_by: String(userId),
        updated_at: now,
      })
      .where(eq(schema.contentPacks.id, id))
      .returning();

    return result;
  },

  async rollback(id: number) {
    const pack = await db
      .select()
      .from(schema.contentPacks)
      .where(eq(schema.contentPacks.id, id));

    if (!pack.length) throw new Error(`Content pack not found: ${id}`);

    // Mark current pack as rolled back
    await db
      .update(schema.contentPacks)
      .set({
        pack_status: 'ROLLED_BACK',
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.contentPacks.id, id));

    // Restore the most recent archived pack for same jurisdiction + category
    const target = pack[0];
    const archivedPacks = await db
      .select()
      .from(schema.contentPacks)
      .where(
        and(
          eq(schema.contentPacks.jurisdiction_id, target.jurisdiction_id!),
          eq(schema.contentPacks.category, target.category),
          eq(schema.contentPacks.pack_status, 'ARCHIVED'),
        ),
      )
      .orderBy(desc(schema.contentPacks.activated_at))
      .limit(1);

    if (archivedPacks.length > 0) {
      const [restored] = await db
        .update(schema.contentPacks)
        .set({
          pack_status: 'ACTIVE',
          superseded_by: null,
          activated_at: new Date(),
          updated_by: 'system',
          updated_at: new Date(),
        })
        .where(eq(schema.contentPacks.id, archivedPacks[0].id))
        .returning();

      return { rolledBack: id, restored: restored };
    }

    return { rolledBack: id, restored: null };
  },

  async verifySignature(id: number) {
    const pack = await db
      .select()
      .from(schema.contentPacks)
      .where(eq(schema.contentPacks.id, id));

    if (!pack.length) throw new Error(`Content pack not found: ${id}`);

    const target = pack[0];
    const computedHash = createHash('sha256')
      .update(JSON.stringify(target.payload))
      .digest('hex');

    return {
      valid: computedHash === target.signature_hash,
      computed_hash: computedHash,
      stored_hash: target.signature_hash,
    };
  },

  async getAll(filters: {
    status?: string;
    jurisdiction_id?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.contentPacks.is_deleted, false)];

    if (filters.status) {
      conditions.push(eq(schema.contentPacks.pack_status, filters.status as any));
    }
    if (filters.jurisdiction_id) {
      conditions.push(eq(schema.contentPacks.jurisdiction_id, filters.jurisdiction_id));
    }

    const data = await db
      .select()
      .from(schema.contentPacks)
      .where(and(...conditions))
      .orderBy(desc(schema.contentPacks.created_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.contentPacks)
      .where(and(...conditions));

    return { data, total: Number(count), page, pageSize };
  },

  async getById(id: number) {
    const [result] = await db
      .select()
      .from(schema.contentPacks)
      .where(
        and(
          eq(schema.contentPacks.id, id),
          eq(schema.contentPacks.is_deleted, false),
        ),
      );

    if (!result) throw new Error(`Content pack not found: ${id}`);
    return result;
  },
};
