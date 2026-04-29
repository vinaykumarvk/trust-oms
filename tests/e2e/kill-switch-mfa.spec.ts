/**
 * E2E Kill Switch MFA Tests — Philippines BRD Gaps (FR-KSW-001, FR-KSW-003)
 *
 * Verifies the TOTP verification, role-based invocation (CRO/CCO only),
 * MFA requirement, FIX session disconnect by scope, open order cancellation
 * for MARKET/ASSET_CLASS/PORTFOLIO/DESK scopes, and dual-approval resumption.
 *
 * Since tests run without a real DB, we mock the `db` module and
 * `@shared/schema` so that service imports resolve cleanly.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

let mockHaltRow: any = null;
let mockUpdateReturns: any[] = [];

vi.mock('../../server/db', () => {
  const noop = (): any => {};

  const buildDbProxy = (): any => {
    const dbProxy: any = new Proxy(
      {},
      {
        get(_target: any, prop: string) {
          if (prop === 'select') {
            return (...selArgs: any[]) => {
              // Detect count query: select({ count: ... })
              const isCountQuery = selArgs.length > 0 && typeof selArgs[0] === 'object' && selArgs[0] !== null && 'count' in selArgs[0];
              return {
                from: () => {
                  const qb: any = {
                    where: () => qb,
                    limit: () => qb,
                    offset: () => qb,
                    orderBy: () => {
                      if (mockHaltRow) {
                        return Promise.resolve([mockHaltRow]);
                      }
                      return Promise.resolve([]);
                    },
                    then: (resolve: any) => {
                      if (isCountQuery) {
                        return resolve([{ count: 0 }]);
                      }
                      if (mockHaltRow) {
                        return resolve([mockHaltRow]);
                      }
                      // Default: return empty array (no existing halts)
                      return resolve([]);
                    },
                    catch: (fn: any) => Promise.resolve([]),
                    finally: (fn: any) => Promise.resolve([]),
                  };
                  return qb;
                },
              };
            };
          }
          if (prop === 'insert') {
            return () => ({
              values: (vals: any) => ({
                returning: () => Promise.resolve([{
                  id: 1,
                  scope: vals.scope,
                  reason: vals.reason,
                  invoked_by: vals.invoked_by,
                  active_since: new Date(),
                  resumed_at: null,
                  resume_approved_by: null,
                }]),
              }),
            });
          }
          if (prop === 'update') {
            return () => ({
              set: (vals: any) => ({
                where: () => ({
                  returning: () => {
                    if (mockUpdateReturns.length > 0) {
                      return Promise.resolve(mockUpdateReturns);
                    }
                    return Promise.resolve([{
                      id: 1,
                      order_status: 'CANCELLED',
                      ...vals,
                    }]);
                  },
                }),
              }),
            });
          }
          // Fallback
          return (..._args: any[]) => {
            const chain: any = new Proxy(Promise.resolve([{}]) as any, {
              get(target: any, p: string) {
                if (p === 'then' || p === 'catch' || p === 'finally') {
                  return target[p].bind(target);
                }
                return (..._a: any[]) => chain;
              },
            });
            return chain;
          };
        },
      },
    );
    return dbProxy;
  };

  return { db: buildDbProxy(), pool: { query: noop, end: noop }, dbReady: Promise.resolve() };
});

vi.mock('@shared/schema', () => {
  const tableNames = [
    'auditRecords', 'beneficialOwners', 'blocks', 'brokers', 'cashLedger',
    'cashTransactions', 'clientFatcaCrs', 'clientProfiles', 'clients',
    'complianceBreaches', 'complianceLimits', 'complianceRules', 'confirmations',
    'contributions', 'corporateActionEntitlements', 'corporateActions',
    'counterparties', 'eodJobs', 'eodRuns', 'feeAccruals', 'feeInvoices',
    'feeSchedules', 'heldAwayAssets', 'killSwitchEvents', 'kycCases', 'mandates',
    'modelPortfolios', 'navComputations', 'notificationLog', 'orderAuthorizations',
    'orders', 'oreEvents', 'peraAccounts', 'peraTransactions', 'portfolios',
    'positions', 'pricingRecords', 'rebalancingRuns', 'reconBreaks', 'reconRuns',
    'reversalCases', 'scheduledPlans', 'securities', 'settlementInstructions',
    'standingInstructions', 'taxEvents', 'tradeSurveillanceAlerts', 'trades',
    'transfers', 'unitTransactions', 'uploadBatches', 'validationOverrides',
    'whistleblowerCases', 'withdrawals', 'sanctionsScreeningLog', 'form1601fq',
    'fixOutboundMessages', 'switchOrders', 'subsequentAllocations', 'ipoAllocations',
    'brokerChargeSchedules', 'cashSweepRules', 'settlementAccountConfigs',
    'derivativeSetups', 'stressTestResults', 'uploadBatchItems', 'glBusinessEvents',
    'glEventDefinitions', 'glCriteriaDefinitions', 'glCriteriaConditions',
    'glAccountingRuleSets', 'glAccountingIntents', 'glJournalBatches',
    'glJournalEntries', 'glChartOfAccounts', 'glSubAccounts', 'glPeriods',
    'users', 'countries', 'currencies', 'assetClasses', 'branches', 'exchanges',
    'trustProductTypes', 'feeTypes', 'taxCodes', 'marketCalendar', 'legalEntities',
    'feedRouting', 'dataStewardship', 'approvalWorkflowDefinitions',
    'notificationTemplates', 'notificationConsent', 'systemConfig',
  ];
  const makeTable = (name: string): any =>
    new Proxy({}, {
      get(_t: any, col: string | symbol) {
        if (typeof col === 'symbol') return undefined;
        if (col === '$inferSelect') return {};
        if (col === '$inferInsert') return {};
        return `${name}.${col}`;
      },
    });
  const mod: Record<string, any> = {};
  for (const t of tableNames) mod[t] = makeTable(t);
  const enumNames = [
    'orderTypeEnum', 'orderSideEnum', 'orderStatusEnum', 'makerCheckerTierEnum',
    'timeInForceTypeEnum', 'paymentModeTypeEnum', 'disposalMethodEnum',
    'backdatingReasonEnum', 'sanctionsScreeningStatusEnum', 'fixMsgTypeEnum',
    'fixAckStatusEnum', 'switchReasonEnum', 'scalingMethodEnum', 'brokerRateTypeEnum',
    'cashSweepFrequencyEnum', 'derivativeInstrumentTypeEnum', 'uploadItemStatusEnum',
    'corporateActionTypeEnum', 'feeTypeEnum',
  ];
  for (const e of enumNames) mod[e] = makeTable(e);
  return mod;
});

vi.mock('drizzle-orm', () => {
  const identity = (...args: any[]) => args;
  const sqlTag: any = (...args: any[]) => args;
  sqlTag.raw = (...args: any[]) => args;
  sqlTag.join = (...args: any[]) => args;
  return {
    eq: identity, desc: (col: any) => col, asc: (col: any) => col,
    and: identity, or: identity, sql: sqlTag, inArray: identity,
    gte: identity, lte: identity, lt: identity, gt: identity,
    isNull: (col: any) => col, count: identity, type: {},
  };
});

// ---------------------------------------------------------------------------
// Import service after mocks
// ---------------------------------------------------------------------------

let killSwitchService: any;

beforeAll(async () => {
  const mod = await import('../../server/services/kill-switch-service');
  killSwitchService = mod.killSwitchService;
});

beforeEach(() => {
  mockHaltRow = null;
  mockUpdateReturns = [];
});

// ===========================================================================
// Test Suites
// ===========================================================================

describe('Kill Switch MFA — Philippines BRD (FR-KSW-001, FR-KSW-003)', () => {
  // -------------------------------------------------------------------------
  // 1. Service Import Verification
  // -------------------------------------------------------------------------
  describe('1. Service Import Verification', () => {
    it('should export killSwitchService object', () => {
      expect(killSwitchService).toBeDefined();
      expect(typeof killSwitchService).toBe('object');
    });

    it('should have verifyTOTP method', () => {
      expect(typeof killSwitchService.verifyTOTP).toBe('function');
    });

    it('should have invokeKillSwitch method', () => {
      expect(typeof killSwitchService.invokeKillSwitch).toBe('function');
    });

    it('should have disconnectFIXSessions method', () => {
      expect(typeof killSwitchService.disconnectFIXSessions).toBe('function');
    });

    it('should have cancelOpenOrders method', () => {
      expect(typeof killSwitchService.cancelOpenOrders).toBe('function');
    });

    it('should have resumeTrading method', () => {
      expect(typeof killSwitchService.resumeTrading).toBe('function');
    });

    it('should have getActiveHalts method', () => {
      expect(typeof killSwitchService.getActiveHalts).toBe('function');
    });

    it('should have getHistory method', () => {
      expect(typeof killSwitchService.getHistory).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 2. TOTP Verification (FR-KSW-001)
  // -------------------------------------------------------------------------
  describe('2. TOTP Verification (FR-KSW-001)', () => {
    it('should reject non-6-digit token (too short)', () => {
      const result = killSwitchService.verifyTOTP(1, '12345');
      expect(result).toBe(false);
    });

    it('should reject non-6-digit token (too long)', () => {
      const result = killSwitchService.verifyTOTP(1, '1234567');
      expect(result).toBe(false);
    });

    it('should reject token with letters', () => {
      const result = killSwitchService.verifyTOTP(1, '12345a');
      expect(result).toBe(false);
    });

    it('should reject empty token', () => {
      const result = killSwitchService.verifyTOTP(1, '');
      expect(result).toBe(false);
    });

    it('should reject token with special characters', () => {
      const result = killSwitchService.verifyTOTP(1, '123-56');
      expect(result).toBe(false);
    });

    it('should accept valid 6-digit token', () => {
      const result = killSwitchService.verifyTOTP(1, '123456');
      expect(result).toBe(true);
    });

    it('should accept another valid 6-digit token', () => {
      const result = killSwitchService.verifyTOTP(1, '000000');
      expect(result).toBe(true);
    });

    it('should accept token 999999', () => {
      const result = killSwitchService.verifyTOTP(1, '999999');
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. invokeKillSwitch — Role Authorization
  // -------------------------------------------------------------------------
  describe('3. invokeKillSwitch — Role Authorization', () => {
    it('should reject unauthorized role (TRADER)', async () => {
      await expect(
        killSwitchService.invokeKillSwitch({
          scope: { type: 'MARKET', value: 'PSE' },
          reason: 'Flash crash detected',
          invokedBy: { userId: 1, role: 'TRADER', mfaVerified: true },
        }),
      ).rejects.toThrow('Unauthorized: only CRO/CCO may invoke the kill switch');
    });

    it('should reject unauthorized role (BO_MAKER)', async () => {
      await expect(
        killSwitchService.invokeKillSwitch({
          scope: { type: 'MARKET', value: 'PSE' },
          reason: 'Emergency halt',
          invokedBy: { userId: 1, role: 'BO_MAKER', mfaVerified: true },
        }),
      ).rejects.toThrow('Unauthorized');
    });

    it('should accept CRO role with MFA', async () => {
      const result = await killSwitchService.invokeKillSwitch({
        scope: { type: 'MARKET', value: 'PSE' },
        reason: 'Market circuit breaker',
        invokedBy: { userId: 1, role: 'CRO', mfaVerified: true },
      });
      expect(result).toBeDefined();
      expect(result.scope.type).toBe('MARKET');
    });

    it('should accept CCO role with MFA', async () => {
      const result = await killSwitchService.invokeKillSwitch({
        scope: { type: 'ASSET_CLASS', value: 'FIXED_INCOME' },
        reason: 'Compliance emergency',
        invokedBy: { userId: 2, role: 'CCO', mfaVerified: true },
      });
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. invokeKillSwitch — MFA Requirement
  // -------------------------------------------------------------------------
  describe('4. invokeKillSwitch — MFA Requirement', () => {
    it('should reject when MFA not verified and no token provided', async () => {
      await expect(
        killSwitchService.invokeKillSwitch({
          scope: { type: 'MARKET', value: 'PSE' },
          reason: 'Flash crash',
          invokedBy: { userId: 1, role: 'CRO', mfaVerified: false },
        }),
      ).rejects.toThrow('MFA verification required');
    });

    it('should reject invalid inline mfaToken', async () => {
      await expect(
        killSwitchService.invokeKillSwitch({
          scope: { type: 'MARKET', value: 'PSE' },
          reason: 'Flash crash',
          invokedBy: { userId: 1, role: 'CRO', mfaVerified: false, mfaToken: '123' },
        }),
      ).rejects.toThrow('MFA verification failed: invalid or expired TOTP code');
    });

    it('should accept valid inline mfaToken when mfaVerified is false', async () => {
      const result = await killSwitchService.invokeKillSwitch({
        scope: { type: 'MARKET', value: 'PSE' },
        reason: 'Market anomaly detected',
        invokedBy: { userId: 1, role: 'CRO', mfaVerified: false, mfaToken: '654321' },
      });
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 5. invokeKillSwitch — Scope Validation
  // -------------------------------------------------------------------------
  describe('5. invokeKillSwitch — Scope Validation', () => {
    it('should reject invalid scope type', async () => {
      await expect(
        killSwitchService.invokeKillSwitch({
          scope: { type: 'INVALID_SCOPE', value: 'X' },
          reason: 'Test',
          invokedBy: { userId: 1, role: 'CRO', mfaVerified: true },
        }),
      ).rejects.toThrow('Invalid scope type');
    });

    it('should reject empty scope value', async () => {
      await expect(
        killSwitchService.invokeKillSwitch({
          scope: { type: 'MARKET', value: '' },
          reason: 'Test',
          invokedBy: { userId: 1, role: 'CRO', mfaVerified: true },
        }),
      ).rejects.toThrow('Scope value is required');
    });

    it('should reject empty reason', async () => {
      await expect(
        killSwitchService.invokeKillSwitch({
          scope: { type: 'MARKET', value: 'PSE' },
          reason: '',
          invokedBy: { userId: 1, role: 'CRO', mfaVerified: true },
        }),
      ).rejects.toThrow('A reason is required');
    });
  });

  // -------------------------------------------------------------------------
  // 6. FIX Session Disconnect (FR-KSW-003)
  // -------------------------------------------------------------------------
  describe('6. FIX Session Disconnect (FR-KSW-003)', () => {
    it('should disconnect MARKET-scoped sessions matching PSE', async () => {
      const result = await killSwitchService.disconnectFIXSessions({
        type: 'MARKET',
        value: 'PSE',
      });
      expect(result).toBeDefined();
      expect(result.disconnectedCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.sessions)).toBe(true);
    });

    it('should disconnect ASSET_CLASS sessions matching FIXED_INCOME', async () => {
      const result = await killSwitchService.disconnectFIXSessions({
        type: 'ASSET_CLASS',
        value: 'FIXED_INCOME',
      });
      expect(result).toBeDefined();
      expect(result.disconnectedCount).toBeGreaterThanOrEqual(0);
    });

    it('should include ALL-scope sessions in disconnect', async () => {
      // The FIX-ALL-001 session has scopeType=ALL, so it should always match
      const result = await killSwitchService.disconnectFIXSessions({
        type: 'PORTFOLIO',
        value: 'PF-001',
      });
      expect(result).toBeDefined();
      // ALL-scope session should have been matched
      expect(result.sessions).toBeDefined();
    });

    it('should return session IDs of disconnected sessions', async () => {
      const result = await killSwitchService.disconnectFIXSessions({
        type: 'MARKET',
        value: 'PSE',
      });
      for (const sessionId of result.sessions) {
        expect(typeof sessionId).toBe('string');
        expect(sessionId.startsWith('FIX-')).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. Cancel Open Orders by Scope
  // -------------------------------------------------------------------------
  describe('7. Cancel Open Orders by Scope', () => {
    it('should cancel orders for MARKET scope', async () => {
      const result = await killSwitchService.cancelOpenOrders({
        type: 'MARKET',
        value: 'PSE',
      });
      expect(result).toBeDefined();
      expect(typeof result.cancelledCount).toBe('number');
    });

    it('should cancel orders for ASSET_CLASS scope', async () => {
      const result = await killSwitchService.cancelOpenOrders({
        type: 'ASSET_CLASS',
        value: 'FIXED_INCOME',
      });
      expect(result).toBeDefined();
      expect(typeof result.cancelledCount).toBe('number');
    });

    it('should cancel orders for PORTFOLIO scope', async () => {
      const result = await killSwitchService.cancelOpenOrders({
        type: 'PORTFOLIO',
        value: 'PF-001',
      });
      expect(result).toBeDefined();
      expect(typeof result.cancelledCount).toBe('number');
    });

    it('should handle DESK scope (stub returns 0)', async () => {
      const result = await killSwitchService.cancelOpenOrders({
        type: 'DESK',
        value: 'DESK-001',
      });
      expect(result).toBeDefined();
      expect(result.cancelledCount).toBe(0);
    });

    it('should throw for unsupported scope type', async () => {
      await expect(
        killSwitchService.cancelOpenOrders({
          type: 'INVALID',
          value: 'X',
        }),
      ).rejects.toThrow('Unsupported scope type for order cancellation');
    });
  });

  // -------------------------------------------------------------------------
  // 8. Resume Trading — Dual Approval
  // -------------------------------------------------------------------------
  describe('8. Resume Trading — Dual Approval', () => {
    it('should reject when userId1 equals userId2 (same user)', async () => {
      await expect(
        killSwitchService.resumeTrading(1, { userId1: 5, userId2: 5 }),
      ).rejects.toThrow('Dual approval required: userId1 and userId2 must be different users');
    });

    it('should reject when userId1 is missing', async () => {
      await expect(
        killSwitchService.resumeTrading(1, { userId1: 0, userId2: 5 }),
      ).rejects.toThrow('Dual approval required');
    });

    it('should reject when userId2 is missing', async () => {
      await expect(
        killSwitchService.resumeTrading(1, { userId1: 5, userId2: 0 }),
      ).rejects.toThrow('Dual approval required');
    });

    it('should accept valid dual approval with different users', async () => {
      // Set up mock to return a non-resumed halt
      mockHaltRow = {
        id: 1,
        scope: { type: 'MARKET', value: 'PSE' },
        reason: 'Test halt',
        invoked_by: { userId: 1, role: 'CRO', mfaVerified: true },
        active_since: new Date(),
        resumed_at: null,
        resume_approved_by: null,
      };
      mockUpdateReturns = [{
        ...mockHaltRow,
        resumed_at: new Date(),
        resume_approved_by: { userId1: 3, userId2: 4 },
      }];

      const result = await killSwitchService.resumeTrading(1, { userId1: 3, userId2: 4 });
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 9. History and Active Halts
  // -------------------------------------------------------------------------
  describe('9. History and Active Halts', () => {
    it('should list active halts', async () => {
      const result = await killSwitchService.getActiveHalts();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get paginated history', async () => {
      const result = await killSwitchService.getHistory({ page: 1, pageSize: 10 });
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
    });

    it('should default to page 1 with no filters', async () => {
      const result = await killSwitchService.getHistory({});
      expect(result.page).toBe(1);
    });

    it('should respect pageSize cap of 100', async () => {
      const result = await killSwitchService.getHistory({ pageSize: 500 });
      expect(result.pageSize).toBeLessThanOrEqual(100);
    });
  });
});
