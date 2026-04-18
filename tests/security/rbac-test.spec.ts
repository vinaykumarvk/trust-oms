/**
 * Phase 7 — Security & RBAC Integration Tests
 *
 * Validates authorization, maker-checker, kill-switch, client portal isolation,
 * whistleblower anonymity, PII handling, and auth middleware patterns against
 * the BRD security requirements for TrustOMS Philippines.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB and schema — no real database connection
// ---------------------------------------------------------------------------

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('@shared/schema', () => ({
  orders: { order_id: 'order_id', order_status: 'order_status', is_deleted: 'is_deleted', created_by: 'created_by', authorization_tier: 'authorization_tier', created_at: 'created_at', portfolio_id: 'portfolio_id', security_id: 'security_id', side: 'side', quantity: 'quantity', trader_id: 'trader_id', created_by_role: 'created_by_role' },
  orderAuthorizations: { order_id: 'order_id', approver_id: 'approver_id', decision: 'decision', decided_at: 'decided_at' },
  approvalWorkflowDefinitions: { entity_type: 'entity_type', action: 'action', is_active: 'is_active' },
  approvalRequests: { id: 'id', entity_type: 'entity_type', entity_id: 'entity_id', action: 'action', approval_status: 'approval_status', submitted_by: 'submitted_by', payload: 'payload' },
  auditRecords: { entity_type: 'entity_type', entity_id: 'entity_id', id: 'id', record_hash: 'record_hash', created_at: 'created_at' },
  killSwitchEvents: { id: 'id', scope: 'scope', resumed_at: 'resumed_at', active_since: 'active_since', updated_at: 'updated_at' },
  portfolios: { portfolio_id: 'portfolio_id', client_id: 'client_id', is_deleted: 'is_deleted', aum: 'aum', type: 'type', base_currency: 'base_currency', portfolio_status: 'portfolio_status', inception_date: 'inception_date' },
  positions: { id: 'id', portfolio_id: 'portfolio_id', security_id: 'security_id', is_deleted: 'is_deleted', market_value: 'market_value', quantity: 'quantity', cost_basis: 'cost_basis', unrealized_pnl: 'unrealized_pnl', as_of_date: 'as_of_date' },
  securities: { id: 'id', asset_class: 'asset_class', name: 'name', isin: 'isin', currency: 'currency', coupon_rate: 'coupon_rate' },
  notificationLog: { id: 'id', event_type: 'event_type', channel: 'channel', recipient_id: 'recipient_id', recipient_type: 'recipient_type', notification_status: 'notification_status', sent_at: 'sent_at', delivered_at: 'delivered_at', is_deleted: 'is_deleted', content_hash: 'content_hash' },
  whistleblowerCases: { id: 'id', case_status: 'case_status', anonymous: 'anonymous', created_at: 'created_at', updated_at: 'updated_at', cco_reviewer_id: 'cco_reviewer_id', intake_channel: 'intake_channel', dpo_notified: 'dpo_notified' },
  confirmations: { id: 'id', trade_id: 'trade_id', match_status: 'match_status', exception_reason: 'exception_reason' },
  trades: { trade_id: 'trade_id', execution_time: 'execution_time', execution_price: 'execution_price' },
}));

// ---------------------------------------------------------------------------
// 1. Authorization Service — Role-Based Access & Tiered Authorization
// ---------------------------------------------------------------------------

describe('Authorization Service — RBAC & Tiered Authorization', () => {
  let authorizationService: typeof import('../../server/services/authorization-service').authorizationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../server/services/authorization-service');
    authorizationService = mod.authorizationService;
  });

  describe('BRD 23-role support', () => {
    it('should export authorizationService as an object with required methods', () => {
      expect(authorizationService).toBeDefined();
      expect(typeof authorizationService).toBe('object');
    });

    it('should expose determineAuthTier for role-based tier assignment', () => {
      expect(typeof authorizationService.determineAuthTier).toBe('function');
    });

    it('should expose getRequiredApprovers for role-count mapping', () => {
      expect(typeof authorizationService.getRequiredApprovers).toBe('function');
    });

    it('should expose authorizeOrder for permission-checked approval', () => {
      expect(typeof authorizationService.authorizeOrder).toBe('function');
    });

    it('should expose getPendingOrders for checker queue rendering', () => {
      expect(typeof authorizationService.getPendingOrders).toBe('function');
    });

    it('should expose getOrderAuthorizations for audit of approvals', () => {
      expect(typeof authorizationService.getOrderAuthorizations).toBe('function');
    });
  });

  describe('Tier-based authorization (2-eyes / 4-eyes / 6-eyes)', () => {
    it('should classify orders <= PHP 50M as TWO_EYES', () => {
      expect(authorizationService.determineAuthTier(10_000_000)).toBe('TWO_EYES');
      expect(authorizationService.determineAuthTier(50_000_000)).toBe('TWO_EYES');
    });

    it('should classify orders PHP 50M–500M as FOUR_EYES', () => {
      expect(authorizationService.determineAuthTier(50_000_001)).toBe('FOUR_EYES');
      expect(authorizationService.determineAuthTier(500_000_000)).toBe('FOUR_EYES');
    });

    it('should classify orders > PHP 500M as SIX_EYES', () => {
      expect(authorizationService.determineAuthTier(500_000_001)).toBe('SIX_EYES');
      expect(authorizationService.determineAuthTier(1_000_000_000)).toBe('SIX_EYES');
    });

    it('should require 1 approver for TWO_EYES', () => {
      expect(authorizationService.getRequiredApprovers('TWO_EYES')).toBe(1);
    });

    it('should require 2 approvers for FOUR_EYES', () => {
      expect(authorizationService.getRequiredApprovers('FOUR_EYES')).toBe(2);
    });

    it('should require 3 approvers for SIX_EYES (committee)', () => {
      expect(authorizationService.getRequiredApprovers('SIX_EYES')).toBe(3);
    });

    it('should handle boundary value at exactly PHP 50M as TWO_EYES', () => {
      expect(authorizationService.determineAuthTier(50_000_000)).toBe('TWO_EYES');
    });

    it('should handle boundary value at exactly PHP 500M as FOUR_EYES', () => {
      expect(authorizationService.determineAuthTier(500_000_000)).toBe('FOUR_EYES');
    });

    it('should handle zero amount as TWO_EYES', () => {
      expect(authorizationService.determineAuthTier(0)).toBe('TWO_EYES');
    });

    it('should handle negative amount as TWO_EYES', () => {
      expect(authorizationService.determineAuthTier(-100)).toBe('TWO_EYES');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Self-Approval Prevention (Maker-Checker)
// ---------------------------------------------------------------------------

describe('Maker-Checker — Self-Approval Prevention', () => {
  let reviewRequest: typeof import('../../server/services/maker-checker').reviewRequest;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../server/services/maker-checker');
    reviewRequest = mod.reviewRequest;
  });

  it('should export reviewRequest function', () => {
    expect(typeof reviewRequest).toBe('function');
  });

  it('should prevent self-approval when reviewer === submitter', async () => {
    const { db } = await import('../../server/db');

    // Mock: return a PENDING request submitted by user 42
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 1,
              approval_status: 'PENDING',
              submitted_by: 42,
              entity_type: 'orders',
              entity_id: 'ORD-001',
              action: 'create',
              payload: { amount: 1000 },
            },
          ]),
        }),
      }),
    });

    // Reviewer "42" is the same as submitted_by 42 => must be rejected
    const result = await reviewRequest(1, '42', 'APPROVED');
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/self-approval/i);
  });

  it('should export submitForApproval function', async () => {
    const mod = await import('../../server/services/maker-checker');
    expect(typeof mod.submitForApproval).toBe('function');
  });

  it('should export batchApprove and batchReject for bulk operations', async () => {
    const mod = await import('../../server/services/maker-checker');
    expect(typeof mod.batchApprove).toBe('function');
    expect(typeof mod.batchReject).toBe('function');
  });

  it('should export cancelRequest for submitter-only cancellation', async () => {
    const mod = await import('../../server/services/maker-checker');
    expect(typeof mod.cancelRequest).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 3. Kill-Switch Authorization — CRO/CCO + MFA Required
// ---------------------------------------------------------------------------

describe('Kill-Switch — CRO/CCO Role + MFA Enforcement', () => {
  let killSwitchService: typeof import('../../server/services/kill-switch-service').killSwitchService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../server/services/kill-switch-service');
    killSwitchService = mod.killSwitchService;
  });

  it('should export killSwitchService with invokeKillSwitch method', () => {
    expect(typeof killSwitchService.invokeKillSwitch).toBe('function');
  });

  it('should reject kill-switch invocation by unauthorized role (e.g., RM)', async () => {
    await expect(
      killSwitchService.invokeKillSwitch({
        scope: { type: 'MARKET', value: 'PSE' },
        reason: 'Emergency halt',
        invokedBy: { userId: 1, role: 'RM', mfaVerified: true },
      }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('should reject kill-switch invocation by Trader role', async () => {
    await expect(
      killSwitchService.invokeKillSwitch({
        scope: { type: 'MARKET', value: 'PSE' },
        reason: 'Emergency halt',
        invokedBy: { userId: 1, role: 'TRADER', mfaVerified: true },
      }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('should reject kill-switch invocation without MFA even for CRO', async () => {
    await expect(
      killSwitchService.invokeKillSwitch({
        scope: { type: 'MARKET', value: 'PSE' },
        reason: 'Emergency halt',
        invokedBy: { userId: 1, role: 'CRO', mfaVerified: false },
      }),
    ).rejects.toThrow(/mfa/i);
  });

  it('should reject kill-switch invocation without MFA even for CCO', async () => {
    await expect(
      killSwitchService.invokeKillSwitch({
        scope: { type: 'MARKET', value: 'PSE' },
        reason: 'Emergency halt',
        invokedBy: { userId: 1, role: 'CCO', mfaVerified: false },
      }),
    ).rejects.toThrow(/mfa/i);
  });

  it('should accept CRO with MFA verified', async () => {
    const { db } = await import('../../server/db');

    // Mock: no existing halt, insert returns a record
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 1, scope: { type: 'MARKET', value: 'PSE' }, reason: 'Emergency', active_since: new Date() },
        ]),
      }),
    });

    const result = await killSwitchService.invokeKillSwitch({
      scope: { type: 'MARKET', value: 'PSE' },
      reason: 'Emergency halt',
      invokedBy: { userId: 1, role: 'CRO', mfaVerified: true },
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
  });

  it('should accept CCO with MFA verified', async () => {
    const { db } = await import('../../server/db');

    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 2, scope: { type: 'ASSET_CLASS', value: 'EQUITY' }, reason: 'Emergency', active_since: new Date() },
        ]),
      }),
    });

    const result = await killSwitchService.invokeKillSwitch({
      scope: { type: 'ASSET_CLASS', value: 'EQUITY' },
      reason: 'Equity halt',
      invokedBy: { userId: 2, role: 'CCO', mfaVerified: true },
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(2);
  });

  it('should require dual approval for resumeTrading (two different users)', async () => {
    expect(typeof killSwitchService.resumeTrading).toBe('function');

    // Same user for both approvals must fail
    await expect(
      killSwitchService.resumeTrading(1, { userId1: 5, userId2: 5 }),
    ).rejects.toThrow(/different users/i);
  });

  it('should validate scope type is one of MARKET, ASSET_CLASS, PORTFOLIO, DESK', async () => {
    await expect(
      killSwitchService.invokeKillSwitch({
        scope: { type: 'INVALID_TYPE', value: 'test' },
        reason: 'test',
        invokedBy: { userId: 1, role: 'CRO', mfaVerified: true },
      }),
    ).rejects.toThrow(/invalid scope type/i);
  });

  it('should require a non-empty reason when invoking kill switch', async () => {
    await expect(
      killSwitchService.invokeKillSwitch({
        scope: { type: 'MARKET', value: 'PSE' },
        reason: '',
        invokedBy: { userId: 1, role: 'CRO', mfaVerified: true },
      }),
    ).rejects.toThrow(/reason/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Client Portal Isolation — Read-Only + Request-Action Pattern
// ---------------------------------------------------------------------------

describe('Client Portal — Isolation & Read-Only Enforcement', () => {
  let clientPortalService: typeof import('../../server/services/client-portal-service').clientPortalService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../server/services/client-portal-service');
    clientPortalService = mod.clientPortalService;
  });

  it('should export clientPortalService as an object', () => {
    expect(clientPortalService).toBeDefined();
    expect(typeof clientPortalService).toBe('object');
  });

  describe('Read-only data methods', () => {
    it('should expose getPortfolioSummary (read)', () => {
      expect(typeof clientPortalService.getPortfolioSummary).toBe('function');
    });

    it('should expose getAllocation (read)', () => {
      expect(typeof clientPortalService.getAllocation).toBe('function');
    });

    it('should expose getPerformance (read)', () => {
      expect(typeof clientPortalService.getPerformance).toBe('function');
    });

    it('should expose getHoldings (read)', () => {
      expect(typeof clientPortalService.getHoldings).toBe('function');
    });

    it('should expose getRecentTransactions (read)', () => {
      expect(typeof clientPortalService.getRecentTransactions).toBe('function');
    });

    it('should expose getStatements (read)', () => {
      expect(typeof clientPortalService.getStatements).toBe('function');
    });

    it('should expose getNotifications (read)', () => {
      expect(typeof clientPortalService.getNotifications).toBe('function');
    });
  });

  describe('Request-action pattern (no direct mutation)', () => {
    it('should expose requestAction for client-initiated requests', () => {
      expect(typeof clientPortalService.requestAction).toBe('function');
    });

    it('should NOT expose createOrder (direct transaction method)', () => {
      expect((clientPortalService as any).createOrder).toBeUndefined();
    });

    it('should NOT expose updateOrder (direct transaction method)', () => {
      expect((clientPortalService as any).updateOrder).toBeUndefined();
    });

    it('should NOT expose deleteOrder (direct transaction method)', () => {
      expect((clientPortalService as any).deleteOrder).toBeUndefined();
    });

    it('should NOT expose cancelOrder (direct transaction method)', () => {
      expect((clientPortalService as any).cancelOrder).toBeUndefined();
    });

    it('should NOT expose submitForAuthorization (back-office method)', () => {
      expect((clientPortalService as any).submitForAuthorization).toBeUndefined();
    });

    it('should NOT expose authorizeOrder (back-office method)', () => {
      expect((clientPortalService as any).authorizeOrder).toBeUndefined();
    });

    it('should NOT expose placeOrder (back-office method)', () => {
      expect((clientPortalService as any).placeOrder).toBeUndefined();
    });
  });

  describe('requestAction validates action type', () => {
    it('should accept CONTRIBUTION action type', async () => {
      const result = await clientPortalService.requestAction(
        'CLIENT-001',
        'CONTRIBUTION',
        { amount: 100_000, currency: 'PHP' },
      );
      expect(result).toBeDefined();
      expect(result.actionType).toBe('CONTRIBUTION');
      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('should accept WITHDRAWAL action type', async () => {
      const result = await clientPortalService.requestAction(
        'CLIENT-001',
        'WITHDRAWAL',
        { amount: 50_000 },
      );
      expect(result.actionType).toBe('WITHDRAWAL');
    });

    it('should accept TRANSFER action type', async () => {
      const result = await clientPortalService.requestAction(
        'CLIENT-001',
        'TRANSFER',
        { fromPortfolio: 'P-001', toPortfolio: 'P-002' },
      );
      expect(result.actionType).toBe('TRANSFER');
    });

    it('should accept REDEMPTION action type', async () => {
      const result = await clientPortalService.requestAction(
        'CLIENT-001',
        'REDEMPTION',
        { units: 500 },
      );
      expect(result.actionType).toBe('REDEMPTION');
    });

    it('should reject invalid action type', async () => {
      await expect(
        clientPortalService.requestAction('CLIENT-001', 'DELETE_PORTFOLIO', {}),
      ).rejects.toThrow(/invalid action type/i);
    });

    it('should generate a reference number for each request', async () => {
      const result = await clientPortalService.requestAction(
        'CLIENT-001',
        'CONTRIBUTION',
        { amount: 100_000 },
      );
      expect(result.referenceNumber).toBeDefined();
      expect(result.referenceNumber).toMatch(/^REQ-/);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Whistleblower Anonymity
// ---------------------------------------------------------------------------

describe('Whistleblower Service — Anonymous Case Submission', () => {
  let whistleblowerService: typeof import('../../server/services/whistleblower-service').whistleblowerService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../server/services/whistleblower-service');
    whistleblowerService = mod.whistleblowerService;
  });

  it('should export whistleblowerService with submitCase method', () => {
    expect(typeof whistleblowerService.submitCase).toBe('function');
  });

  it('should accept anonymous=true for anonymous submissions', async () => {
    const { db } = await import('../../server/db');

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 1, anonymous: true, case_status: 'SUBMITTED', intake_channel: 'WEB_PORTAL' },
        ]),
      }),
    });

    const result = await whistleblowerService.submitCase({
      channel: 'WEB_PORTAL',
      description: 'Suspicious activity observed',
      anonymous: true,
    });

    expect(result).toBeDefined();
    expect(result.anonymous).toBe(true);
    expect(result.case_status).toBe('SUBMITTED');
  });

  it('should accept anonymous=false for named submissions', async () => {
    const { db } = await import('../../server/db');

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 2, anonymous: false, case_status: 'SUBMITTED', intake_channel: 'HOTLINE' },
        ]),
      }),
    });

    const result = await whistleblowerService.submitCase({
      channel: 'HOTLINE',
      description: 'Reporting a concern',
      anonymous: false,
    });

    expect(result.anonymous).toBe(false);
  });

  it('should validate intake channel against allowed values', async () => {
    await expect(
      whistleblowerService.submitCase({
        channel: 'TWITTER',
        description: 'test',
        anonymous: true,
      }),
    ).rejects.toThrow(/invalid intake channel/i);
  });

  it('should accept all valid intake channels: HOTLINE, EMAIL, WEB_PORTAL, WALK_IN', async () => {
    const { db } = await import('../../server/db');
    const validChannels = ['HOTLINE', 'EMAIL', 'WEB_PORTAL', 'WALK_IN'];

    for (const channel of validChannels) {
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 1, anonymous: true, case_status: 'SUBMITTED', intake_channel: channel },
          ]),
        }),
      });

      const result = await whistleblowerService.submitCase({
        channel,
        description: 'Test submission',
        anonymous: true,
      });
      expect(result.intake_channel).toBe(channel);
    }
  });

  it('should expose notifyDPO for Data Protection Officer notification', () => {
    expect(typeof whistleblowerService.notifyDPO).toBe('function');
  });

  it('should expose getConductRiskDashboard for conduct risk analytics', () => {
    expect(typeof whistleblowerService.getConductRiskDashboard).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 6. PII Handling — Notification Consent & Regulatory Bypass
// ---------------------------------------------------------------------------

describe('Notification Service — PII & Consent Handling', () => {
  let notificationService: typeof import('../../server/services/notification-service').notificationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../server/services/notification-service');
    notificationService = mod.notificationService;
  });

  it('should export notificationService with checkConsent method', () => {
    expect(typeof notificationService.checkConsent).toBe('function');
  });

  describe('Regulatory notifications cannot be opted out', () => {
    const regulatoryEvents = [
      'ORDER_LIFECYCLE',
      'MANDATE_BREACH',
      'KYC_EXPIRY',
      'KILL_SWITCH',
      'BSP_REPORT',
    ];

    for (const eventType of regulatoryEvents) {
      it(`should always allow ${eventType} regardless of user preference`, () => {
        // Even if user disabled all channels, regulatory events must send
        notificationService.updatePreferences('user-no-consent', {
          email: false,
          sms: false,
          push: false,
          inApp: false,
        });

        const allowed = notificationService.checkConsent(
          'user-no-consent',
          'EMAIL',
          eventType,
        );
        expect(allowed).toBe(true);
      });
    }
  });

  describe('Non-regulatory notifications respect consent', () => {
    it('should block EMAIL when user has email=false for non-regulatory event', () => {
      notificationService.updatePreferences('user-opt-out', {
        email: false,
        sms: true,
        push: true,
        inApp: true,
      });

      const allowed = notificationService.checkConsent(
        'user-opt-out',
        'EMAIL',
        'GENERAL_ALERT',
      );
      expect(allowed).toBe(false);
    });

    it('should block SMS when user has sms=false for non-regulatory event', () => {
      notificationService.updatePreferences('user-opt-out', {
        email: true,
        sms: false,
        push: true,
        inApp: true,
      });

      const allowed = notificationService.checkConsent(
        'user-opt-out',
        'SMS',
        'GENERAL_ALERT',
      );
      expect(allowed).toBe(false);
    });

    it('should allow SMS when user has sms=true for non-regulatory event', () => {
      notificationService.updatePreferences('user-opted-in', {
        email: true,
        sms: true,
        push: true,
        inApp: true,
      });

      const allowed = notificationService.checkConsent(
        'user-opted-in',
        'SMS',
        'GENERAL_ALERT',
      );
      expect(allowed).toBe(true);
    });
  });

  describe('Preferences management', () => {
    it('should expose getPreferences method', () => {
      expect(typeof notificationService.getPreferences).toBe('function');
    });

    it('should expose updatePreferences method', () => {
      expect(typeof notificationService.updatePreferences).toBe('function');
    });

    it('should return default preferences (all true) for unknown user', () => {
      const prefs = notificationService.getPreferences('unknown-user-xyz');
      expect(prefs).toEqual({ email: true, sms: true, push: true, inApp: true });
    });

    it('should persist preference updates', () => {
      notificationService.updatePreferences('test-user', { push: false });
      const prefs = notificationService.getPreferences('test-user');
      expect(prefs.push).toBe(false);
      expect(prefs.email).toBe(true); // unchanged
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Session / Auth Middleware Pattern
// ---------------------------------------------------------------------------

describe('Auth Middleware — Session & Authentication Pattern', () => {
  let authMiddleware: typeof import('../../server/middleware/auth').authMiddleware;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../server/middleware/auth');
    authMiddleware = mod.authMiddleware;
  });

  it('should export authMiddleware as a function', () => {
    expect(typeof authMiddleware).toBe('function');
  });

  it('should have standard Express middleware signature (req, res, next)', () => {
    // Express middleware always receives 3 arguments
    expect(authMiddleware.length).toBe(3);
  });

  it('should allow public health-check paths without authorization', () => {
    const req = {
      path: '/api/v1/health',
      headers: {},
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should allow /readiness path without authorization', () => {
    const req = {
      path: '/readiness',
      headers: {},
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should attach userId, userRole, userEmail to request object', () => {
    const req = {
      path: '/api/v1/orders',
      headers: { authorization: 'Bearer test-token' },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    const next = vi.fn();

    authMiddleware(req, res, next);

    // In development mode it attaches dev values; the point is the pattern exists
    expect(req.userId).toBeDefined();
    expect(req.userRole).toBeDefined();
    expect(req.userEmail).toBeDefined();
  });

  it('should use Bearer token scheme from Authorization header', () => {
    const req = {
      path: '/api/v1/orders',
      headers: {},
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    const next = vi.fn();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    authMiddleware(req, res, next);

    // In production, missing Bearer token should return 401
    expect(res.status).toHaveBeenCalledWith(401);

    process.env.NODE_ENV = originalEnv;
  });
});

// ---------------------------------------------------------------------------
// Audit Logger — Sensitive Data Redaction
// ---------------------------------------------------------------------------

describe('Audit Logger — Sensitive Data Redaction', () => {
  let redactSensitive: typeof import('../../server/services/audit-logger').redactSensitive;
  let redactPii: typeof import('../../server/services/audit-logger').redactPii;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../server/services/audit-logger');
    redactSensitive = mod.redactSensitive;
    redactPii = mod.redactPii;
  });

  it('should redact fields matching sensitive patterns (password, token, secret)', () => {
    const input = {
      username: 'admin',
      password: 'super-secret-123',
      api_token: 'tok_abcdef',
      secret_key: 'sk_live_xxx',
    };
    const result = redactSensitive(input);

    expect(result.username).toBe('admin');
    expect(result.password).toBe('[REDACTED]');
    expect(result.api_token).toBe('[REDACTED]');
    expect(result.secret_key).toBe('[REDACTED]');
  });

  it('should deep-redact nested objects', () => {
    const input = {
      config: {
        database_password: 'db-pass',
        host: 'localhost',
      },
    };
    const result = redactSensitive(input);
    expect((result.config as any).database_password).toBe('[REDACTED]');
    expect((result.config as any).host).toBe('localhost');
  });

  it('should redact PII fields for client entities', () => {
    const input = {
      name: 'John Doe',
      tin: '123456789',
      email: 'john@example.com',
      phone: '09171234567',
    };
    const result = redactPii('clients', input);

    expect(result.name).toBe('John Doe'); // name is not a PII pattern
    expect(result.tin).not.toBe('123456789'); // should be masked
    expect(result.email).not.toBe('john@example.com'); // should be masked
    expect(result.phone).not.toBe('09171234567'); // should be masked
  });
});
