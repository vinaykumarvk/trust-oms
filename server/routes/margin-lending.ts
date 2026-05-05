import type { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { denyBusinessApproval, requireAnyRole } from '../middleware/role-auth';
import { httpStatusFromError, safeErrorMessage } from '../services/service-errors';
import { marginLendingService } from '../services/margin-lending-service';

const router = Router();

const mlReadRoles = [
  'RELATIONSHIP_MANAGER',
  'SENIOR_RM',
  'BO_MAKER',
  'BO_CHECKER',
  'BO_HEAD',
  'MO_MAKER',
  'MO_CHECKER',
  'RISK_OFFICER',
  'CRO',
  'COMPLIANCE_OFFICER',
  'INTERNAL_AUDITOR',
  'AUDITOR',
  'SYSTEM_ADMIN',
];

const mlMaintenanceReadRoles = [
  'BO_MAKER',
  'BO_CHECKER',
  'BO_HEAD',
  'MO_MAKER',
  'MO_CHECKER',
  'RISK_OFFICER',
  'CRO',
  'COMPLIANCE_OFFICER',
  'INTERNAL_AUDITOR',
  'AUDITOR',
  'SYSTEM_ADMIN',
];

const requireMarginLendingRole = () => requireAnyRole(...mlReadRoles);
const requireMlReadRole = () => requireAnyRole(...mlReadRoles);
const requireMlMaintenanceReadRole = () => requireAnyRole(...mlMaintenanceReadRoles);
const requireMlWriteRole = () => requireAnyRole('BO_MAKER', 'MO_MAKER', 'RISK_OFFICER', 'BO_HEAD', 'SYSTEM_ADMIN');
const requireMlCheckerRole = () => requireAnyRole('BO_CHECKER', 'MO_CHECKER', 'BO_HEAD', 'CRO');
const requireMlOperatorRole = () => requireAnyRole('BO_MAKER', 'BO_CHECKER', 'BO_HEAD', 'MO_MAKER', 'MO_CHECKER', 'RISK_OFFICER', 'CRO', 'SYSTEM_ADMIN');
const requireMlReportRole = () => requireAnyRole('BO_MAKER', 'BO_CHECKER', 'BO_HEAD', 'MO_MAKER', 'MO_CHECKER', 'RISK_OFFICER', 'CRO', 'COMPLIANCE_OFFICER', 'INTERNAL_AUDITOR', 'AUDITOR', 'SYSTEM_ADMIN');
const requireMlAuditRole = () => requireAnyRole('BO_CHECKER', 'BO_HEAD', 'RISK_OFFICER', 'CRO', 'COMPLIANCE_OFFICER', 'INTERNAL_AUDITOR', 'AUDITOR', 'SYSTEM_ADMIN');

router.use(requireMarginLendingRole());

function actor(req: Request): string {
  return String((req as any).user?.id ?? (req as any).userId ?? 'system');
}

function errorCode(err: unknown): string {
  if (err instanceof Error && err.message && /^[A-Z0-9_]+$/.test(err.message)) return err.message;
  if (err instanceof Error && err.name) return err.name.replace(/Error$/, '').toUpperCase();
  return 'INTERNAL_ERROR';
}

function sendServiceError(res: Response, err: unknown) {
  res.status(httpStatusFromError(err)).json({
    error: {
      code: errorCode(err),
      message: safeErrorMessage(err),
    },
  });
}

function serviceRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return asyncHandler(async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendServiceError(res, err);
    }
  });
}

function wireLifecycleRoutes(args: {
  path: string;
  entityType: any;
  idParam: string;
  create: (body: Record<string, unknown>, userId: string) => Promise<Record<string, unknown>>;
  list: (query: { status?: string }) => Promise<Record<string, unknown>[]>;
}) {
  router.get(args.path, requireMlMaintenanceReadRole(), serviceRoute(async (req, res) => {
    res.json(await args.list({ status: req.query.status as string | undefined }));
  }));

  router.post(args.path, requireMlWriteRole(), serviceRoute(async (req, res) => {
    const row = await args.create(req.body, actor(req));
    res.status(201).json(row);
  }));

  router.patch(`${args.path}/:${args.idParam}`, requireMlWriteRole(), serviceRoute(async (req, res) => {
    res.json(await marginLendingService.updateRecord(args.entityType, req.params[args.idParam], req.body, actor(req)));
  }));

  router.delete(`${args.path}/:${args.idParam}`, requireMlWriteRole(), serviceRoute(async (req, res) => {
    res.json(await marginLendingService.softDeleteRecord(args.entityType, req.params[args.idParam], actor(req)));
  }));

  router.post(`${args.path}/:${args.idParam}/copy`, requireMlWriteRole(), serviceRoute(async (req, res) => {
    const row = await marginLendingService.copyRecord(args.entityType, req.params[args.idParam], req.body ?? {}, actor(req));
    res.status(201).json(row);
  }));

  router.post(`${args.path}/:${args.idParam}/authorize`, denyBusinessApproval(), requireMlCheckerRole(), serviceRoute(async (req, res) => {
    res.json(await marginLendingService.decideRecord(args.entityType, req.params[args.idParam], {
      ...req.body,
      decision: req.body?.decision ?? 'AUTHORIZE',
    }, actor(req)));
  }));

  router.post(`${args.path}/:${args.idParam}/decision`, denyBusinessApproval(), requireMlCheckerRole(), serviceRoute(async (req, res) => {
    res.json(await marginLendingService.decideRecord(args.entityType, req.params[args.idParam], req.body, actor(req)));
  }));
}

router.get('/summary', requireMlReadRole(), serviceRoute(async (_req, res) => {
  res.json(await marginLendingService.getSummary());
}));

