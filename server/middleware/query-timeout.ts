import type { Request, Response, NextFunction } from 'express';

const DEFAULT_TIMEOUT_MS = 25_000;

export function queryTimeout(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return (req: Request, res: Response, next: NextFunction) => {
    const controller = new AbortController();
    (req as any).abortSignal = controller.signal;

    const timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) {
        res.status(504).json({
          error: {
            code: 'TIMEOUT',
            message: `Request timed out after ${timeoutMs}ms`,
            correlation_id: (req as any).id,
          },
        });
      }
    }, timeoutMs);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}
