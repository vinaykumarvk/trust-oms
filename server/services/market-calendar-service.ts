import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

export const marketCalendarService = {
  async isBusinessDay(calendarKey: string, dateStr: string): Promise<boolean> {
    const entries = await db
      .select()
      .from(schema.marketCalendar)
      .where(
        and(
          eq(schema.marketCalendar.calendar_key, calendarKey),
          eq(schema.marketCalendar.date, dateStr),
          eq(schema.marketCalendar.is_deleted, false),
        ),
      );
    if (entries.length === 0) return true; // if not in calendar, assume business day
    return entries[0].is_business_day;
  },

  async isSettlementDay(calendarKey: string, dateStr: string): Promise<boolean> {
    const entries = await db
      .select()
      .from(schema.marketCalendar)
      .where(
        and(
          eq(schema.marketCalendar.calendar_key, calendarKey),
          eq(schema.marketCalendar.date, dateStr),
          eq(schema.marketCalendar.is_deleted, false),
        ),
      );
    if (entries.length === 0) return true;
    return entries[0].is_settlement_day;
  },

  async nextBusinessDay(calendarKey: string, fromDate: string, offset: number = 1): Promise<string> {
    let current = new Date(fromDate);
    let remaining = offset;

    while (remaining > 0) {
      current.setDate(current.getDate() + 1);
      const dateStr = current.toISOString().split('T')[0];
      const isBD = await this.isBusinessDay(calendarKey, dateStr);
      if (isBD) remaining--;
    }

    return current.toISOString().split('T')[0];
  },

  async validateCADates(
    calendarKey: string,
    exDate?: string,
    recordDate?: string,
    paymentDate?: string,
  ): Promise<{ valid: boolean; warnings: string[]; suggestions: Record<string, string> }> {
    const warnings: string[] = [];
    const suggestions: Record<string, string> = {};

    if (exDate) {
      const isExBD = await this.isBusinessDay(calendarKey, exDate);
      if (!isExBD) {
        warnings.push(`Ex-date ${exDate} falls on a non-business day`);
        suggestions.exDate = await this.nextBusinessDay(calendarKey, exDate, 0).catch(() => exDate);
        // Find next business day from the day before
        const prev = new Date(exDate);
        prev.setDate(prev.getDate() - 1);
        suggestions.exDate = await this.nextBusinessDay(calendarKey, prev.toISOString().split('T')[0], 1);
      }
    }

    if (recordDate) {
      const isRecBD = await this.isBusinessDay(calendarKey, recordDate);
      if (!isRecBD) {
        warnings.push(`Record date ${recordDate} falls on a non-business day`);
        const prev = new Date(recordDate);
        prev.setDate(prev.getDate() - 1);
        suggestions.recordDate = await this.nextBusinessDay(calendarKey, prev.toISOString().split('T')[0], 1);
      }
    }

    if (paymentDate) {
      const isPaySD = await this.isSettlementDay(calendarKey, paymentDate);
      if (!isPaySD) {
        warnings.push(`Payment date ${paymentDate} falls on a non-settlement day`);
        const prev = new Date(paymentDate);
        prev.setDate(prev.getDate() - 1);
        suggestions.paymentDate = await this.nextBusinessDay(calendarKey, prev.toISOString().split('T')[0], 1);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
      suggestions,
    };
  },

  async getHolidays(calendarKey: string, year: number): Promise<Array<{ date: string; holiday_name: string | null }>> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const entries = await db
      .select()
      .from(schema.marketCalendar)
      .where(
        and(
          eq(schema.marketCalendar.calendar_key, calendarKey),
          eq(schema.marketCalendar.is_business_day, false),
          eq(schema.marketCalendar.is_deleted, false),
          gte(schema.marketCalendar.date, startDate),
          lte(schema.marketCalendar.date, endDate),
        ),
      );

    return entries.map((e: { date: string; holiday_name: string | null }) => ({ date: e.date, holiday_name: e.holiday_name }));
  },
};
