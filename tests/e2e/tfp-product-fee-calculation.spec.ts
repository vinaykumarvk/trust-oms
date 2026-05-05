import { describe, expect, it } from 'vitest';
import { resolveProductFeeFormula } from '../../server/services/tfp-fee-calculation-policy';

describe('TrustFees Pro product fee calculation policy', () => {
  it('uses ADB/AUM source for discretionary trust AUM fees', () => {
    const policy = resolveProductFeeFormula(
      { fee_type: 'TRUST', value_basis: 'AUM', rate_type: 'ANNUALIZED' },
      {
        portfolioId: 'PTF-001',
        businessDate: '2026-05-04',
        portfolioType: 'IMA_DISCRETIONARY',
      },
    );

    expect(policy.formulaCode).toBe('TRUST_ADB_AUM_360');
    expect(policy.baseSource).toBe('NAV_MTD_AVERAGE');
    expect(policy.periodDays).toBe(1);
    expect(policy.taxTreatment).toBe('DEFER_TO_INVOICE_TAX_RULES');
  });

  it('maps face-value plans to bond/coupon formula evidence', () => {
    const policy = resolveProductFeeFormula(
      { fee_type: 'TRUST', value_basis: 'FACE_VALUE', rate_type: 'ANNUALIZED' },
      {
        portfolioId: 'PTF-BOND',
        businessDate: '2026-05-04',
        securityAssetClass: 'FIXED_INCOME',
        securityInstrumentSubType: 'CORPORATE_BOND',
      },
    );

    expect(policy.formulaCode).toBe('BOND_FACE_VALUE_COUPON_360');
    expect(policy.baseSource).toBe('POSITION_FACE_VALUE');
    expect(policy.periodSource).toBe('coupon_or_accrual_day');
  });

  it('maps preferred equity cost fees to dividend-day formula evidence', () => {
    const policy = resolveProductFeeFormula(
      { fee_type: 'COMMISSION', value_basis: 'COST', rate_type: 'ANNUALIZED' },
      {
        portfolioId: 'PTF-PREF',
        businessDate: '2026-05-04',
        securityAssetClass: 'EQUITY',
        securityInstrumentSubType: 'PREFERRED_EQUITY',
      },
    );

    expect(policy.formulaCode).toBe('PREFERRED_EQUITY_COST_DIVIDEND_360');
    expect(policy.baseSource).toBe('POSITION_COST');
    expect(policy.productFamily).toBe('PREFERRED_EQUITY');
  });

  it('maps loan principal fees to interest-day formula evidence', () => {
    const policy = resolveProductFeeFormula(
      { fee_type: 'ADMIN', value_basis: 'PRINCIPAL', rate_type: 'ANNUALIZED' },
      {
        portfolioId: 'PTF-LOAN',
        businessDate: '2026-05-04',
        securityAssetClass: 'LOAN',
        securityInstrumentSubType: 'TERM_LOAN',
      },
    );

    expect(policy.formulaCode).toBe('LOAN_PRINCIPAL_INTEREST_360');
    expect(policy.baseSource).toBe('POSITION_PRINCIPAL');
    expect(policy.productFamily).toBe('LOAN');
  });

  it('maps T-bill and commercial paper cost fees to term formula evidence', () => {
    const policy = resolveProductFeeFormula(
      { fee_type: 'ADMIN', value_basis: 'COST', rate_type: 'ANNUALIZED' },
      {
        portfolioId: 'PTF-MM',
        businessDate: '2026-05-04',
        securityAssetClass: 'MONEY_MARKET',
        securityInstrumentSubType: 'T-BILL',
      },
    );

    expect(policy.formulaCode).toBe('MONEY_MARKET_COST_TERM_360');
    expect(policy.baseSource).toBe('POSITION_COST');
    expect(policy.periodSource).toBe('term_or_accrual_day');
  });

  it('maps escrow plans to monthly step-window formula evidence', () => {
    const policy = resolveProductFeeFormula(
      { fee_type: 'ESCROW', value_basis: 'PRINCIPAL', rate_type: 'FLAT' },
      {
        portfolioId: 'PTF-ESCROW',
        businessDate: '2026-05-04',
      },
    );

    expect(policy.formulaCode).toBe('ESCROW_STEP_FUNCTION_MONTHLY');
    expect(policy.baseSource).toBe('ESCROW_STEP_WINDOW');
    expect(policy.periodDays).toBe(30);
  });
});
