/**
 * Circuit Breaker Service (TrustFees Pro — BRD Gap A01)
 *
 * Generic circuit breaker pattern implementation with three states:
 * CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing recovery).
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 3,
};

export class CircuitBreaker {
  readonly name: string;
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private halfOpenAttempts = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(name: string, options?: Partial<CircuitBreakerOptions>) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttempts,
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if enough time has passed to try HALF_OPEN
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs
      ) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
      } else {
        throw new Error(`Circuit breaker '${this.name}' is OPEN — request rejected`);
      }
    }

    try {
      const result = await fn();

      // Success in HALF_OPEN -> back to CLOSED
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
      }

      // Success in CLOSED -> reset failure counter
      if (this.state === 'CLOSED') {
        this.failureCount = 0;
      }

      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === 'HALF_OPEN') {
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
          this.state = 'OPEN';
        }
      } else if (this.failureCount >= this.options.failureThreshold) {
        this.state = 'OPEN';
        console.warn(`[CircuitBreaker] '${this.name}' tripped to OPEN after ${this.failureCount} failures`);
      }

      throw err;
    }
  }
}

// Registry of named circuit breakers
const registry = new Map<string, CircuitBreaker>();

export function getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker(name, options));
  }
  return registry.get(name)!;
}

export function getAllBreakers(): CircuitBreaker[] {
  return Array.from(registry.values());
}

export function resetBreaker(name: string): boolean {
  const breaker = registry.get(name);
  if (breaker) {
    breaker.reset();
    return true;
  }
  return false;
}
