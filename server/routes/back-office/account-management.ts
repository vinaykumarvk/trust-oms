/**
 * account-management.ts — Account & Fund Management Routes
 * Covers AFM-01 through AFM-14
 */

import { Router, Request, Response } from 'express';
import { accountManagementService } from '../../services/account-management-service';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response) => fn(req, res).catch((err: any) => {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  });
}

// AFM-01: Copy account
router.post('/copy', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await accountManagementService.copyAccount(req.body.source_portfolio_id, req.body.overrides ?? {}, userId);
  res.status(201).json(result);
}));

// AFM-04: Account groups
router.get('/groups', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const groups = await accountManagementService.listAccountGroups(req.query.client_id as string);
  res.json(groups);
}));

router.post('/groups', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const group = await accountManagementService.createAccountGroup(req.body, userId);
  res.status(201).json(group);
}));

router.post('/groups/:groupId/members', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const member = await accountManagementService.addToGroup(req.params.groupId, req.body.portfolio_id, userId);
  res.status(201).json(member);
}));

router.get('/groups/:groupId/members', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const members = await accountManagementService.getGroupMembers(req.params.groupId);
  res.json(members);
}));

router.get('/groups/:groupId/consolidated', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const result = await accountManagementService.getConsolidatedAum(req.params.groupId);
  res.json(result);
}));

// AFM-02/03/05: Account links
router.post('/links', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const link = await accountManagementService.createAccountLink(req.body, userId);
  res.status(201).json(link);
}));

router.get('/links/:portfolioId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const links = await accountManagementService.getLinkedAccounts(req.params.portfolioId);
  res.json(links);
}));

// AFM-10/11: Hold-out
router.get('/holds', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const holds = await accountManagementService.listHolds({
    client_id: req.query.client_id as string,
    portfolio_id: req.query.portfolio_id as string,
  });
  res.json(holds);
}));

router.post('/holds', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const hold = await accountManagementService.createHold(req.body, userId);
  res.status(201).json(hold);
}));

router.post('/holds/:holdId/release', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const hold = await accountManagementService.releaseHold(req.params.holdId, userId, req.body.reason);
  res.json(hold);
}));

router.get('/holds/:portfolioId/history', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const history = await accountManagementService.getHoldHistory(req.params.portfolioId);
  res.json(history);
}));

// AFM-07/08/09: Dormancy
router.get('/dormancy/:portfolioId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const status = await accountManagementService.getDormancyStatus(req.params.portfolioId);
  res.json(status ?? { dormancy_status: 'ACTIVE' });
}));

router.post('/dormancy/:portfolioId/mark-dormant', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await accountManagementService.markDormant(req.params.portfolioId, userId);
  res.json(result);
}));

router.post('/dormancy/:portfolioId/auto-close', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await accountManagementService.autoCloseAccount(req.params.portfolioId, req.body.reason, req.body.parameters, userId);
  res.json(result);
}));

router.post('/dormancy/:portfolioId/reopen', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = await accountManagementService.reopenAccount(req.params.portfolioId, req.body.reason, userId);
  res.json(result);
}));

// AFM-12/14: Fee sharing
router.get('/fee-sharing', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const arrangements = await accountManagementService.listFeeSharingArrangements(req.query.portfolio_id as string);
  res.json(arrangements);
}));

router.post('/fee-sharing', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const arrangement = await accountManagementService.createFeeSharingArrangement(req.body, userId);
  res.status(201).json(arrangement);
}));

router.patch('/fee-sharing/:arrangementId', requireBackOfficeRole(), asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const arrangement = await accountManagementService.updateFeeSharingArrangement(req.params.arrangementId, req.body, userId);
  res.json(arrangement);
}));

export default router;
