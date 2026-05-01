/**
 * security-master-extensions.ts — Routes for MB-GAP-014
 * Non-financial assets: instrument sub-types, deposits, properties, vaults, NFA
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { safeErrorMessage, httpStatusFromError } from '../../services/service-errors';
import {
  instrumentSubTypeService,
  depositPlacementService,
  propertyAssetService,
  safekeepingVaultService,
  nonFinancialAssetService,
} from '../../services/security-master-extensions-service';

const router = Router();
router.use(requireBackOfficeRole());

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

// ─── Instrument Sub-Types ─────────────────────────────────────────────────────

router.post('/instrument-sub-types', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await instrumentSubTypeService.create({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/instrument-sub-types', asyncHandler(async (req, res) => {
  const data = await instrumentSubTypeService.list(req.query.asset_class as string);
  res.json({ data });
}));

router.patch('/instrument-sub-types/:id', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await instrumentSubTypeService.update(id, req.body, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/instrument-sub-types/:id/deactivate', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await instrumentSubTypeService.deactivate(id, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── Deposit Placements ───────────────────────────────────────────────────────

router.post('/deposit-placements', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await depositPlacementService.create({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/deposit-placements/:portfolioId', asyncHandler(async (req, res) => {
  const data = await depositPlacementService.listByPortfolio(req.params.portfolioId);
  res.json({ data });
}));

router.get('/deposit-placements/detail/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await depositPlacementService.getById(id);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/deposit-placements/:id/preterminate', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await depositPlacementService.preterminate(id, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/deposit-placements/:id/rollover', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  if (!req.body.new_maturity_date) return res.status(400).json({ error: 'new_maturity_date required' });
  try {
    const data = await depositPlacementService.rollover(id, req.body.new_maturity_date, req.body.new_rate, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/deposit-placements/:id/accrued-interest', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await depositPlacementService.computeAccruedInterest(id);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── Property Assets ──────────────────────────────────────────────────────────

router.post('/property-assets', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await propertyAssetService.create({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/property-assets/:portfolioId', asyncHandler(async (req, res) => {
  const data = await propertyAssetService.listByPortfolio(req.params.portfolioId);
  res.json({ data });
}));

router.get('/property-assets/detail/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await propertyAssetService.getById(id);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.patch('/property-assets/:id', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await propertyAssetService.update(id, req.body, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/property-assets/valuations', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await propertyAssetService.addValuation({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/property-assets/:propertyId/valuations', asyncHandler(async (req, res) => {
  const data = await propertyAssetService.getValuationHistory(req.params.propertyId);
  res.json({ data });
}));

// ─── Safekeeping Vaults ───────────────────────────────────────────────────────

router.post('/vaults', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await safekeepingVaultService.createVault({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/vaults', asyncHandler(async (_req, res) => {
  const data = await safekeepingVaultService.listVaults();
  res.json({ data });
}));

router.patch('/vaults/:id', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await safekeepingVaultService.updateVault(id, req.body, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/vaults/:id/access', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await safekeepingVaultService.logAccess({ ...req.body, vault_id: id, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/vaults/:id/access-log', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const data = await safekeepingVaultService.getAccessLog(id);
  res.json({ data });
}));

router.get('/vaults/:id/inventory', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await safekeepingVaultService.getVaultInventory(id);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

// ─── Non-Financial Assets ─────────────────────────────────────────────────────

router.post('/non-financial-assets', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = await nonFinancialAssetService.create({ ...req.body, userId: String(userId) });
    res.status(201).json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/non-financial-assets/:portfolioId', asyncHandler(async (req, res) => {
  const data = await nonFinancialAssetService.listByPortfolio(req.params.portfolioId);
  res.json({ data });
}));

router.get('/non-financial-assets/detail/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await nonFinancialAssetService.getById(id);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.patch('/non-financial-assets/:id', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await nonFinancialAssetService.update(id, req.body, String(userId));
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.post('/non-financial-assets/:id/valuate', asyncHandler(async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await nonFinancialAssetService.updateValuation(id, { ...req.body, userId: String(userId) });
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

router.get('/non-financial-assets/:portfolioId/summary', asyncHandler(async (req, res) => {
  try {
    const data = await nonFinancialAssetService.getPortfolioSummary(req.params.portfolioId);
    res.json({ data });
  } catch (err) {
    res.status(httpStatusFromError(err)).json({ error: safeErrorMessage(err) });
  }
}));

export default router;
