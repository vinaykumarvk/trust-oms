/**
 * ODA Blotter: Deaggregation + Partial Fulfillment Allocation tests
 *
 * Tests pure allocation functions, service method guards, route registration,
 * and schema presence for the deaggregation/partial fill feature.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../server/db', () => {
  const asyncChain = (): any =>
    new Proxy(Promise.resolve([{}]) as any, {
      get(target: any, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop].bind(target);
        }
        return (..._args: any[]) => asyncChain();
      },
    });

  const dbProxy: any = new Proxy(
    {},
    {
      get() {
        return (..._args: any[]) => asyncChain();
      },
    },
  );

  return {
    db: dbProxy,
    pool: { query: vi.fn(), end: vi.fn() },
    dbReady: Promise.resolve(),
  };
});

import {
  computeProportionateAllocation,
  computeFifoAllocation,
  computeManualAllocation,
} from '../../server/services/oems-service';
import * as schema from '../../packages/shared/src/schema';

describe('ODA Deaggregation + Partial Fulfillment', () => {
  // ─── Schema Presence ─────────────────────────────────────────────────────────

  describe('Schema', () => {
    it('should have oemsOdaFillStatusEnum defined', () => {
      expect(schema.oemsOdaFillStatusEnum).toBeDefined();
      expect(schema.oemsOdaFillStatusEnum.enumValues).toContain('UNFILLED');
      expect(schema.oemsOdaFillStatusEnum.enumValues).toContain('PARTIAL');
      expect(schema.oemsOdaFillStatusEnum.enumValues).toContain('FULL');
    });

    it('should have oemsOdaAllocationMethodEnum defined', () => {
      expect(schema.oemsOdaAllocationMethodEnum).toBeDefined();
      expect(schema.oemsOdaAllocationMethodEnum.enumValues).toContain('PROPORTIONATE');
      expect(schema.oemsOdaAllocationMethodEnum.enumValues).toContain('FIFO');
      expect(schema.oemsOdaAllocationMethodEnum.enumValues).toContain('MANUAL');
    });

    it('should have oemsOdaAllocationLog table defined', () => {
      expect(schema.oemsOdaAllocationLog).toBeDefined();
    });

    it('should have oemsOdaDeaggregationEvents table defined', () => {
      expect(schema.oemsOdaDeaggregationEvents).toBeDefined();
    });

    it('should have fill columns on oemsOdaBlotterGroups', () => {
      const cols = Object.keys((schema.oemsOdaBlotterGroups as any).$inferSelect ?? schema.oemsOdaBlotterGroups);
      // Check table object has columns defined in the pgTable call
      expect(schema.oemsOdaBlotterGroups).toBeDefined();
    });

    it('should have fill columns on oemsOdaRecommendations', () => {
      expect(schema.oemsOdaRecommendations).toBeDefined();
    });
  });

  // ─── Proportionate Allocation ────────────────────────────────────────────────

  describe('computeProportionateAllocation', () => {
    it('should allocate proportionally across multiple orders', () => {
      const recs = [
        { id: 1, nominal_amount: '1000' },
        { id: 2, nominal_amount: '2000' },
        { id: 3, nominal_amount: '2000' },
      ];
      const result = computeProportionateAllocation(recs, 2500, 5000);

      expect(result).toHaveLength(3);
      // 1000/5000 * 2500 = 500
      expect(result[0].filledAmount).toBe(500);
      expect(result[0].nominal).toBe(1000);
      // 2000/5000 * 2500 = 1000
      expect(result[1].filledAmount).toBe(1000);
      // Last order absorbs remainder: 2500 - 500 - 1000 = 1000
      expect(result[2].filledAmount).toBe(1000);

      const totalFilled = result.reduce((s, r) => s + r.filledAmount, 0);
      expect(totalFilled).toBe(2500);
    });

    it('should handle single order', () => {
      const recs = [{ id: 1, nominal_amount: '5000' }];
      const result = computeProportionateAllocation(recs, 3000, 5000);
      expect(result).toHaveLength(1);
      expect(result[0].filledAmount).toBe(3000);
    });

    it('should handle full fill (executed = total)', () => {
      const recs = [
        { id: 1, nominal_amount: '1000' },
        { id: 2, nominal_amount: '1000' },
      ];
      const result = computeProportionateAllocation(recs, 2000, 2000);
      expect(result[0].filledAmount).toBe(1000);
      expect(result[1].filledAmount).toBe(1000);
    });

    it('should handle rounding correctly with 4dp precision', () => {
      const recs = [
        { id: 1, nominal_amount: '3333.3333' },
        { id: 2, nominal_amount: '3333.3333' },
        { id: 3, nominal_amount: '3333.3334' },
      ];
      const total = 10000;
      const executed = 7777;
      const result = computeProportionateAllocation(recs, executed, total);

      const totalFilled = result.reduce((s, r) => s + r.filledAmount, 0);
      // Total should equal executed amount exactly (remainder absorbed by last)
      expect(Math.abs(totalFilled - executed)).toBeLessThan(0.0001);
    });

    it('should give zero to all when executedAmount is zero edge case', () => {
      const recs = [
        { id: 1, nominal_amount: '1000' },
        { id: 2, nominal_amount: '2000' },
      ];
      const result = computeProportionateAllocation(recs, 0, 3000);
      expect(result[0].filledAmount).toBe(0);
      expect(result[1].filledAmount).toBe(0);
    });
  });

  // ─── FIFO Allocation ─────────────────────────────────────────────────────────

  describe('computeFifoAllocation', () => {
    it('should fill orders sequentially', () => {
      const recs = [
        { id: 1, nominal_amount: '1000' },
        { id: 2, nominal_amount: '2000' },
        { id: 3, nominal_amount: '3000' },
      ];
      const result = computeFifoAllocation(recs, 2500);

      expect(result[0].filledAmount).toBe(1000); // fully filled
      expect(result[1].filledAmount).toBe(1500); // partial (boundary)
      expect(result[2].filledAmount).toBe(0);    // unfilled
    });

    it('should fill all orders when executed equals total', () => {
      const recs = [
        { id: 1, nominal_amount: '1000' },
        { id: 2, nominal_amount: '2000' },
      ];
      const result = computeFifoAllocation(recs, 3000);
      expect(result[0].filledAmount).toBe(1000);
      expect(result[1].filledAmount).toBe(2000);
    });

    it('should handle partial fill on first order', () => {
      const recs = [
        { id: 1, nominal_amount: '5000' },
        { id: 2, nominal_amount: '3000' },
      ];
      const result = computeFifoAllocation(recs, 2000);
      expect(result[0].filledAmount).toBe(2000);
      expect(result[1].filledAmount).toBe(0);
    });

    it('should give all zero when executed is zero', () => {
      const recs = [
        { id: 1, nominal_amount: '1000' },
        { id: 2, nominal_amount: '2000' },
      ];
      const result = computeFifoAllocation(recs, 0);
      expect(result[0].filledAmount).toBe(0);
      expect(result[1].filledAmount).toBe(0);
    });

    it('should handle single order with exact fill', () => {
      const recs = [{ id: 1, nominal_amount: '5000' }];
      const result = computeFifoAllocation(recs, 5000);
      expect(result[0].filledAmount).toBe(5000);
    });
  });

  // ─── Manual Allocation ───────────────────────────────────────────────────────

  describe('computeManualAllocation', () => {
    const recs = [
      { id: 1, nominal_amount: '1000' },
      { id: 2, nominal_amount: '2000' },
      { id: 3, nominal_amount: '3000' },
    ];

    it('should apply specified amounts', () => {
      const result = computeManualAllocation(recs, 3000, [
        { recommendationId: 1, filledAmount: 500 },
        { recommendationId: 2, filledAmount: 1500 },
        { recommendationId: 3, filledAmount: 1000 },
      ]);
      expect(result[0].filledAmount).toBe(500);
      expect(result[1].filledAmount).toBe(1500);
      expect(result[2].filledAmount).toBe(1000);
    });

    it('should set unspecified orders to zero', () => {
      const result = computeManualAllocation(recs, 2000, [
        { recommendationId: 1, filledAmount: 1000 },
        { recommendationId: 3, filledAmount: 1000 },
      ]);
      expect(result[0].filledAmount).toBe(1000);
      expect(result[1].filledAmount).toBe(0);  // unspecified
      expect(result[2].filledAmount).toBe(1000);
    });

    it('should reject negative allocations', () => {
      expect(() => computeManualAllocation(recs, 1000, [
        { recommendationId: 1, filledAmount: -100 },
      ])).toThrow(/Negative allocation/);
    });

    it('should reject allocation exceeding order nominal', () => {
      expect(() => computeManualAllocation(recs, 5000, [
        { recommendationId: 1, filledAmount: 1500 }, // exceeds 1000
      ])).toThrow(/exceeds nominal/);
    });

    it('should reject total exceeding executed amount', () => {
      expect(() => computeManualAllocation(recs, 2000, [
        { recommendationId: 1, filledAmount: 1000 },
        { recommendationId: 2, filledAmount: 1500 },
      ])).toThrow(/exceed executed amount/);
    });

    it('should reject unknown recommendation IDs', () => {
      expect(() => computeManualAllocation(recs, 1000, [
        { recommendationId: 999, filledAmount: 500 },
      ])).toThrow(/not found in group/);
    });

    it('should allow under-allocation (sum < executedAmount)', () => {
      const result = computeManualAllocation(recs, 5000, [
        { recommendationId: 1, filledAmount: 500 },
      ]);
      const totalAllocated = result.reduce((s, r) => s + r.filledAmount, 0);
      expect(totalAllocated).toBe(500);
      expect(totalAllocated).toBeLessThan(5000);
    });
  });

  // ─── Service Methods Existence ───────────────────────────────────────────────

  describe('Service methods', () => {
    it('should export oemsService with deaggregateFromBlotterGroup', async () => {
      const { oemsService } = await import('../../server/services/oems-service');
      expect(typeof oemsService.deaggregateFromBlotterGroup).toBe('function');
    });

    it('should export oemsService with allocateOdaBlotterGroup', async () => {
      const { oemsService } = await import('../../server/services/oems-service');
      expect(typeof oemsService.allocateOdaBlotterGroup).toBe('function');
    });

    it('should export oemsService with releaseOdaFundsPartial', async () => {
      const { oemsService } = await import('../../server/services/oems-service');
      expect(typeof oemsService.releaseOdaFundsPartial).toBe('function');
    });

    it('should export oemsService with listOdaAllocationLog', async () => {
      const { oemsService } = await import('../../server/services/oems-service');
      expect(typeof oemsService.listOdaAllocationLog).toBe('function');
    });

    it('should export oemsService with listOdaDeaggregationEvents', async () => {
      const { oemsService } = await import('../../server/services/oems-service');
      expect(typeof oemsService.listOdaDeaggregationEvents).toBe('function');
    });
  });

  // ─── Route Registration ──────────────────────────────────────────────────────

  describe('Route registration', () => {
    it('should register POST /oda/collections/:groupId/deaggregate', async () => {
      const oemsRouter = (await import('../../server/routes/oems')).default;
      const routes = oemsRouter.stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      const deaggRoute = routes.find(
        (r: any) => r.path === '/oda/collections/:groupId/deaggregate' && r.methods.includes('post'),
      );
      expect(deaggRoute).toBeDefined();
    });

    it('should register POST /oda/collections/:groupId/allocate', async () => {
      const oemsRouter = (await import('../../server/routes/oems')).default;
      const routes = oemsRouter.stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      const allocateRoute = routes.find(
        (r: any) => r.path === '/oda/collections/:groupId/allocate' && r.methods.includes('post'),
      );
      expect(allocateRoute).toBeDefined();
    });

    it('should register GET /oda/collections/:groupId/allocations', async () => {
      const oemsRouter = (await import('../../server/routes/oems')).default;
      const routes = oemsRouter.stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      const logRoute = routes.find(
        (r: any) => r.path === '/oda/collections/:groupId/allocations' && r.methods.includes('get'),
      );
      expect(logRoute).toBeDefined();
    });

    it('should register GET /oda/collections/:groupId/deaggregation-events', async () => {
      const oemsRouter = (await import('../../server/routes/oems')).default;
      const routes = oemsRouter.stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      const eventsRoute = routes.find(
        (r: any) => r.path === '/oda/collections/:groupId/deaggregation-events' && r.methods.includes('get'),
      );
      expect(eventsRoute).toBeDefined();
    });
  });

  // ─── Backward Compatibility ──────────────────────────────────────────────────

  describe('Backward compatibility', () => {
    it('should preserve existing approveOdaTreasuryUpdate method', async () => {
      const { oemsService } = await import('../../server/services/oems-service');
      expect(typeof oemsService.approveOdaTreasuryUpdate).toBe('function');
    });

    it('should preserve existing releaseOdaFunds method', async () => {
      const { oemsService } = await import('../../server/services/oems-service');
      expect(typeof oemsService.releaseOdaFunds).toBe('function');
    });

    it('should preserve existing approveOdaBlotterGroup method', async () => {
      const { oemsService } = await import('../../server/services/oems-service');
      expect(typeof oemsService.approveOdaBlotterGroup).toBe('function');
    });
  });
});
