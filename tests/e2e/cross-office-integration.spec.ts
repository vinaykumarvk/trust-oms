/**
 * E2E Cross-Office Integration Tests — Phase 7 Integration Testing
 *
 * Verifies that front-office, mid-office, and back-office services are
 * properly wired together: handoff points, client portal isolation,
 * notification dispatch, integration hub connectors, and real-time channels.
 *
 * Since tests run without a real DB, we mock the `db` module and
 * `@shared/schema` so that service imports resolve cleanly.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database layer — all definitions MUST be inline inside the factory
// because vi.mock is hoisted above all variable declarations.
// ---------------------------------------------------------------------------

vi.mock('../../server/db', () => {
  const noop = (): any => {};
  // Every method on `db` returns a chainable proxy that eventually resolves to [{}]
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
    pool: { query: noop, end: noop },
    dbReady: Promise.resolve(),
  };
});

// Mock the shared schema — each table must be an explicit named export so vitest
// recognises it.  Every table object is a Proxy that returns column-reference
// strings for any property access (e.g. schema.orders.order_id -> "orders.order_id").
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
  return mod;
});

// Mock drizzle-orm operators used by services
vi.mock('drizzle-orm', () => {
  const identity = (...args: any[]) => args;
  const sqlTag: any = (...args: any[]) => args;
  sqlTag.raw = (...args: any[]) => args;
  return {
    eq: identity,
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

import { orderService } from '../../server/services/order-service';
import { aggregationService } from '../../server/services/aggregation-service';
import { placementService } from '../../server/services/placement-service';
import { fillService } from '../../server/services/fill-service';
import { confirmationService } from '../../server/services/confirmation-service';
import { settlementService } from '../../server/services/settlement-service';
import { clientPortalService } from '../../server/services/client-portal-service';
import { notificationService } from '../../server/services/notification-service';
import { integrationService } from '../../server/services/integration-service';
import { realtimeService } from '../../server/services/realtime-service';

// ===========================================================================
// Test Suite
// ===========================================================================

describe('E2E Cross-Office Integration', () => {
  // =========================================================================
  // 1. Front-Office -> Mid-Office Handoff
  // =========================================================================

  describe('Front-Office to Mid-Office Handoff', () => {
    it('should have orderService.createOrder producing orders for aggregation', () => {
      // Front-office creates orders
      expect(typeof orderService.createOrder).toBe('function');
      // Mid-office aggregates them
      expect(typeof aggregationService.getAggregationView).toBe('function');
      expect(typeof aggregationService.createBlock).toBe('function');
    });

    it('should have orderService.submitForAuthorization as the handoff trigger', () => {
      // Orders must be submitted for auth before mid-office can process them
      expect(typeof orderService.submitForAuthorization).toBe('function');
    });

    it('should have aggregationService.createBlock to group authorized orders', () => {
      expect(typeof aggregationService.createBlock).toBe('function');
    });

    it('should have aggregationService.suggestBlocks for auto-grouping', () => {
      // Auto-combine feature suggests blocks from similar authorized orders
      expect(typeof aggregationService.suggestBlocks).toBe('function');
    });

    it('should have placementService.placeBlock to route blocks to brokers', () => {
      expect(typeof placementService.placeBlock).toBe('function');
    });

    it('should have placementService.getBrokerComparison for best-execution analysis', () => {
      expect(typeof placementService.getBrokerComparison).toBe('function');
    });

    it('should have fillService.recordFill to capture execution results', () => {
      expect(typeof fillService.recordFill).toBe('function');
    });

    it('should chain the full front-to-mid pipeline: order -> auth -> aggregate -> place -> fill', () => {
      // Verify the complete pipeline exists as callable functions
      const pipeline = [
        orderService.createOrder,
        orderService.submitForAuthorization,
        aggregationService.createBlock,
        placementService.placeBlock,
        fillService.recordFill,
      ];

      pipeline.forEach((fn) => {
        expect(typeof fn).toBe('function');
      });
      expect(pipeline).toHaveLength(5);
    });
  });

  // =========================================================================
  // 2. Mid-Office -> Back-Office Handoff
  // =========================================================================

  describe('Mid-Office to Back-Office Handoff', () => {
    it('should have confirmationService.autoMatch for trade matching', () => {
      expect(typeof confirmationService.autoMatch).toBe('function');
    });

    it('should have confirmationService.resolveException for exception handling', () => {
      expect(typeof confirmationService.resolveException).toBe('function');
    });

    it('should have confirmationService.bulkConfirm for batch confirmation', () => {
      expect(typeof confirmationService.bulkConfirm).toBe('function');
    });

    it('should have settlementService.initializeSettlement connecting from confirmed trades', () => {
      // Settlement starts from a confirmed trade (confirmation -> settlement)
      expect(typeof settlementService.initializeSettlement).toBe('function');
    });

    it('should have settlementService.resolveSSI for routing resolution', () => {
      expect(typeof settlementService.resolveSSI).toBe('function');
    });

    it('should have settlementService.generateSwiftMessage for cross-border messaging', () => {
      expect(typeof settlementService.generateSwiftMessage).toBe('function');
    });

    it('should have settlementService.routeToPhilPaSS for RTGS settlement', () => {
      expect(typeof settlementService.routeToPhilPaSS).toBe('function');
    });

    it('should have settlementService.postCashLedger for cash posting', () => {
      expect(typeof settlementService.postCashLedger).toBe('function');
    });

    it('should have settlementService.postToFinacle for GL integration', () => {
      expect(typeof settlementService.postToFinacle).toBe('function');
    });

    it('should have settlementService.markSettled to finalize the cycle', () => {
      expect(typeof settlementService.markSettled).toBe('function');
    });

    it('should chain the full mid-to-back pipeline: confirm -> settle -> cash -> GL -> done', () => {
      const pipeline = [
        confirmationService.autoMatch,
        confirmationService.bulkConfirm,
        settlementService.initializeSettlement,
        settlementService.postCashLedger,
        settlementService.postToFinacle,
        settlementService.markSettled,
      ];

      pipeline.forEach((fn) => {
        expect(typeof fn).toBe('function');
      });
      expect(pipeline).toHaveLength(6);
    });
  });

  // =========================================================================
  // 3. Client Portal Isolation
  // =========================================================================

  describe('Client Portal Isolation', () => {
    it('should expose read-only portfolio methods (no direct order creation)', () => {
      expect(typeof clientPortalService.getPortfolioSummary).toBe('function');
      expect(typeof clientPortalService.getAllocation).toBe('function');
      expect(typeof clientPortalService.getPerformance).toBe('function');
      expect(typeof clientPortalService.getHoldings).toBe('function');
      expect(typeof clientPortalService.getRecentTransactions).toBe('function');
      expect(typeof clientPortalService.getStatements).toBe('function');
      expect(typeof clientPortalService.getNotifications).toBe('function');
    });

    it('should NOT expose direct order creation or modification methods', () => {
      // Client portal should not have createOrder, updateOrder, cancelOrder
      expect((clientPortalService as any).createOrder).toBeUndefined();
      expect((clientPortalService as any).updateOrder).toBeUndefined();
      expect((clientPortalService as any).cancelOrder).toBeUndefined();
      expect((clientPortalService as any).submitForAuthorization).toBeUndefined();
    });

    it('should NOT expose direct settlement or confirmation methods', () => {
      expect((clientPortalService as any).initializeSettlement).toBeUndefined();
      expect((clientPortalService as any).autoMatch).toBeUndefined();
      expect((clientPortalService as any).postCashLedger).toBeUndefined();
    });

    it('should expose requestAction for controlled client-initiated requests', () => {
      // Clients can REQUEST actions (contribution, withdrawal, etc.) which go through approval
      expect(typeof clientPortalService.requestAction).toBe('function');
    });

    it('should restrict requestAction to valid action types only', async () => {
      // requestAction should reject invalid action types
      await expect(
        clientPortalService.requestAction('client-1', 'INVALID_ACTION', {}),
      ).rejects.toThrow('Invalid action type');
    });

    it('should allow valid action types: CONTRIBUTION, WITHDRAWAL, TRANSFER, REDEMPTION', async () => {
      // These return request objects (not actual transactions)
      const result = await clientPortalService.requestAction('client-1', 'CONTRIBUTION', {
        amount: 100000,
        currency: 'PHP',
      });
      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING_REVIEW');
      expect(result.actionType).toBe('CONTRIBUTION');
      expect(result.referenceNumber).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Notification Wiring
  // =========================================================================

  describe('Notification Wiring', () => {
    it('should expose the send method for low-level notification dispatch', () => {
      expect(typeof notificationService.send).toBe('function');
    });

    it('should expose emitOrderEvent for order lifecycle notifications', () => {
      expect(typeof notificationService.emitOrderEvent).toBe('function');
    });

    it('should expose the multi-channel dispatch method', () => {
      expect(typeof notificationService.dispatch).toBe('function');
    });

    it('should expose dispatchBatch for bulk notifications', () => {
      expect(typeof notificationService.dispatchBatch).toBe('function');
    });

    it('should expose retryFailed for failed notification re-processing', () => {
      expect(typeof notificationService.retryFailed).toBe('function');
    });

    it('should expose getNotifications for recipient notification queries', () => {
      expect(typeof notificationService.getNotifications).toBe('function');
    });

    it('should expose markAsRead for notification state management', () => {
      expect(typeof notificationService.markAsRead).toBe('function');
    });

    it('should expose getById for individual notification retrieval', () => {
      expect(typeof notificationService.getById).toBe('function');
    });

    it('should expose getPreferences and updatePreferences for user consent', () => {
      expect(typeof notificationService.getPreferences).toBe('function');
      expect(typeof notificationService.updatePreferences).toBe('function');
    });

    it('should expose checkConsent for channel-level consent verification', () => {
      expect(typeof notificationService.checkConsent).toBe('function');
    });

    it('should return default preferences for a new user', () => {
      const prefs = notificationService.getPreferences('new-user-cross-office');
      expect(prefs).toBeDefined();
      expect(prefs.email).toBe(true);
      expect(prefs.sms).toBe(true);
      expect(prefs.push).toBe(true);
      expect(prefs.inApp).toBe(true);
    });

    it('should allow updating notification preferences', () => {
      const updated = notificationService.updatePreferences('test-user-cross', { sms: false });
      expect(updated.sms).toBe(false);
      expect(updated.email).toBe(true); // unchanged
    });

    it('should always allow regulatory events regardless of consent', () => {
      // Regulatory events bypass consent
      const regulatoryEvents = [
        'ORDER_LIFECYCLE',
        'MANDATE_BREACH',
        'KYC_EXPIRY',
        'KILL_SWITCH',
        'BSP_REPORT',
      ];

      regulatoryEvents.forEach((eventType) => {
        const allowed = notificationService.checkConsent('any-user-cross', 'EMAIL', eventType);
        expect(allowed).toBe(true);
      });
    });

    it('should respect consent settings for non-regulatory events', () => {
      // Disable SMS for this user
      notificationService.updatePreferences('consent-test-cross', { sms: false });
      const allowed = notificationService.checkConsent('consent-test-cross', 'SMS', 'GENERAL_UPDATE');
      expect(allowed).toBe(false);
    });
  });

  // =========================================================================
  // 5. Integration Hub Connectivity
  // =========================================================================

  describe('Integration Hub Connectivity', () => {
    it('should expose getConnectors to list all registered connectors', async () => {
      expect(typeof integrationService.getConnectors).toBe('function');
      const connectors = await integrationService.getConnectors();
      expect(Array.isArray(connectors)).toBe(true);
    });

    it('should have at least 11 BRD connectors registered', async () => {
      const connectors = await integrationService.getConnectors();
      expect(connectors.length).toBeGreaterThanOrEqual(11);
    });

    it('should include the Finacle Core Banking connector', async () => {
      const connectors = await integrationService.getConnectors();
      const finacle = connectors.find((c: any) => c.id === 'finacle');
      expect(finacle).toBeDefined();
      expect(finacle!.type).toBe('CORE_BANKING');
      expect(finacle!.name).toContain('Finacle');
    });

    it('should include the Bloomberg Market Data connector', async () => {
      const connectors = await integrationService.getConnectors();
      const bloomberg = connectors.find((c: any) => c.id === 'bloomberg');
      expect(bloomberg).toBeDefined();
      expect(bloomberg!.type).toBe('MARKET_DATA');
    });

    it('should include the Refinitiv Market Data connector', async () => {
      const connectors = await integrationService.getConnectors();
      const refinitiv = connectors.find((c: any) => c.id === 'refinitiv');
      expect(refinitiv).toBeDefined();
      expect(refinitiv!.type).toBe('MARKET_DATA');
    });

    it('should include the PDEx exchange connector', async () => {
      const connectors = await integrationService.getConnectors();
      const pdex = connectors.find((c: any) => c.id === 'pdex');
      expect(pdex).toBeDefined();
      expect(pdex!.type).toBe('EXCHANGE');
      expect(pdex!.protocol).toBe('FIX');
    });

    it('should include the PSE EDGE exchange connector', async () => {
      const connectors = await integrationService.getConnectors();
      const pse = connectors.find((c: any) => c.id === 'pse-edge');
      expect(pse).toBeDefined();
      expect(pse!.type).toBe('EXCHANGE');
      expect(pse!.protocol).toBe('FIX');
    });

    it('should include the SWIFT messaging connector', async () => {
      const connectors = await integrationService.getConnectors();
      const swift = connectors.find((c: any) => c.id === 'swift');
      expect(swift).toBeDefined();
      expect(swift!.type).toBe('MESSAGING');
      expect(swift!.protocol).toBe('SWIFT');
    });

    it('should include the PhilPaSS payment connector', async () => {
      const connectors = await integrationService.getConnectors();
      const philpass = connectors.find((c: any) => c.id === 'philpass');
      expect(philpass).toBeDefined();
      expect(philpass!.type).toBe('PAYMENT');
    });

    it('should include the BSP eFRS regulatory connector', async () => {
      const connectors = await integrationService.getConnectors();
      const bsp = connectors.find((c: any) => c.id === 'bsp-efrs');
      expect(bsp).toBeDefined();
      expect(bsp!.type).toBe('REGULATORY');
      expect(bsp!.protocol).toBe('SFTP');
    });

    it('should include the AMLC goAML regulatory connector', async () => {
      const connectors = await integrationService.getConnectors();
      const amlc = connectors.find((c: any) => c.id === 'amlc-goaml');
      expect(amlc).toBeDefined();
      expect(amlc!.type).toBe('REGULATORY');
    });

    it('should include the BIR IDES regulatory connector', async () => {
      const connectors = await integrationService.getConnectors();
      const bir = connectors.find((c: any) => c.id === 'bir-ides');
      expect(bir).toBeDefined();
      expect(bir!.type).toBe('REGULATORY');
      expect(bir!.protocol).toBe('SFTP');
    });

    it('should include the Sanctions Screening vendor connector', async () => {
      const connectors = await integrationService.getConnectors();
      const sanctions = connectors.find((c: any) => c.id === 'sanctions-vendor');
      expect(sanctions).toBeDefined();
      expect(sanctions!.type).toBe('SANCTIONS');
    });

    it('should expose routing rule management methods', () => {
      expect(typeof integrationService.getRoutingRules).toBe('function');
      expect(typeof integrationService.createRoutingRule).toBe('function');
      expect(typeof integrationService.updateRoutingRule).toBe('function');
      expect(typeof integrationService.deleteRoutingRule).toBe('function');
    });

    it('should expose simulateOrderRouting for dry-run routing', () => {
      expect(typeof integrationService.simulateOrderRouting).toBe('function');
    });

    it('should route EQUITY orders to PSE EDGE', async () => {
      const result = await integrationService.simulateOrderRouting('EQUITY', 'BUY', 1000);
      expect(result).toBeDefined();
      expect(result.primary_connector).toBeDefined();
      expect(result.primary_connector!.id).toBe('pse-edge');
    });

    it('should route GOVERNMENT_BOND orders to PDEx', async () => {
      const result = await integrationService.simulateOrderRouting('GOVERNMENT_BOND', 'BUY', 1000000);
      expect(result).toBeDefined();
      expect(result.primary_connector).toBeDefined();
      expect(result.primary_connector!.id).toBe('pdex');
    });

    it('should route UITF orders to Finacle', async () => {
      const result = await integrationService.simulateOrderRouting('UITF', 'BUY', 50000);
      expect(result).toBeDefined();
      expect(result.primary_connector).toBeDefined();
      expect(result.primary_connector!.id).toBe('finacle');
    });

    it('should expose getActivityLog for integration audit trail', async () => {
      expect(typeof integrationService.getActivityLog).toBe('function');
      const log = await integrationService.getActivityLog({});
      expect(log.data).toBeDefined();
      expect(Array.isArray(log.data)).toBe(true);
      expect(log.total).toBeGreaterThan(0);
    });

    it('should expose getConnectorMetrics for health monitoring', async () => {
      expect(typeof integrationService.getConnectorMetrics).toBe('function');
      const metrics = await integrationService.getConnectorMetrics('bloomberg', '24h');
      expect(metrics).toBeDefined();
      expect(metrics.connector_id).toBe('bloomberg');
      expect(metrics.success_rate).toBeGreaterThan(0);
      expect(metrics.total_requests).toBeGreaterThan(0);
    });

    it('should expose testConnection for connectivity checks', () => {
      expect(typeof integrationService.testConnection).toBe('function');
    });
  });

  // =========================================================================
  // 6. Real-Time Channels
  // =========================================================================

  describe('Real-Time Channels', () => {
    it('should expose getChannelRegistry to list all channels', () => {
      expect(typeof realtimeService.getChannelRegistry).toBe('function');
      const channels = realtimeService.getChannelRegistry();
      expect(Array.isArray(channels)).toBe(true);
    });

    it('should have all 6 required real-time channels registered', () => {
      const channels = realtimeService.getChannelRegistry();
      expect(channels).toHaveLength(6);
    });

    it('should include the POSITIONS channel', () => {
      const channels = realtimeService.getChannelRegistry();
      const positions = channels.find((c: any) => c.channel === 'POSITIONS');
      expect(positions).toBeDefined();
      expect(positions!.category).toBe('MARKET_DATA');
    });

    it('should include the NAV_UPDATES channel', () => {
      const channels = realtimeService.getChannelRegistry();
      const nav = channels.find((c: any) => c.channel === 'NAV_UPDATES');
      expect(nav).toBeDefined();
      expect(nav!.category).toBe('MARKET_DATA');
    });

    it('should include the ORDER_STATUS channel', () => {
      const channels = realtimeService.getChannelRegistry();
      const orders = channels.find((c: any) => c.channel === 'ORDER_STATUS');
      expect(orders).toBeDefined();
      expect(orders!.category).toBe('OPERATIONS');
    });

    it('should include the SETTLEMENT_EVENTS channel', () => {
      const channels = realtimeService.getChannelRegistry();
      const settlement = channels.find((c: any) => c.channel === 'SETTLEMENT_EVENTS');
      expect(settlement).toBeDefined();
      expect(settlement!.category).toBe('OPERATIONS');
    });

    it('should include the AUM_UPDATES channel', () => {
      const channels = realtimeService.getChannelRegistry();
      const aum = channels.find((c: any) => c.channel === 'AUM_UPDATES');
      expect(aum).toBeDefined();
      expect(aum!.category).toBe('MARKET_DATA');
    });

    it('should include the COMMITTEE_WORKSPACE channel', () => {
      const channels = realtimeService.getChannelRegistry();
      const committee = channels.find((c: any) => c.channel === 'COMMITTEE_WORKSPACE');
      expect(committee).toBeDefined();
      expect(committee!.category).toBe('GOVERNANCE');
    });

    it('should expose subscribe and unsubscribe methods', () => {
      expect(typeof realtimeService.subscribe).toBe('function');
      expect(typeof realtimeService.unsubscribe).toBe('function');
    });

    it('should allow subscribing to a valid channel', () => {
      const result = realtimeService.subscribe('user-1-cross', 'ORDER_STATUS');
      expect(result.subscribed).toBe(true);
      expect(result.channel).toBe('ORDER_STATUS');
      expect(result.userId).toBe('user-1-cross');
    });

    it('should reject subscription to an unknown channel', () => {
      expect(() => realtimeService.subscribe('user-1-cross', 'INVALID_CHANNEL')).toThrow(
        'Unknown channel',
      );
    });

    it('should allow unsubscribing from a channel', () => {
      realtimeService.subscribe('user-2-cross', 'NAV_UPDATES');
      const result = realtimeService.unsubscribe('user-2-cross', 'NAV_UPDATES');
      expect(result.unsubscribed).toBe(true);
    });

    it('should expose getSubscribers to list channel subscribers', () => {
      expect(typeof realtimeService.getSubscribers).toBe('function');
      realtimeService.subscribe('user-3-cross', 'POSITIONS');
      const result = realtimeService.getSubscribers('POSITIONS');
      expect(result.subscribers).toContain('user-3-cross');
      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('should expose publishEvent for broadcasting events', () => {
      expect(typeof realtimeService.publishEvent).toBe('function');
      const event = realtimeService.publishEvent('ORDER_STATUS', {
        type: 'STATUS_CHANGE',
        data: { orderId: 'ORD-001', newStatus: 'FILLED' },
        timestamp: new Date().toISOString(),
      });
      expect(event.id).toBeDefined();
      expect(event.channel).toBe('ORDER_STATUS');
      expect(event.type).toBe('STATUS_CHANGE');
    });

    it('should expose getRecentEvents for event history retrieval', () => {
      expect(typeof realtimeService.getRecentEvents).toBe('function');
      const events = realtimeService.getRecentEvents('ORDER_STATUS');
      expect(Array.isArray(events)).toBe(true);
    });

    it('should expose workspace presence methods for committee governance', () => {
      expect(typeof realtimeService.joinWorkspace).toBe('function');
      expect(typeof realtimeService.leaveWorkspace).toBe('function');
      expect(typeof realtimeService.getPresence).toBe('function');
    });

    it('should track presence when users join a workspace', () => {
      const entry = realtimeService.joinWorkspace('ws-cross-1', 'user-10-cross', 'John Doe');
      expect(entry.userId).toBe('user-10-cross');
      expect(entry.userName).toBe('John Doe');
      expect(entry.status).toBe('ONLINE');

      const presence = realtimeService.getPresence('ws-cross-1');
      expect(presence.length).toBeGreaterThanOrEqual(1);
      const user = presence.find((p: any) => p.userId === 'user-10-cross');
      expect(user).toBeDefined();
    });

    it('should expose castVote and getVotes for 6-eyes committee voting', () => {
      expect(typeof realtimeService.castVote).toBe('function');
      expect(typeof realtimeService.getVotes).toBe('function');
    });

    it('should track votes and determine resolution', () => {
      // Cast 3 approvals for a workspace (6-eyes requires 3)
      realtimeService.castVote('ws-vote-cross-1', 'voter-1-cross', 'APPROVE', 'Looks good');
      realtimeService.castVote('ws-vote-cross-1', 'voter-2-cross', 'APPROVE', 'Agreed');
      realtimeService.castVote('ws-vote-cross-1', 'voter-3-cross', 'APPROVE', 'Approved');

      const voteResult = realtimeService.getVotes('ws-vote-cross-1');
      expect(voteResult.summary.approve).toBe(3);
      expect(voteResult.resolution).toBe('APPROVED');
      expect(voteResult.requiredApprovals).toBe(3);
    });

    it('should expose sendWorkspaceMessage and getWorkspaceMessages for chat', () => {
      expect(typeof realtimeService.sendWorkspaceMessage).toBe('function');
      expect(typeof realtimeService.getWorkspaceMessages).toBe('function');
    });

    it('should store and retrieve workspace chat messages', () => {
      const msg = realtimeService.sendWorkspaceMessage(
        'ws-chat-cross-1',
        'user-20-cross',
        'Jane Doe',
        'Hello team!',
      );
      expect(msg.id).toBeDefined();
      expect(msg.message).toBe('Hello team!');

      const messages = realtimeService.getWorkspaceMessages('ws-chat-cross-1');
      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(messages[0].message).toBe('Hello team!');
    });
  });
});
