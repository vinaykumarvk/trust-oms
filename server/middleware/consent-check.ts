import type { Request, Response, NextFunction } from 'express';
import { consentService } from '../services/consent-service';

export function requireConsent(purpose: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.params.clientId || req.body?.clientId || req.query.clientId;
    if (!clientId) {
      return next(); // No client context, skip consent check
    }

    const hasConsent = await consentService.checkConsent(String(clientId), purpose);
    if (!hasConsent) {
      return res.status(403).json({
        error: {
          code: 'CONSENT_REQUIRED',
          message: `Client has not granted consent for purpose: ${purpose}`,
          purpose,
          clientId,
          correlation_id: req.id,
        },
      });
    }

    next();
  };
}
