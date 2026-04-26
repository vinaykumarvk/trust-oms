/**
 * Call Reports Custom Routes (Calendar & Call Report Management)
 *
 * Custom endpoints that extend the CRUD router for call reports:
 *   PATCH /:id/submit  — Submit a call report (auto-approve or route to supervisor)
 *   GET   /search      — Advanced search with filters and pagination
 */

import { Router } from 'express';
import { requireCRMRole } from '../../middleware/role-auth';
import { callReportService } from '../../services/call-report-service';
import { httpStatusFromError, safeErrorMessage } from '../../services/service-errors';

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (isNaN(id)) throw new Error('Invalid ID');
  return id;
}

const asyncHandler = (fn: Function) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const router = Router();
router.use(requireCRMRole());

// ---------------------------------------------------------------------------
// GET /search — Advanced search with filters and pagination
// ---------------------------------------------------------------------------

router.get(
  '/search',
  asyncHandler(async (req: any, res: any) => {
    const userId: number | undefined = req.user?.id ?? (req.userId ? parseInt(req.userId) : undefined);
    const userRole: string = req.userRole ?? req.user?.role ?? '';
    const userBranchId: number | undefined = req.userBranchId ?? req.user?.branch_id;

    // GAP-036: Role-based auto-scoping when client doesn't specify filedBy/branchId
    const explicitFiledBy = req.query.filedBy ? parseInt(req.query.filedBy as string) : undefined;
    const explicitBranchId = req.query.branchId ? parseInt(req.query.branchId as string) : undefined;

    let scopedFiledBy: number | undefined = explicitFiledBy;
    let scopedBranchId: number | undefined = explicitBranchId;

    if (explicitFiledBy === undefined && explicitBranchId === undefined) {
      if (userRole === 'RELATIONSHIP_MANAGER' || userRole === 'BRANCH_ASSOCIATE') {
        // RM sees only their own call reports
        scopedFiledBy = userId;
      } else if ((userRole === 'SENIOR_RM' || userRole === 'BO_CHECKER') && userBranchId) {
        // Team lead sees all reports in their branch
        scopedBranchId = userBranchId;
      }
      // BO_HEAD and SYSTEM_ADMIN see all — no extra scoping
    }

    const filters = {
      reportStatus: req.query.reportStatus as string | undefined,
      reportType: req.query.reportType as string | undefined,
      filedBy: scopedFiledBy,
      branchId: scopedBranchId,
      search: req.query.search as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
    };

    const result = await callReportService.getAll(filters);
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// PATCH /:id/submit — Submit a call report for approval
// ---------------------------------------------------------------------------

router.patch(
  '/:id/submit',
  asyncHandler(async (req: any, res: any) => {
    const id = parseId(req.params.id);

    const userId = (req as any).user?.id ?? (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const result = await callReportService.submit(id, userId);
      res.json({ data: result });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      return res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

export default router;
