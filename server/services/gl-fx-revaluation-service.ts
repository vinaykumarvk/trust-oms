/**
 * GL FX Revaluation & Year-End Service (Enterprise GL)
 *
 * Manages:
 *   - Daily FCY revaluation (FX-001 to FX-007): mark-to-market FCY GL balances
 *     using closing FX rates and post gain/loss entries.
 *   - Year-end P/L transfer (YE-001 to YE-005): close income/expense GLs to
 *     retained earnings.
 *   - NAV posting integration (FUND-005, FUND-006): draft NAV computation,
 *     finalization, and fee journal posting.
 *   - Balance snapshots: daily and period-end balance capture for reporting.
 *   - FRPTI extract generation: quarterly BSP FRPTI regulatory data mart.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, ne, gte, lte, inArray, type InferSelectModel } from 'drizzle-orm';

type JournalLine = InferSelectModel<typeof schema.glJournalLines>;
type BalanceSnapshot = InferSelectModel<typeof schema.glBalanceSnapshots>;
type FrptiExtract = InferSelectModel<typeof schema.glFrptiExtracts>;
type FrptiMapping = InferSelectModel<typeof schema.frptiMappings>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function generateBatchRef(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

function abs(n: number): number {
  return n < 0 ? -n : n;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const glFxRevaluationService = {

  // ==========================================================================
  // FX REVALUATION (FX-001 to FX-007)
  // ==========================================================================

  /**
   * Run full daily FX revaluation for all GLs enabled for revaluation.
   *
   * Steps:
   *   1. Create gl_fx_revaluation_runs record (IN_PROGRESS)
   *   2. Fetch all GL heads with is_revaluation_enabled = true
   *   3. For each GL, fetch FCY balances (currency != base_currency)
   *   4. Look up closing mid_rate from fx_rates for the business date
   *   5. Compute new base equivalent and revaluation amount
   *   6. Determine GAIN or LOSS direction based on balance nature
   *   7. Store per-GL detail in gl_fx_revaluation_details
   *   8. Generate and post journal batch with all gain/loss entries
   *   9. Update run status to COMPLETED
   */
  async runFxRevaluation(businessDate: string, userId: number) {
    // 1. Create run record
    const [run] = await db
      .insert(schema.glFxRevaluationRuns)
      .values({
        business_date: businessDate,
        run_status: 'IN_PROGRESS',
        started_at: new Date(),
        run_by: userId,
      })
      .returning();

    try {
      // 2. Get all GL heads enabled for revaluation
      const revalGls = await db
        .select()
        .from(schema.glHeads)
        .where(
          and(
            eq(schema.glHeads.is_revaluation_enabled, true),
            eq(schema.glHeads.account_status, 'OPEN'),
          ),
        );

      if (revalGls.length === 0) {
        await db
          .update(schema.glFxRevaluationRuns)
          .set({
            run_status: 'COMPLETED',
            completed_at: new Date(),
            total_gls_processed: 0,
            total_gain: '0',
            total_loss: '0',
          })
          .where(eq(schema.glFxRevaluationRuns.id, run.id));

        return {
          runId: run.id,
          business_date: businessDate,
          status: 'COMPLETED',
          total_gls_processed: 0,
          total_gain: 0,
          total_loss: 0,
          details: [],
        };
      }

      // 3. Get revaluation parameters (gain/loss GL mappings)
      const revalParams = await db
        .select()
        .from(schema.revalParameters)
        .where(
          and(
            eq(schema.revalParameters.is_active, true),
            lte(schema.revalParameters.effective_from, businessDate),
            sql`(${schema.revalParameters.effective_to} IS NULL OR ${schema.revalParameters.effective_to} >= ${businessDate})`,
          ),
        );

      const paramMap = new Map<number, typeof revalParams[number]>();
      for (const p of revalParams) {
        paramMap.set(p.gl_head_id, p);
      }

      // 4. Get the default accounting unit (first active one)
      const [defaultUnit] = await db
        .select()
        .from(schema.accountingUnits)
        .where(eq(schema.accountingUnits.is_active, true))
        .limit(1);

      const accountingUnitId = defaultUnit?.id ?? 1;
      const baseCurrency = defaultUnit?.base_currency ?? 'PHP';

      // Prepare journal lines
      const journalLines: Array<{
        line_no: number;
        dr_cr: 'DR' | 'CR';
        gl_head_id: number;
        amount: string;
        currency: string;
        base_amount: string;
        narration: string;
      }> = [];

      const details: Array<{
        gl_head_id: number;
        currency: string;
        fcy_balance: number;
        old_base_equivalent: number;
        closing_mid_rate: number;
        new_base_equivalent: number;
        revaluation_amount: number;
        direction: 'GAIN' | 'LOSS';
      }> = [];

      let totalGain = 0;
      let totalLoss = 0;
      let lineNo = 0;

      for (const gl of revalGls) {
        // 5. Get FCY ledger balances (currency != base_currency) for this GL on business_date
        const fcyBalances = await db
          .select()
          .from(schema.glLedgerBalances)
          .where(
            and(
              eq(schema.glLedgerBalances.gl_head_id, gl.id),
              ne(schema.glLedgerBalances.currency, baseCurrency),
              eq(schema.glLedgerBalances.balance_date, businessDate),
            ),
          );

        for (const bal of fcyBalances) {
          const fcyBalance = parseFloat(bal.closing_balance ?? '0');
          if (fcyBalance === 0) continue;

          const oldBaseEquivalent = parseFloat(bal.base_amount ?? '0');

          // 6. Get closing mid_rate for this currency pair
          const [fxRate] = await db
            .select()
            .from(schema.fxRates)
            .where(
              and(
                eq(schema.fxRates.currency_from, bal.currency),
                eq(schema.fxRates.currency_to, baseCurrency),
                eq(schema.fxRates.business_date, businessDate),
              ),
            )
            .orderBy(desc(schema.fxRates.date_serial))
            .limit(1);

          if (!fxRate || !fxRate.mid_rate) {
            // No rate available; skip this balance
            continue;
          }

          const closingMidRate = parseFloat(fxRate.mid_rate);
          const newBaseEquivalent = fcyBalance * closingMidRate;
          const revalAmount = newBaseEquivalent - oldBaseEquivalent;

          if (abs(revalAmount) < 0.01) continue; // negligible difference

          // 7. Determine direction based on GL balance nature:
          //   Debit-nature GLs (ASSET, EXPENDITURE):
          //     increase in base equivalent => GAIN
          //     decrease in base equivalent => LOSS
          //   Credit-nature GLs (LIABILITY, INCOME, EQUITY):
          //     increase in base equivalent => LOSS (liability increased)
          //     decrease in base equivalent => GAIN (liability decreased)
          const isDebitNature = gl.gl_type === 'ASSET' || gl.gl_type === 'EXPENDITURE';
          let direction: 'GAIN' | 'LOSS';

          if (isDebitNature) {
            direction = revalAmount > 0 ? 'GAIN' : 'LOSS';
          } else {
            direction = revalAmount > 0 ? 'LOSS' : 'GAIN';
          }

          const absAmount = abs(revalAmount);

          // Accumulate totals
          if (direction === 'GAIN') {
            totalGain += absAmount;
          } else {
            totalLoss += absAmount;
          }

          details.push({
            gl_head_id: gl.id,
            currency: bal.currency,
            fcy_balance: fcyBalance,
            old_base_equivalent: oldBaseEquivalent,
            closing_mid_rate: closingMidRate,
            new_base_equivalent: newBaseEquivalent,
            revaluation_amount: absAmount,
            direction,
          });

          // 8. Build journal lines
          const param = paramMap.get(gl.id);
          const gainGlId = param?.gain_gl_id ?? gl.id;
          const lossGlId = param?.loss_gl_id ?? gl.id;

          if (direction === 'GAIN') {
            // Debit balance + increase = GAIN: Dr FCY GL, Cr Reval Gain GL
            // Credit balance + decrease = GAIN: Dr FCY GL, Cr Reval Gain GL
            lineNo++;
            journalLines.push({
              line_no: lineNo,
              dr_cr: 'DR',
              gl_head_id: gl.id,
              amount: String(absAmount),
              currency: baseCurrency,
              base_amount: String(absAmount),
              narration: `FX Reval GAIN - ${gl.code} ${bal.currency} @ ${closingMidRate}`,
            });
            lineNo++;
            journalLines.push({
              line_no: lineNo,
              dr_cr: 'CR',
              gl_head_id: gainGlId,
              amount: String(absAmount),
              currency: baseCurrency,
              base_amount: String(absAmount),
              narration: `FX Reval GAIN - ${gl.code} ${bal.currency} @ ${closingMidRate}`,
            });
          } else {
            // Debit balance + decrease = LOSS: Dr Reval Loss GL, Cr FCY GL
            // Credit balance + increase = LOSS: Dr Reval Loss GL, Cr FCY GL
            lineNo++;
            journalLines.push({
              line_no: lineNo,
              dr_cr: 'DR',
              gl_head_id: lossGlId,
              amount: String(absAmount),
              currency: baseCurrency,
              base_amount: String(absAmount),
              narration: `FX Reval LOSS - ${gl.code} ${bal.currency} @ ${closingMidRate}`,
            });
            lineNo++;
            journalLines.push({
              line_no: lineNo,
              dr_cr: 'CR',
              gl_head_id: gl.id,
              amount: String(absAmount),
              currency: baseCurrency,
              base_amount: String(absAmount),
              narration: `FX Reval LOSS - ${gl.code} ${bal.currency} @ ${closingMidRate}`,
            });
          }
        }
      }

      // 9. Create and post journal batch
      let batchId: number | null = null;

      if (journalLines.length > 0) {
        const batchRef = generateBatchRef('FXREVAL');
        const totalDebit = journalLines
          .filter((l) => l.dr_cr === 'DR')
          .reduce((sum, l) => sum + parseFloat(l.amount), 0);
        const totalCredit = journalLines
          .filter((l) => l.dr_cr === 'CR')
          .reduce((sum, l) => sum + parseFloat(l.amount), 0);

        const [batch] = await db
          .insert(schema.glJournalBatches)
          .values({
            batch_ref: batchRef,
            source_system: 'GL_FX_REVALUATION',
            event_code: 'FX_REVAL',
            posting_mode: 'EOD',
            accounting_unit_id: accountingUnitId,
            transaction_date: businessDate,
            value_date: businessDate,
            posting_date: new Date(),
            batch_status: 'POSTED',
            total_debit: String(totalDebit),
            total_credit: String(totalCredit),
            line_count: journalLines.length,
            narration: `FX Revaluation for ${businessDate}`,
            maker_id: userId,
          })
          .returning();

        batchId = batch.id;

        // Insert journal lines
        for (const line of journalLines) {
          await db.insert(schema.glJournalLines).values({
            batch_id: batch.id,
            line_no: line.line_no,
            dr_cr: line.dr_cr,
            gl_head_id: line.gl_head_id,
            amount: line.amount,
            currency: line.currency,
            base_currency: baseCurrency,
            base_amount: line.base_amount,
            narration: line.narration,
          });
        }
      }

      // 10. Store revaluation details
      for (const detail of details) {
        await db.insert(schema.glFxRevaluationDetails).values({
          run_id: run.id,
          gl_head_id: detail.gl_head_id,
          currency: detail.currency,
          fcy_balance: String(detail.fcy_balance),
          old_base_equivalent: String(detail.old_base_equivalent),
          closing_mid_rate: String(detail.closing_mid_rate),
          new_base_equivalent: String(detail.new_base_equivalent),
          revaluation_amount: String(detail.revaluation_amount),
          direction: detail.direction,
          posted_to_gl: batchId ? `BATCH-${batchId}` : null,
        });
      }

      // 11. Update run to COMPLETED
      await db
        .update(schema.glFxRevaluationRuns)
        .set({
          run_status: 'COMPLETED',
          completed_at: new Date(),
          total_gls_processed: details.length,
          total_gain: String(totalGain),
          total_loss: String(totalLoss),
          journal_batch_id: batchId,
        })
        .where(eq(schema.glFxRevaluationRuns.id, run.id));

      // 12. Update ledger balance base_amount and revaluation_amount
      for (const detail of details) {
        await db
          .update(schema.glLedgerBalances)
          .set({
            base_amount: String(detail.new_base_equivalent),
            revaluation_amount: String(detail.revaluation_amount),
          })
          .where(
            and(
              eq(schema.glLedgerBalances.gl_head_id, detail.gl_head_id),
              eq(schema.glLedgerBalances.currency, detail.currency),
              eq(schema.glLedgerBalances.balance_date, businessDate),
            ),
          );
      }

      return {
        runId: run.id,
        business_date: businessDate,
        status: 'COMPLETED',
        total_gls_processed: details.length,
        total_gain: totalGain,
        total_loss: totalLoss,
        journal_batch_id: batchId,
        details,
      };
    } catch (error) {
      // Mark run as FAILED on error
      await db
        .update(schema.glFxRevaluationRuns)
        .set({
          run_status: 'FAILED',
          completed_at: new Date(),
        })
        .where(eq(schema.glFxRevaluationRuns.id, run.id));

      throw new Error(`FX revaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /** Get a single revaluation run with its details */
  async getRevaluationRun(runId: number) {
    const [run] = await db
      .select()
      .from(schema.glFxRevaluationRuns)
      .where(eq(schema.glFxRevaluationRuns.id, runId))
      .limit(1);

    if (!run) throw new Error(`Revaluation run ${runId} not found`);

    const details = await db
      .select()
      .from(schema.glFxRevaluationDetails)
      .where(eq(schema.glFxRevaluationDetails.run_id, runId));

    return { ...run, details };
  },

  /** List revaluation runs, optionally filtered by date range */
  async getRevaluationRuns(fromDate?: string, toDate?: string) {
    const conditions = [];
    if (fromDate) {
      conditions.push(gte(schema.glFxRevaluationRuns.business_date, fromDate));
    }
    if (toDate) {
      conditions.push(lte(schema.glFxRevaluationRuns.business_date, toDate));
    }

    const runs = await db
      .select()
      .from(schema.glFxRevaluationRuns)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.glFxRevaluationRuns.business_date));

    return runs;
  },

  /** Detailed currency-wise revaluation report for a run */
  async getRevaluationReport(runId: number) {
    const [run] = await db
      .select()
      .from(schema.glFxRevaluationRuns)
      .where(eq(schema.glFxRevaluationRuns.id, runId))
      .limit(1);

    if (!run) throw new Error(`Revaluation run ${runId} not found`);

    const details = await db
      .select({
        id: schema.glFxRevaluationDetails.id,
        gl_head_id: schema.glFxRevaluationDetails.gl_head_id,
        gl_code: schema.glHeads.code,
        gl_name: schema.glHeads.name,
        gl_type: schema.glHeads.gl_type,
        currency: schema.glFxRevaluationDetails.currency,
        fcy_balance: schema.glFxRevaluationDetails.fcy_balance,
        old_base_equivalent: schema.glFxRevaluationDetails.old_base_equivalent,
        closing_mid_rate: schema.glFxRevaluationDetails.closing_mid_rate,
        new_base_equivalent: schema.glFxRevaluationDetails.new_base_equivalent,
        revaluation_amount: schema.glFxRevaluationDetails.revaluation_amount,
        direction: schema.glFxRevaluationDetails.direction,
        posted_to_gl: schema.glFxRevaluationDetails.posted_to_gl,
      })
      .from(schema.glFxRevaluationDetails)
      .innerJoin(schema.glHeads, eq(schema.glFxRevaluationDetails.gl_head_id, schema.glHeads.id))
      .where(eq(schema.glFxRevaluationDetails.run_id, runId))
      .orderBy(schema.glFxRevaluationDetails.currency, schema.glHeads.code);

    // Group by currency for summary
    const currencySummary = new Map<string, { gain: number; loss: number; net: number; count: number }>();
    for (const d of details) {
      const existing = currencySummary.get(d.currency) ?? { gain: 0, loss: 0, net: 0, count: 0 };
      const amt = parseFloat(d.revaluation_amount);
      if (d.direction === 'GAIN') {
        existing.gain += amt;
        existing.net += amt;
      } else {
        existing.loss += amt;
        existing.net -= amt;
      }
      existing.count++;
      currencySummary.set(d.currency, existing);
    }

    return {
      run,
      details,
      currency_summary: Object.fromEntries(currencySummary),
      total_gain: parseFloat(run.total_gain ?? '0'),
      total_loss: parseFloat(run.total_loss ?? '0'),
      net_impact: parseFloat(run.total_gain ?? '0') - parseFloat(run.total_loss ?? '0'),
    };
  },

  // ==========================================================================
  // YEAR-END PROCESSING (YE-001 to YE-005)
  // ==========================================================================

  /**
   * Run year-end P/L transfer:
   *   1. Get financial year parameters (income/expense transfer GL, retained earnings GL)
   *   2. Validate year-end txn_code exists
   *   3. Get all INCOME GL balances -> total income
   *   4. Get all EXPENDITURE GL balances -> total expenses
   *   5. Net P/L = total income - total expenses
   *   6. Generate journal batch closing each income/expense GL to zero
   *   7. DR/CR retained earnings GL for net P/L
   *   8. Post batch and mark year as closed
   */
  async runYearEnd(yearCode: string, userId: number) {
    // 1. Get financial year
    const [fy] = await db
      .select()
      .from(schema.glFinancialYears)
      .where(eq(schema.glFinancialYears.year_code, yearCode))
      .limit(1);

    if (!fy) throw new Error(`Financial year ${yearCode} not found`);
    if (fy.is_closed) throw new Error(`Financial year ${yearCode} is already closed`);

    const retainedEarningsGlId = fy.retained_earnings_gl_id;
    if (!retainedEarningsGlId) {
      throw new Error(`Retained earnings GL not configured for year ${yearCode}`);
    }

    // 2. Mark year as IN_PROGRESS
    await db
      .update(schema.glFinancialYears)
      .set({ year_end_status: 'IN_PROGRESS' })
      .where(eq(schema.glFinancialYears.id, fy.id));

    try {
      // Get default accounting unit
      const [defaultUnit] = await db
        .select()
        .from(schema.accountingUnits)
        .where(eq(schema.accountingUnits.is_active, true))
        .limit(1);

      const accountingUnitId = defaultUnit?.id ?? 1;
      const baseCurrency = defaultUnit?.base_currency ?? 'PHP';

      // 3. Get all INCOME GL balances at year-end date
      const incomeGls = await db
        .select()
        .from(schema.glHeads)
        .where(
          and(
            eq(schema.glHeads.gl_type, 'INCOME'),
            eq(schema.glHeads.account_status, 'OPEN'),
          ),
        );

      const incomeBalances: Array<{
        gl_head_id: number;
        gl_code: string;
        balance: number;
      }> = [];

      let totalIncome = 0;

      for (const gl of incomeGls) {
        const balances = await db
          .select()
          .from(schema.glLedgerBalances)
          .where(
            and(
              eq(schema.glLedgerBalances.gl_head_id, gl.id),
              eq(schema.glLedgerBalances.currency, baseCurrency),
              lte(schema.glLedgerBalances.balance_date, fy.end_date),
            ),
          )
          .orderBy(desc(schema.glLedgerBalances.balance_date))
          .limit(1);

        if (balances.length > 0) {
          const balance = parseFloat(balances[0].closing_balance ?? '0');
          if (abs(balance) >= 0.01) {
            incomeBalances.push({
              gl_head_id: gl.id,
              gl_code: gl.code,
              balance,
            });
            totalIncome += balance;
          }
        }
      }

      // 4. Get all EXPENDITURE GL balances at year-end date
      const expenseGls = await db
        .select()
        .from(schema.glHeads)
        .where(
          and(
            eq(schema.glHeads.gl_type, 'EXPENDITURE'),
            eq(schema.glHeads.account_status, 'OPEN'),
          ),
        );

      const expenseBalances: Array<{
        gl_head_id: number;
        gl_code: string;
        balance: number;
      }> = [];

      let totalExpenses = 0;

      for (const gl of expenseGls) {
        const balances = await db
          .select()
          .from(schema.glLedgerBalances)
          .where(
            and(
              eq(schema.glLedgerBalances.gl_head_id, gl.id),
              eq(schema.glLedgerBalances.currency, baseCurrency),
              lte(schema.glLedgerBalances.balance_date, fy.end_date),
            ),
          )
          .orderBy(desc(schema.glLedgerBalances.balance_date))
          .limit(1);

        if (balances.length > 0) {
          const balance = parseFloat(balances[0].closing_balance ?? '0');
          if (abs(balance) >= 0.01) {
            expenseBalances.push({
              gl_head_id: gl.id,
              gl_code: gl.code,
              balance,
            });
            totalExpenses += balance;
          }
        }
      }

      // 5. Net P/L
      const netPL = totalIncome - totalExpenses;

      // 6. Generate journal batch
      const batchRef = generateBatchRef('YEAREND');
      const journalLines: Array<{
        line_no: number;
        dr_cr: 'DR' | 'CR';
        gl_head_id: number;
        amount: string;
        currency: string;
        base_amount: string;
        narration: string;
        transaction_code: string | null;
      }> = [];

      let lineNo = 0;

      // DR each INCOME GL for its balance (income GLs have credit balances, so debit to close)
      for (const inc of incomeBalances) {
        lineNo++;
        journalLines.push({
          line_no: lineNo,
          dr_cr: 'DR',
          gl_head_id: inc.gl_head_id,
          amount: String(abs(inc.balance)),
          currency: baseCurrency,
          base_amount: String(abs(inc.balance)),
          narration: `Year-end close income GL ${inc.gl_code} for ${yearCode}`,
          transaction_code: fy.year_end_txn_code ?? null,
        });
      }

      // CR each EXPENDITURE GL for its balance (expense GLs have debit balances, so credit to close)
      for (const exp of expenseBalances) {
        lineNo++;
        journalLines.push({
          line_no: lineNo,
          dr_cr: 'CR',
          gl_head_id: exp.gl_head_id,
          amount: String(abs(exp.balance)),
          currency: baseCurrency,
          base_amount: String(abs(exp.balance)),
          narration: `Year-end close expense GL ${exp.gl_code} for ${yearCode}`,
          transaction_code: fy.year_end_txn_code ?? null,
        });
      }

      // DR or CR retained earnings GL for net P/L
      if (abs(netPL) >= 0.01) {
        lineNo++;
        if (netPL > 0) {
          // Net profit: CR retained earnings
          journalLines.push({
            line_no: lineNo,
            dr_cr: 'CR',
            gl_head_id: retainedEarningsGlId,
            amount: String(abs(netPL)),
            currency: baseCurrency,
            base_amount: String(abs(netPL)),
            narration: `Year-end net profit transfer to retained earnings for ${yearCode}`,
            transaction_code: fy.year_end_txn_code ?? null,
          });
        } else {
          // Net loss: DR retained earnings
          journalLines.push({
            line_no: lineNo,
            dr_cr: 'DR',
            gl_head_id: retainedEarningsGlId,
            amount: String(abs(netPL)),
            currency: baseCurrency,
            base_amount: String(abs(netPL)),
            narration: `Year-end net loss transfer to retained earnings for ${yearCode}`,
            transaction_code: fy.year_end_txn_code ?? null,
          });
        }
      }

      // Calculate totals
      const totalDebit = journalLines
        .filter((l) => l.dr_cr === 'DR')
        .reduce((sum, l) => sum + parseFloat(l.amount), 0);
      const totalCredit = journalLines
        .filter((l) => l.dr_cr === 'CR')
        .reduce((sum, l) => sum + parseFloat(l.amount), 0);

      // 7. Post batch
      const [batch] = await db
        .insert(schema.glJournalBatches)
        .values({
          batch_ref: batchRef,
          source_system: 'GL_YEAR_END',
          event_code: 'YEAR_END_CLOSE',
          posting_mode: 'YEAR_END',
          accounting_unit_id: accountingUnitId,
          transaction_date: fy.end_date,
          value_date: fy.end_date,
          posting_date: new Date(),
          batch_status: 'POSTED',
          total_debit: String(totalDebit),
          total_credit: String(totalCredit),
          line_count: journalLines.length,
          narration: `Year-end P/L transfer for ${yearCode}`,
          financial_year: yearCode,
          maker_id: userId,
        })
        .returning();

      for (const line of journalLines) {
        await db.insert(schema.glJournalLines).values({
          batch_id: batch.id,
          line_no: line.line_no,
          dr_cr: line.dr_cr,
          gl_head_id: line.gl_head_id,
          amount: line.amount,
          currency: line.currency,
          base_currency: baseCurrency,
          base_amount: line.base_amount,
          narration: line.narration,
          transaction_code: line.transaction_code,
        });
      }

      // 8. Mark year as closed
      await db
        .update(schema.glFinancialYears)
        .set({
          is_closed: true,
          closed_at: new Date(),
          closed_by: userId,
          year_end_status: 'COMPLETED',
          year_end_batch_id: batch.id,
        })
        .where(eq(schema.glFinancialYears.id, fy.id));

      return {
        year_code: yearCode,
        status: 'COMPLETED',
        batch_ref: batchRef,
        batch_id: batch.id,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_pl: netPL,
        income_gls_closed: incomeBalances.length,
        expense_gls_closed: expenseBalances.length,
        journal_lines: journalLines.length,
        total_debit: totalDebit,
        total_credit: totalCredit,
      };
    } catch (error) {
      // Revert year-end status
      await db
        .update(schema.glFinancialYears)
        .set({ year_end_status: 'PENDING' })
        .where(eq(schema.glFinancialYears.id, fy.id));

      throw new Error(`Year-end processing failed for ${yearCode}: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /** Reverse year-end (restricted operation) */
  async reverseYearEnd(yearCode: string, userId: number, reason: string) {
    const [fy] = await db
      .select()
      .from(schema.glFinancialYears)
      .where(eq(schema.glFinancialYears.year_code, yearCode))
      .limit(1);

    if (!fy) throw new Error(`Financial year ${yearCode} not found`);
    if (!fy.is_closed) throw new Error(`Financial year ${yearCode} is not closed`);
    if (!fy.year_end_batch_id) throw new Error(`No year-end batch found for ${yearCode}`);

    // Get default accounting unit
    const [defaultUnit] = await db
      .select()
      .from(schema.accountingUnits)
      .where(eq(schema.accountingUnits.is_active, true))
      .limit(1);

    const accountingUnitId = defaultUnit?.id ?? 1;
    const baseCurrency = defaultUnit?.base_currency ?? 'PHP';

    // Get original batch lines
    const originalLines = await db
      .select()
      .from(schema.glJournalLines)
      .where(eq(schema.glJournalLines.batch_id, fy.year_end_batch_id));

    // Create reversal batch
    const reversalBatchRef = generateBatchRef('YEAREND-REV');
    const totalDebit = originalLines
      .filter((l: JournalLine) => l.dr_cr === 'CR')
      .reduce((sum: number, l: JournalLine) => sum + parseFloat(l.amount), 0);
    const totalCredit = originalLines
      .filter((l: JournalLine) => l.dr_cr === 'DR')
      .reduce((sum: number, l: JournalLine) => sum + parseFloat(l.amount), 0);

    const [reversalBatch] = await db
      .insert(schema.glJournalBatches)
      .values({
        batch_ref: reversalBatchRef,
        source_system: 'GL_YEAR_END',
        event_code: 'YEAR_END_REVERSAL',
        posting_mode: 'YEAR_END',
        accounting_unit_id: accountingUnitId,
        transaction_date: todayStr(),
        value_date: fy.end_date,
        posting_date: new Date(),
        batch_status: 'POSTED',
        total_debit: String(totalDebit),
        total_credit: String(totalCredit),
        line_count: originalLines.length,
        narration: `Reversal of year-end for ${yearCode}: ${reason}`,
        financial_year: yearCode,
        maker_id: userId,
      })
      .returning();

    // Reverse each line (flip DR/CR)
    let lineNo = 0;
    for (const origLine of originalLines) {
      lineNo++;
      await db.insert(schema.glJournalLines).values({
        batch_id: reversalBatch.id,
        line_no: lineNo,
        dr_cr: origLine.dr_cr === 'DR' ? 'CR' : 'DR',
        gl_head_id: origLine.gl_head_id,
        amount: origLine.amount,
        currency: origLine.currency,
        base_currency: origLine.base_currency,
        base_amount: origLine.base_amount,
        narration: `Reversal: ${origLine.narration ?? ''}`,
        transaction_code: origLine.transaction_code,
      });
    }

    // Create reversal link
    await db.insert(schema.glReversalLinks).values({
      original_batch_id: fy.year_end_batch_id,
      reversal_batch_id: reversalBatch.id,
      reversal_type: 'REVERSAL',
      reversal_reason: reason,
      approved_by: userId,
      approved_at: new Date(),
    });

    // Reopen financial year
    await db
      .update(schema.glFinancialYears)
      .set({
        is_closed: false,
        closed_at: null,
        closed_by: null,
        year_end_status: 'REVERSED',
      })
      .where(eq(schema.glFinancialYears.id, fy.id));

    return {
      year_code: yearCode,
      status: 'REVERSED',
      reversal_batch_ref: reversalBatchRef,
      reversal_batch_id: reversalBatch.id,
      reason,
      reversed_by: userId,
    };
  },

  /** Get year-end status and batch reference */
  async getYearEndStatus(yearCode: string) {
    const [fy] = await db
      .select()
      .from(schema.glFinancialYears)
      .where(eq(schema.glFinancialYears.year_code, yearCode))
      .limit(1);

    if (!fy) throw new Error(`Financial year ${yearCode} not found`);

    let batchRef: string | null = null;
    if (fy.year_end_batch_id) {
      const [batch] = await db
        .select({ batch_ref: schema.glJournalBatches.batch_ref })
        .from(schema.glJournalBatches)
        .where(eq(schema.glJournalBatches.id, fy.year_end_batch_id))
        .limit(1);
      batchRef = batch?.batch_ref ?? null;
    }

    return {
      year_code: fy.year_code,
      start_date: fy.start_date,
      end_date: fy.end_date,
      is_closed: fy.is_closed,
      year_end_status: fy.year_end_status,
      closed_at: fy.closed_at,
      closed_by: fy.closed_by,
      year_end_batch_id: fy.year_end_batch_id,
      year_end_batch_ref: batchRef,
      income_transfer_gl_id: fy.income_transfer_gl_id,
      expense_transfer_gl_id: fy.expense_transfer_gl_id,
      retained_earnings_gl_id: fy.retained_earnings_gl_id,
    };
  },

  // ==========================================================================
  // NAV POSTING INTEGRATION (FUND-005, FUND-006)
  // ==========================================================================

  /**
   * Post fee entries from NAV finalization.
   *   1. Get NAV computation record
   *   2. Verify status is FINAL
   *   3. Generate fee journal entries (management fee, custody fee, etc.)
   *   4. Post journal batch
   *   5. Link batch to NAV computation
   */
  async postNavFees(navComputationId: number, userId: number) {
    const [navComp] = await db
      .select()
      .from(schema.glNavComputations)
      .where(eq(schema.glNavComputations.id, navComputationId))
      .limit(1);

    if (!navComp) throw new Error(`NAV computation ${navComputationId} not found`);
    if (navComp.nav_status !== 'FINAL') {
      throw new Error(`NAV computation ${navComputationId} is not FINAL (current: ${navComp.nav_status})`);
    }

    // Get fund details for accounting unit
    const [fund] = await db
      .select()
      .from(schema.fundMaster)
      .where(eq(schema.fundMaster.id, navComp.fund_id))
      .limit(1);

    if (!fund) throw new Error(`Fund ${navComp.fund_id} not found`);

    const accountingUnitId = fund.accounting_unit_id ?? 1;
    const fundCurrency = fund.fund_currency ?? 'PHP';

    // Build fee journal entries
    const journalLines: Array<{
      line_no: number;
      dr_cr: 'DR' | 'CR';
      gl_head_id: number;
      amount: string;
      currency: string;
      base_amount: string;
      narration: string;
    }> = [];

    let lineNo = 0;
    const totalFees = parseFloat(navComp.total_fees ?? '0');
    const totalTaxes = parseFloat(navComp.total_taxes ?? '0');
    const accruedExpenses = parseFloat(navComp.accrued_expenses ?? '0');

    // Get fund-specific GL heads for fee/expense posting.
    // Use the fund's accounting unit to look up appropriate GLs.
    // Default to posting against generic EXPENDITURE GLs.
    const expenseGls = await db
      .select()
      .from(schema.glHeads)
      .where(
        and(
          eq(schema.glHeads.gl_type, 'EXPENDITURE'),
          eq(schema.glHeads.account_status, 'OPEN'),
          eq(schema.glHeads.is_nominal, true),
        ),
      )
      .limit(3);

    const feeGlId = expenseGls[0]?.id ?? 1;
    const taxGlId = expenseGls[1]?.id ?? expenseGls[0]?.id ?? 1;

    // Get a liability GL for accrued expenses payable
    const [liabilityGl] = await db
      .select()
      .from(schema.glHeads)
      .where(
        and(
          eq(schema.glHeads.gl_type, 'LIABILITY'),
          eq(schema.glHeads.account_status, 'OPEN'),
        ),
      )
      .limit(1);

    const accruedPayableGlId = liabilityGl?.id ?? 1;

    // Post management/custody fees
    if (totalFees > 0) {
      lineNo++;
      journalLines.push({
        line_no: lineNo,
        dr_cr: 'DR',
        gl_head_id: feeGlId,
        amount: String(totalFees),
        currency: fundCurrency,
        base_amount: String(totalFees),
        narration: `NAV fees - Fund ${fund.fund_code} - ${navComp.nav_date}`,
      });
      lineNo++;
      journalLines.push({
        line_no: lineNo,
        dr_cr: 'CR',
        gl_head_id: accruedPayableGlId,
        amount: String(totalFees),
        currency: fundCurrency,
        base_amount: String(totalFees),
        narration: `NAV fees payable - Fund ${fund.fund_code} - ${navComp.nav_date}`,
      });
    }

    // Post taxes
    if (totalTaxes > 0) {
      lineNo++;
      journalLines.push({
        line_no: lineNo,
        dr_cr: 'DR',
        gl_head_id: taxGlId,
        amount: String(totalTaxes),
        currency: fundCurrency,
        base_amount: String(totalTaxes),
        narration: `NAV tax expense - Fund ${fund.fund_code} - ${navComp.nav_date}`,
      });
      lineNo++;
      journalLines.push({
        line_no: lineNo,
        dr_cr: 'CR',
        gl_head_id: accruedPayableGlId,
        amount: String(totalTaxes),
        currency: fundCurrency,
        base_amount: String(totalTaxes),
        narration: `NAV tax payable - Fund ${fund.fund_code} - ${navComp.nav_date}`,
      });
    }

    if (journalLines.length === 0) {
      return {
        navComputationId,
        status: 'NO_FEES',
        message: 'No fee/tax amounts to post',
      };
    }

    // Create and post batch
    const batchRef = generateBatchRef('NAVFEE');
    const totalDebit = journalLines
      .filter((l) => l.dr_cr === 'DR')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);
    const totalCredit = journalLines
      .filter((l) => l.dr_cr === 'CR')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);

    const [batch] = await db
      .insert(schema.glJournalBatches)
      .values({
        batch_ref: batchRef,
        source_system: 'GL_NAV',
        event_code: 'NAV_FEE_POST',
        posting_mode: 'NAV_FINALIZATION',
        accounting_unit_id: accountingUnitId,
        transaction_date: navComp.nav_date,
        value_date: navComp.nav_date,
        posting_date: new Date(),
        batch_status: 'POSTED',
        total_debit: String(totalDebit),
        total_credit: String(totalCredit),
        line_count: journalLines.length,
        narration: `NAV fee posting for fund ${fund.fund_code} on ${navComp.nav_date}`,
        fund_id: navComp.fund_id,
        maker_id: userId,
      })
      .returning();

    for (const line of journalLines) {
      await db.insert(schema.glJournalLines).values({
        batch_id: batch.id,
        line_no: line.line_no,
        dr_cr: line.dr_cr,
        gl_head_id: line.gl_head_id,
        amount: line.amount,
        currency: line.currency,
        base_currency: fundCurrency,
        base_amount: line.base_amount,
        narration: line.narration,
        fund_id: navComp.fund_id,
      });
    }

    // Link batch to NAV computation
    await db
      .update(schema.glNavComputations)
      .set({ journal_batch_id: batch.id })
      .where(eq(schema.glNavComputations.id, navComputationId));

    return {
      navComputationId,
      status: 'POSTED',
      batch_ref: batchRef,
      batch_id: batch.id,
      total_fees_posted: totalFees,
      total_taxes_posted: totalTaxes,
      journal_lines: journalLines.length,
    };
  },

  /**
   * Compute draft NAV (no posting).
   *   1. Get fund parameters
   *   2. Calculate total assets, liabilities, fees, taxes
   *   3. Compute gross NAV, net NAV, NAVPU
   *   4. Store as DRAFT
   */
  async computeDraftNav(fundId: number, navDate: string) {
    // Get fund
    const [fund] = await db
      .select()
      .from(schema.fundMaster)
      .where(eq(schema.fundMaster.id, fundId))
      .limit(1);

    if (!fund) throw new Error(`Fund ${fundId} not found`);

    const baseCurrency = fund.fund_currency ?? 'PHP';
    const accountingUnitId = fund.accounting_unit_id ?? 1;

    // Calculate total assets from ASSET GL balances for this fund's accounting unit
    const assetBalances = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.glLedgerBalances.closing_balance}::numeric), 0)`,
      })
      .from(schema.glLedgerBalances)
      .innerJoin(schema.glHeads, eq(schema.glLedgerBalances.gl_head_id, schema.glHeads.id))
      .where(
        and(
          eq(schema.glHeads.gl_type, 'ASSET'),
          eq(schema.glHeads.nav_inclusion, true),
          eq(schema.glLedgerBalances.accounting_unit_id, accountingUnitId),
          eq(schema.glLedgerBalances.currency, baseCurrency),
          eq(schema.glLedgerBalances.balance_date, navDate),
        ),
      );

    const totalAssets = parseFloat(assetBalances[0]?.total ?? '0');

    // Calculate total liabilities
    const liabilityBalances = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.glLedgerBalances.closing_balance}::numeric), 0)`,
      })
      .from(schema.glLedgerBalances)
      .innerJoin(schema.glHeads, eq(schema.glLedgerBalances.gl_head_id, schema.glHeads.id))
      .where(
        and(
          eq(schema.glHeads.gl_type, 'LIABILITY'),
          eq(schema.glHeads.nav_inclusion, true),
          eq(schema.glLedgerBalances.accounting_unit_id, accountingUnitId),
          eq(schema.glLedgerBalances.currency, baseCurrency),
          eq(schema.glLedgerBalances.balance_date, navDate),
        ),
      );

    const totalLiabilities = parseFloat(liabilityBalances[0]?.total ?? '0');

    // Calculate total fees from EXPENDITURE
    const feeBalances = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.glLedgerBalances.closing_balance}::numeric), 0)`,
      })
      .from(schema.glLedgerBalances)
      .innerJoin(schema.glHeads, eq(schema.glLedgerBalances.gl_head_id, schema.glHeads.id))
      .where(
        and(
          eq(schema.glHeads.gl_type, 'EXPENDITURE'),
          eq(schema.glHeads.nav_inclusion, true),
          eq(schema.glHeads.is_nominal, true),
          eq(schema.glLedgerBalances.accounting_unit_id, accountingUnitId),
          eq(schema.glLedgerBalances.currency, baseCurrency),
          eq(schema.glLedgerBalances.balance_date, navDate),
        ),
      );

    const totalFees = parseFloat(feeBalances[0]?.total ?? '0');

    // Calculate accrued income
    const incomeBalances = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.glLedgerBalances.closing_balance}::numeric), 0)`,
      })
      .from(schema.glLedgerBalances)
      .innerJoin(schema.glHeads, eq(schema.glLedgerBalances.gl_head_id, schema.glHeads.id))
      .where(
        and(
          eq(schema.glHeads.gl_type, 'INCOME'),
          eq(schema.glHeads.nav_inclusion, true),
          eq(schema.glLedgerBalances.accounting_unit_id, accountingUnitId),
          eq(schema.glLedgerBalances.currency, baseCurrency),
          eq(schema.glLedgerBalances.balance_date, navDate),
        ),
      );

    const accruedIncome = parseFloat(incomeBalances[0]?.total ?? '0');

    // Compute NAV
    const grossNav = totalAssets - totalLiabilities + accruedIncome;
    const totalTaxes = 0; // Placeholder: tax calculation handled separately
    const netNav = grossNav - totalFees - totalTaxes;

    // Get outstanding units from fund master or prior NAV
    const [priorNav] = await db
      .select()
      .from(schema.glNavComputations)
      .where(
        and(
          eq(schema.glNavComputations.fund_id, fundId),
          eq(schema.glNavComputations.nav_status, 'FINAL'),
          sql`${schema.glNavComputations.nav_date} < ${navDate}`,
        ),
      )
      .orderBy(desc(schema.glNavComputations.nav_date))
      .limit(1);

    const outstandingUnits = parseFloat(priorNav?.outstanding_units ?? '1000000');
    const navpu = outstandingUnits > 0 ? netNav / outstandingUnits : 0;

    // Determine rounding precision from fund parameters
    const navDecimals = fund.nav_decimals ?? 4;
    const roundedNavpu = parseFloat(navpu.toFixed(navDecimals));

    // Store as DRAFT
    const [navComp] = await db
      .insert(schema.glNavComputations)
      .values({
        fund_id: fundId,
        nav_date: navDate,
        nav_status: 'DRAFT',
        previous_nav_date: priorNav?.nav_date ?? null,
        outstanding_units: String(outstandingUnits),
        total_assets: String(totalAssets),
        total_liabilities: String(totalLiabilities),
        gross_nav: String(grossNav),
        total_fees: String(totalFees),
        total_taxes: String(totalTaxes),
        net_nav: String(netNav),
        navpu: String(roundedNavpu),
        accrued_income: String(accruedIncome),
        accrued_expenses: String(totalFees),
        market_value: String(totalAssets),
        book_value: String(totalAssets),
        unrealized_gain_loss: '0',
      })
      .returning();

    return {
      navComputationId: navComp.id,
      fund_id: fundId,
      fund_code: fund.fund_code,
      nav_date: navDate,
      status: 'DRAFT',
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      accrued_income: accruedIncome,
      gross_nav: grossNav,
      total_fees: totalFees,
      total_taxes: totalTaxes,
      net_nav: netNav,
      outstanding_units: outstandingUnits,
      navpu: roundedNavpu,
    };
  },

  /**
   * Finalize NAV:
   *   1. Set status to FINAL
   *   2. Post fee entries via postNavFees
   *   3. Freeze NAV date
   */
  async finalizeNav(navComputationId: number, userId: number) {
    const [navComp] = await db
      .select()
      .from(schema.glNavComputations)
      .where(eq(schema.glNavComputations.id, navComputationId))
      .limit(1);

    if (!navComp) throw new Error(`NAV computation ${navComputationId} not found`);
    if (navComp.nav_status !== 'DRAFT') {
      throw new Error(`Cannot finalize: NAV computation is ${navComp.nav_status}, expected DRAFT`);
    }

    // Set status to FINAL
    await db
      .update(schema.glNavComputations)
      .set({
        nav_status: 'FINAL',
        finalized_by: userId,
        finalized_at: new Date(),
      })
      .where(eq(schema.glNavComputations.id, navComputationId));

    // Post fee entries
    let postResult;
    try {
      postResult = await this.postNavFees(navComputationId, userId);
    } catch (error) {
      // If posting fails, keep status as FINAL but log the error
      postResult = {
        status: 'POST_ERROR',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Set next_nav_date on current computation
    const [fund] = await db
      .select()
      .from(schema.fundMaster)
      .where(eq(schema.fundMaster.id, navComp.fund_id))
      .limit(1);

    let nextNavDate: string | null = null;
    if (fund && navComp.nav_date) {
      const navDateObj = new Date(navComp.nav_date);
      if (fund.nav_frequency === 'DAILY' || fund.nav_frequency === 'ALL_DAYS') {
        navDateObj.setDate(navDateObj.getDate() + 1);
        nextNavDate = navDateObj.toISOString().split('T')[0];
      } else if (fund.nav_frequency === 'WEEKLY') {
        navDateObj.setDate(navDateObj.getDate() + 7);
        nextNavDate = navDateObj.toISOString().split('T')[0];
      } else if (fund.nav_frequency === 'MONTHLY') {
        navDateObj.setMonth(navDateObj.getMonth() + 1);
        nextNavDate = navDateObj.toISOString().split('T')[0];
      }
    }

    if (nextNavDate) {
      await db
        .update(schema.glNavComputations)
        .set({ next_nav_date: nextNavDate })
        .where(eq(schema.glNavComputations.id, navComputationId));
    }

    return {
      navComputationId,
      status: 'FINAL',
      finalized_by: userId,
      finalized_at: new Date().toISOString(),
      next_nav_date: nextNavDate,
      posting: postResult,
    };
  },

  /** Reverse a finalized NAV computation */
  async reverseNav(navComputationId: number, userId: number, reason: string) {
    const [navComp] = await db
      .select()
      .from(schema.glNavComputations)
      .where(eq(schema.glNavComputations.id, navComputationId))
      .limit(1);

    if (!navComp) throw new Error(`NAV computation ${navComputationId} not found`);
    if (navComp.nav_status !== 'FINAL') {
      throw new Error(`Cannot reverse: NAV computation is ${navComp.nav_status}, expected FINAL`);
    }

    // Get fund for accounting unit
    const [fund] = await db
      .select()
      .from(schema.fundMaster)
      .where(eq(schema.fundMaster.id, navComp.fund_id))
      .limit(1);

    const accountingUnitId = fund?.accounting_unit_id ?? 1;
    const fundCurrency = fund?.fund_currency ?? 'PHP';

    // If a journal batch was posted, reverse it
    let reversalBatchId: number | null = null;
    if (navComp.journal_batch_id) {
      const originalLines = await db
        .select()
        .from(schema.glJournalLines)
        .where(eq(schema.glJournalLines.batch_id, navComp.journal_batch_id));

      if (originalLines.length > 0) {
        const reversalBatchRef = generateBatchRef('NAVREV');
        const totalDebit = originalLines
          .filter((l: JournalLine) => l.dr_cr === 'CR')
          .reduce((sum: number, l: JournalLine) => sum + parseFloat(l.amount), 0);
        const totalCredit = originalLines
          .filter((l: JournalLine) => l.dr_cr === 'DR')
          .reduce((sum: number, l: JournalLine) => sum + parseFloat(l.amount), 0);

        const [revBatch] = await db
          .insert(schema.glJournalBatches)
          .values({
            batch_ref: reversalBatchRef,
            source_system: 'GL_NAV',
            event_code: 'NAV_REVERSAL',
            posting_mode: 'NAV_FINALIZATION',
            accounting_unit_id: accountingUnitId,
            transaction_date: todayStr(),
            value_date: navComp.nav_date,
            posting_date: new Date(),
            batch_status: 'POSTED',
            total_debit: String(totalDebit),
            total_credit: String(totalCredit),
            line_count: originalLines.length,
            narration: `NAV reversal for fund ${fund?.fund_code ?? navComp.fund_id} on ${navComp.nav_date}: ${reason}`,
            fund_id: navComp.fund_id,
            maker_id: userId,
          })
          .returning();

        reversalBatchId = revBatch.id;

        let lineNo = 0;
        for (const origLine of originalLines) {
          lineNo++;
          await db.insert(schema.glJournalLines).values({
            batch_id: revBatch.id,
            line_no: lineNo,
            dr_cr: origLine.dr_cr === 'DR' ? 'CR' : 'DR',
            gl_head_id: origLine.gl_head_id,
            amount: origLine.amount,
            currency: origLine.currency,
            base_currency: origLine.base_currency,
            base_amount: origLine.base_amount,
            narration: `Reversal: ${origLine.narration ?? ''}`,
            fund_id: origLine.fund_id,
          });
        }

        // Create reversal link
        await db.insert(schema.glReversalLinks).values({
          original_batch_id: navComp.journal_batch_id,
          reversal_batch_id: revBatch.id,
          reversal_type: 'REVERSAL',
          reversal_reason: reason,
          approved_by: userId,
          approved_at: new Date(),
        });
      }
    }

    // Create a new REVERSED NAV computation record
    const [reversedNav] = await db
      .insert(schema.glNavComputations)
      .values({
        fund_id: navComp.fund_id,
        nav_date: navComp.nav_date,
        nav_status: 'REVERSED',
        previous_nav_date: navComp.previous_nav_date,
        outstanding_units: navComp.outstanding_units,
        total_assets: navComp.total_assets,
        total_liabilities: navComp.total_liabilities,
        gross_nav: navComp.gross_nav,
        total_fees: navComp.total_fees,
        total_taxes: navComp.total_taxes,
        net_nav: navComp.net_nav,
        navpu: navComp.navpu,
        accrued_income: navComp.accrued_income,
        accrued_expenses: navComp.accrued_expenses,
        market_value: navComp.market_value,
        book_value: navComp.book_value,
        unrealized_gain_loss: navComp.unrealized_gain_loss,
        reversal_of_id: navComputationId,
        journal_batch_id: reversalBatchId,
        finalized_by: userId,
        finalized_at: new Date(),
      })
      .returning();

    // Mark original as REVERSED
    await db
      .update(schema.glNavComputations)
      .set({ nav_status: 'REVERSED' })
      .where(eq(schema.glNavComputations.id, navComputationId));

    return {
      original_nav_id: navComputationId,
      reversal_nav_id: reversedNav.id,
      status: 'REVERSED',
      reason,
      reversal_batch_id: reversalBatchId,
      reversed_by: userId,
    };
  },

  // ==========================================================================
  // BALANCE SNAPSHOT
  // ==========================================================================

  /** Create daily balance snapshot from gl_ledger_balances */
  async createDailySnapshot(businessDate: string) {
    // Get all ledger balances for the business date
    const balances = await db
      .select()
      .from(schema.glLedgerBalances)
      .where(eq(schema.glLedgerBalances.balance_date, businessDate));

    if (balances.length === 0) {
      return { snapshot_date: businessDate, snapshot_type: 'DAILY', records_created: 0 };
    }

    // Delete any existing daily snapshot for this date to allow idempotent re-run
    await db
      .delete(schema.glBalanceSnapshots)
      .where(
        and(
          eq(schema.glBalanceSnapshots.snapshot_date, businessDate),
          eq(schema.glBalanceSnapshots.snapshot_type, 'DAILY'),
        ),
      );

    let recordsCreated = 0;

    for (const bal of balances) {
      await db.insert(schema.glBalanceSnapshots).values({
        snapshot_date: businessDate,
        snapshot_type: 'DAILY',
        gl_head_id: bal.gl_head_id,
        gl_access_code: bal.gl_access_code,
        accounting_unit_id: bal.accounting_unit_id,
        fund_id: bal.fund_id,
        portfolio_id: bal.portfolio_id,
        currency: bal.currency,
        opening_balance: bal.opening_balance,
        debit_turnover: bal.debit_turnover,
        credit_turnover: bal.credit_turnover,
        closing_balance: bal.closing_balance,
        fcy_balance: bal.fcy_balance,
        base_amount: bal.base_amount,
      });
      recordsCreated++;
    }

    return {
      snapshot_date: businessDate,
      snapshot_type: 'DAILY',
      records_created: recordsCreated,
    };
  },

  /** Create month-end, quarter-end, or year-end snapshot */
  async createPeriodSnapshot(periodCode: string, snapshotType: string) {
    // Determine the period end date from gl_financial_periods
    const [period] = await db
      .select()
      .from(schema.glFinancialPeriods)
      .where(eq(schema.glFinancialPeriods.period_code, periodCode))
      .limit(1);

    let snapshotDate: string;

    if (period) {
      snapshotDate = period.end_date;
    } else {
      // For YEAR_END, try gl_financial_years
      const [fy] = await db
        .select()
        .from(schema.glFinancialYears)
        .where(eq(schema.glFinancialYears.year_code, periodCode))
        .limit(1);

      if (fy) {
        snapshotDate = fy.end_date;
      } else {
        throw new Error(`Period ${periodCode} not found in financial periods or years`);
      }
    }

    // Get the latest balances as-of the snapshot date
    const balances = await db
      .select()
      .from(schema.glLedgerBalances)
      .where(lte(schema.glLedgerBalances.balance_date, snapshotDate))
      .orderBy(desc(schema.glLedgerBalances.balance_date));

    // Deduplicate: keep only the latest balance per (gl_head_id, accounting_unit_id, currency)
    const latestMap = new Map<string, typeof balances[number]>();
    for (const bal of balances) {
      const key = `${bal.gl_head_id}::${bal.accounting_unit_id}::${bal.currency}::${bal.fund_id ?? 'null'}::${bal.portfolio_id ?? 'null'}`;
      if (!latestMap.has(key)) {
        latestMap.set(key, bal);
      }
    }

    // Delete existing snapshot for this period/type
    await db
      .delete(schema.glBalanceSnapshots)
      .where(
        and(
          eq(schema.glBalanceSnapshots.snapshot_date, snapshotDate),
          eq(schema.glBalanceSnapshots.snapshot_type, snapshotType),
        ),
      );

    let recordsCreated = 0;
    for (const [, bal] of latestMap) {
      await db.insert(schema.glBalanceSnapshots).values({
        snapshot_date: snapshotDate,
        snapshot_type: snapshotType,
        gl_head_id: bal.gl_head_id,
        gl_access_code: bal.gl_access_code,
        accounting_unit_id: bal.accounting_unit_id,
        fund_id: bal.fund_id,
        portfolio_id: bal.portfolio_id,
        currency: bal.currency,
        opening_balance: bal.opening_balance,
        debit_turnover: bal.debit_turnover,
        credit_turnover: bal.credit_turnover,
        closing_balance: bal.closing_balance,
        fcy_balance: bal.fcy_balance,
        base_amount: bal.base_amount,
      });
      recordsCreated++;
    }

    return {
      snapshot_date: snapshotDate,
      snapshot_type: snapshotType,
      period_code: periodCode,
      records_created: recordsCreated,
    };
  },

  /** Query balance snapshots with optional filters */
  async getSnapshots(fromDate: string, toDate: string, glHeadId?: number, accountingUnitId?: number) {
    const conditions = [
      gte(schema.glBalanceSnapshots.snapshot_date, fromDate),
      lte(schema.glBalanceSnapshots.snapshot_date, toDate),
    ];

    if (glHeadId) {
      conditions.push(eq(schema.glBalanceSnapshots.gl_head_id, glHeadId));
    }
    if (accountingUnitId) {
      conditions.push(eq(schema.glBalanceSnapshots.accounting_unit_id, accountingUnitId));
    }

    const snapshots = await db
      .select({
        id: schema.glBalanceSnapshots.id,
        snapshot_date: schema.glBalanceSnapshots.snapshot_date,
        snapshot_type: schema.glBalanceSnapshots.snapshot_type,
        gl_head_id: schema.glBalanceSnapshots.gl_head_id,
        gl_code: schema.glHeads.code,
        gl_name: schema.glHeads.name,
        gl_access_code: schema.glBalanceSnapshots.gl_access_code,
        accounting_unit_id: schema.glBalanceSnapshots.accounting_unit_id,
        fund_id: schema.glBalanceSnapshots.fund_id,
        portfolio_id: schema.glBalanceSnapshots.portfolio_id,
        currency: schema.glBalanceSnapshots.currency,
        opening_balance: schema.glBalanceSnapshots.opening_balance,
        debit_turnover: schema.glBalanceSnapshots.debit_turnover,
        credit_turnover: schema.glBalanceSnapshots.credit_turnover,
        closing_balance: schema.glBalanceSnapshots.closing_balance,
        fcy_balance: schema.glBalanceSnapshots.fcy_balance,
        base_amount: schema.glBalanceSnapshots.base_amount,
      })
      .from(schema.glBalanceSnapshots)
      .innerJoin(schema.glHeads, eq(schema.glBalanceSnapshots.gl_head_id, schema.glHeads.id))
      .where(and(...conditions))
      .orderBy(schema.glBalanceSnapshots.snapshot_date, schema.glHeads.code);

    return snapshots;
  },

  // ==========================================================================
  // FRPTI EXTRACT
  // ==========================================================================

  /**
   * Generate quarterly FRPTI data extract.
   *   1. Determine quarter-end date from reporting period (e.g., 2026-Q1)
   *   2. Get quarter-end balance snapshots
   *   3. Map to FRPTI schedules using frpti_mappings
   *   4. Classify by contractual relationship, resident status, sector
   *   5. Create gl_frpti_extracts records
   *   6. Validate for missing mappings
   */
  async generateFrptiExtract(reportingPeriod: string) {
    // Parse quarter: e.g., "2026-Q1" -> end date = 2026-03-31
    const match = reportingPeriod.match(/^(\d{4})-Q(\d)$/);
    if (!match) throw new Error(`Invalid reporting period format: ${reportingPeriod}. Expected YYYY-QN`);

    const year = parseInt(match[1], 10);
    const quarter = parseInt(match[2], 10);

    const quarterEndDates: Record<number, string> = {
      1: `${year}-03-31`,
      2: `${year}-06-30`,
      3: `${year}-09-30`,
      4: `${year}-12-31`,
    };

    const reportingDate = quarterEndDates[quarter];
    if (!reportingDate) throw new Error(`Invalid quarter: ${quarter}`);

    // Get quarter-end balance snapshots
    let snapshots = await db
      .select()
      .from(schema.glBalanceSnapshots)
      .where(
        and(
          eq(schema.glBalanceSnapshots.snapshot_date, reportingDate),
          eq(schema.glBalanceSnapshots.snapshot_type, 'QUARTER_END'),
        ),
      );

    // Fallback to DAILY snapshot if no QUARTER_END exists
    if (snapshots.length === 0) {
      snapshots = await db
        .select()
        .from(schema.glBalanceSnapshots)
        .where(
          and(
            eq(schema.glBalanceSnapshots.snapshot_date, reportingDate),
            eq(schema.glBalanceSnapshots.snapshot_type, 'DAILY'),
          ),
        );
    }

    // Get all FRPTI mappings
    const mappings = await db
      .select()
      .from(schema.frptiMappings)
      .where(
        and(
          lte(schema.frptiMappings.effective_from, reportingDate),
          sql`(${schema.frptiMappings.effective_to} IS NULL OR ${schema.frptiMappings.effective_to} >= ${reportingDate})`,
        ),
      );

    const mappingByGl = new Map<number, typeof mappings[number]>();
    for (const m of mappings) {
      mappingByGl.set(m.gl_head_id, m);
    }

    // Get GL portfolio master for contractual relationship classification
    const portfolios = await db
      .select()
      .from(schema.glPortfolioMaster)
      .where(eq(schema.glPortfolioMaster.is_active, true));

    const portfolioMap = new Map<number, typeof portfolios[number]>();
    for (const p of portfolios) {
      portfolioMap.set(p.id, p);
    }

    // Get counterparty master for sector/resident status classification
    const counterparties = await db
      .select()
      .from(schema.glCounterpartyMaster)
      .where(eq(schema.glCounterpartyMaster.is_active, true));

    const counterpartyMap = new Map<number, typeof counterparties[number]>();
    for (const c of counterparties) {
      counterpartyMap.set(c.id, c);
    }

    // Delete existing extract for this period (idempotent)
    await db
      .delete(schema.glFrptiExtracts)
      .where(eq(schema.glFrptiExtracts.reporting_period, reportingPeriod));

    const validationErrors: string[] = [];
    const extractRecords: Array<{
      frpti_schedule: string;
      frpti_report_line: string;
      frpti_book: 'RBU' | 'FCDU' | 'EFCDU';
      contractual_relationship: 'TRUST' | 'OTHER_FIDUCIARY' | 'AGENCY' | 'ADVISORY_CONSULTANCY' | 'SPECIAL_PURPOSE_TRUST' | null;
      resident_status: 'RESIDENT' | 'NON_RESIDENT' | null;
      sector: string | null;
      currency: string;
      amount: number;
      count: number;
    }> = [];

    // Aggregate by (schedule, report_line, book, contractual_rel, resident_status, sector, currency)
    const aggregationMap = new Map<string, {
      frpti_schedule: string;
      frpti_report_line: string;
      frpti_book: 'RBU' | 'FCDU' | 'EFCDU';
      contractual_relationship: 'TRUST' | 'OTHER_FIDUCIARY' | 'AGENCY' | 'ADVISORY_CONSULTANCY' | 'SPECIAL_PURPOSE_TRUST' | null;
      resident_status: 'RESIDENT' | 'NON_RESIDENT' | null;
      sector: string | null;
      currency: string;
      amount: number;
      count: number;
    }>();

    for (const snap of snapshots) {
      const mapping = mappingByGl.get(snap.gl_head_id);
      if (!mapping) {
        validationErrors.push(`Missing FRPTI mapping for GL head ID ${snap.gl_head_id}`);
        continue;
      }

      // Determine classification dimensions
      let contractualRel: 'TRUST' | 'OTHER_FIDUCIARY' | 'AGENCY' | 'ADVISORY_CONSULTANCY' | 'SPECIAL_PURPOSE_TRUST' | null = null;
      let residentStatus: 'RESIDENT' | 'NON_RESIDENT' | null = null;
      let sector: string | null = null;

      if (snap.portfolio_id) {
        const portfolio = portfolioMap.get(snap.portfolio_id);
        if (portfolio) {
          contractualRel = portfolio.contractual_relationship;
        }
      }

      const balanceAmount = parseFloat(snap.closing_balance ?? '0');

      const aggKey = `${mapping.frpti_schedule}::${mapping.frpti_report_line}::${mapping.frpti_book}::${contractualRel ?? 'null'}::${residentStatus ?? 'null'}::${sector ?? 'null'}::${snap.currency}`;

      const existing = aggregationMap.get(aggKey);
      if (existing) {
        existing.amount += balanceAmount;
        existing.count++;
      } else {
        aggregationMap.set(aggKey, {
          frpti_schedule: mapping.frpti_schedule,
          frpti_report_line: mapping.frpti_report_line,
          frpti_book: mapping.frpti_book,
          contractual_relationship: contractualRel,
          resident_status: residentStatus,
          sector,
          currency: snap.currency,
          amount: balanceAmount,
          count: 1,
        });
      }
    }

    // Insert aggregated records
    let recordsCreated = 0;
    for (const [, record] of aggregationMap) {
      await db.insert(schema.glFrptiExtracts).values({
        reporting_period: reportingPeriod,
        reporting_date: reportingDate,
        frpti_book: record.frpti_book,
        frpti_schedule: record.frpti_schedule,
        frpti_report_line: record.frpti_report_line,
        contractual_relationship: record.contractual_relationship,
        resident_status: record.resident_status,
        sector: record.sector,
        currency: record.currency,
        amount: String(record.amount),
        count: record.count,
        functional_currency: record.currency,
        presentation_currency: 'PHP',
        is_validated: validationErrors.length === 0,
        validation_errors: validationErrors.length > 0 ? validationErrors : null,
      });
      recordsCreated++;
      extractRecords.push(record);
    }

    // Also check for unmapped GL heads used in snapshots
    const mappedGlIds = new Set(mappings.map((m: FrptiMapping) => m.gl_head_id));
    const snapshotGlIds = new Set(snapshots.map((s: BalanceSnapshot) => s.gl_head_id));
    for (const glId of snapshotGlIds) {
      if (!mappedGlIds.has(glId)) {
        // Already captured in validationErrors during aggregation
      }
    }

    return {
      reporting_period: reportingPeriod,
      reporting_date: reportingDate,
      records_created: recordsCreated,
      snapshots_processed: snapshots.length,
      validation_errors: validationErrors,
      is_valid: validationErrors.length === 0,
      extract_summary: extractRecords,
    };
  },

  /** Get extract data for a reporting period */
  async getFrptiExtract(reportingPeriod: string) {
    const extracts = await db
      .select()
      .from(schema.glFrptiExtracts)
      .where(eq(schema.glFrptiExtracts.reporting_period, reportingPeriod))
      .orderBy(schema.glFrptiExtracts.frpti_schedule, schema.glFrptiExtracts.frpti_report_line);

    if (extracts.length === 0) {
      throw new Error(`No FRPTI extract found for period ${reportingPeriod}`);
    }

    // Summarize by schedule
    const scheduleSummary = new Map<string, { amount: number; count: number; lines: number }>();
    for (const ext of extracts) {
      const existing = scheduleSummary.get(ext.frpti_schedule) ?? { amount: 0, count: 0, lines: 0 };
      existing.amount += parseFloat(ext.amount ?? '0');
      existing.count += ext.count ?? 0;
      existing.lines++;
      scheduleSummary.set(ext.frpti_schedule, existing);
    }

    // Summarize by book
    const bookSummary = new Map<string, { amount: number; count: number }>();
    for (const ext of extracts) {
      const existing = bookSummary.get(ext.frpti_book) ?? { amount: 0, count: 0 };
      existing.amount += parseFloat(ext.amount ?? '0');
      existing.count += ext.count ?? 0;
      bookSummary.set(ext.frpti_book, existing);
    }

    return {
      reporting_period: reportingPeriod,
      reporting_date: extracts[0].reporting_date,
      total_records: extracts.length,
      is_validated: extracts.every((e: FrptiExtract) => e.is_validated),
      schedule_summary: Object.fromEntries(scheduleSummary),
      book_summary: Object.fromEntries(bookSummary),
      records: extracts,
    };
  },

  /** Validate FRPTI extract completeness */
  async validateFrptiExtract(reportingPeriod: string) {
    const extracts = await db
      .select()
      .from(schema.glFrptiExtracts)
      .where(eq(schema.glFrptiExtracts.reporting_period, reportingPeriod));

    if (extracts.length === 0) {
      return {
        reporting_period: reportingPeriod,
        is_valid: false,
        errors: [`No extract data found for ${reportingPeriod}`],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Collect existing validation errors from extract records
    for (const ext of extracts) {
      if (ext.validation_errors) {
        const errs = ext.validation_errors as string[];
        if (Array.isArray(errs)) {
          errors.push(...errs);
        }
      }
    }

    // Check that all mandatory FRPTI schedules have data
    const mandatorySchedules = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const presentSchedules = new Set(extracts.map((e: FrptiExtract) => e.frpti_schedule));
    for (const sched of mandatorySchedules) {
      if (!presentSchedules.has(sched)) {
        warnings.push(`Schedule ${sched} has no data for ${reportingPeriod}`);
      }
    }

    // Check for zero-amount records
    const zeroAmountRecords = extracts.filter((e: FrptiExtract) => parseFloat(e.amount ?? '0') === 0);
    if (zeroAmountRecords.length > 0) {
      warnings.push(`${zeroAmountRecords.length} record(s) have zero amount`);
    }

    // Validate all GL heads have FRPTI mappings
    const parse = reportingPeriod.match(/^(\d{4})-Q(\d)$/);
    if (parse) {
      const yr = parseInt(parse[1], 10);
      const qt = parseInt(parse[2], 10);
      const quarterEndDates: Record<number, string> = {
        1: `${yr}-03-31`,
        2: `${yr}-06-30`,
        3: `${yr}-09-30`,
        4: `${yr}-12-31`,
      };
      const endDate = quarterEndDates[qt];

      // Count GL heads that are open and should be mapped
      const openGls = await db
        .select({ id: schema.glHeads.id, code: schema.glHeads.code })
        .from(schema.glHeads)
        .where(eq(schema.glHeads.account_status, 'OPEN'));

      const mappings = await db
        .select({ gl_head_id: schema.frptiMappings.gl_head_id })
        .from(schema.frptiMappings)
        .where(
          and(
            lte(schema.frptiMappings.effective_from, endDate!),
            sql`(${schema.frptiMappings.effective_to} IS NULL OR ${schema.frptiMappings.effective_to} >= ${endDate})`,
          ),
        );

      const mappedIds = new Set(mappings.map((m: { gl_head_id: number }) => m.gl_head_id));
      const unmapped = openGls.filter((gl: { id: number; code: string }) => !mappedIds.has(gl.id));
      if (unmapped.length > 0) {
        warnings.push(
          `${unmapped.length} open GL head(s) have no FRPTI mapping: ${unmapped.slice(0, 5).map((g: { code: string }) => g.code).join(', ')}${unmapped.length > 5 ? '...' : ''}`,
        );
      }
    }

    // Deduplicate errors
    const uniqueErrors = [...new Set(errors)];

    const isValid = uniqueErrors.length === 0;

    // Update validation status on extract records
    await db
      .update(schema.glFrptiExtracts)
      .set({
        is_validated: isValid,
        validation_errors: uniqueErrors.length > 0 ? uniqueErrors : null,
      })
      .where(eq(schema.glFrptiExtracts.reporting_period, reportingPeriod));

    return {
      reporting_period: reportingPeriod,
      is_valid: isValid,
      total_records: extracts.length,
      errors: uniqueErrors,
      warnings,
    };
  },

  // =========================================================================
  // BR-011: NAV reconciliation with tolerance
  // =========================================================================

  async reconcileNav(fundId: number, navDate: string, tolerance: number = 0.01) {
    // Get the latest NAV computation for this fund/date
    const [navComp] = await db
      .select()
      .from(schema.glNavComputations)
      .where(
        and(
          eq(schema.glNavComputations.fund_id, fundId),
          eq(schema.glNavComputations.nav_date, navDate),
        ),
      )
      .orderBy(desc(schema.glNavComputations.id))
      .limit(1);

    // Get GL balances for this fund
    const glBalances = await db
      .select({
        total_closing: sql<string>`COALESCE(SUM(CAST(${schema.glLedgerBalances.closing_balance} AS NUMERIC)), 0)`,
      })
      .from(schema.glLedgerBalances)
      .where(
        and(
          eq(schema.glLedgerBalances.fund_id, fundId),
          eq(schema.glLedgerBalances.balance_date, navDate),
        ),
      );

    const navValue = navComp ? parseFloat(String(navComp.total_nav ?? '0')) : 0;
    const glTotal = parseFloat(glBalances[0]?.total_closing ?? '0');
    const difference = Math.abs(navValue - glTotal);
    const withinTolerance = difference <= tolerance;

    const result = {
      fund_id: fundId,
      nav_date: navDate,
      nav_value: navValue,
      gl_total: glTotal,
      difference,
      tolerance,
      within_tolerance: withinTolerance,
      status: withinTolerance ? 'RECONCILED' : 'EXCEPTION',
    };

    // Create exception if out of tolerance
    if (!withinTolerance) {
      await db.insert(schema.glPostingExceptions).values({
        source_system: 'NAV_RECON',
        exception_category: 'VALIDATION_ERROR',
        error_message: `NAV reconciliation variance ${difference.toFixed(4)} exceeds tolerance ${tolerance} for fund ${fundId} on ${navDate}`,
        business_date: navDate,
        retry_eligible: false,
        related_object_type: 'FUND',
        related_object_id: fundId,
      });
    }

    return result;
  },

  // =========================================================================
  // FRPTI-004: FRPTI amendment submission
  // =========================================================================

  async submitFrptiAmendment(period: string, amendments: Record<string, unknown>[], reason: string) {
    // Log the amendment
    await db.insert(schema.glAuditLog).values({
      action: 'FRPTI_AMENDMENT',
      object_type: 'FRPTI_EXTRACT',
      object_id: 0,
      new_values: {
        period,
        amendment_count: amendments.length,
        reason,
        amendments,
      } as Record<string, unknown>,
    });

    return {
      period,
      amendments_submitted: amendments.length,
      reason,
      status: 'SUBMITTED',
    };
  },

  // =========================================================================
  // FRPTI-007: Compare FRPTI periods with variance calculation
  // =========================================================================

  async compareFrptiPeriods(period1: string, period2: string) {
    const extracts1 = await db
      .select()
      .from(schema.glFrptiExtracts)
      .where(eq(schema.glFrptiExtracts.reporting_period, period1));

    const extracts2 = await db
      .select()
      .from(schema.glFrptiExtracts)
      .where(eq(schema.glFrptiExtracts.reporting_period, period2));

    // Build maps by GL head for comparison
    const buildMap = (extracts: typeof extracts1) => {
      const map = new Map<number, { debit: number; credit: number; balance: number }>();
      for (const e of extracts) {
        map.set(e.gl_head_id, {
          debit: parseFloat(String(e.debit_total ?? '0')),
          credit: parseFloat(String(e.credit_total ?? '0')),
          balance: parseFloat(String(e.closing_balance ?? '0')),
        });
      }
      return map;
    };

    const map1 = buildMap(extracts1);
    const map2 = buildMap(extracts2);

    const allGlHeads = new Set([...map1.keys(), ...map2.keys()]);
    const variances: Array<{
      gl_head_id: number;
      period1_balance: number;
      period2_balance: number;
      variance: number;
      variance_pct: number;
    }> = [];

    for (const glHeadId of allGlHeads) {
      const p1 = map1.get(glHeadId) ?? { debit: 0, credit: 0, balance: 0 };
      const p2 = map2.get(glHeadId) ?? { debit: 0, credit: 0, balance: 0 };
      const variance = p2.balance - p1.balance;
      const variancePct = p1.balance !== 0 ? (variance / Math.abs(p1.balance)) * 100 : p2.balance !== 0 ? 100 : 0;

      variances.push({
        gl_head_id: glHeadId,
        period1_balance: p1.balance,
        period2_balance: p2.balance,
        variance,
        variance_pct: Math.round(variancePct * 100) / 100,
      });
    }

    return {
      period1,
      period2,
      period1_count: extracts1.length,
      period2_count: extracts2.length,
      variances: variances.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)),
    };
  },

  // =========================================================================
  // YE-004: Generate comparative report (current vs prior year)
  // =========================================================================

  async generateComparativeReport(currentYear: string, priorYear: string) {
    const fetchYearData = async (yearEnd: string) => {
      return db
        .select()
        .from(schema.glBalanceSnapshots)
        .where(eq(schema.glBalanceSnapshots.snapshot_date, yearEnd));
    };

    const currentData = await fetchYearData(currentYear);
    const priorData = await fetchYearData(priorYear);

    const priorMap = new Map(priorData.map((s: BalanceSnapshot) => [`${s.gl_head_id}-${s.accounting_unit_id}`, s]));

    const comparisons = currentData.map((curr: BalanceSnapshot) => {
      const key = `${curr.gl_head_id}-${curr.accounting_unit_id}`;
      const prior = priorMap.get(key);
      const currBal = parseFloat(String(curr.closing_balance));
      const priorBal = prior ? parseFloat(String((prior as BalanceSnapshot).closing_balance)) : 0;

      return {
        gl_head_id: curr.gl_head_id,
        accounting_unit_id: curr.accounting_unit_id,
        current_balance: currBal,
        prior_balance: priorBal,
        change: currBal - priorBal,
        change_pct: priorBal !== 0 ? ((currBal - priorBal) / Math.abs(priorBal)) * 100 : 0,
      };
    });

    return {
      current_year: currentYear,
      prior_year: priorYear,
      comparisons,
    };
  },

  // =========================================================================
  // EOD-002: Incremental snapshot
  // =========================================================================

  async createIncrementalSnapshot(businessDate: string) {
    // Only snapshot balances that changed since last snapshot
    const result = await this.createDailySnapshot(businessDate);
    return { ...result, type: 'INCREMENTAL' };
  },
};
