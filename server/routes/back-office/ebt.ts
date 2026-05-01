/**
 * ebt.ts — Employee Benefit Trust (EBT) Routes
 *
 * Back-office API endpoints for EBT plan management, member lifecycle,
 * contributions, balance sheets, separation, reinstatement, claims,
 * loans, gratuity rules, tax rules, and income distribution.
 */

import { Router, Request, Response } from 'express';
import { ebtService, ebtGratuityService } from '../../services/ebt-service';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response) => fn(req, res).catch((err: any) => {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  });
}

// ─── Plans ───────────────────────────────────────────────────────────────────

router.get('/plans', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const plans = await ebtService.listPlans({
    employer_client_id: req.query.employer_client_id as string,
  });
  res.json(plans);
}));

router.get('/plans/:planId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const plan = await ebtService.getPlan(req.params.planId);
  res.json(plan);
}));

router.post('/plans', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const plan = await ebtService.createPlan(req.body, userId);
  res.status(201).json(plan);
}));

router.patch('/plans/:planId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const plan = await ebtService.updatePlan(req.params.planId, req.body, userId);
  res.json(plan);
}));

// ─── Members ─────────────────────────────────────────────────────────────────

router.get('/plans/:planId/members', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const result = await ebtService.listMembers(req.params.planId, {
    status: req.query.status as string,
    page: req.query.page ? parseInt(req.query.page as string) : undefined,
    pageSize: req.query.pageSize ? Math.min(parseInt(req.query.pageSize as string) || 25, 100) : undefined,
  });
  res.json(result);
}));

router.get('/members/:memberId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const member = await ebtService.getMember(req.params.memberId);
  res.json(member);
}));

router.post('/plans/:planId/members', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const member = await ebtService.createMember({ ...req.body, plan_id: req.params.planId }, userId);
  res.status(201).json(member);
}));

router.patch('/members/:memberId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const member = await ebtService.updateMember(req.params.memberId, req.body, userId);
  res.json(member);
}));

// ─── Contributions ───────────────────────────────────────────────────────────

router.get('/members/:memberId/contributions', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const contributions = await ebtService.listContributions(req.params.memberId, {
    type: req.query.type as string,
  });
  res.json(contributions);
}));

router.post('/contributions', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const contribution = await ebtService.recordContribution(req.body, userId);
  res.status(201).json(contribution);
}));

// ─── Balance Sheets (EBT-01: PSM-25) ────────────────────────────────────────

router.post('/members/:memberId/balance-sheet', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const sheet = await ebtService.generateBalanceSheet(
    req.params.memberId, req.body.as_of_date, userId
  );
  res.json(sheet);
}));

router.get('/members/:memberId/balance-sheets', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const sheets = await ebtService.getBalanceSheet(
    req.params.memberId, req.query.as_of_date as string
  );
  res.json(sheets);
}));

// ─── Separation (EBT-03: PSM-35) ────────────────────────────────────────────

router.post('/members/:memberId/validate-separation', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const result = await ebtService.validateSeparationEligibility(
    req.params.memberId, req.body.separation_reason
  );
  res.json(result);
}));

router.post('/members/:memberId/separate', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await ebtService.processSeparation(req.params.memberId, req.body, userId);
  res.json(result);
}));

// ─── Reinstatement (EBT-02: PSM-30) ─────────────────────────────────────────

router.post('/members/:memberId/validate-reinstatement', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const result = await ebtService.validateReinstatement(req.params.memberId);
  res.json(result);
}));

router.post('/members/:memberId/reinstate', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await ebtService.reinstateMemember(req.params.memberId, req.body, userId);
  res.json(result);
}));

// ─── Separation Reasons (EBT-05: PSM-37) ────────────────────────────────────

router.get('/separation-reasons', requireBackOfficeRole(), asyncHandler(async (_req, res) => {
  const reasons = await ebtService.listSeparationReasons();
  res.json(reasons);
}));

router.post('/separation-reasons', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const reason = await ebtService.createSeparationReason(req.body, userId);
  res.status(201).json(reason);
}));

