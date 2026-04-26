import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { contentPackService } from '../../services/content-pack-service';

const router = Router();
router.use(requireBackOfficeRole());

/** GET / — list content packs with filters */
router.get('/', asyncHandler(async (req: any, res: any) => {
  const { status, jurisdiction_id, page, pageSize } = req.query;
  const result = await contentPackService.getAll({
    status: status as string | undefined,
    jurisdiction_id: jurisdiction_id ? Number(jurisdiction_id) : undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}));

/** POST / — create a new content pack */
router.post('/', asyncHandler(async (req: any, res: any) => {
  const { pack_name, jurisdiction_id, category, payload } = req.body;
  if (!pack_name || !jurisdiction_id || !category || !payload) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'pack_name, jurisdiction_id, category, and payload are required' },
    });
  }
  const result = await contentPackService.create({ pack_name, jurisdiction_id, category, payload });
  res.status(201).json({ data: result });
}));

/** GET /:id — get content pack by id */
router.get('/:id', asyncHandler(async (req: any, res: any) => {
  const result = await contentPackService.getById(Number(req.params.id));
  res.json({ data: result });
}));

/** POST /:id/activate — activate content pack */
router.post('/:id/activate', asyncHandler(async (req: any, res: any) => {
  const { activated_by } = req.body;
  if (!activated_by) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'activated_by is required' },
    });
  }
  const result = await contentPackService.activate(Number(req.params.id), Number(activated_by));
  res.json({ data: result });
}));

/** POST /:id/rollback — rollback content pack */
router.post('/:id/rollback', asyncHandler(async (req: any, res: any) => {
  const result = await contentPackService.rollback(Number(req.params.id));
  res.json({ data: result });
}));

/** POST /:id/verify — verify content pack signature */
router.post('/:id/verify', asyncHandler(async (req: any, res: any) => {
  const result = await contentPackService.verifySignature(Number(req.params.id));
  res.json({ data: result });
}));

export default router;
