/**
 * IMASI Service (FR-IMASI-003, FR-IMASI-004)
 *
 * Investment Management Account Special Instructions service.
 * Handles Finacle core banking sync, reconciliation, and
 * pretermination penalty calculation with GL posting.
 */

import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';

// =============================================================================
// Types
// =============================================================================

interface FinacleSyncResult {
  accountId: string;
  finacleRef: string;
  syncStatus: 'SYNCED' | 'MISMATCH' | 'ERROR';
  mismatches: FinacleMismatch[];
  syncedAt: string;
}

interface FinacleMismatch {
  field: string;
  localValue: string;
  finacleValue: string;
}

interface PreterminationResult {
  accountId: string;
  originalMaturity: string;
  terminationDate: string;
  principalAmount: number;
  accruedInterest: number;
  penaltyRate: number;
  penaltyAmount: number;
  netProceeds: number;
  glBatchId: number | null;
}

interface IMAContractTerms {
  maturityDate: string;
  principalAmount: number;
  interestRate: number;
  penaltyRateEarly: number;
  minHoldDays: number;
}

// =============================================================================
// Service
// =============================================================================

export const imasiService = {
  /**
   * FR-IMASI-003: Sync account data to Finacle core banking system.
   * Maps portfolio/account fields to Finacle format, calls integration layer,
   * and handles reconciliation of response.
   */
  async syncToFinacle(accountId: string): Promise<FinacleSyncResult> {
    // Fetch portfolio + client data
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, accountId))
      .limit(1);

    if (!portfolio) {
      throw new Error(`Portfolio/account not found: ${accountId}`);
    }

    // Build Finacle-mapped payload
    const finaclePayload = {
      accountNumber: accountId,
      clientId: portfolio.client_id,
      accountType: 'IMA',
      currency: portfolio.base_currency ?? 'PHP',
      openDate: portfolio.created_at?.toISOString().split('T')[0],
      status: portfolio.status ?? 'ACTIVE',
    };

    // Call Finacle integration (stub — would call integration-service connector)
    const finacleResponse = await callFinacleAPI('syncAccount', finaclePayload);

    // Reconcile response with local data
    const mismatches: FinacleMismatch[] = [];

    if (finacleResponse.currency !== finaclePayload.currency) {
      mismatches.push({
        field: 'currency',
        localValue: finaclePayload.currency,
        finacleValue: finacleResponse.currency ?? 'UNKNOWN',
      });
    }

    if (finacleResponse.status !== finaclePayload.status) {
      mismatches.push({
        field: 'status',
        localValue: finaclePayload.status,
        finacleValue: finacleResponse.status ?? 'UNKNOWN',
      });
    }

    if (finacleResponse.clientId !== finaclePayload.clientId) {
      mismatches.push({
        field: 'clientId',
        localValue: finaclePayload.clientId ?? '',
        finacleValue: finacleResponse.clientId ?? 'UNKNOWN',
      });
    }

    const syncStatus = mismatches.length > 0 ? 'MISMATCH' : 'SYNCED';
    const finacleRef = finacleResponse.finacleRef ?? `FIN-${accountId}-${Date.now()}`;

    return {
      accountId,
      finacleRef,
      syncStatus,
      mismatches,
      syncedAt: new Date().toISOString(),
    };
  },

  /**
   * FR-IMASI-004: Calculate pretermination penalty for early IMA withdrawal.
   * Computes penalty per IMA contract terms and generates GL entries.
   */
  async calculatePreterminationPenalty(
    accountId: string,
    terminationDate?: string,
  ): Promise<PreterminationResult> {
    const termDate = terminationDate ?? new Date().toISOString().split('T')[0];

    // Fetch contract terms (from portfolio metadata or mandates)
    const terms = await getContractTerms(accountId);

    if (!terms) {
      throw new Error(`No IMA contract terms found for account: ${accountId}`);
    }

    const maturityDate = new Date(terms.maturityDate);
    const termDateObj = new Date(termDate);

    // Check if actually early termination
    if (termDateObj >= maturityDate) {
      return {
        accountId,
        originalMaturity: terms.maturityDate,
        terminationDate: termDate,
        principalAmount: terms.principalAmount,
        accruedInterest: 0,
        penaltyRate: 0,
        penaltyAmount: 0,
        netProceeds: terms.principalAmount,
        glBatchId: null,
      };
    }

    // Calculate days held vs minimum hold
    const startDate = await getAccountStartDate(accountId);
    const daysHeld = Math.floor(
      (termDateObj.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Calculate accrued interest (simple interest for IMA)
    const daysInYear = 365;
    const accruedInterest =
      terms.principalAmount * (terms.interestRate / 100) * (daysHeld / daysInYear);

    // Penalty: apply penalty rate to principal if before minimum hold
    let penaltyRate = terms.penaltyRateEarly;
    if (daysHeld >= terms.minHoldDays) {
      // Reduced penalty if past minimum hold but before maturity
      penaltyRate = terms.penaltyRateEarly * 0.5;
    }

    const penaltyAmount = terms.principalAmount * (penaltyRate / 100);
    const netProceeds = terms.principalAmount + accruedInterest - penaltyAmount;

    // Generate GL entries for the pretermination
    let glBatchId: number | null = null;
    try {
      glBatchId = await postPreterminationGL(accountId, {
        principalAmount: terms.principalAmount,
        accruedInterest,
        penaltyAmount,
        netProceeds,
        terminationDate: termDate,
      });
    } catch {
      // GL posting failure should not block the calculation
      console.error(`GL posting failed for pretermination of ${accountId}`);
    }

    return {
      accountId,
      originalMaturity: terms.maturityDate,
      terminationDate: termDate,
      principalAmount: terms.principalAmount,
      accruedInterest: Math.round(accruedInterest * 100) / 100,
      penaltyRate,
      penaltyAmount: Math.round(penaltyAmount * 100) / 100,
      netProceeds: Math.round(netProceeds * 100) / 100,
      glBatchId,
    };
  },

  /**
   * Bulk reconciliation: sync multiple accounts and return summary.
   */
  async bulkReconcile(
    accountIds: string[],
  ): Promise<{
    total: number;
    synced: number;
    mismatched: number;
    errors: number;
    results: FinacleSyncResult[];
  }> {
    const results: FinacleSyncResult[] = [];
    let synced = 0;
    let mismatched = 0;
    let errors = 0;

    for (const accountId of accountIds) {
      try {
        const result = await this.syncToFinacle(accountId);
        results.push(result);
        if (result.syncStatus === 'SYNCED') synced++;
        else if (result.syncStatus === 'MISMATCH') mismatched++;
        else errors++;
      } catch {
        errors++;
        results.push({
          accountId,
          finacleRef: '',
          syncStatus: 'ERROR',
          mismatches: [],
          syncedAt: new Date().toISOString(),
        });
      }
    }

    return {
      total: accountIds.length,
      synced,
      mismatched,
      errors,
      results,
    };
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Stub Finacle API call — in production, routes through integration-service connector.
 */
async function callFinacleAPI(
  _method: string,
  payload: Record<string, unknown>,
): Promise<Record<string, string>> {
  // Simulate Finacle response matching local data (stub)
  return {
    finacleRef: `FIN-${payload.accountNumber}-${Date.now()}`,
    accountNumber: String(payload.accountNumber),
    clientId: String(payload.clientId ?? ''),
    currency: String(payload.currency ?? 'PHP'),
    status: String(payload.status ?? 'ACTIVE'),
  };
}

/**
 * Retrieve IMA contract terms from portfolio mandates.
 */
async function getContractTerms(accountId: string): Promise<IMAContractTerms | null> {
  const [mandate] = await db
    .select()
    .from(schema.mandates)
    .where(eq(schema.mandates.portfolio_id, accountId))
    .limit(1);

  if (!mandate) {
    // Return default IMA terms
    return {
      maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      principalAmount: 0,
      interestRate: 3.5,
      penaltyRateEarly: 2.0,
      minHoldDays: 30,
    };
  }

  // Extract terms from mandate metadata
  const meta = (mandate.investment_guidelines as Record<string, unknown>) ?? {};

  return {
    maturityDate:
      String(meta.maturityDate ?? '') ||
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    principalAmount: Number(meta.principalAmount ?? 0),
    interestRate: Number(meta.interestRate ?? 3.5),
    penaltyRateEarly: Number(meta.penaltyRateEarly ?? 2.0),
    minHoldDays: Number(meta.minHoldDays ?? 30),
  };
}

/**
 * Get account start date from portfolio creation date.
 */
async function getAccountStartDate(accountId: string): Promise<Date> {
  const [portfolio] = await db
    .select({ created_at: schema.portfolios.created_at })
    .from(schema.portfolios)
    .where(eq(schema.portfolios.portfolio_id, accountId))
    .limit(1);

  return portfolio?.created_at ?? new Date();
}

/**
 * Post GL entries for pretermination via gl-posting-engine.
 * Uses submitBusinessEvent → resolveAccountingIntent flow.
 */
async function postPreterminationGL(
  accountId: string,
  data: {
    principalAmount: number;
    accruedInterest: number;
    penaltyAmount: number;
    netProceeds: number;
    terminationDate: string;
  },
): Promise<number> {
  const { glPostingEngine } = await import('./gl-posting-engine');

  const { event_id } = await glPostingEngine.submitBusinessEvent({
    sourceSystem: 'IMASI',
    sourceReference: accountId,
    idempotencyKey: `IMA-PRETERM-${accountId}-${data.terminationDate}`,
    eventCode: 'IMA_PRETERMINATION',
    eventPayload: {
      accountId,
      principalAmount: data.principalAmount,
      accruedInterest: data.accruedInterest,
      penaltyAmount: data.penaltyAmount,
      netProceeds: data.netProceeds,
    },
    businessDate: data.terminationDate,
  });

  // Attempt to resolve accounting intent (may not have a matching rule yet)
  try {
    await glPostingEngine.resolveAccountingIntent(event_id);
  } catch {
    // Rule may not be configured yet — event is still recorded for manual processing
  }

  return event_id;
}
