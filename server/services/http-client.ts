/**
 * Production-grade HTTP client with retry, circuit breaker, and timeout.
 *
 * Wraps native `fetch` with:
 *   - Configurable timeout via AbortController
 *   - Retry with exponential backoff
 *   - Circuit breaker integration (uses existing CircuitBreaker from circuit-breaker.ts)
 *   - Rate-limit tracking with warning thresholds
 *   - Per-request logging
 *
 * Usage:
 *   const client = new ResilientHttpClient({ name: 'WorldCheck', baseUrl: '...', timeout: 30000, retries: 3 });
 *   const data = await client.post<ResponseType>('/endpoint', body);
 */

import { CircuitBreaker, getBreaker } from './circuit-breaker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HttpClientConfig {
  /** Human-readable name for logging */
  name: string;
  /** Base URL for all requests (no trailing slash) */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Number of retry attempts (0 = no retries, total calls = 1 + retries) */
  retries: number;
  /** Base delay for first retry in ms; doubles each attempt (exponential backoff) */
  retryDelayMs: number;
  /** Circuit breaker configuration */
  circuitBreaker?: {
    /** Number of consecutive failures before opening the circuit */
    failureThreshold: number;
    /** Time window in ms — failures older than this are not counted */
    windowMs: number;
    /** How long the circuit stays open before transitioning to half-open (ms) */
    openDurationMs: number;
  };
  /** Default headers included in every request */
  headers?: Record<string, string>;
  /** Rate limit: maximum calls per minute. If set, warnings are logged at 80% utilization */
  rateLimitPerMinute?: number;
}

export class CircuitOpenError extends Error {
  constructor(clientName: string) {
    super(`[${clientName}] Circuit breaker is OPEN — request rejected`);
    this.name = 'CircuitOpenError';
  }
}

export class HttpTimeoutError extends Error {
  constructor(clientName: string, timeoutMs: number) {
    super(`[${clientName}] Request timed out after ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
  }
}

export class HttpRequestError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(clientName: string, statusCode: number, body: string) {
    super(`[${clientName}] HTTP ${statusCode}: ${body.substring(0, 200)}`);
    this.name = 'HttpRequestError';
    this.statusCode = statusCode;
    this.responseBody = body;
  }
}

// ---------------------------------------------------------------------------
// Rate Limit Tracker
// ---------------------------------------------------------------------------

class RateLimitTracker {
  private timestamps: number[] = [];
  private readonly maxPerMinute: number;
  private readonly clientName: string;

  constructor(clientName: string, maxPerMinute: number) {
    this.clientName = clientName;
    this.maxPerMinute = maxPerMinute;
  }

  record(): void {
    const now = Date.now();
    // Prune timestamps older than 60 seconds
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
    this.timestamps.push(now);

    const usage = this.timestamps.length;
    const threshold80 = Math.floor(this.maxPerMinute * 0.8);
    if (usage >= this.maxPerMinute) {
      console.error(
        `[${this.clientName}] RATE LIMIT EXCEEDED: ${usage}/${this.maxPerMinute} calls in the last minute`,
      );
    } else if (usage >= threshold80) {
      console.warn(
        `[${this.clientName}] Rate limit warning: ${usage}/${this.maxPerMinute} calls in the last minute (80% threshold)`,
      );
    }
  }

  getCurrentUsage(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
    return this.timestamps.length;
  }
}

// ---------------------------------------------------------------------------
// ResilientHttpClient
// ---------------------------------------------------------------------------

export class ResilientHttpClient {
  private readonly config: HttpClientConfig;
  private readonly breaker: CircuitBreaker;
  private readonly rateLimiter: RateLimitTracker | null;

  constructor(config: HttpClientConfig) {
    this.config = config;

    // Initialize circuit breaker via the existing registry
    const cbConfig = config.circuitBreaker;
    this.breaker = getBreaker(config.name, {
      failureThreshold: cbConfig?.failureThreshold ?? 5,
      resetTimeoutMs: cbConfig?.openDurationMs ?? 60_000,
      halfOpenMaxAttempts: 1,
    });

    // Initialize rate limiter if configured
    this.rateLimiter = config.rateLimitPerMinute
      ? new RateLimitTracker(config.name, config.rateLimitPerMinute)
      : null;
  }

  /**
   * Execute an HTTP request with timeout, retry, and circuit breaker.
   *
   * @param path   URL path appended to baseUrl (e.g. '/v2/cases/screeningRequest')
   * @param init   Standard RequestInit (method, headers, body, etc.)
   * @returns      Parsed JSON response of type T
   */
  async request<T>(path: string, init?: RequestInit): Promise<T> {
    // Rate-limit tracking
    this.rateLimiter?.record();

    const url = `${this.config.baseUrl}${path}`;
    const maxAttempts = 1 + this.config.retries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.breaker.call(async () => {
          return this._singleRequest<T>(url, init, attempt);
        });
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Do not retry on circuit-open errors
        if (lastError.message.includes('OPEN')) {
          throw new CircuitOpenError(this.config.name);
        }

        // Do not retry on 4xx client errors (except 429 Too Many Requests)
        if (
          lastError instanceof HttpRequestError &&
          lastError.statusCode >= 400 &&
          lastError.statusCode < 500 &&
          lastError.statusCode !== 429
        ) {
          throw lastError;
        }

        if (attempt < maxAttempts) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          console.warn(
            `[${this.config.name}] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${lastError.message}`,
          );
          await this._sleep(delay);
        } else {
          console.error(
            `[${this.config.name}] All ${maxAttempts} attempts exhausted: ${lastError.message}`,
          );
        }
      }
    }

    throw lastError!;
  }

  /** Convenience: GET request */
  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, {
      method: 'GET',
      headers: { ...this.config.headers, ...headers },
    });
  }

  /** Convenience: POST request with JSON body */
  async post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  /** Get current circuit breaker state */
  getCircuitState(): { isOpen: boolean; state: string; failures: number } {
    const stats = this.breaker.getStats();
    return {
      isOpen: stats.state === 'OPEN',
      state: stats.state,
      failures: stats.failureCount,
    };
  }

  /** Get current rate limit usage */
  getRateLimitUsage(): { current: number; max: number | null } {
    return {
      current: this.rateLimiter?.getCurrentUsage() ?? 0,
      max: this.config.rateLimitPerMinute ?? null,
    };
  }

  /** Reset the circuit breaker (for operational recovery) */
  resetCircuit(): void {
    this.breaker.reset();
    console.log(`[${this.config.name}] Circuit breaker manually reset to CLOSED`);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async _singleRequest<T>(url: string, init?: RequestInit, attempt?: number): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const mergedHeaders: Record<string, string> = {
      ...this.config.headers,
      ...(init?.headers as Record<string, string> | undefined),
    };

    try {
      const startMs = Date.now();
      const response = await fetch(url, {
        ...init,
        headers: mergedHeaders,
        signal: controller.signal,
      });
      const elapsedMs = Date.now() - startMs;

      if (attempt === 1 || (attempt ?? 1) > 1) {
        console.log(
          `[${this.config.name}] ${init?.method ?? 'GET'} ${url} -> ${response.status} (${elapsedMs}ms, attempt ${attempt ?? 1})`,
        );
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No response body');
        throw new HttpRequestError(this.config.name, response.status, errorBody);
      }

      const data = (await response.json()) as T;
      return data;
    } catch (err) {
      if (err instanceof HttpRequestError) throw err;

      if (err instanceof Error && err.name === 'AbortError') {
        throw new HttpTimeoutError(this.config.name, this.config.timeout);
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
