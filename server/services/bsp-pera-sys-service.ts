/**
 * BSP PERA System Integration Service (Phase 3I + FR-PERA-012)
 *
 * API client for BSP (Bangko Sentral ng Pilipinas) PERA-Sys integration.
 * Provides TIN existence verification, duplicate PERA checks, contributor
 * registration submission, and transaction file submission per BSP
 * regulatory requirements (BDO RFI Gap #9 Critical).
 *
 * Configuration:
 *   BSP_PERA_SYS_URL     — Base URL for BSP PERA-Sys API
 *   BSP_PERA_SYS_API_KEY — API key for authentication
 *
 * When BSP_PERA_SYS_URL is not set, the service operates in simulated mode
 * and returns stub responses (suitable for development/testing).
 *
 * Production hardening:
 *   - ResilientHttpClient with 60s timeout (BSP is slow)
 *   - 3 retries with exponential backoff (1s/2s/4s)
 *   - Circuit breaker: 3 failures in 10 min -> open for 120s
 *   - X-Request-ID tracking on every request
 *   - X-BSP-Signature verification (certificate pinning placeholder)
 *   - Response format validation before parsing
 */

import { randomUUID } from 'crypto';
import {
  ResilientHttpClient,
  CircuitOpenError,
  HttpRequestError,
} from './http-client';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BSP_PERA_SYS_URL = process.env.BSP_PERA_SYS_URL ?? '';
const BSP_PERA_SYS_API_KEY = process.env.BSP_PERA_SYS_API_KEY ?? '';

const isSimulatedMode = !BSP_PERA_SYS_URL;

if (isSimulatedMode) {
  console.warn(
    '[BSP-PERA-Sys] WARNING: BSP_PERA_SYS_URL is not configured. ' +
    'Running in SIMULATED mode — all API calls will return stub responses. ' +
    'Set BSP_PERA_SYS_URL and BSP_PERA_SYS_API_KEY environment variables ' +
    'for production BSP connectivity.',
  );
}

// ---------------------------------------------------------------------------
// ResilientHttpClient instance (only created when not in simulated mode)
// ---------------------------------------------------------------------------

let _bspClient: ResilientHttpClient | null = null;

function getBspClient(): ResilientHttpClient {
  if (!_bspClient) {
    _bspClient = new ResilientHttpClient({
      name: 'BSP-PERA-Sys',
      baseUrl: BSP_PERA_SYS_URL,
      timeout: 60_000,           // 60s — BSP is slow
      retries: 3,
      retryDelayMs: 1_000,       // 1s, 2s, 4s exponential backoff
      circuitBreaker: {
        failureThreshold: 3,
        windowMs: 10 * 60_000,   // 10 minutes
        openDurationMs: 120_000, // open for 2 minutes
      },
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': BSP_PERA_SYS_API_KEY,
      },
      rateLimitPerMinute: undefined, // BSP has no documented rate limit
    });
  }
  return _bspClient;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface BSPApiResponse<T> {
  success: boolean;
  data: T | null;
  error?: { code: string; message: string };
  requestId: string;
  timestamp: string;
}

interface TINVerificationResult {
  exists: boolean;
  tin: string;
  registeredName?: string;
  registrationType?: string;
  checkedAt: string;
  requestId: string;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  contributorId: string;
  existingAccounts?: Array<{
    administrator: string;
    accountId: string;
    status: string;
  }>;
  checkedAt: string;
  requestId: string;
}

interface ContributorRegistrationResult {
  bspReferenceId: string;
  contributorId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING_REVIEW';
  rejectionReason?: string;
  registeredAt: string;
  requestId: string;
}

interface TransactionFileResult {
  bspBatchId: string;
  recordCount: number;
  status: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED';
  acceptedCount: number;
  rejectedCount: number;
  rejections?: Array<{
    recordIndex: number;
    reason: string;
  }>;
  submittedAt: string;
  requestId: string;
}

// ---------------------------------------------------------------------------
// BSP Response Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a BSP API response has the expected envelope format.
 * Throws if the response doesn't match the expected BSP structure.
 */
function validateBspResponseFormat(
  data: unknown,
  requestId: string,
): asserts data is BSPApiResponse<unknown> {
  if (data === null || data === undefined || typeof data !== 'object') {
    throw new Error(
      `[BSP-PERA-Sys] Invalid response format (requestId=${requestId}): ` +
      `expected object, got ${typeof data}`,
    );
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj.success !== 'boolean') {
    throw new Error(
      `[BSP-PERA-Sys] Invalid response format (requestId=${requestId}): ` +
      `missing or invalid 'success' field`,
    );
  }
}

/**
 * Certificate pinning placeholder: validate BSP response signature.
 * In production, BSP responses include an X-BSP-Signature header that
 * should be verified against the BSP public key to ensure authenticity.
 *
 * This is a placeholder that logs a warning if the header is present
 * but not yet verified. Replace with actual HMAC/RSA verification when
 * BSP provides the signing key specification.
 */
