/**
 * GL Error Codes — Standardized Error Handling for Enterprise GL
 *
 * Implements:
 *   AI-002: Standardized error codes
 *   AI-003: Consistent error response format
 *   AI-005: Machine-readable error metadata
 */

// ---------------------------------------------------------------------------
// Error Code Registry
// ---------------------------------------------------------------------------

export const GL_ERROR_CODES = {
  // Posting errors
  GL_POST_001: { code: 'GL_POST_001', httpStatus: 404, message: 'Journal batch not found' },
  GL_POST_002: { code: 'GL_POST_002', httpStatus: 400, message: 'Batch cannot be posted in current status' },
  GL_POST_003: { code: 'GL_POST_003', httpStatus: 400, message: 'Debit/credit imbalance detected' },
  GL_POST_004: { code: 'GL_POST_004', httpStatus: 400, message: 'Insufficient journal lines (minimum 2 required)' },
  GL_POST_005: { code: 'GL_POST_005', httpStatus: 400, message: 'GL head not found or inactive' },
  GL_POST_006: { code: 'GL_POST_006', httpStatus: 400, message: 'Currency not allowed for GL head' },
  GL_POST_007: { code: 'GL_POST_007', httpStatus: 400, message: 'Manual posting not allowed for GL head' },
  GL_POST_008: { code: 'GL_POST_008', httpStatus: 400, message: 'No open financial period for transaction date' },
  GL_POST_009: { code: 'GL_POST_009', httpStatus: 409, message: 'Duplicate event (idempotency key exists)' },
  GL_POST_010: { code: 'GL_POST_010', httpStatus: 400, message: 'System journal cannot be cancelled' },

  // Authorization errors
  GL_AUTH_001: { code: 'GL_AUTH_001', httpStatus: 403, message: 'Maker/checker violation' },
  GL_AUTH_002: { code: 'GL_AUTH_002', httpStatus: 400, message: 'Authorization task not found' },
  GL_AUTH_003: { code: 'GL_AUTH_003', httpStatus: 400, message: 'Task already processed' },
  GL_AUTH_004: { code: 'GL_AUTH_004', httpStatus: 400, message: 'Cannot delegate to maker' },
  GL_AUTH_005: { code: 'GL_AUTH_005', httpStatus: 403, message: 'Insufficient approval level' },

  // Rule engine errors
  GL_RULE_001: { code: 'GL_RULE_001', httpStatus: 404, message: 'Event definition not found' },
  GL_RULE_002: { code: 'GL_RULE_002', httpStatus: 404, message: 'No matching criteria found' },
  GL_RULE_003: { code: 'GL_RULE_003', httpStatus: 404, message: 'No rule set found for criteria' },
  GL_RULE_004: { code: 'GL_RULE_004', httpStatus: 400, message: 'Rule set not approved' },
  GL_RULE_005: { code: 'GL_RULE_005', httpStatus: 400, message: 'Expression evaluation error' },

  // Accrual errors
  GL_ACCR_001: { code: 'GL_ACCR_001', httpStatus: 404, message: 'Accrual schedule not found' },
  GL_ACCR_002: { code: 'GL_ACCR_002', httpStatus: 400, message: 'Accrual already processed for date' },
  GL_ACCR_003: { code: 'GL_ACCR_003', httpStatus: 400, message: 'Amortization schedule exhausted' },

  // Period errors
  GL_PERIOD_001: { code: 'GL_PERIOD_001', httpStatus: 404, message: 'Financial period not found' },
  GL_PERIOD_002: { code: 'GL_PERIOD_002', httpStatus: 400, message: 'Period already closed' },
  GL_PERIOD_003: { code: 'GL_PERIOD_003', httpStatus: 400, message: 'Unposted batches exist in period' },

  // EOD errors
  GL_EOD_001: { code: 'GL_EOD_001', httpStatus: 404, message: 'EOD run not found' },
  GL_EOD_002: { code: 'GL_EOD_002', httpStatus: 400, message: 'EOD run already rolled back' },
  GL_EOD_003: { code: 'GL_EOD_003', httpStatus: 500, message: 'Job execution failure after max retries' },
} as const;

export type GlErrorCode = keyof typeof GL_ERROR_CODES;

// ---------------------------------------------------------------------------
// Custom Error Class
// ---------------------------------------------------------------------------

export class GlError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    errorCode: GlErrorCode,
    details?: Record<string, unknown>,
    customMessage?: string,
  ) {
    const errorDef = GL_ERROR_CODES[errorCode];
    super(customMessage ?? errorDef.message);
    this.code = errorDef.code;
    this.httpStatus = errorDef.httpStatus;
    this.details = details;
    this.name = 'GlError';
  }

  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}
