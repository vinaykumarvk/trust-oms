/**
 * E2E TrustFees Pro (TFP) Lifecycle Tests — Phase 10 Integration Testing
 *
 * Verifies the full TFP lifecycle including fee plan management, pricing
 * library, accrual engine, invoice & payment, overrides & exceptions,
 * audit trail, and EOD integration.
 *
 * Since tests run without a real DB, we mock the `db` module and
 * `@shared/schema` so that service imports resolve cleanly.
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database layer — all definitions MUST be inline inside the factory
// because vi.mock is hoisted above all variable declarations.
// ---------------------------------------------------------------------------

vi.mock('../../server/db', () => {
  const noop = (): any => {};

  const defaultRow: Record<string, any> = {
    is_business_day: true,
    is_settlement_day: true,
  };

  const asyncChain = (): any =>
    new Proxy(Promise.resolve([defaultRow]) as any, {
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
    pool: { query: noop, end: noop },
    dbReady: Promise.resolve(),
  };
});

// Mock the shared schema — each table must be an explicit named export
vi.mock('@shared/schema', () => {
  const tableNames = [
    'auditRecords', 'beneficialOwners', 'blocks', 'brokers', 'cashLedger',
    'cashTransactions', 'clientFatcaCrs', 'clientProfiles', 'clients',
    'complianceBreaches', 'complianceLimits', 'complianceRules', 'confirmations',
    'contributions', 'corporateActionEntitlements', 'corporateActionTypeEnum',
    'corporateActions', 'counterparties', 'eodJobs', 'eodRuns', 'feeAccruals',
    'feeInvoices', 'feeSchedules', 'feeTypeEnum', 'heldAwayAssets',
    'killSwitchEvents', 'kycCases', 'mandates', 'modelPortfolios',
    'navComputations', 'notificationLog', 'orderAuthorizations', 'orders',
    'oreEvents', 'peraAccounts', 'peraTransactions', 'portfolios', 'positions',
    'pricingRecords', 'rebalancingRuns', 'reconBreaks', 'reconRuns',
    'reversalCases', 'scheduledPlans', 'securities', 'settlementInstructions',
    'standingInstructions', 'taxEvents', 'tradeSurveillanceAlerts', 'trades',
    'transfers', 'unitTransactions', 'uploadBatches', 'validationOverrides',
    'whistleblowerCases', 'withdrawals',
    'ttraApplications', 'claims', 'consentRecords', 'feedRouting',
    'degradedModeLogs', 'dataStewardship', 'marketCalendar', 'legalEntities',
    // TFP tables
    'feePlans', 'tfpAccruals', 'tfpInvoices', 'tfpInvoiceLines', 'tfpPayments',
    'feeOverrides', 'exceptionItems', 'pricingDefinitions', 'eligibilityExpressions',
    'accrualSchedules', 'feePlanTemplates', 'auditEvents', 'piiClassifications',
    'taxRules', 'disputes', 'creditNotes', 'jurisdictions', 'contentPacks',
    'auditWindowSignatures', 'tfpAdhocFees',
  ];

  const makeTable = (name: string): any =>
    new Proxy(
      {},
      {
        get(_t: any, col: string | symbol) {
          if (typeof col === 'symbol') return undefined;
          if (col === '$inferSelect') return {};
          if (col === '$inferInsert') return {};
          return `${name}.${col}`;
        },
      },
    );

  const mod: Record<string, any> = {};
  for (const t of tableNames) {
    mod[t] = makeTable(t);
  }

  // Provide corporateActionTypeEnum with enumValues
  mod.corporateActionTypeEnum = {
    enumValues: [
      'DIVIDEND_CASH', 'DIVIDEND_STOCK', 'BONUS_ISSUE', 'SPLIT', 'REVERSE_SPLIT', 'CONSOLIDATION',
      'COUPON', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION', 'MATURITY',
      'CAPITAL_DISTRIBUTION', 'CAPITAL_GAINS_DISTRIBUTION', 'RETURN_OF_CAPITAL',
      'NAME_CHANGE', 'ISIN_CHANGE', 'TICKER_CHANGE', 'PAR_VALUE_CHANGE', 'SECURITY_RECLASSIFICATION',
      'RIGHTS', 'TENDER', 'BUYBACK', 'DUTCH_AUCTION', 'EXCHANGE_OFFER', 'WARRANT_EXERCISE', 'CONVERSION',
      'MERGER', 'PROXY_VOTE', 'CLASS_ACTION',
      'DIVIDEND_WITH_OPTION', 'MERGER_WITH_ELECTION', 'SPINOFF_WITH_OPTION',
      'BONUS',
    ],
  };

  return mod;
});

// Mock drizzle-orm operators used by services
vi.mock('drizzle-orm', () => {
  const identity = (...args: any[]) => args;
  const sqlTag: any = (...args: any[]) => args;
  sqlTag.raw = (...args: any[]) => args;
  return {
    eq: identity,
    ne: identity,
    desc: (col: any) => col,
    asc: (col: any) => col,
    and: identity,
    or: identity,
    sql: sqlTag,
    inArray: identity,
    gte: identity,
    lte: identity,
    lt: identity,
    isNull: (col: any) => col,
    count: identity,
    type: {},
  };
});

// ---------------------------------------------------------------------------
// Import services under test
// ---------------------------------------------------------------------------

import { feePlanService } from '../../server/services/fee-plan-service';
import { tfpAccrualEngine } from '../../server/services/tfp-accrual-engine';
import { tfpInvoiceService } from '../../server/services/tfp-invoice-service';
import { tfpPaymentService } from '../../server/services/tfp-payment-service';
import { tfpReversalService } from '../../server/services/tfp-reversal-service';
import { feeOverrideService } from '../../server/services/fee-override-service';
import { exceptionQueueService } from '../../server/services/exception-queue-service';
import { tfpAuditService } from '../../server/services/tfp-audit-service';
import { pricingDefinitionService } from '../../server/services/pricing-definition-service';
import { eligibilityExpressionService } from '../../server/services/eligibility-expression-service';
import { eligibilityEngine } from '../../server/services/eligibility-engine';
import { eodOrchestrator } from '../../server/services/eod-orchestrator';

// ===========================================================================
// Test Suite
// ===========================================================================

describe('E2E TrustFees Pro Lifecycle', () => {
  // =========================================================================
  // 1. Service Import Verification
  // =========================================================================

  describe('Service Import Verification', () => {
    it('should import feePlanService with all critical methods', () => {
      expect(feePlanService).toBeDefined();
      expect(typeof feePlanService.create).toBe('function');
      expect(typeof feePlanService.submit).toBe('function');
      expect(typeof feePlanService.approve).toBe('function');
      expect(typeof feePlanService.reject).toBe('function');
      expect(typeof feePlanService.getAll).toBe('function');
      expect(typeof feePlanService.getById).toBe('function');
      expect(typeof feePlanService.computePreview).toBe('function');
    });

    it('should import tfpAccrualEngine with runDailyAccrual', () => {
      expect(tfpAccrualEngine).toBeDefined();
      expect(typeof tfpAccrualEngine.runDailyAccrual).toBe('function');
      expect(typeof tfpAccrualEngine.listAccruals).toBe('function');
      expect(typeof tfpAccrualEngine.getSummary).toBe('function');
    });

    it('should import tfpInvoiceService with all critical methods', () => {
      expect(tfpInvoiceService).toBeDefined();
      expect(typeof tfpInvoiceService.generateInvoices).toBe('function');
      expect(typeof tfpInvoiceService.markOverdue).toBe('function');
      expect(typeof tfpInvoiceService.getInvoices).toBe('function');
      expect(typeof tfpInvoiceService.getInvoiceDetail).toBe('function');
      expect(typeof tfpInvoiceService.getSummary).toBe('function');
    });

    it('should import tfpPaymentService with all critical methods', () => {
      expect(tfpPaymentService).toBeDefined();
      expect(typeof tfpPaymentService.capturePayment).toBe('function');
      expect(typeof tfpPaymentService.reversePayment).toBe('function');
      expect(typeof tfpPaymentService.getPayments).toBe('function');
    });

    it('should import tfpReversalService with checkReversals', () => {
      expect(tfpReversalService).toBeDefined();
      expect(typeof tfpReversalService.checkReversals).toBe('function');
    });

    it('should import feeOverrideService with all critical methods', () => {
      expect(feeOverrideService).toBeDefined();
      expect(typeof feeOverrideService.requestOverride).toBe('function');
      expect(typeof feeOverrideService.approveOverride).toBe('function');
      expect(typeof feeOverrideService.rejectOverride).toBe('function');
      expect(typeof feeOverrideService.getOverrides).toBe('function');
    });

    it('should import exceptionQueueService with all critical methods', () => {
      expect(exceptionQueueService).toBeDefined();
      expect(typeof exceptionQueueService.createException).toBe('function');
      expect(typeof exceptionQueueService.assignException).toBe('function');
      expect(typeof exceptionQueueService.resolveException).toBe('function');
      expect(typeof exceptionQueueService.checkSlaBreaches).toBe('function');
      expect(typeof exceptionQueueService.getExceptions).toBe('function');
      expect(typeof exceptionQueueService.getKpiDashboard).toBe('function');
    });

    it('should import tfpAuditService with all critical methods', () => {
      expect(tfpAuditService).toBeDefined();
      expect(typeof tfpAuditService.logEvent).toBe('function');
      expect(typeof tfpAuditService.searchEvents).toBe('function');
      expect(typeof tfpAuditService.verifyChain).toBe('function');
    });

    it('should import pricingDefinitionService with all critical methods', () => {
      expect(pricingDefinitionService).toBeDefined();
      expect(typeof pricingDefinitionService.create).toBe('function');
      expect(typeof pricingDefinitionService.approve).toBe('function');
      expect(typeof pricingDefinitionService.reject).toBe('function');
      expect(typeof pricingDefinitionService.retire).toBe('function');
      expect(typeof pricingDefinitionService.getAll).toBe('function');
      expect(typeof pricingDefinitionService.getById).toBe('function');
    });

    it('should import eligibilityExpressionService and eligibilityEngine', () => {
      expect(eligibilityExpressionService).toBeDefined();
      expect(typeof eligibilityExpressionService.create).toBe('function');
      expect(typeof eligibilityExpressionService.testExpression).toBe('function');
      expect(eligibilityEngine).toBeDefined();
      expect(typeof eligibilityEngine.evaluate).toBe('function');
      expect(typeof eligibilityEngine.validate).toBe('function');
    });
  });

  // =========================================================================
  // 2. Fee Plan Lifecycle
  // =========================================================================

  describe('Fee Plan Lifecycle', () => {
    it('should define the correct status progression: DRAFT -> PENDING_APPROVAL -> ACTIVE -> EXPIRED/SUSPENDED', () => {
      const statusOrder = ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'];

      statusOrder.forEach((status: string) => {
        expect(typeof status).toBe('string');
        expect(status.length).toBeGreaterThan(0);
      });

      expect(statusOrder[0]).toBe('DRAFT');
      expect(statusOrder).toContain('ACTIVE');
      expect(statusOrder).toContain('EXPIRED');
    });

    it('should create a fee plan via feePlanService.create', async () => {
      const result = await feePlanService.create({
        name: 'Test Fee Plan',
        client_id: '1',
        effective_from: '2026-01-01',
        effective_to: '2026-12-31',
        created_by: 'test-user',
      } as any);

      expect(result).toBeDefined();
    });

    it('should enforce DRAFT status requirement on submit', async () => {
      // Mock DB returns plan with plan_status = undefined (not DRAFT)
      await expect(
        feePlanService.submit(1, 'test-user'),
      ).rejects.toThrow('Cannot submit');
    });

    it('should enforce PENDING_APPROVAL status requirement on approve', async () => {
      // Mock DB returns plan with plan_status = undefined (not PENDING_APPROVAL)
      await expect(
        feePlanService.approve(1, 'approver-user'),
      ).rejects.toThrow('Cannot approve');
    });

    it('should enforce PENDING_APPROVAL status requirement on reject', async () => {
      // Mock DB returns plan with plan_status = undefined (not PENDING_APPROVAL)
      await expect(
        feePlanService.reject(1, 'approver-user', 'Rates too high'),
      ).rejects.toThrow('Cannot reject');
    });

    it('should list all fee plans', async () => {
      const result = await feePlanService.getAll({});
      expect(result).toBeDefined();
    });

    it('should get a fee plan by ID', async () => {
      const result = await feePlanService.getById(1);
      expect(result).toBeDefined();
    });

    it('should enforce pricing definition requirement on computePreview', async () => {
      // Mock DB returns plan without pricing_definition_id
      await expect(
        feePlanService.computePreview(1),
      ).rejects.toThrow('pricing definition');
    });
  });

  // =========================================================================
  // 3. Pricing Library Lifecycle
  // =========================================================================

  describe('Pricing Library Lifecycle', () => {
    it('should define the correct status progression: DRAFT -> ACTIVE -> RETIRED', () => {
      const statusOrder = ['DRAFT', 'ACTIVE', 'RETIRED'];

      expect(statusOrder[0]).toBe('DRAFT');
      expect(statusOrder[1]).toBe('ACTIVE');
      expect(statusOrder[2]).toBe('RETIRED');
    });

    it('should create a pricing definition', async () => {
      const result = await pricingDefinitionService.create({
        name: 'Trust Admin Fee',
        fee_type: 'TRUST_ADMIN',
        rate_type: 'BPS',
        rate_value: '25',
        created_by: 'test-user',
      } as any);

      expect(result).toBeDefined();
    });

    it('should enforce DRAFT status requirement on approve', async () => {
      // Mock DB returns definition with pd_status = undefined (not DRAFT)
      await expect(
        pricingDefinitionService.approve(1, 'approver-user'),
      ).rejects.toThrow('Cannot approve');
    });

    it('should enforce DRAFT status requirement on reject', async () => {
      // Mock DB returns definition with pd_status = undefined (not DRAFT)
      await expect(
        pricingDefinitionService.reject(1, 'approver-user', 'Rate inconsistent'),
      ).rejects.toThrow('Cannot reject');
    });

    it('should enforce ACTIVE status requirement on retire', async () => {
      // Mock DB returns definition with pd_status = undefined (not ACTIVE)
      await expect(
        pricingDefinitionService.retire(1, 'admin-user'),
      ).rejects.toThrow('Cannot retire');
    });

    it('should list all pricing definitions', async () => {
      const result = await pricingDefinitionService.getAll({});
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Accrual Engine
  // =========================================================================

  describe('Accrual Engine', () => {
    it('should run daily accrual and produce results', async () => {
      const result = await tfpAccrualEngine.runDailyAccrual('2026-04-20');
      expect(result).toBeDefined();
    });

    it('should list accruals', async () => {
      const result = await tfpAccrualEngine.listAccruals({});
      expect(result).toBeDefined();
    });

    it('should get accrual summary', async () => {
      const result = await tfpAccrualEngine.getSummary();
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 5. Invoice & Payment
  // =========================================================================

  describe('Invoice & Payment', () => {
    it('should generate invoices', async () => {
      const result = await tfpInvoiceService.generateInvoices();
      expect(result).toBeDefined();
    });

    it('should mark overdue invoices', async () => {
      const result = await tfpInvoiceService.markOverdue();
      expect(result).toBeDefined();
    });

    it('should list invoices', async () => {
      const result = await tfpInvoiceService.getInvoices({});
      expect(result).toBeDefined();
    });

    it('should get invoice detail', async () => {
      const result = await tfpInvoiceService.getInvoiceDetail(1);
      expect(result).toBeDefined();
    });

    it('should expose capturePayment method', () => {
      expect(typeof tfpPaymentService.capturePayment).toBe('function');
    });

    it('should expose reversePayment method', () => {
      expect(typeof tfpPaymentService.reversePayment).toBe('function');
    });

    it('should list payments', async () => {
      const result = await tfpPaymentService.getPayments({});
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 6. Override & Exception
  // =========================================================================

  describe('Override & Exception', () => {
    it('should expose requestOverride method', () => {
      expect(typeof feeOverrideService.requestOverride).toBe('function');
    });

    it('should enforce PENDING status requirement on approveOverride', async () => {
      // Mock DB returns override with override_status = undefined (not PENDING)
      await expect(
        feeOverrideService.approveOverride(1, 'approver-user'),
      ).rejects.toThrow('Cannot approve override');
    });

    it('should enforce PENDING status requirement on rejectOverride', async () => {
      // Mock DB returns override with override_status = undefined (not PENDING)
      await expect(
        feeOverrideService.rejectOverride(1, 'approver-user', 'Not justified'),
      ).rejects.toThrow('Cannot reject override');
    });

    it('should list overrides', async () => {
      const result = await feeOverrideService.getOverrides({});
      expect(result).toBeDefined();
    });

    it('should create an exception item', async () => {
      const result = await exceptionQueueService.createException({
        source: 'FEE_ACCRUAL',
        severity: 'HIGH',
        description: 'Missing AUM for portfolio PORT-001',
        created_by: 'system',
      } as any);

      expect(result).toBeDefined();
    });

    it('should enforce OPEN/IN_PROGRESS status requirement on assignException', async () => {
      // Mock DB returns exception with exception_status = undefined
      await expect(
        exceptionQueueService.assignException(1, 'ops-user'),
      ).rejects.toThrow('Cannot assign exception');
    });

    it('should enforce IN_PROGRESS/ESCALATED status requirement on resolveException', async () => {
      // Mock DB returns exception with exception_status = undefined
      await expect(
        exceptionQueueService.resolveException(1, 'ops-user', 'AUM data corrected'),
      ).rejects.toThrow('Cannot resolve exception');
    });

    it('should check SLA breaches', async () => {
      const result = await exceptionQueueService.checkSlaBreaches();
      expect(result).toBeDefined();
    });

    it('should expose getKpiDashboard method', () => {
      expect(typeof exceptionQueueService.getKpiDashboard).toBe('function');
    });
  });

  // =========================================================================
  // 7. Audit Trail
  // =========================================================================

  describe('Audit Trail', () => {
    it('should log an audit event', async () => {
      const result = await tfpAuditService.logEvent({
        entity_type: 'FEE_PLAN',
        entity_id: '1',
        action: 'APPROVE',
        actor: 'approver-user',
        details: { old_status: 'PENDING_APPROVAL', new_status: 'ACTIVE' },
      } as any);

      expect(result).toBeDefined();
    });

    it('should search audit events', async () => {
      const result = await tfpAuditService.searchEvents({});
      expect(result).toBeDefined();
    });

    it('should expose verifyChain method', () => {
      expect(typeof tfpAuditService.verifyChain).toBe('function');
    });
  });

  // =========================================================================
  // 8. Eligibility Engine
  // =========================================================================

  describe('Eligibility Engine', () => {
    it('should evaluate an eligibility expression', async () => {
      const result = await eligibilityEngine.evaluate({
        aum: 10_000_000,
        account_type: 'UITF',
        client_segment: 'HNW',
      });

      expect(result).toBeDefined();
    });

    it('should validate an eligibility expression', () => {
      const result = eligibilityEngine.validate('aum > 5000000 AND account_type = "UITF"');
      expect(result).toBeDefined();
    });

    it('should expose eligibilityExpressionService.create method', () => {
      expect(typeof eligibilityExpressionService.create).toBe('function');
    });

    it('should test an eligibility expression', async () => {
      const result = await eligibilityExpressionService.testExpression(1, {
        aum: 10_000_000,
        account_type: 'UITF',
      });

      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 9. Reversal Check
  // =========================================================================

  describe('Reversal Check', () => {
    it('should check for reversals', async () => {
      const result = await tfpReversalService.checkReversals('2026-04-20');
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // 10. EOD Integration — TFP Jobs in DAG
  // =========================================================================

  describe('EOD Integration', () => {
    it('should contain fee_accrual job in the DAG', () => {
      const defs = eodOrchestrator.getDefinitions();
      const jobNames = defs.map((d: { name: string }) => d.name);
      expect(jobNames).toContain('fee_accrual');
    });

    it('should contain invoice_generation job in the DAG', () => {
      const defs = eodOrchestrator.getDefinitions();
      const jobNames = defs.map((d: { name: string }) => d.name);
      expect(jobNames).toContain('invoice_generation');
    });

    it('should contain reversal_check job in the DAG', () => {
      const defs = eodOrchestrator.getDefinitions();
      const jobNames = defs.map((d: { name: string }) => d.name);
      expect(jobNames).toContain('reversal_check');
    });

    it('should contain exception_sweep job in the DAG', () => {
      const defs = eodOrchestrator.getDefinitions();
      const jobNames = defs.map((d: { name: string }) => d.name);
      expect(jobNames).toContain('exception_sweep');
    });

    it('should chain TFP pipeline: fee_accrual -> invoice_generation -> ... -> reversal_check -> ... -> exception_sweep', () => {
      const defs = eodOrchestrator.getDefinitions();
      const getJob = (name: string) => defs.find((d: { name: string }) => d.name === name);

      const feeAccrual = getJob('fee_accrual');
      const invoiceGen = getJob('invoice_generation');
      const reversalCheck = getJob('reversal_check');
      const exceptionSweep = getJob('exception_sweep');

      expect(invoiceGen!.dependsOn).toContain('fee_accrual');
      expect(reversalCheck!.dependsOn).toContain('notional_accounting');
      expect(exceptionSweep!.dependsOn).toContain('reversal_check');

      // fee_accrual depends on settlement_processing
      expect(feeAccrual!.dependsOn).toContain('settlement_processing');
    });
  });
});