function validateBspSignature(
  _requestId: string,
  bspSignature: string | null,
): void {
  if (bspSignature) {
    // TODO: Implement actual signature verification against BSP public key
    // For now, log that a signature was received
    console.log(
      `[BSP-PERA-Sys] X-BSP-Signature header present (requestId=${_requestId}). ` +
      'Certificate pinning verification is a placeholder — implement HMAC/RSA check.',
    );
  }
}

// ---------------------------------------------------------------------------
// Hardened HTTP helper using ResilientHttpClient
// ---------------------------------------------------------------------------

async function bspPost<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<BSPApiResponse<T>> {
  const requestId = randomUUID();
  const client = getBspClient();

  console.log(`[BSP-PERA-Sys] POST ${BSP_PERA_SYS_URL}${endpoint} requestId=${requestId}`);

  // Use the resilient client with request-specific headers
  const raw = await client.post<unknown>(endpoint, body, {
    'X-Request-ID': requestId,
  });

  // Validate response format before parsing
  validateBspResponseFormat(raw, requestId);

  const response = raw as BSPApiResponse<T>;

  // Certificate pinning placeholder — verify signature if present
  // Note: In a real implementation, the signature would come from response headers.
  // With ResilientHttpClient we don't get raw headers, so this is a structural placeholder.
  validateBspSignature(requestId, null);

  return { ...response, requestId, timestamp: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const bspPeraSysService = {
  /**
   * FR-PERA-012: Check TIN existence with BSP PERA-Sys.
   * POST {BASE_URL}/api/v1/tin/verify
   *
   * Verifies that a Tax Identification Number (TIN) is registered with
   * the Bureau of Internal Revenue (BIR) via the BSP PERA-Sys gateway.
   */
  async checkTINExistence(tin: string): Promise<TINVerificationResult> {
    if (!tin || tin.trim().length === 0) {
      throw new Error('TIN is required for verification');
    }

    const requestId = randomUUID();

    // Simulated mode fallback
    if (isSimulatedMode) {
      console.log(`[BSP-PERA-Sys] SIMULATED: checkTINExistence(${tin})`);
      return {
        exists: true,
        tin,
        registeredName: 'SIMULATED — BSP not connected',
        registrationType: 'INDIVIDUAL',
        checkedAt: new Date().toISOString(),
        requestId,
      };
    }

    // Live API call via resilient HTTP client
    const response = await bspPost<{
      tin_exists: boolean;
      registered_name?: string;
      registration_type?: string;
    }>('/api/v1/tin/verify', {
      tin: tin.replace(/[^0-9-]/g, ''), // sanitize to digits and dashes
    });

    if (!response.success || !response.data) {
      throw new Error(
        `BSP TIN verification failed: ${response.error?.message ?? 'Unknown error'}`,
      );
    }

    return {
      exists: response.data.tin_exists,
      tin,
      registeredName: response.data.registered_name,
      registrationType: response.data.registration_type,
      checkedAt: new Date().toISOString(),
      requestId: response.requestId,
    };
  },

  /**
   * FR-PERA-012: Check for duplicate PERA registrations with BSP PERA-Sys.
   * POST {BASE_URL}/api/v1/pera/duplicate-check
   *
   * Verifies that a contributor does not already have a PERA account
   * registered with another PERA administrator.
   */
  async checkDuplicatePERA(contributorId: string): Promise<DuplicateCheckResult> {
    if (!contributorId || contributorId.trim().length === 0) {
      throw new Error('Contributor ID is required for duplicate check');
    }

    const requestId = randomUUID();

    // Simulated mode fallback
    if (isSimulatedMode) {
      console.log(`[BSP-PERA-Sys] SIMULATED: checkDuplicatePERA(${contributorId})`);
      return {
        isDuplicate: false,
        contributorId,
        existingAccounts: [],
        checkedAt: new Date().toISOString(),
        requestId,
      };
    }

    // Live API call via resilient HTTP client
    const response = await bspPost<{
      is_duplicate: boolean;
      existing_accounts?: Array<{
        administrator: string;
        account_id: string;
        status: string;
      }>;
    }>('/api/v1/pera/duplicate-check', {
      contributor_id: contributorId,
    });

    if (!response.success || !response.data) {
      throw new Error(
        `BSP duplicate PERA check failed: ${response.error?.message ?? 'Unknown error'}`,
      );
    }

    return {
      isDuplicate: response.data.is_duplicate,
      contributorId,
      existingAccounts: response.data.existing_accounts?.map((a) => ({
        administrator: a.administrator,
        accountId: a.account_id,
        status: a.status,
      })),
      checkedAt: new Date().toISOString(),
      requestId: response.requestId,
    };
  },

  /**
   * FR-PERA-012: Submit contributor registration to BSP PERA-Sys.
   * POST {BASE_URL}/api/v1/pera/contributor/register
   *
   * Registers a new PERA contributor with the BSP central registry.
   * Must be called after successful TIN verification and duplicate check.
   */
  async submitContributorRegistration(data: {
    contributorId: string;
    tin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    administrator: string;
    productId: string;
  }): Promise<ContributorRegistrationResult> {
    const requestId = randomUUID();

    // Simulated mode fallback
    if (isSimulatedMode) {
      console.log(`[BSP-PERA-Sys] SIMULATED: submitContributorRegistration(${data.contributorId})`);
      return {
        bspReferenceId: `BSP-SIM-${Date.now()}`,
        contributorId: data.contributorId,
        status: 'ACCEPTED',
        registeredAt: new Date().toISOString(),
        requestId,
      };
    }

    // Live API call via resilient HTTP client
    const response = await bspPost<{
      bsp_reference_id: string;
      status: 'ACCEPTED' | 'REJECTED' | 'PENDING_REVIEW';
      rejection_reason?: string;
    }>('/api/v1/pera/contributor/register', {
      contributor_id: data.contributorId,
      tin: data.tin,
      first_name: data.firstName,
      last_name: data.lastName,
      date_of_birth: data.dateOfBirth,
      nationality: data.nationality,
      administrator: data.administrator,
      product_id: data.productId,
    });

    if (!response.success || !response.data) {
      throw new Error(
        `BSP contributor registration failed: ${response.error?.message ?? 'Unknown error'}`,
      );
    }

    return {
      bspReferenceId: response.data.bsp_reference_id,
      contributorId: data.contributorId,
      status: response.data.status,
      rejectionReason: response.data.rejection_reason,
      registeredAt: new Date().toISOString(),
      requestId: response.requestId,
    };
  },

  /**
   * FR-PERA-012: Submit a transaction batch file to BSP PERA-Sys.
   * POST {BASE_URL}/api/v1/pera/transactions/submit
   *
   * Submits a batch of PERA transactions (contributions, withdrawals,
   * transfers) to the BSP central registry for regulatory reporting.
   */
  async submitTransactionFile(transactions: Array<{
    transactionId: string;
    contributorId: string;
    type: 'CONTRIBUTION' | 'QUALIFIED_WITHDRAWAL' | 'UNQUALIFIED_WITHDRAWAL' | 'TRANSFER_PRODUCT' | 'TRANSFER_ADMIN';
    amount: string;
    currency: string;
    transactionDate: string;
    peraAccountId: string;
  }>): Promise<TransactionFileResult> {
    if (!transactions || transactions.length === 0) {
      throw new Error('At least one transaction is required');
    }

    const requestId = randomUUID();

    // Simulated mode fallback
    if (isSimulatedMode) {
      console.log(`[BSP-PERA-Sys] SIMULATED: submitTransactionFile(${transactions.length} records)`);
      return {
        bspBatchId: `BSP-BATCH-SIM-${Date.now()}`,
        recordCount: transactions.length,
        status: 'ACCEPTED',
        acceptedCount: transactions.length,
        rejectedCount: 0,
        rejections: [],
        submittedAt: new Date().toISOString(),
        requestId,
      };
    }

    // Live API call via resilient HTTP client
    const response = await bspPost<{
      bsp_batch_id: string;
      record_count: number;
      status: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED';
      accepted_count: number;
      rejected_count: number;
      rejections?: Array<{ record_index: number; reason: string }>;
    }>('/api/v1/pera/transactions/submit', {
      batch_date: new Date().toISOString().split('T')[0],
      administrator: 'TRUSTOMS',
      transactions: transactions.map((t) => ({
        transaction_id: t.transactionId,
        contributor_id: t.contributorId,
        transaction_type: t.type,
        amount: t.amount,
        currency: t.currency,
        transaction_date: t.transactionDate,
        pera_account_id: t.peraAccountId,
      })),
    });

    if (!response.success || !response.data) {
      throw new Error(
        `BSP transaction file submission failed: ${response.error?.message ?? 'Unknown error'}`,
      );
    }

    return {
      bspBatchId: response.data.bsp_batch_id,
      recordCount: response.data.record_count,
      status: response.data.status,
      acceptedCount: response.data.accepted_count,
      rejectedCount: response.data.rejected_count,
      rejections: response.data.rejections?.map((r) => ({
        recordIndex: r.record_index,
        reason: r.reason,
      })),
      submittedAt: new Date().toISOString(),
      requestId: response.requestId,
    };
  },

  /**
   * Get the current circuit breaker state for the BSP client.
   * Useful for operational dashboards and health checks.
   */
  getCircuitState(): { isOpen: boolean; state: string; failures: number } | null {
    if (isSimulatedMode) return null;
    return getBspClient().getCircuitState();
  },
};
