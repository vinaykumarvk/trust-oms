import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export const regulatoryCalendarService = {
  async create(data: {
    title: string;
    description?: string;
    regulatory_body?: string;
    jurisdiction_id?: number;
    effective_date: string;
    category?: string;
    impact?: Record<string, unknown>;
  }) {
    const [result] = await db
      .insert(schema.regulatoryCalendar)
      .values({
        title: data.title,
        description: data.description ?? null,
        regulatory_body: data.regulatory_body ?? null,
        jurisdiction_id: data.jurisdiction_id ?? null,
        effective_date: data.effective_date,
        category: data.category ?? null,
        cal_status: 'UPCOMING',
        impact: data.impact ?? null,
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();

    return result;
  },

  async update(id: number, data: Partial<{
    title: string;
    description: string;
    regulatory_body: string;
    jurisdiction_id: number;
    effective_date: string;
    category: string;
    status: string;
    impact: Record<string, unknown>;
  }>) {
    const existing = await db
      .select()
      .from(schema.regulatoryCalendar)
      .where(eq(schema.regulatoryCalendar.id, id));

    if (!existing.length) throw new Error(`Regulatory calendar entry not found: ${id}`);

    const [result] = await db
      .update(schema.regulatoryCalendar)
      .set({
        ...data,
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.regulatoryCalendar.id, id))
      .returning();

    return result;
  },

  async getAll(filters: {
    status?: string;
    jurisdiction_id?: number;
    category?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.regulatoryCalendar.is_deleted, false)];

    if (filters.status) {
      conditions.push(eq(schema.regulatoryCalendar.cal_status, filters.status));
    }
    if (filters.jurisdiction_id) {
      conditions.push(eq(schema.regulatoryCalendar.jurisdiction_id, filters.jurisdiction_id));
    }
    if (filters.category) {
      conditions.push(eq(schema.regulatoryCalendar.category, filters.category));
    }

    const data = await db
      .select()
      .from(schema.regulatoryCalendar)
      .where(and(...conditions))
      .orderBy(desc(schema.regulatoryCalendar.effective_date))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.regulatoryCalendar)
      .where(and(...conditions));

    return { data, total: Number(count), page, pageSize };
  },

  async getById(id: number) {
    const [result] = await db
      .select()
      .from(schema.regulatoryCalendar)
      .where(
        and(
          eq(schema.regulatoryCalendar.id, id),
          eq(schema.regulatoryCalendar.is_deleted, false),
        ),
      );

    if (!result) throw new Error(`Regulatory calendar entry not found: ${id}`);
    return result;
  },

  async getUpcoming(daysAhead: number) {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const nowStr = now.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];

    const data = await db
      .select()
      .from(schema.regulatoryCalendar)
      .where(
        and(
          eq(schema.regulatoryCalendar.is_deleted, false),
          sql`${schema.regulatoryCalendar.effective_date} >= ${nowStr}`,
          sql`${schema.regulatoryCalendar.effective_date} <= ${futureStr}`,
        ),
      )
      .orderBy(schema.regulatoryCalendar.effective_date);

    return data;
  },

  async checkNotifications(businessDate: Date) {
    const dateStr = (offsetDays: number) => {
      const d = new Date(businessDate);
      d.setDate(d.getDate() + offsetDays);
      return d.toISOString().split('T')[0];
    };

    const windows = [
      { label: '30_days', offsetDays: 30 },
      { label: '7_days', offsetDays: 7 },
      { label: '1_day', offsetDays: 1 },
    ];

    const notifications: Record<string, Array<{
      id: number;
      title: string;
      effective_date: string;
      regulatory_body: string | null;
      category: string | null;
    }>> = {};

    for (const window of windows) {
      const targetDate = dateStr(window.offsetDays);
      const items = await db
        .select()
        .from(schema.regulatoryCalendar)
        .where(
          and(
            eq(schema.regulatoryCalendar.is_deleted, false),
            eq(schema.regulatoryCalendar.effective_date, targetDate),
          ),
        );

      notifications[window.label] = items.map((item: typeof items[number]) => ({
        id: item.id,
        title: item.title,
        effective_date: item.effective_date,
        regulatory_body: item.regulatory_body,
        category: item.category,
      }));
    }

    return notifications;
  },
};
