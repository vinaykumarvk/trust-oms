/**
 * TrustFees Pro calculation policy.
 *
 * Keeps product/value-basis formula selection pure and testable. Data fetching
 * remains in the accrual engine; this module only decides which formula and
 * source evidence are required for a given plan context.
 */

export interface FeePlanCalculationInput {
  fee_type?: string | null;
  value_basis?: string | null;
  rate_type?: string | null;
  fee_plan_code?: string | null;
}

export interface FeeCalculationContext {
  portfolioId: string;
  businessDate: string;
  portfolioType?: string | null;
  securityId?: string | null;
  securityAssetClass?: string | null;
  securityInstrumentSubType?: string | null;
  periodDays?: number | null;
}

export interface ProductFeeFormulaPolicy {
  formulaCode: string;
  formulaDescription: string;
  baseSource:
    | 'NAV_MTD_AVERAGE'
    | 'PORTFOLIO_AUM'
    | 'PORTFOLIO_BUM'
    | 'AVG_INVESTMENT'
    | 'POSITION_FACE_VALUE'
    | 'POSITION_COST'
    | 'POSITION_PRINCIPAL'
    | 'POSITION_NOTIONAL'
    | 'CASH_OR_TRANSACTION_AMOUNT'
    | 'ESCROW_STEP_WINDOW';
  productFamily: string;
  expectedValueBasis: string;
  periodSource: string;
  periodDays: number;
  annualizationBase: 360;
  taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES' | 'NO_TAX_AT_ACCRUAL';
}

const MONEY_MARKET_TERMS = new Set([
  'TBILL',
  'T-BILL',
  'T_BILL',
  'TREASURY_BILL',
  'COMMERCIAL_PAPER',
  'CP',
]);

const LOAN_TERMS = new Set(['LOAN', 'LOANS', 'CREDIT', 'FACILITY']);
const PREFERRED_EQUITY_TERMS = new Set(['PREFERRED', 'PREFERRED_EQUITY', 'PREF']);
const FIXED_INCOME_TERMS = new Set(['BOND', 'FIXED_INCOME', 'GOVERNMENT_BOND', 'CORPORATE_BOND']);

