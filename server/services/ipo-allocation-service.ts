/**
 * IPO Allocation Service (Philippines BRD FR-EXE-004)
 *
 * Handles IPO allocation across trust accounts.
 * Orders participating in an IPO are tagged via client_reference = ipoId.
 * Supports PRO_RATA, LOTTERY, and FIXED scaling methods.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

interface IpoAllocationResult {
  order_id: string;
  applied_units: number;
  allotted_units: number;
  scaling_factor: number;
}

export const ipoAllocationService = {
  /**
   * Allocate IPO shares to participating orders.
   *
   * @param ipoId - Identifier for the IPO (matched against orders.client_reference)
   * @param scalingMethod - PRO_RATA | LOTTERY | FIXED
   * @param totalAvailable - Total units available for allotment (required for PRO_RATA and LOTTERY)
   */
  async allocateIPO(
    ipoId: string,
    scalingMethod: 'PRO_RATA' | 'LOTTERY' | 'FIXED',
    totalAvailable?: number,
  ): Promise<{
    totalApplied: number;
    totalAllotted: number;
    allocations: IpoAllocationResult[];
  }> {
    // Fetch all orders tagged with this IPO id via client_reference
    const ipoOrders = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.client_reference, ipoId));

    if (ipoOrders.length === 0) {
      throw new Error(`No orders found for IPO: ${ipoId}`);
    }

    // Calculate total applied units
    const totalApplied = ipoOrders.reduce(
      (sum: number, o: Record<string, unknown>) => sum + parseFloat((o.quantity as string) ?? '0'),
      0,
    );

    if (totalApplied <= 0) {
      throw new Error(`Total applied units for IPO ${ipoId} is zero`);
    }

    const allocations: IpoAllocationResult[] = [];
    let totalAllotted = 0;

    switch (scalingMethod) {
      case 'PRO_RATA': {
        // Pro-rata: allotted = applied * (totalAvailable / totalApplied)
        if (totalAvailable === undefined || totalAvailable <= 0) {
          throw new Error('totalAvailable must be a positive number for PRO_RATA scaling');
        }

        const scalingFactor = Math.min(totalAvailable / totalApplied, 1);
        let allocated = 0;

        for (let i = 0; i < ipoOrders.length; i++) {
          const order = ipoOrders[i];
          const applied = parseFloat(order.quantity ?? '0');

          let allotted: number;
          if (i === ipoOrders.length - 1) {
            // Last order gets the remainder to avoid rounding issues
            allotted = Math.max(
              0,
              Math.floor(totalAvailable - allocated),
            );
          } else {
            allotted = Math.floor(applied * scalingFactor);
          }

          allocated += allotted;
          totalAllotted += allotted;

          allocations.push({
            order_id: order.order_id,
            applied_units: applied,
            allotted_units: allotted,
            scaling_factor: scalingFactor,
          });
        }
        break;
      }

      case 'LOTTERY': {
        // Lottery: randomly select winners until totalAvailable is exhausted
        if (totalAvailable === undefined || totalAvailable <= 0) {
          throw new Error('totalAvailable must be a positive number for LOTTERY scaling');
        }

        // Shuffle orders using Fisher-Yates
        const shuffled = [...ipoOrders];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        let remaining = totalAvailable;

        // Build allocation map (order_id -> allotted)
        const allotmentMap = new Map<string, { allotted: number; scalingFactor: number }>();

        // Initialize all as zero
        for (const order of ipoOrders) {
          allotmentMap.set(order.order_id, { allotted: 0, scalingFactor: 0 });
        }

        // Assign full application amounts to winners in shuffle order
        for (const order of shuffled) {
          if (remaining <= 0) break;

          const applied = parseFloat(order.quantity ?? '0');
          const allotted = Math.min(applied, remaining);
          remaining -= allotted;

          allotmentMap.set(order.order_id, {
            allotted,
            scalingFactor: applied > 0 ? allotted / applied : 0,
          });
        }

        // Build allocations in original order
        for (const order of ipoOrders) {
          const applied = parseFloat(order.quantity ?? '0');
          const entry = allotmentMap.get(order.order_id)!;
          totalAllotted += entry.allotted;

          allocations.push({
            order_id: order.order_id,
            applied_units: applied,
            allotted_units: entry.allotted,
            scaling_factor: entry.scalingFactor,
          });
        }
        break;
      }

      case 'FIXED': {
        // Fixed: allot exact applied amounts (no scaling)
        for (const order of ipoOrders) {
          const applied = parseFloat(order.quantity ?? '0');
          totalAllotted += applied;

          allocations.push({
            order_id: order.order_id,
            applied_units: applied,
            allotted_units: applied,
            scaling_factor: 1,
          });
        }
        break;
      }

      default:
        throw new Error(`Unsupported scaling method: ${scalingMethod}`);
    }

    // Persist allocations to ipoAllocations table
    for (const alloc of allocations) {
      await db.insert(schema.ipoAllocations).values({
        ipo_id: ipoId,
        order_id: alloc.order_id,
        applied_units: String(alloc.applied_units),
        allotted_units: String(alloc.allotted_units),
        scaling_factor: String(alloc.scaling_factor),
        scaling_method: scalingMethod,
      });
    }

    return {
      totalApplied,
      totalAllotted,
      allocations,
    };
  },

  /** Retrieve allocations for a specific IPO */
  async getIPOAllocations(ipoId: string) {
    const allocations = await db
      .select()
      .from(schema.ipoAllocations)
      .where(eq(schema.ipoAllocations.ipo_id, ipoId));

    return allocations;
  },

  /** Get allocation summary stats for an IPO */
  async getIPOSummary(ipoId: string) {
    const result = await db
      .select({
        total_applied: sql<string>`COALESCE(SUM(${schema.ipoAllocations.applied_units}::numeric), 0)`,
        total_allotted: sql<string>`COALESCE(SUM(${schema.ipoAllocations.allotted_units}::numeric), 0)`,
        order_count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.ipoAllocations)
      .where(eq(schema.ipoAllocations.ipo_id, ipoId));

    const row = result[0];
    return {
      ipo_id: ipoId,
      total_applied: parseFloat(row?.total_applied ?? '0'),
      total_allotted: parseFloat(row?.total_allotted ?? '0'),
      order_count: row?.order_count ?? 0,
    };
  },
};
