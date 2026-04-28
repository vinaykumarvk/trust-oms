/**
 * Typed service errors for structured HTTP status mapping.
 * Route handlers use `instanceof` checks instead of string matching.
 */

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PendingScanError extends Error {
  readonly status = 202;
  constructor(message: string) {
    super(message);
    this.name = 'PendingScanError';
  }
}

/** Map a service error to its HTTP status, defaulting to 400 for plain Errors. */
export function httpStatusFromError(err: unknown): number {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ForbiddenError) return 403;
  if (err instanceof ConflictError) return 409;
  if (err instanceof ValidationError) return 400;
  if (err instanceof PendingScanError) return 202;
  return 400;
}

/**
 * RFC 5987 safe Content-Disposition header value.
 * Prevents HTTP header injection via filenames containing newlines, quotes,
 * or non-ASCII characters.
 */
export function safeContentDisposition(filename: string): string {
  // Strip any control characters (CR, LF, null)
  const safe = filename.replace(/[\x00-\x1f]/g, '');
  // ASCII-safe fallback: replace non-ASCII with underscore
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
  // RFC 5987 encoded UTF-8 version
  const utf8Encoded = encodeURIComponent(safe).replace(/'/g, '%27');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

/**
 * SEC-08: Returns err.message only for typed, user-facing errors.
 * Unknown/internal errors return a generic message to prevent state leakage.
 */
export function safeErrorMessage(err: unknown): string {
  if (
    err instanceof NotFoundError ||
    err instanceof ForbiddenError ||
    err instanceof ValidationError ||
    err instanceof ConflictError ||
    err instanceof PendingScanError
  ) {
    return err.message;
  }
  return 'Internal server error';
}
