import type { Express } from 'express';
import entityRegistryRouter from './routes/entity-registry';
import backOfficeRouter from './routes/back-office';
import approvalsRouter from './routes/back-office/approvals';
import auditRouter from './routes/back-office/audit';
import kycRouter from './routes/back-office/kyc';
import suitabilityRouter from './routes/suitability';
import ordersRouter from './routes/orders';
import tradesRouter from './routes/trades';
import confirmationsRouter from './routes/confirmations';
import rmDashboardRouter from './routes/rm-dashboard';
import navRouter from './routes/nav';
import settlementsRouter from './routes/settlements';
import eodRouter from './routes/back-office/eod';
import reconRouter from './routes/back-office/reconciliation';
import corporateActionsRouter from './routes/back-office/corporate-actions';
import feesRouter from './routes/back-office/fees';
import taxRouter from './routes/back-office/tax';
import reversalsRouter from './routes/back-office/reversals';
import uploadsRouter from './routes/back-office/uploads';
import transfersRouter from './routes/back-office/transfers';
import contributionsRouter from './routes/back-office/contributions';
import withdrawalsRouter from './routes/back-office/withdrawals';
import complianceLimitsRouter from './routes/back-office/compliance-limits';
import rebalancingRouter from './routes/back-office/rebalancing';
import scheduledPlansRouter from './routes/back-office/scheduled-plans';
import peraRouter from './routes/back-office/pera';
import riskAnalyticsRouter from './routes/back-office/risk-analytics';
import complianceWorkbenchRouter from './routes/back-office/compliance';
import surveillanceRouter from './routes/back-office/surveillance';
import killSwitchRouter from './routes/kill-switch';
import oreRouter from './routes/back-office/ore';
import whistleblowerRouter from './routes/whistleblower';
import executiveRouter from './routes/executive';
import reportsRouter from './routes/back-office/reports';
import notificationsRouter from './routes/notifications';
import clientPortalRouter from './routes/client-portal';
import integrationsRouter from './routes/back-office/integrations';
import realtimeRouter from './routes/realtime';
import scenarioRouter from './routes/scenario';
import aiRouter from './routes/ai';
import authRouter from './routes/auth';

export function registerRoutes(app: Express) {
  // API v1 routes
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', service: 'trustoms-api' });
  });

  // Auth routes (login/refresh are public, others require auth)
  app.use('/api/v1/auth', authRouter);

  // Entity registry — list entities, get entity config, get field configs
  app.use('/api/v1/entity-registry', entityRegistryRouter);

  // Approval queue routes
  app.use('/api/v1/approvals', approvalsRouter);

  // Audit trail routes
  app.use('/api/v1/audit', auditRouter);

  // KYC management routes
  app.use('/api/v1/kyc', kycRouter);

  // Suitability assessment routes
  app.use('/api/v1/suitability', suitabilityRouter);

  // Order management routes
  app.use('/api/v1/orders', ordersRouter);

  // Trades, blocks, and execution routes (Phase 2A)
  app.use('/api/v1/trades', tradesRouter);

  // Confirmation & Matching routes (Phase 2B)
  app.use('/api/v1/confirmations', confirmationsRouter);

  // RM Dashboard routes
  app.use('/api/v1/rm-dashboard', rmDashboardRouter);

  // NAV & Fund Accounting routes (Phase 2C)
  app.use('/api/v1/nav', navRouter);

  // Settlement & Cash Ledger routes (Phase 3A)
  app.use('/api/v1/settlements', settlementsRouter);

  // EOD Processing routes (Phase 3B)
  app.use('/api/v1/eod', eodRouter);

  // Reconciliation routes (Phase 3B)
  app.use('/api/v1/reconciliation', reconRouter);

  // Corporate Actions routes (Phase 3C)
  app.use('/api/v1/corporate-actions', corporateActionsRouter);

  // Fee Engine routes (Phase 3C)
  app.use('/api/v1/fees', feesRouter);

  // Tax Engine routes (Phase 3D)
  app.use('/api/v1/tax', taxRouter);

  // Reversals routes (Phase 3E)
  app.use('/api/v1/reversals', reversalsRouter);

  // Bulk Upload routes (Phase 3E)
  app.use('/api/v1/uploads', uploadsRouter);

  // Transfers routes (Phase 3F)
  app.use('/api/v1/transfers', transfersRouter);

  // Contributions routes (Phase 3F)
  app.use('/api/v1/contributions', contributionsRouter);

  // Withdrawals routes (Phase 3F)
  app.use('/api/v1/withdrawals', withdrawalsRouter);

  // Compliance Limits & Pre/Post-Trade Compliance routes (Phase 3G)
  app.use('/api/v1/compliance-limits', complianceLimitsRouter);

  // Portfolio Modeling & Rebalancing routes (Phase 3H)
  app.use('/api/v1/rebalancing', rebalancingRouter);

  // Scheduled Plans (EIP/ERP/Standing Instructions) routes (Phase 3I)
  app.use('/api/v1/scheduled-plans', scheduledPlansRouter);

  // PERA (Personal Equity & Retirement Account) routes (Phase 3I)
  app.use('/api/v1/pera', peraRouter);

  // Risk Analytics (VaR/Duration/IREP) routes (Phase 3J)
  app.use('/api/v1/risk-analytics', riskAnalyticsRouter);

  // Compliance Workbench & Rules Engine routes (Phase 4A)
  app.use('/api/v1/compliance', complianceWorkbenchRouter);

  // Trade Surveillance routes (Phase 4B)
  app.use('/api/v1/surveillance', surveillanceRouter);

  // Kill-Switch routes (Phase 4B)
  app.use('/api/v1/kill-switch', killSwitchRouter);

  // ORE Ledger routes (Phase 4C)
  app.use('/api/v1/ore', oreRouter);

  // Whistleblower routes (Phase 4C)
  app.use('/api/v1/whistleblower', whistleblowerRouter);

  // Executive Dashboard & Operations Control Tower routes (Phase 5B)
  app.use('/api/v1/executive', executiveRouter);

  // Reports & Analytics Hub routes (Phase 5A)
  app.use('/api/v1/reports', reportsRouter);

  // Notification System routes (Phase 5D)
  app.use('/api/v1/notifications', notificationsRouter);

  // Client Self-Service Portal routes (Phase 5C)
  app.use('/api/v1/client-portal', clientPortalRouter);

  // Integration Hub & External Connectors routes (Phase 6A)
  app.use('/api/v1/integrations', integrationsRouter);

  // What-If Scenario Engine & ESG Scoring routes (Phase 6B)
  app.use('/api/v1/scenario', scenarioRouter);

  // AI Suitability Engine & Intelligent Order Routing routes (Phase 6C)
  app.use('/api/v1/ai', aiRouter);

  // Real-time Subscriptions & Collaborative Workspace routes (Phase 6D)
  app.use('/api/v1/realtime', realtimeRouter);

  // Back-office CRUD routes — all entity data operations
  app.use('/api/v1', backOfficeRouter);
}
