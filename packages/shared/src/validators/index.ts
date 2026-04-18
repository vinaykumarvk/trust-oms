import { z } from 'zod';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const positiveIntSchema = z.coerce.number().int().positive();

export const sortOrderSchema = z.enum(['asc', 'desc']).default('asc');

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: sortOrderSchema,
  })
  .passthrough();
