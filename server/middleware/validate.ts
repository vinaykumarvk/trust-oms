import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.flatten().fieldErrors,
          correlation_id: req.id,
        },
      });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: result.error.flatten().fieldErrors,
          correlation_id: req.id,
        },
      });
    }
    (req as unknown as Record<string, unknown>).validatedQuery = result.data;
    next();
  };
}

export function validateParams<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid path parameters',
          details: result.error.flatten().fieldErrors,
          correlation_id: req.id,
        },
      });
    }
    (req as unknown as Record<string, unknown>).validatedParams = result.data;
    next();
  };
}