wireLifecycleRoutes({
  path: '/attribute-settings',
  entityType: 'attribute-settings',
  idParam: 'settingId',
  create: (body, userId) => marginLendingService.createAttributeSetting(body, userId),
  list: (query) => marginLendingService.listAttributeSettings(query),
});

wireLifecycleRoutes({
  path: '/references',
  entityType: 'references',
  idParam: 'referenceId',
  create: (body, userId) => marginLendingService.createReference(body, userId),
  list: (query) => marginLendingService.listReferences(query),
});

wireLifecycleRoutes({
  path: '/scrip-settings',
  entityType: 'scrip-settings',
  idParam: 'scripSettingId',
  create: (body, userId) => marginLendingService.createScripSetting(body, userId),
  list: (query) => marginLendingService.listScripSettings(query),
});

wireLifecycleRoutes({
  path: '/exposure-limits',
  entityType: 'exposure-limits',
  idParam: 'exposureLimitId',
  create: (body, userId) => marginLendingService.createExposureLimit(body, userId),
  list: (query) => marginLendingService.listExposureLimits(query),
});

wireLifecycleRoutes({
  path: '/cross-currency-haircuts',
  entityType: 'cross-currency-haircuts',
  idParam: 'haircutId',
  create: (body, userId) => marginLendingService.createCrossCurrencyHaircut(body, userId),
  list: (query) => marginLendingService.listCrossCurrencyHaircuts(query),
});

wireLifecycleRoutes({
  path: '/facility-groups',
  entityType: 'facility-groups',
  idParam: 'facilityGroupId',
  create: (body, userId) => marginLendingService.createFacilityGroup(body, userId),
  list: (query) => marginLendingService.listFacilityGroups(query),
});

router.get('/facilities', requireMlReadRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.listFacilities({
    facilityGroupId: req.query.facilityGroupId as string | undefined,
    status: req.query.status as string | undefined,
    assetClass: req.query.assetClass as string | undefined,
    subAssetClass: req.query.subAssetClass as string | undefined,
    currency: req.query.currency as string | undefined,
  }));
}));

router.post('/facilities/imports', requireMlOperatorRole(), serviceRoute(async (req, res) => {
  const row = await marginLendingService.createFacility(req.body, actor(req));
  res.status(201).json(row);
}));

wireLifecycleRoutes({
  path: '/portfolio-links',
  entityType: 'portfolio-links',
  idParam: 'portfolioLinkId',
  create: (body, userId) => marginLendingService.createPortfolioLink(body, userId),
  list: (_query) => marginLendingService.listPortfolioLinks(),
});

wireLifecycleRoutes({
  path: '/asset-settings',
  entityType: 'asset-settings',
  idParam: 'assetSettingId',
  create: (body, userId) => marginLendingService.createAssetSetting(body, userId),
  list: (query) => marginLendingService.listAssetSettings(query),
});

router.get('/credit-view', requireMlReadRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.getCreditView(req.query as Record<string, unknown>, actor(req)));
}));

router.post('/credit-view', requireMlReadRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.getCreditView(req.body, actor(req)));
}));

router.get('/margin-call-cases', requireMlReadRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.listMarginCallCases({
    status: req.query.status as string | undefined,
    baseNumber: req.query.baseNumber as string | undefined,
  }));
}));

router.post('/margin-call-cases/process', requireMlOperatorRole(), serviceRoute(async (req, res) => {
  const row = await marginLendingService.processMarginCallSnapshots(req.body, actor(req));
  res.status(201).json(row);
}));

router.get('/margin-call-cases/:caseId/actions', requireMlReadRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.listMarginCallActions(req.params.caseId));
}));

router.post('/margin-call-cases/:caseId/actions', requireMlWriteRole(), serviceRoute(async (req, res) => {
  const row = await marginLendingService.updateMarginCallCase(req.params.caseId, req.body, actor(req));
  res.status(201).json(row);
}));

router.post('/margin-call-cases/:caseId/authorize', denyBusinessApproval(), requireMlCheckerRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.decideMarginCallCase(req.params.caseId, {
    ...req.body,
    decision: req.body?.decision ?? 'AUTHORIZE',
  }, actor(req)));
}));

router.post('/margin-call-cases/:caseId/decision', denyBusinessApproval(), requireMlCheckerRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.decideMarginCallCase(req.params.caseId, req.body, actor(req)));
}));

router.get('/eod-runs', requireMlOperatorRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.listEodRuns({ status: req.query.status as string | undefined }));
}));

router.post('/eod-runs', requireMlOperatorRole(), serviceRoute(async (req, res) => {
  const row = await marginLendingService.runEod(req.body, actor(req));
  res.status(201).json(row);
}));

router.get('/simulations', requireMlReadRole(), serviceRoute(async (_req, res) => {
  res.json(await marginLendingService.listSimulationRuns());
}));

router.post('/simulations', requireMlReadRole(), serviceRoute(async (req, res) => {
  const row = await marginLendingService.runSimulation(req.body, actor(req));
  res.status(201).json(row);
}));

router.get('/reports/:reportCode', requireMlReportRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.getReport(req.params.reportCode, req.query as Record<string, unknown>, actor(req)));
}));

router.get('/reports/:reportCode/export.csv', requireMlReportRole(), serviceRoute(async (req, res) => {
  const csv = await marginLendingService.renderReportCsv(req.params.reportCode, req.query as Record<string, unknown>, actor(req));
  res.setHeader('Content-Type', String(csv.contentType));
  res.setHeader('Content-Disposition', `attachment; filename="${csv.fileName}"`);
  res.send(csv.content);
}));

router.get('/audit-events', requireMlAuditRole(), serviceRoute(async (req, res) => {
  res.json(await marginLendingService.listAuditEvents({ entityType: req.query.entityType as string | undefined }));
}));

export default router;