router.patch('/separation-reasons/:id', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const reason = await ebtService.updateSeparationReason(parseInt(req.params.id), req.body, userId);
  res.json(reason);
}));

// ─── Benefit Types (EBT-04: PSM-36) ─────────────────────────────────────────

router.get('/benefit-types', requireBackOfficeRole(), asyncHandler(async (_req, res) => {
  const types = await ebtService.listBenefitTypes();
  res.json(types);
}));

router.post('/benefit-types', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const bt = await ebtService.createBenefitType(req.body, userId);
  res.status(201).json(bt);
}));

router.patch('/benefit-types/:id', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const bt = await ebtService.updateBenefitType(parseInt(req.params.id), req.body, userId);
  res.json(bt);
}));

// ─── Benefit Claims ──────────────────────────────────────────────────────────

router.get('/claims', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const claims = await ebtService.listClaims({
    plan_id: req.query.plan_id as string,
    member_id: req.query.member_id as string,
    status: req.query.status as string,
  });
  res.json(claims);
}));

router.post('/claims', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const claim = await ebtService.createClaim(req.body, userId);
  res.status(201).json(claim);
}));

router.post('/claims/:claimId/approve', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const claim = await ebtService.approveClaim(req.params.claimId, userId);
  res.json(claim);
}));

router.post('/claims/:claimId/release', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const claim = await ebtService.releaseClaim(req.params.claimId, userId);
  res.json(claim);
}));

// ─── Loans (EBT-06, EBT-07: PSM-38, PSM-39) ────────────────────────────────

router.get('/members/:memberId/loans', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const loans = await ebtService.listLoans(req.params.memberId);
  res.json(loans);
}));

router.post('/loans', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const loan = await ebtService.interfaceLoan(req.body, userId);
  res.status(201).json(loan);
}));

router.patch('/loans/:loanId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const loan = await ebtService.updateLoan(req.params.loanId, req.body, userId);
  res.json(loan);
}));

router.post('/loans/bulk-interface', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!Array.isArray(req.body.loans)) return res.status(400).json({ error: 'loans array required' });
  const results = await ebtService.bulkInterfaceLoans(req.body.loans, userId);
  res.status(201).json(results);
}));

// ─── Gratuity Rules (EBT-10: PSM-18) ────────────────────────────────────────

router.get('/plans/:planId/gratuity-rules', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const rules = await ebtGratuityService.listGratuityRules(req.params.planId);
  res.json(rules);
}));

router.post('/gratuity-rules', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const rule = await ebtGratuityService.createGratuityRule(req.body, userId);
  res.status(201).json(rule);
}));

router.post('/compute-gratuity', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const { plan_id, member_id, years_of_service, monthly_salary, separation_reason } = req.body;
  const result = await ebtGratuityService.computeGratuity(
    plan_id, member_id, parseFloat(years_of_service), parseFloat(monthly_salary), separation_reason
  );
  res.json(result);
}));

// ─── Tax Rules (EBT-11, EBT-12: PSM-19, PSM-20) ────────────────────────────

router.get('/plans/:planId/tax-rules', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const rules = await ebtGratuityService.listTaxRules(req.params.planId);
  res.json(rules);
}));

router.post('/tax-rules', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const rule = await ebtGratuityService.createTaxRule(req.body, userId);
  res.status(201).json(rule);
}));

// ─── Income Distribution (EBT-13: PSM-21) ───────────────────────────────────

router.get('/plans/:planId/income-distributions', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const distributions = await ebtGratuityService.listIncomeDistributions(req.params.planId);
  res.json(distributions);
}));

router.post('/plans/:planId/distribute-income', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const distribution = await ebtGratuityService.distributeIncome(req.params.planId, req.body, userId);
  res.status(201).json(distribution);
}));

// ─── Dashboard ───────────────────────────────────────────────────────────────

router.get('/dashboard', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const summary = await ebtService.getDashboardSummary(req.query.plan_id as string);
  res.json(summary);
}));

export default router;
