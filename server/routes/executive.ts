/**
 * Executive Dashboard & Operations Control Tower API Routes (Phase 5B)
 *
 * Provides aggregated data for executive KPIs, AUM, revenue, risk,
 * regulatory filings, operations metrics, and SLA compliance.
 *
 *   GET /aum               -- AUM summary with breakdown and trend
 *   GET /revenue           -- Revenue summary with fee-type and product breakdown
 *   GET /risk              -- Risk summary (breaches, ORE, surveillance)
 *   GET /regulatory-status -- Regulatory filing status table
 *   GET /operations        -- Operations metrics (STP, settlement SLA, recon)
 *   GET /service-sla       -- Service SLA heat-map data
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { executiveDashboardService } from '../services/executive-dashboard-service';

const router = Router();

// =============================================================================
// AUM Summary
// =============================================================================

router.get(
  '/aum',
  asyncHandler(async (_req, res) => {
    const data = await executiveDashboardService.getAumSummary();
    res.json({ data });
  }),
);

// =============================================================================
// Revenue Summary
// =============================================================================

router.get(
  '/revenue',
  asyncHandler(async (_req, res) => {
    const data = await executiveDashboardService.getRevenueSummary();
    res.json({ data });
  }),
);

// =============================================================================
// Risk Summary
// =============================================================================

router.get(
  '/risk',
  asyncHandler(async (_req, res) => {
    const data = await executiveDashboardService.getRiskSummary();
    res.json({ data });
  }),
);

// =============================================================================
// Regulatory Filing Status
// =============================================================================

router.get(
  '/regulatory-status',
  asyncHandler(async (_req, res) => {
    const data = await executiveDashboardService.getRegulatoryFilingStatus();
    res.json({ data });
  }),
);

// =============================================================================
// Operations Metrics
// =============================================================================

router.get(
  '/operations',
  asyncHandler(async (_req, res) => {
    const data = await executiveDashboardService.getOperationsMetrics();
    res.json({ data });
  }),
);

// =============================================================================
// Service SLA Metrics
// =============================================================================

router.get(
  '/service-sla',
  asyncHandler(async (_req, res) => {
    const data = await executiveDashboardService.getServiceSlaMetrics();
    res.json({ data });
  }),
);

export default router;