function normalize(value?: string | null): string {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function includesAny(value: string, candidates: Set<string>): boolean {
  if (!value) return false;
  if (candidates.has(value)) return true;
  for (const candidate of candidates) {
    if (value.includes(candidate)) return true;
  }
  return false;
}

function dailyPeriodDays(context: FeeCalculationContext): number {
  const days = Number(context.periodDays ?? 1);
  return Number.isFinite(days) && days > 0 ? days : 1;
}

export function resolveProductFeeFormula(
  feePlan: FeePlanCalculationInput,
  context: FeeCalculationContext,
): ProductFeeFormulaPolicy {
  const feeType = normalize(feePlan.fee_type);
  const valueBasis = normalize(feePlan.value_basis || 'AUM');
  const portfolioType = normalize(context.portfolioType);
  const assetClass = normalize(context.securityAssetClass);
  const instrumentSubType = normalize(context.securityInstrumentSubType);
  const instrumentToken = `${assetClass}_${instrumentSubType}`;
  const periodDays = dailyPeriodDays(context);

  if (feeType === 'ESCROW') {
    return {
      formulaCode: 'ESCROW_STEP_FUNCTION_MONTHLY',
      formulaDescription: 'Escrow monthly step-window fee prorated over 30 days',
      baseSource: 'ESCROW_STEP_WINDOW',
      productFamily: 'ESCROW',
      expectedValueBasis: valueBasis || 'PRINCIPAL',
      periodSource: 'months_since_engagement',
      periodDays: 30,
      annualizationBase: 360,
      taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
    };
  }

  if (valueBasis === 'FACE_VALUE') {
    return {
      formulaCode: 'BOND_FACE_VALUE_COUPON_360',
      formulaDescription: 'Face value based instrument fee using Act/360 coupon-day accrual',
      baseSource: 'POSITION_FACE_VALUE',
      productFamily: includesAny(instrumentToken, MONEY_MARKET_TERMS) ? 'MONEY_MARKET' : 'FIXED_INCOME',
      expectedValueBasis: 'FACE_VALUE',
      periodSource: 'coupon_or_accrual_day',
      periodDays,
      annualizationBase: 360,
      taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
    };
  }

  if (valueBasis === 'PRINCIPAL') {
    return {
      formulaCode: includesAny(instrumentToken, LOAN_TERMS)
        ? 'LOAN_PRINCIPAL_INTEREST_360'
        : 'PRINCIPAL_BALANCE_RATE_360',
      formulaDescription: 'Principal balance based fee using Act/360 interest-day accrual',
      baseSource: 'POSITION_PRINCIPAL',
      productFamily: includesAny(instrumentToken, LOAN_TERMS) ? 'LOAN' : 'PRINCIPAL_INSTRUMENT',
      expectedValueBasis: 'PRINCIPAL',
      periodSource: 'interest_or_accrual_day',
      periodDays,
      annualizationBase: 360,
      taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
    };
  }

  if (valueBasis === 'COST') {
    const isMoneyMarket = includesAny(instrumentToken, MONEY_MARKET_TERMS);
    const isPreferredEquity = includesAny(instrumentToken, PREFERRED_EQUITY_TERMS);

    return {
      formulaCode: isMoneyMarket
        ? 'MONEY_MARKET_COST_TERM_360'
        : isPreferredEquity
          ? 'PREFERRED_EQUITY_COST_DIVIDEND_360'
          : 'POSITION_COST_RATE_360',
      formulaDescription: isMoneyMarket
        ? 'T-bill/commercial-paper cost based fee using Act/360 term accrual'
        : isPreferredEquity
          ? 'Preferred equity acquisition-cost based fee using Act/360 dividend-day accrual'
          : 'Position cost based fee using Act/360 accrual',
      baseSource: 'POSITION_COST',
      productFamily: isMoneyMarket ? 'MONEY_MARKET' : isPreferredEquity ? 'PREFERRED_EQUITY' : 'POSITION_COST',
      expectedValueBasis: 'COST',
      periodSource: isMoneyMarket ? 'term_or_accrual_day' : isPreferredEquity ? 'dividend_or_accrual_day' : 'accrual_day',
      periodDays,
      annualizationBase: 360,
      taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
    };
  }

  if (valueBasis === 'TXN_AMOUNT') {
    return {
      formulaCode: 'DIRECTIONAL_DEPOSIT_TXN_TERM_360',
      formulaDescription: 'Directional deposit or transaction amount fee using Act/360 term accrual',
      baseSource: 'CASH_OR_TRANSACTION_AMOUNT',
      productFamily: feeType === 'SUBSCRIPTION' || feeType === 'REDEMPTION' ? 'DIRECTIONAL_DEPOSIT' : 'TRANSACTION',
      expectedValueBasis: 'TXN_AMOUNT',
      periodSource: 'term_or_accrual_day',
      periodDays,
      annualizationBase: 360,
      taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
    };
  }

  if (valueBasis === 'NOTIONAL') {
    return {
      formulaCode: 'NOTIONAL_AMOUNT_RATE_360',
      formulaDescription: 'Notional amount based fee using Act/360 accrual',
      baseSource: 'POSITION_NOTIONAL',
      productFamily: 'NOTIONAL_INSTRUMENT',
      expectedValueBasis: 'NOTIONAL',
      periodSource: 'accrual_day',
      periodDays,
      annualizationBase: 360,
      taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
    };
  }

  if (valueBasis === 'BUM') {
    return {
      formulaCode: 'TRUST_BUM_RATE_360',
      formulaDescription: 'Business-under-management fee using Act/360 accrual',
      baseSource: 'PORTFOLIO_BUM',
      productFamily: portfolioType || 'TRUST',
      expectedValueBasis: 'BUM',
      periodSource: 'accrual_day',
      periodDays,
      annualizationBase: 360,
      taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
    };
  }

  if (valueBasis === 'AVG_INVESTMENT') {
    return {
      formulaCode: 'AVG_INVESTMENT_RATE_360',
      formulaDescription: 'Average investment fee using Act/360 accrual',
      baseSource: 'AVG_INVESTMENT',
      productFamily: portfolioType || 'TRUST',
      expectedValueBasis: 'AVG_INVESTMENT',
      periodSource: 'month_to_date_average',
      periodDays,
      annualizationBase: 360,
      taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
    };
  }

  const isFixedIncomeByContext = includesAny(instrumentToken, FIXED_INCOME_TERMS);

  return {
    formulaCode: isFixedIncomeByContext ? 'FIXED_INCOME_AUM_RATE_360' : 'TRUST_ADB_AUM_360',
    formulaDescription: isFixedIncomeByContext
      ? 'Fixed-income portfolio AUM fee using Act/360 accrual'
      : 'Trust ADB/AUM fee using month-to-date NAV average and Act/360 accrual',
    baseSource: 'NAV_MTD_AVERAGE',
    productFamily: portfolioType || feeType || 'TRUST',
    expectedValueBasis: 'AUM',
    periodSource: 'accrual_day',
    periodDays,
    annualizationBase: 360,
    taxTreatment: 'DEFER_TO_INVOICE_TAX_RULES',
  };
}
