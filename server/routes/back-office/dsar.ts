import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { dsarService } from '../../services/dsar-service';

const router = Router();
router.use(requireBackOfficeRole());

/** GET / — list DSAR requests with filters */
router.get('/', asyncHandler(async (req: any, res: any) => {
  const { status, request_type, page, pageSize } = req.query;
  const result = await dsarService.getAll({
    status: status as string | undefined,
    request_type: request_type as string | undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

/** POST / — submit a new DSAR request */
router.post('/', asyncHandler(async (req: any, res: any) => {
  const { request_type, requestor_name, requestor_email, subject_client_id, description } = req.body;
  if (!request_type || !requestor_name || !requestor_email || !subject_client_id) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'request_type, requestor_name, requestor_email, and subject_client_id are required' },
    });
  }
  const result = await dsarService.submitRequest({
    request_type,
    requestor_name,
    requestor_email,
    subject_client_id: Number(subject_client_id),
    description,
  });
  res.status(201).json({ data: result });
}));

/** GET /:id — get DSAR request by id */
router.get('/:id', asyncHandler(async (req: any, res: any) => {
  const result = await dsarService.getById(Number(req.params.id));
  res.json({ data: result });
}));

/** POST /:id/process — process a DSAR request */
router.post('/:id/process', asyncHandler(async (req: any, res: any) => {
  const { user_id } = req.body;
  if (!user_id) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'user_id is required' },
    });
  }
  const result = await dsarService.processRequest(Number(req.params.id), Number(user_id));
  res.json({ data: result });
}));

/** POST /:id/approve — DPO approval of a DSAR response */
router.post('/:id/approve', asyncHandler(async (req: any, res: any) => {
  const { dpo_user_id } = req.body;
  if (!dpo_user_id) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'dpo_user_id is required' },
    });
  }
  const result = await dsarService.approveDsarResponse(Number(req.params.id), Number(dpo_user_id));
  res.json({ data: result });
}));

/** POST /:id/reject — reject a DSAR request */
router.post('/:id/reject', asyncHandler(async (req: any, res: any) => {
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'reason is required' },
    });
  }
  const result = await dsarService.rejectDsar(Number(req.params.id), reason);
  res.json({ data: result });
}));

export default router;
