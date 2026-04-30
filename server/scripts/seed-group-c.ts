#!/usr/bin/env tsx
/**
 * Seed Group C — all remaining operational / transactional tables.
 *
 * Usage (Cloud SQL via proxy):
 *   DATABASE_URL=postgresql://trust_banking:jSa55AvZDpdl0I24gzQQdhd0tg1bHvbS@127.0.0.1:15435/trust-banking-db?sslmode=disable \
 *     npx tsx server/scripts/seed-group-c.ts
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { db } from '../db';
import * as s from '../../packages/shared/src/schema';
import { eq, and, sql } from 'drizzle-orm';

const SYSTEM_USER = 1;
/** Spread into any table that carries the full auditFields (text created_by / updated_by). */
const AUD = { created_by: 'SYSTEM' as string, updated_by: 'SYSTEM' as string };

// ── Reference ID loader ──────────────────────────────────────────────────────

async function loadRefs() {
  const [client]    = await db.select().from(s.clients).limit(1);
  const [portfolio] = await db.select().from(s.portfolios).limit(1);
  const [user]      = await db.select().from(s.users).limit(1);
  const [security]  = await db.select().from(s.securities).limit(1);
  const [broker]    = await db.select().from(s.brokers).limit(1);
  const [glHead]    = await db.select().from(s.glHeads).limit(1);
  const [acctUnit]  = await db.select().from(s.accountingUnits).limit(1);
  const [fund]      = await db.select().from(s.fundMaster).limit(1);
  const [glPort]    = await db.select().from(s.glPortfolioMaster).limit(1);
  const [caOpt]     = await db.select().from(s.caOptions).limit(1);
  const [modelPort] = await db.select().from(s.modelPortfolios).limit(1);
  const [reportDef] = await db.select().from(s.glReportDefinitions).limit(1);

  // These may be null if Group A did not seed them yet
  let criteriaId = 1;
  let ruleSetId  = 1;
  try {
    const [crit] = await db.select().from(s.glCriteriaDefinitions).limit(1);
    if (crit) criteriaId = crit.id;
  } catch { /* table might not exist */ }
  try {
    const [rs] = await db.select().from(s.glAccountingRuleSets).limit(1);
    if (rs) ruleSetId = rs.id;
  } catch { /* table might not exist */ }

  return {
    clientId:    client?.client_id      ?? 'CLIENT-001',
    portfolioId: portfolio?.portfolio_id ?? 'PORT-001',
    userId:      user?.id               ?? SYSTEM_USER,
    securityId:  security?.id           ?? 1,
    brokerId:    broker?.id             ?? 1,
    glHeadId:    glHead?.id             ?? 1,
    acctUnitId:  acctUnit?.id           ?? 1,
    fundId:      fund?.id               ?? 1,
    glPortId:    glPort?.id             ?? 1,
    caOptionId:  caOpt?.id             ?? 1,
    caEventId:   (caOpt as any)?.event_id ?? 1,
    accountId:   'ACCT-001',
    modelPortId: modelPort?.id          ?? 1,
    reportDefId: reportDef?.id          ?? 1,
    criteriaId,
    ruleSetId,
  };
}

type Refs = Awaited<ReturnType<typeof loadRefs>>;

// ── Seed helper ──────────────────────────────────────────────────────────────

async function seed(label: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${label}... `);
  try {
    await fn();
    console.log('ok');
  } catch (err: unknown) {
    console.log('skip – ' + (err instanceof Error ? err.message.split('\n')[0].slice(0, 120) : String(err)));
  }
}

async function any(table: any): Promise<boolean> {
  const rows = await db.select({ x: sql<number>`1` }).from(table).limit(1);
  return rows.length > 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seed-group-c] Loading refs...');
  const r = await loadRefs();
  console.log('[seed-group-c] Seeding...\n');

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 1 — TrustFees Pro: master tables (no Group-C deps)
  // ══════════════════════════════════════════════════════════════════════════

  let jurisdictionId = 1;
  await seed('jurisdictions', async () => {
    if (await any(s.jurisdictions)) { const [j] = await db.select().from(s.jurisdictions).limit(1); jurisdictionId = j!.id; return; }
    const [j] = await db.insert(s.jurisdictions).values({
      code: 'PH', name: 'Philippines', locale: 'en-PH', is_active: true, ...AUD,
    }).returning({ id: s.jurisdictions.id });
    jurisdictionId = j!.id;
  });

  let pricingDefId = 1;
  await seed('pricingDefinitions', async () => {
    if (await any(s.pricingDefinitions)) { const [p] = await db.select().from(s.pricingDefinitions).limit(1); pricingDefId = p!.id; return; }
    const [p] = await db.insert(s.pricingDefinitions).values({
      pricing_code: 'TF-AUM-TIERED',
      pricing_name: 'AUM-Based Tiered Fee',
      pricing_type: 'TIERED',
      currency: 'PHP',
      pricing_tiers: [{ from: 0, rate: 0.01 }, { from: 1_000_000, rate: 0.008 }],
      pricing_version: 1,
      library_status: 'ACTIVE',
      ...AUD,
    }).returning({ id: s.pricingDefinitions.id });
    pricingDefId = p!.id;
  });

  let eligExprId = 1;
  await seed('eligibilityExpressions', async () => {
    if (await any(s.eligibilityExpressions)) { const [e] = await db.select().from(s.eligibilityExpressions).limit(1); eligExprId = e!.id; return; }
    const [e] = await db.insert(s.eligibilityExpressions).values({
      eligibility_code: 'ELIG-PH-RESIDENT',
      eligibility_name: 'Philippine Resident Individual',
      expression: 'domicile == "PH" && entity_type == "INDIVIDUAL"',
      library_status: 'ACTIVE',
      ...AUD,
    }).returning({ id: s.eligibilityExpressions.id });
    eligExprId = e!.id;
  });

  let accrualSchedId = 1;
  await seed('accrualSchedules', async () => {
    if (await any(s.accrualSchedules)) { const [a] = await db.select().from(s.accrualSchedules).limit(1); accrualSchedId = a!.id; return; }
    const [a] = await db.insert(s.accrualSchedules).values({
      schedule_code: 'ACR-MONTHLY',
      schedule_name: 'Monthly Accrual',
      accrual_enabled: true,
      accrual_frequency: 'MONTHLY',
      accrual_method: 'DAILY',
      invoice_frequency: 'QUARTERLY',
      due_date_offset_days: 15,
      library_status: 'ACTIVE',
      ...AUD,
    }).returning({ id: s.accrualSchedules.id });
    accrualSchedId = a!.id;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 2 — depends on jurisdictions (Wave 1)
  // ══════════════════════════════════════════════════════════════════════════

  let feePlanTemplateId = 1;
  await seed('feePlanTemplates', async () => {
    if (await any(s.feePlanTemplates)) { const [t] = await db.select().from(s.feePlanTemplates).limit(1); feePlanTemplateId = t!.id; return; }
    const [t] = await db.insert(s.feePlanTemplates).values({
      template_code: 'TPL-STANDARD',
      template_name: 'Standard Trust Fee Template',
      category: 'TRUST',
      default_payload: { notes: 'Standard PH template' },
      jurisdiction_id: jurisdictionId,
      is_active: true,
      ...AUD,
    }).returning({ id: s.feePlanTemplates.id });
    feePlanTemplateId = t!.id;
  });

  let taxRuleId = 1;
  await seed('taxRules', async () => {
    if (await any(s.taxRules)) { const [t] = await db.select().from(s.taxRules).limit(1); taxRuleId = t!.id; return; }
    const [t] = await db.insert(s.taxRules).values({
      tax_code: 'WT-12PCT',
      name: '12% Withholding Tax',
      tax_rule_type: 'WITHHOLDING',
      rate: 0.12,
      jurisdiction_id: jurisdictionId,
      applicable_fee_types: ['TRUST_FEE', 'MANAGEMENT_FEE'],
      effective_date: new Date('2024-01-01'),
      ...AUD,
    }).returning({ id: s.taxRules.id });
    taxRuleId = t!.id;
  });

  let customerRefId = 1;
  await seed('customerReferences', async () => {
    if (await any(s.customerReferences)) { const [c] = await db.select().from(s.customerReferences).limit(1); customerRefId = c!.id; return; }
    const [c] = await db.insert(s.customerReferences).values({
      customer_id: r.clientId,
      display_name: 'Seed Customer Reference',
      customer_type: 'INDIVIDUAL',
      domicile: 'PH',
      billing_currency: 'PHP',
      jurisdiction_id: jurisdictionId,
      ...AUD,
    }).returning({ id: s.customerReferences.id });
    customerRefId = c!.id;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 3 — feePlans (depends on pricingDef, eligExpr, accrualSched, jurisdiction)
  // ══════════════════════════════════════════════════════════════════════════

  let feePlanId = 1;
  await seed('feePlans', async () => {
    if (await any(s.feePlans)) { const [f] = await db.select().from(s.feePlans).limit(1); feePlanId = f!.id; return; }
    const [f] = await db.insert(s.feePlans).values({
      fee_plan_code: 'FP-STANDARD-001',
      fee_plan_name: 'Standard Trust Fee Plan',
      charge_basis: 'AUM',
      fee_type: 'TRUST_FEE',
      pricing_definition_id: pricingDefId,
      eligibility_expression_id: eligExprId,
      accrual_schedule_id: accrualSchedId,
      jurisdiction_id: jurisdictionId,
      source_party: 'CLIENT',
      target_party: 'TRUSTEE',
      comparison_basis: 'AVERAGE_AUM',
      value_basis: 'GROSS',
      effective_date: new Date('2024-01-01'),
      plan_status: 'ACTIVE',
      ...AUD,
    }).returning({ id: s.feePlans.id });
    feePlanId = f!.id;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 4 — TrustFees Pro: transactional (depends on feePlans + customer + portfolio)
  // ══════════════════════════════════════════════════════════════════════════

  let tfpAccrualId = 1;
  await seed('tfpAccruals', async () => {
    if (await any(s.tfpAccruals)) { const [a] = await db.select().from(s.tfpAccruals).limit(1); tfpAccrualId = a!.id; return; }
    const [a] = await db.insert(s.tfpAccruals).values({
      fee_plan_id: feePlanId,
      customer_id: r.clientId,
      portfolio_id: r.portfolioId,
      base_amount: 10_000_000,
      computed_fee: 100_000,
      applied_fee: 100_000,
      currency: 'PHP',
      accrual_date: new Date('2024-03-31'),
      accrual_status: 'POSTED',
      idempotency_key: 'SEED-ACCRUAL-2024-Q1',
      ...AUD,
    }).returning({ id: s.tfpAccruals.id });
    tfpAccrualId = a!.id;
  });

  let tfpInvoiceId = 1;
  await seed('tfpInvoices', async () => {
    if (await any(s.tfpInvoices)) { const [i] = await db.select().from(s.tfpInvoices).limit(1); tfpInvoiceId = i!.id; return; }
    const [i] = await db.insert(s.tfpInvoices).values({
      invoice_number: 'INV-2024-00001',
      customer_id: r.clientId,
      jurisdiction_id: jurisdictionId,
      currency: 'PHP',
      total_amount: 100_000,
      tax_amount: 12_000,
      grand_total: 112_000,
      invoice_date: new Date('2024-04-05'),
      due_date: new Date('2024-04-20'),
      invoice_status: 'ISSUED',
      ...AUD,
    }).returning({ id: s.tfpInvoices.id });
    tfpInvoiceId = i!.id;
  });

  await seed('tfpInvoiceLines', async () => {
    if (await any(s.tfpInvoiceLines)) return;
    await db.insert(s.tfpInvoiceLines).values({
      invoice_id: tfpInvoiceId,
      accrual_id: tfpAccrualId,
      description: 'Trust Management Fee – Q1 2024',
      quantity: 1,
      unit_amount: 100_000,
      line_amount: 100_000,
      tax_amount: 12_000,
      ...AUD,
    });
  });

  await seed('tfpPayments', async () => {
    if (await any(s.tfpPayments)) return;
    await db.insert(s.tfpPayments).values({
      invoice_id: tfpInvoiceId,
      amount: 112_000,
      currency: 'PHP',
      payment_date: new Date('2024-04-18'),
      method: 'BANK_TRANSFER',
      reference_no: 'PAY-REF-2024-001',
      payment_status: 'SETTLED',
      ...AUD,
    });
  });

  await seed('feeOverrides', async () => {
    if (await any(s.feeOverrides)) return;
    await db.insert(s.feeOverrides).values({
      stage: 'PRE_INVOICE',
      accrual_id: tfpAccrualId,
      original_amount: 100_000,
      overridden_amount: 95_000,
      delta_pct: -5,
      reason_code: 'NEGOTIATED_RATE',
      reason_notes: 'Client negotiated 5% discount',
      requested_by: String(r.userId),
      override_status: 'APPROVED',
      ...AUD,
    });
  });

  await seed('disputes', async () => {
    if (await any(s.disputes)) return;
    await db.insert(s.disputes).values({
      invoice_id: tfpInvoiceId,
      raised_by: String(r.userId),
      reason: 'Incorrect AUM basis used for computation',
      dispute_status: 'OPEN',
      ...AUD,
    });
  });

  await seed('creditNotes', async () => {
    if (await any(s.creditNotes)) return;
    await db.insert(s.creditNotes).values({
      credit_note_number: 'CN-2024-00001',
      related_invoice_id: tfpInvoiceId,
      amount: 5_000,
      currency: 'PHP',
      reason_code: 'CORRECTION',
      cn_status: 'ISSUED',
      ...AUD,
    });
  });

  await seed('exceptionItems', async () => {
    if (await any(s.exceptionItems)) return;
    await db.insert(s.exceptionItems).values({
      exception_type: 'FEE_DISCREPANCY',
      severity: 'MEDIUM',
      customer_id: r.clientId,
      source_aggregate_type: 'TFP_INVOICE',
      source_aggregate_id: String(tfpInvoiceId),
      title: 'Fee variance exceeds threshold',
      details: { variance_pct: 5.2, threshold_pct: 3.0 },
      assigned_to_team: 'TRUST_OPS',
      exception_status: 'OPEN',
      sla_due_at: new Date(Date.now() + 3 * 86_400_000),
      ...AUD,
    });
  });

  await seed('dataSubjectRequests', async () => {
    if (await any(s.dataSubjectRequests)) return;
    await db.insert(s.dataSubjectRequests).values({
      subject_customer_id: r.clientId,
      dsar_type: 'ACCESS',
      submitted_via: 'EMAIL',
      dsar_status: 'NEW',
      response_deadline: new Date(Date.now() + 30 * 86_400_000),
      ...AUD,
    });
  });

  await seed('piiClassifications', async () => {
    if (await any(s.piiClassifications)) return;
    await db.insert(s.piiClassifications).values({
      aggregate_type: 'clients',
      field_path: 'mobile_phone',
      classification: 'SENSITIVE',
      redaction_rule: 'MASK_MIDDLE',
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 5 — Audit: no FK deps within Group C
  // ══════════════════════════════════════════════════════════════════════════

  await seed('auditWindowSignatures', async () => {
    if (await any(s.auditWindowSignatures)) return;
    const now = new Date();
    await db.insert(s.auditWindowSignatures).values({
      window_start: new Date(now.getTime() - 86_400_000),
      window_end: now,
      event_count: 0,
      hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      signature: 'SEED_SIGNATURE',
      created_at: now,
    } as any);
  });

  await seed('auditEvents', async () => {
    if (await any(s.auditEvents)) return;
    await db.insert(s.auditEvents).values({
      aggregate_type: 'clients',
      aggregate_id: r.clientId,
      event_type: 'VIEWED',
      actor_id: String(r.userId),
      window_id: sql`gen_random_uuid()`,
      created_at: new Date(),
    } as any);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 6 — Entity Config
  // ══════════════════════════════════════════════════════════════════════════

  await seed('entityRegistry', async () => {
    if (await any(s.entityRegistry)) return;
    await db.insert(s.entityRegistry).values({
      entity_key: 'clients',
      display_name: 'Client',
      schema_table_name: 'clients',
      is_active: true,
      ...AUD,
    });
  });

  await seed('entityFieldConfig', async () => {
    if (await any(s.entityFieldConfig)) return;
    await db.insert(s.entityFieldConfig).values({
      entity_key: 'clients',
      field_name: 'mobile_phone',
      label: 'Mobile Phone',
      input_type: 'TEXT',
      ...AUD,
    });
  });

  await seed('entityCrossValidations', async () => {
    if (await any(s.entityCrossValidations)) return;
    await db.insert(s.entityCrossValidations).values({
      entity_key: 'clients',
      rule_name: 'email_or_phone_required',
      condition: 'email IS NOT NULL OR mobile_phone IS NOT NULL',
      error_message: 'At least one of email or mobile phone must be provided',
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 7 — Operational: portfolio/security-dependent (no Group-C FK chain)
  // ══════════════════════════════════════════════════════════════════════════

  await seed('pricingRecords', async () => {
    if (await any(s.pricingRecords)) return;
    await db.insert(s.pricingRecords).values({
      security_id: r.securityId,
      price_date: new Date('2024-04-26'),
      close_price: 1.0,
      source: 'BLOOMBERG',
      ...AUD,
    });
  });

  let navCompId = 1;
  await seed('navComputations', async () => {
    if (await any(s.navComputations)) { const [n] = await db.select().from(s.navComputations).limit(1); navCompId = n!.id; return; }
    const [n] = await db.insert(s.navComputations).values({
      portfolio_id: r.portfolioId,
      computation_date: new Date('2024-04-26'),
      nav_per_unit: 1.0,
      total_nav: 10_000_000,
      nav_status: 'CONFIRMED',
      ...AUD,
    }).returning({ id: s.navComputations.id });
    navCompId = n!.id;
  });

  let feeScheduleId = 1;
  await seed('feeSchedules', async () => {
    if (await any(s.feeSchedules)) { const [f] = await db.select().from(s.feeSchedules).limit(1); feeScheduleId = f!.id; return; }
    const [f] = await db.insert(s.feeSchedules).values({
      portfolio_id: r.portfolioId,
      fee_type: 'MANAGEMENT',
      calculation_method: 'AUM_PERCENTAGE',
      rate_pct: 1.0,
      effective_from: new Date('2024-01-01'),
      ...AUD,
    }).returning({ id: s.feeSchedules.id });
    feeScheduleId = f!.id;
  });

  let feeInvoiceId = 1;
  await seed('feeInvoices', async () => {
    if (await any(s.feeInvoices)) { const [f] = await db.select().from(s.feeInvoices).limit(1); feeInvoiceId = f!.id; return; }
    const [f] = await db.insert(s.feeInvoices).values({
      portfolio_id: r.portfolioId,
      fee_schedule_id: feeScheduleId,
      period_from: new Date('2024-01-01'),
      period_to: new Date('2024-03-31'),
      gross_amount: 25_000,
      tax_amount: 3_000,
      net_amount: 22_000,
      invoice_status: 'PAID',
      ...AUD,
    }).returning({ id: s.feeInvoices.id });
    feeInvoiceId = f!.id;
  });

  await seed('feeAccruals', async () => {
    if (await any(s.feeAccruals)) return;
    await db.insert(s.feeAccruals).values({
      fee_schedule_id: feeScheduleId,
      accrual_date: new Date('2024-03-31'),
      amount: 25_000,
      ...AUD,
    });
  });

  await seed('unitTransactions', async () => {
    if (await any(s.unitTransactions)) return;
    await db.insert(s.unitTransactions).values({
      portfolio_id: r.portfolioId,
      type: 'SUBSCRIPTION',
      units: 10_000,
      nav_per_unit: 1.0,
      amount: 10_000_000,
      transaction_date: new Date('2024-01-15'),
      ...AUD,
    });
  });

  await seed('kycCases', async () => {
    if (await any(s.kycCases)) return;
    await db.insert(s.kycCases).values({
      client_id: r.clientId,
      risk_rating: 'LOW',
      kyc_status: 'VERIFIED',
      id_number: 'PH-PSN-123456789',
      id_type: 'PASSPORT',
      expiry_date: new Date('2028-12-31'),
      ...AUD,
    });
  });

  await seed('reversalCases', async () => {
    if (await any(s.reversalCases)) return;
    await db.insert(s.reversalCases).values({
      original_transaction_id: 'TXN-SEED-001',
      type: 'MANUAL',
      reason: 'Duplicate entry detected during reconciliation',
      reversal_status: 'PENDING',
      requested_by: String(r.userId),
      ...AUD,
    });
  });

  let uploadBatchId = 1;
  await seed('uploadBatches', async () => {
    if (await any(s.uploadBatches)) { const [u] = await db.select().from(s.uploadBatches).limit(1); uploadBatchId = u!.id; return; }
    const [u] = await db.insert(s.uploadBatches).values({
      filename: 'seed-positions-2024-04-26.csv',
      row_count: 1,
      upload_status: 'COMPLETED',
      uploaded_by: r.userId,
      ...AUD,
    }).returning({ id: s.uploadBatches.id });
    uploadBatchId = u!.id;
  });

  await seed('uploadBatchItems', async () => {
    if (await any(s.uploadBatchItems)) return;
    await db.insert(s.uploadBatchItems).values({
      batch_id: uploadBatchId,
      row_number: 1,
      entity_type: 'POSITION',
      entity_id: null,
      item_status: 'SUCCEEDED',
      ...AUD,
    });
  });

  await seed('transfers', async () => {
    if (await any(s.transfers)) return;
    await db.insert(s.transfers).values({
      from_portfolio_id: r.portfolioId,
      to_portfolio_id: r.portfolioId,
      security_id: r.securityId,
      quantity: 1_000,
      type: 'IN_SPECIE',
      transfer_status: 'COMPLETED',
      ...AUD,
    });
  });

  await seed('contributions', async () => {
    if (await any(s.contributions)) return;
    await db.insert(s.contributions).values({
      portfolio_id: r.portfolioId,
      amount: 500_000,
      currency: 'PHP',
      source_account: 'ACCT-SOURCE-001',
      type: 'REGULAR',
      contribution_status: 'PROCESSED',
      ...AUD,
    });
  });

  await seed('withdrawals', async () => {
    if (await any(s.withdrawals)) return;
    await db.insert(s.withdrawals).values({
      portfolio_id: r.portfolioId,
      amount: 50_000,
      currency: 'PHP',
      destination_account: 'ACCT-DEST-001',
      type: 'PARTIAL',
      withdrawal_status: 'PROCESSED',
      ...AUD,
    });
  });

  await seed('positions', async () => {
    if (await any(s.positions)) return;
    await db.insert(s.positions).values({
      portfolio_id: r.portfolioId,
      security_id: r.securityId,
      quantity: 10_000,
      cost_basis: 1.0,
      market_value: 10_500,
      as_of_date: new Date('2024-04-26'),
      ...AUD,
    });
  });

  await seed('rebalancingRuns', async () => {
    if (await any(s.rebalancingRuns)) return;
    await db.insert(s.rebalancingRuns).values({
      portfolio_ids: [r.portfolioId],
      model_portfolio_id: r.modelPortId,
      run_type: 'DRIFT',
      rebalancing_status: 'EXECUTED',
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 8 — Compliance / Risk
  // ══════════════════════════════════════════════════════════════════════════

  let compRuleId = 1;
  await seed('complianceRules', async () => {
    if (await any(s.complianceRules)) { const [c] = await db.select().from(s.complianceRules).limit(1); compRuleId = c!.id; return; }
    const [c] = await db.insert(s.complianceRules).values({
      rule_type: 'CONCENTRATION_LIMIT',
      entity_type: 'PORTFOLIO',
      condition: 'single_issuer_pct > 20',
      action: 'ALERT',
      severity: 'HIGH',
      is_active: true,
      ...AUD,
    }).returning({ id: s.complianceRules.id });
    compRuleId = c!.id;
  });

  await seed('complianceBreaches', async () => {
    if (await any(s.complianceBreaches)) return;
    await db.insert(s.complianceBreaches).values({
      rule_id: compRuleId,
      portfolio_id: r.portfolioId,
      breach_description: 'Single issuer concentration at 23% exceeds 20% limit',
      detected_at: new Date(),
      ...AUD,
    });
  });

  await seed('tradeSurveillanceAlerts', async () => {
    if (await any(s.tradeSurveillanceAlerts)) return;
    await db.insert(s.tradeSurveillanceAlerts).values({
      pattern: 'LAYERING',
      score: 0.82,
      order_ids: ['ORD-SEED-001'],
      disposition: 'UNDER_REVIEW',
      analyst_id: r.userId,
      ...AUD,
    });
  });

  await seed('oreEvents', async () => {
    if (await any(s.oreEvents)) return;
    await db.insert(s.oreEvents).values({
      basel_category: 'EXECUTION_DELIVERY',
      description: 'Settlement failure due to incorrect SSI',
      gross_loss: 5_000,
      net_loss: 5_000,
      root_cause: 'PROCESS_ERROR',
      corrective_action: 'SSI updated and reconciled',
      ...AUD,
    });
  });

  await seed('killSwitchEvents', async () => {
    if (await any(s.killSwitchEvents)) return;
    await db.insert(s.killSwitchEvents).values({
      scope: 'TRADING',
      reason: 'System maintenance window – pre-scheduled',
      invoked_by: String(r.userId),
      active_since: new Date(),
      ...AUD,
    });
  });

  await seed('whistleblowerCases', async () => {
    if (await any(s.whistleblowerCases)) return;
    await db.insert(s.whistleblowerCases).values({
      intake_channel: 'HOTLINE',
      anonymous: true,
      description: 'Suspected front-running by a trader – anonymous tip',
      case_status: 'OPEN',
      ...AUD,
    });
  });

  await seed('breachNotifications', async () => {
    if (await any(s.breachNotifications)) return;
    await db.insert(s.breachNotifications).values({
      breach_id: 'BREACH-2024-001',
      breach_type: 'DATA_BREACH',
      detected_at: new Date(),
      npc_deadline: new Date(Date.now() + 72 * 3_600_000),
      affected_count: 0,
      breach_status: 'NPC_NOTIFIED',
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 9 — Notifications / Consent / Audit / Elections / Reports
  // ══════════════════════════════════════════════════════════════════════════

  await seed('notificationLog', async () => {
    if (await any(s.notificationLog)) return;
    await db.insert(s.notificationLog).values({
      event_type: 'KYC_EXPIRY_REMINDER',
      channel: 'EMAIL',
      recipient_id: r.clientId,
      recipient_type: 'CLIENT',
      sent_at: new Date(),
      notification_status: 'DELIVERED',
      ...AUD,
    });
  });

  await seed('consentLog', async () => {
    if (await any(s.consentLog)) return;
    await db.insert(s.consentLog).values({
      client_id: r.clientId,
      processing_activity: 'MARKETING_EMAIL',
      lawful_basis: 'CONSENT',
      purpose: 'Product promotions and market updates',
      retention_period: 1825,
      ...AUD,
    });
  });

  await seed('auditRecords', async () => {
    if (await any(s.auditRecords)) return;
    await db.insert(s.auditRecords).values({
      entity_type: 'clients',
      entity_id: r.clientId,
      action: 'CREATE',
      actor_id: String(r.userId),
      actor_role: 'RELATIONSHIP_MANAGER',
      changes: {},
      previous_hash: null,
      record_hash: 'SEED_HASH_00001',
      metadata: { source: 'seed-group-c' },
      ip_address: '127.0.0.1',
      created_at: new Date(),
    } as any);
  });

  await seed('clientElections', async () => {
    if (await any(s.clientElections)) return;
    await db.insert(s.clientElections).values({
      account_id: r.accountId,
      event_id: null,
      option_id: null,
      quantity: 100,
      elected_at: new Date(),
      election_status: 'SUBMITTED',
      ...AUD,
    });
  });

  await seed('notionalEvents', async () => {
    if (await any(s.notionalEvents)) return;
    await db.insert(s.notionalEvents).values({
      event_type: 'PORTFOLIO_NAV_COMPUTED',
      aggregate_type: 'portfolio',
      aggregate_id: r.portfolioId,
      payload: { nav: 10_000_000, currency: 'PHP' },
      idempotency_key: 'SEED-NOTIONAL-EVT-001',
      schema_version: 1,
      emitted_at: new Date(),
    } as any);
  });

  await seed('eventSchemas', async () => {
    if (await any(s.eventSchemas)) return;
    await db.insert(s.eventSchemas).values({
      event_type: 'PORTFOLIO_NAV_COMPUTED',
      schema_version: 1,
      json_schema: { type: 'object', properties: { nav: { type: 'number' }, currency: { type: 'string' } } },
      is_active: true,
      ...AUD,
    });
  });

  await seed('reportGenerationLog', async () => {
    if (await any(s.reportGenerationLog)) return;
    await db.insert(s.reportGenerationLog).values({
      report_type: 'CLIENT_STATEMENT',
      generated_by: r.userId,
      generated_at: new Date(),
      params: { portfolio_id: r.portfolioId, as_of: '2024-04-26' },
      row_count: 1,
      retention_until: new Date(Date.now() + 2555 * 86_400_000),
    } as any);
  });

  await seed('sanctionsScreeningLog', async () => {
    if (await any(s.sanctionsScreeningLog)) return;
    await db.insert(s.sanctionsScreeningLog).values({
      entity_type: 'CLIENT',
      entity_id: r.clientId,
      provider: 'WORLDCHECK',
      hit_count: 0,
      screening_status: 'CLEAR',
      resolved_by: null,
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 10 — Execution: orders → blocks → trades → derivatives
  // ══════════════════════════════════════════════════════════════════════════

  let orderId = 'ORD-SEED-001';
  await seed('orders', async () => {
    if (await any(s.orders)) { const [o] = await db.select().from(s.orders).limit(1); orderId = o!.order_id; return; }
    await db.insert(s.orders).values({
      order_id: orderId,
      order_no: 'ORD-2024-00001',
      portfolio_id: r.portfolioId,
      type: 'MARKET',
      side: 'BUY',
      security_id: r.securityId,
      quantity: 1_000,
      currency: 'PHP',
      order_status: 'FILLED',
      ...AUD,
    });
  });

  let blockId = 'BLK-SEED-001';
  await seed('blocks', async () => {
    if (await any(s.blocks)) { const [b] = await db.select().from(s.blocks).limit(1); blockId = b!.block_id; return; }
    await db.insert(s.blocks).values({
      block_id: blockId,
      security_id: r.securityId,
      side: 'BUY',
      total_qty: 1_000,
      block_status: 'FILLED',
      trader_id: r.userId,
      ...AUD,
    });
  });

  let tradeId = 'TRD-SEED-001';
  await seed('trades', async () => {
    if (await any(s.trades)) { const [t] = await db.select().from(s.trades).limit(1); tradeId = t!.trade_id; return; }
    await db.insert(s.trades).values({
      trade_id: tradeId,
      order_id: orderId,
      block_id: blockId,
      broker_id: r.brokerId,
      execution_price: 1.05,
      execution_qty: 1_000,
      execution_time: new Date(),
      ...AUD,
    });
  });

  await seed('orderAuthorizations', async () => {
    if (await any(s.orderAuthorizations)) return;
    await db.insert(s.orderAuthorizations).values({
      order_id: orderId,
      tier: 'TWO_EYES',
      approver_id: r.userId,
      approver_role: 'FUND_MANAGER',
      decision: 'APPROVED',
      decided_at: new Date(),
      ...AUD,
    });
  });

  await seed('taxEvents', async () => {
    if (await any(s.taxEvents)) return;
    await db.insert(s.taxEvents).values({
      trade_id: tradeId,
      portfolio_id: r.portfolioId,
      tax_type: 'WHT',
      gross_amount: 1_050,
      tax_rate: 0.005,
      tax_amount: 5.25,
      source: 'SYSTEM',
      ...AUD,
    });
  });

  await seed('validationOverrides', async () => {
    if (await any(s.validationOverrides)) return;
    await db.insert(s.validationOverrides).values({
      order_id: orderId,
      validation_rule: 'PRE_TRADE_CONCENTRATION_CHECK',
      severity: 'SOFT',
      override_justification: 'Approved by head of investments per mandate exception',
      overridden_by: r.userId,
      ...AUD,
    });
  });

  await seed('form1601fq', async () => {
    if (await any(s.form1601fq)) return;
    await db.insert(s.form1601fq).values({
      quarter: 1,
      year: 2024,
      filing_date: new Date('2024-04-30'),
      total_withheld: 12_000,
      filing_status: 'FILED',
      ...AUD,
    });
  });

  await seed('fixOutboundMessages', async () => {
    if (await any(s.fixOutboundMessages)) return;
    await db.insert(s.fixOutboundMessages).values({
      order_id: orderId,
      msg_type: 'NEW_ORDER_SINGLE',
      fix_version: 'FIX.4.4',
      target_comp_id: 'BROKER',
      sender_comp_id: 'TRUSTOMS',
      payload: { MsgType: 'D', ClOrdID: orderId },
      ack_status: 'ACKNOWLEDGED',
      sent_at: new Date(),
      ...AUD,
    });
  });

  await seed('switchOrders', async () => {
    if (await any(s.switchOrders)) return;
    await db.insert(s.switchOrders).values({
      parent_order_id: orderId,
      redeem_leg_order_id: null,
      subscribe_leg_order_id: null,
      switch_reason: 'CLIENT_REQUEST',
      switch_status: 'PENDING',
      ...AUD,
    });
  });

  await seed('subsequentAllocations', async () => {
    if (await any(s.subsequentAllocations)) return;
    await db.insert(s.subsequentAllocations).values({
      order_id: orderId,
      fund_id: null,
      percentage: 100.0,
      amount: 1_050,
      ...AUD,
    });
  });

  await seed('ipoAllocations', async () => {
    if (await any(s.ipoAllocations)) return;
    await db.insert(s.ipoAllocations).values({
      ipo_id: 'IPO-SEED-001',
      order_id: orderId,
      applied_units: 1_000,
      allotted_units: 800,
      scaling_factor: 0.8,
      scaling_method: 'PRO_RATA',
      ...AUD,
    });
  });

  await seed('brokerChargeSchedules', async () => {
    if (await any(s.brokerChargeSchedules)) return;
    await db.insert(s.brokerChargeSchedules).values({
      broker_id: r.brokerId,
      asset_class: 'EQUITY',
      rate_type: 'PERCENTAGE',
      rate: 0.002,
      ...AUD,
    });
  });

  await seed('cashSweepRules', async () => {
    if (await any(s.cashSweepRules)) return;
    await db.insert(s.cashSweepRules).values({
      account_id: r.accountId,
      portfolio_id: r.portfolioId,
      threshold_amount: 100_000,
      target_fund_id: null,
      frequency: 'DAILY',
      is_active: true,
      ...AUD,
    });
  });

  await seed('settlementAccountConfigs', async () => {
    if (await any(s.settlementAccountConfigs)) return;
    await db.insert(s.settlementAccountConfigs).values({
      trust_account_id: r.accountId,
      custodian_id: null,
      ssi_id: 'SSI-001',
      currency: 'PHP',
      routing_bic: 'BOFAPHM2XXX',
      is_default: true,
      ...AUD,
    });
  });

  await seed('derivativeSetups', async () => {
    if (await any(s.derivativeSetups)) return;
    await db.insert(s.derivativeSetups).values({
      instrument_type: 'FUTURES',
      underlier: 'PSEi',
      underlier_security_id: r.securityId,
      notional: 50_000_000,
      expiry_date: new Date('2026-12-31'),
      ...AUD,
    });
  });

  await seed('stressTestResults', async () => {
    if (await any(s.stressTestResults)) return;
    await db.insert(s.stressTestResults).values({
      scenario_id: 'SCN-GLOBAL-CRASH',
      scenario_name: 'Global Market Crash –40%',
      portfolio_id: r.portfolioId,
      impact_pct: -40.0,
      impact_amount: -4_000_000,
      run_date: new Date('2024-04-26'),
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 11 — EOD / Reconciliation
  // ══════════════════════════════════════════════════════════════════════════

  let eodRunId = 1;
  await seed('eodRuns', async () => {
    if (await any(s.eodRuns)) { const [e] = await db.select().from(s.eodRuns).limit(1); eodRunId = e!.id; return; }
    const [e] = await db.insert(s.eodRuns).values({
      run_date: new Date('2024-04-26'),
      run_status: 'COMPLETED',
      total_jobs: 5,
      completed_jobs: 5,
      failed_jobs: 0,
      triggered_by: String(r.userId),
      ...AUD,
    }).returning({ id: s.eodRuns.id });
    eodRunId = e!.id;
  });

  await seed('eodJobs', async () => {
    if (await any(s.eodJobs)) return;
    await db.insert(s.eodJobs).values({
      run_id: eodRunId,
      job_name: 'nav_computation',
      display_name: 'NAV Computation',
      job_status: 'COMPLETED',
      depends_on: [],
      ...AUD,
    });
  });

  let reconRunId = 1;
  await seed('reconRuns', async () => {
    if (await any(s.reconRuns)) { const [r2] = await db.select().from(s.reconRuns).limit(1); reconRunId = r2!.id; return; }
    const [r2] = await db.insert(s.reconRuns).values({
      type: 'POSITION',
      run_date: new Date('2024-04-26'),
      recon_status: 'COMPLETED',
      triggered_by: r.userId,
      ...AUD,
    }).returning({ id: s.reconRuns.id });
    reconRunId = r2!.id;
  });

  await seed('reconBreaks', async () => {
    if (await any(s.reconBreaks)) return;
    await db.insert(s.reconBreaks).values({
      run_id: reconRunId,
      type: 'POSITION',
      entity_id: r.portfolioId,
      break_type: 'QUANTITY_MISMATCH',
      internal_value: '10000',
      external_value: '9999',
      break_status: 'OPEN',
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 12 — GL Transactional
  // ══════════════════════════════════════════════════════════════════════════

  let glBizEventId = 1;
  await seed('glBusinessEvents', async () => {
    if (await any(s.glBusinessEvents)) { const [e] = await db.select().from(s.glBusinessEvents).limit(1); glBizEventId = e!.id; return; }
    const [e] = await db.insert(s.glBusinessEvents).values({
      source_system: 'TRUSTOMS',
      source_reference: 'ORD-SEED-001',
      idempotency_key: 'SEED-GL-EVT-001',
      event_code: 'TRADE_SETTLED',
      event_payload: { trade_id: tradeId, amount: 1_050 },
      event_hash: 'SEED_GL_HASH_001',
      business_date: new Date('2024-04-26'),
      processed: true,
      ...AUD,
    }).returning({ id: s.glBusinessEvents.id });
    glBizEventId = e!.id;
  });

  await seed('glAccountingIntents', async () => {
    if (await any(s.glAccountingIntents)) return;
    await db.insert(s.glAccountingIntents).values({
      event_id: glBizEventId,
      event_code: 'TRADE_SETTLED',
      criteria_id: r.criteriaId,
      rule_set_id: r.ruleSetId,
      intent_status: 'POSTED',
      ...AUD,
    });
  });

  let glBatchId = 1;
  await seed('glJournalBatches', async () => {
    if (await any(s.glJournalBatches)) { const [b] = await db.select().from(s.glJournalBatches).limit(1); glBatchId = b!.id; return; }
    const [b] = await db.insert(s.glJournalBatches).values({
      batch_ref: 'GLB-2024-000001',
      source_system: 'TRUSTOMS',
      source_event_id: String(glBizEventId),
      event_code: 'TRADE_SETTLED',
      posting_mode: 'ONLINE',
      accounting_unit_id: r.acctUnitId,
      transaction_date: new Date('2024-04-26'),
      value_date: new Date('2024-04-26'),
      batch_status: 'VALIDATED',
      total_debit: 1_050,
      total_credit: 1_050,
      line_count: 2,
      fund_id: r.fundId,
      ...AUD,
    }).returning({ id: s.glJournalBatches.id });
    glBatchId = b!.id;
  });

  await seed('glJournalLines', async () => {
    if (await any(s.glJournalLines)) return;
    await db.insert(s.glJournalLines).values([
      {
        batch_id: glBatchId,
        line_no: 1,
        dr_cr: 'DR',
        gl_head_id: r.glHeadId,
        amount: 1_050,
        currency: 'PHP',
        base_currency: 'PHP',
        base_amount: 1_050,
        fund_id: r.fundId,
        portfolio_id: r.glPortId,
        ...AUD,
      },
      {
        batch_id: glBatchId,
        line_no: 2,
        dr_cr: 'CR',
        gl_head_id: r.glHeadId,
        amount: 1_050,
        currency: 'PHP',
        base_currency: 'PHP',
        base_amount: 1_050,
        fund_id: r.fundId,
        portfolio_id: r.glPortId,
        ...AUD,
      },
    ]);
  });

  let glAuthTaskId = 1;
  await seed('glAuthorizationTasks', async () => {
    if (await any(s.glAuthorizationTasks)) { const [t] = await db.select().from(s.glAuthorizationTasks).limit(1); glAuthTaskId = t!.id; return; }
    const [t] = await db.insert(s.glAuthorizationTasks).values({
      object_type: 'GL_JOURNAL_BATCH',
      object_id: String(glBatchId),
      action: 'POST',
      maker_id: r.userId,
      auth_status: 'APPROVED',
      ...AUD,
    }).returning({ id: s.glAuthorizationTasks.id });
    glAuthTaskId = t!.id;
  });

  await seed('glAuthorizationAuditLog', async () => {
    if (await any(s.glAuthorizationAuditLog)) return;
    await db.insert(s.glAuthorizationAuditLog).values({
      auth_task_id: glAuthTaskId,
      object_type: 'GL_JOURNAL_BATCH',
      object_id: String(glBatchId),
      action: 'POST',
      actor_id: r.userId,
      decision: 'APPROVED',
      ...AUD,
    });
  });

  await seed('glInterestAccrualSchedules', async () => {
    if (await any(s.glInterestAccrualSchedules)) return;
    await db.insert(s.glInterestAccrualSchedules).values({
      portfolio_id: r.glPortId,
      security_id: r.securityId,
      fund_id: r.fundId,
      accrual_type: 'COUPON',
      day_count_convention: 'ACT/365',
      coupon_rate: 0.065,
      face_value: 1_000_000,
      accrual_frequency: 'SEMI_ANNUAL',
      accrual_gl_dr: r.glHeadId,
      accrual_gl_cr: r.glHeadId,
      effective_from: new Date('2024-01-01'),
      ...AUD,
    });
  });

  await seed('glAmortizationSchedules', async () => {
    if (await any(s.glAmortizationSchedules)) return;
    await db.insert(s.glAmortizationSchedules).values({
      portfolio_id: r.glPortId,
      security_id: r.securityId,
      fund_id: r.fundId,
      amortization_method: 'EFFECTIVE_INTEREST',
      purchase_price: 980_000,
      par_value: 1_000_000,
      premium_discount: -20_000,
      total_periods: 60,
      amortized_amount: 0,
      remaining_amount: -20_000,
      amortization_gl_dr: r.glHeadId,
      amortization_gl_cr: r.glHeadId,
      maturity_date: new Date('2029-01-01'),
      ...AUD,
    });
  });

  await seed('glReportSchedules', async () => {
    if (await any(s.glReportSchedules)) return;
    await db.insert(s.glReportSchedules).values({
      report_definition_id: r.reportDefId,
      schedule_name: 'Daily Trial Balance',
      frequency: 'DAILY',
      next_run_date: new Date(Date.now() + 86_400_000),
      output_format: 'PDF',
      is_active: true,
      owner_user_id: r.userId,
      ...AUD,
    });
  });

  await seed('glReversalLinks', async () => {
    if (await any(s.glReversalLinks)) return;
    await db.insert(s.glReversalLinks).values({
      original_batch_id: glBatchId,
      reversal_batch_id: glBatchId,
      reversal_type: 'FULL',
      reversal_reason: 'Seed test reversal',
      approved_by: r.userId,
      ...AUD,
    });
  });

  await seed('glLedgerBalances', async () => {
    if (await any(s.glLedgerBalances)) return;
    await db.insert(s.glLedgerBalances).values({
      gl_head_id: r.glHeadId,
      accounting_unit_id: r.acctUnitId,
      currency: 'PHP',
      balance_date: new Date('2024-04-26'),
      opening_balance: 0,
      debit_turnover: 1_050,
      credit_turnover: 1_050,
      closing_balance: 0,
      ...AUD,
    });
  });

  await seed('glBalanceSnapshots', async () => {
    if (await any(s.glBalanceSnapshots)) return;
    await db.insert(s.glBalanceSnapshots).values({
      snapshot_date: new Date('2024-04-26'),
      snapshot_type: 'EOD',
      gl_head_id: r.glHeadId,
      accounting_unit_id: r.acctUnitId,
      currency: 'PHP',
      opening_balance: 0,
      debit_turnover: 1_050,
      credit_turnover: 1_050,
      closing_balance: 0,
      ...AUD,
    });
  });

  await seed('glPostingExceptions', async () => {
    if (await any(s.glPostingExceptions)) return;
    await db.insert(s.glPostingExceptions).values({
      event_id: glBizEventId,
      batch_id: glBatchId,
      source_system: 'TRUSTOMS',
      exception_category: 'RULE_ERROR',
      error_message: 'No accounting rule matched for event code TRADE_SETTLED on asset class BOND',
      retry_eligible: true,
      resolved: true,
      ...AUD,
    });
  });

  await seed('glAuditLog', async () => {
    if (await any(s.glAuditLog)) return;
    await db.insert(s.glAuditLog).values({
      action: 'POST',
      object_type: 'GL_JOURNAL_BATCH',
      object_id: String(glBatchId),
      user_id: r.userId,
      timestamp: new Date(),
      old_values: null,
      new_values: { batch_status: 'POSTED' },
      ...AUD,
    });
  });

  await seed('glNavComputations', async () => {
    if (await any(s.glNavComputations)) return;
    await db.insert(s.glNavComputations).values({
      fund_id: r.fundId,
      nav_date: new Date('2024-04-26'),
      nav_status: 'FINAL',
      outstanding_units: 10_000_000,
      gross_nav: 10_000_000,
      net_nav: 10_000_000,
      navpu: 1.0,
      ...AUD,
    });
  });

  await seed('glPortfolioClassifications', async () => {
    if (await any(s.glPortfolioClassifications)) return;
    await db.insert(s.glPortfolioClassifications).values({
      fund_id: r.fundId,
      security_id: r.securityId,
      classification: 'HTM',
      effective_from: new Date('2024-01-01'),
      ...AUD,
    });
  });

  let glFxRunId = 1;
  await seed('glFxRevaluationRuns', async () => {
    if (await any(s.glFxRevaluationRuns)) { const [x] = await db.select().from(s.glFxRevaluationRuns).limit(1); glFxRunId = x!.id; return; }
    const [x] = await db.insert(s.glFxRevaluationRuns).values({
      business_date: new Date('2024-04-26'),
      run_status: 'COMPLETED',
      total_gls_processed: 1,
      total_gain: 0,
      total_loss: 0,
      ...AUD,
    }).returning({ id: s.glFxRevaluationRuns.id });
    glFxRunId = x!.id;
  });

  await seed('glFxRevaluationDetails', async () => {
    if (await any(s.glFxRevaluationDetails)) return;
    await db.insert(s.glFxRevaluationDetails).values({
      run_id: glFxRunId,
      gl_head_id: r.glHeadId,
      currency: 'USD',
      fcy_balance: 10_000,
      old_base_equivalent: 570_000,
      closing_mid_rate: 56.5,
      new_base_equivalent: 565_000,
      revaluation_amount: -5_000,
      direction: 'LOSS',
      ...AUD,
    });
  });

  await seed('glFrptiExtracts', async () => {
    if (await any(s.glFrptiExtracts)) return;
    await db.insert(s.glFrptiExtracts).values({
      reporting_period: '2024-Q1',
      reporting_date: new Date('2024-03-31'),
      frpti_book: 'RBU',
      frpti_schedule: 'SCH-A',
      frpti_report_line: 'LINE-001',
      currency: 'PHP',
      amount: 10_000_000,
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 13 — CRM: parent tables first
  // ══════════════════════════════════════════════════════════════════════════

  let campaignId = 1;
  await seed('campaigns', async () => {
    if (await any(s.campaigns)) { const [c] = await db.select().from(s.campaigns).limit(1); campaignId = c!.id; return; }
    const [c] = await db.insert(s.campaigns).values({
      campaign_code: 'CMP-SEED-001',
      name: 'Seed Trust Fee Awareness Campaign',
      campaign_type: 'OUTBOUND',
      campaign_status: 'DRAFT',
      start_date: new Date('2024-05-01'),
      end_date: new Date('2024-06-30'),
      budget_amount: 50_000,
      budget_currency: 'PHP',
      owner_user_id: r.userId,
      campaign_manager_id: r.userId,
      ...AUD,
    }).returning({ id: s.campaigns.id });
    campaignId = c!.id;
  });

  let leadListId = 1;
  await seed('leadLists', async () => {
    if (await any(s.leadLists)) { const [l] = await db.select().from(s.leadLists).limit(1); leadListId = l!.id; return; }
    const [l] = await db.insert(s.leadLists).values({
      list_code: 'LL-SEED-001',
      name: 'Seed High-Value Prospects',
      source_type: 'MANUAL',
      total_count: 1,
      is_active: true,
      ...AUD,
    }).returning({ id: s.leadLists.id });
    leadListId = l!.id;
  });

  let leadId = 1;
  await seed('leads', async () => {
    if (await any(s.leads)) { const [l] = await db.select().from(s.leads).limit(1); leadId = l!.id; return; }
    const [l] = await db.insert(s.leads).values({
      lead_code: 'LEAD-SEED-001',
      entity_type: 'INDIVIDUAL',
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      source: 'REFERRAL',
      lead_status: 'NEW',
      email: 'juan.delacruz@example.ph',
      mobile_phone: '09171234567',
      ...AUD,
    }).returning({ id: s.leads.id });
    leadId = l!.id;
  });

  let prospectId = 1;
  await seed('prospects', async () => {
    if (await any(s.prospects)) { const [p] = await db.select().from(s.prospects).limit(1); prospectId = p!.id; return; }
    const [p] = await db.insert(s.prospects).values({
      prospect_code: 'PROS-SEED-001',
      entity_type: 'INDIVIDUAL',
      first_name: 'Maria',
      last_name: 'Santos',
      prospect_status: 'QUALIFIED',
      email: 'maria.santos@example.ph',
      mobile_phone: '09189876543',
      negative_list_cleared: true,
      ...AUD,
    }).returning({ id: s.prospects.id });
    prospectId = p!.id;
  });

  let meetingId = 1;
  await seed('meetings', async () => {
    if (await any(s.meetings)) { const [m] = await db.select().from(s.meetings).limit(1); meetingId = m!.id; return; }
    const [m] = await db.insert(s.meetings).values({
      meeting_code: 'MTG-SEED-001',
      title: 'Seed Quarterly Review',
      meeting_type: 'CLIENT_REVIEW',
      organizer_user_id: r.userId,
      start_time: new Date('2024-05-10T10:00:00Z'),
      end_time: new Date('2024-05-10T11:00:00Z'),
      meeting_status: 'COMPLETED',
      ...AUD,
    }).returning({ id: s.meetings.id });
    meetingId = m!.id;
  });

  await seed('leadUploadBatches', async () => {
    if (await any(s.leadUploadBatches)) return;
    await db.insert(s.leadUploadBatches).values({
      batch_code: 'LUB-SEED-001',
      file_name: 'seed-leads.csv',
      file_url: '/uploads/seed-leads.csv',
      target_list_id: leadListId,
      total_rows: 1,
      valid_rows: 1,
      error_rows: 0,
      upload_status: 'COMPLETED',
      ...AUD,
    });
  });

  await seed('campaignConsentLog', async () => {
    if (await any(s.campaignConsentLog)) return;
    await db.insert(s.campaignConsentLog).values({
      consent_type: 'EMAIL_MARKETING',
      consent_status: 'GRANTED',
      consent_source: 'ONLINE_FORM',
      effective_date: new Date('2024-04-01'),
      ...AUD,
    });
  });

  await seed('leadRules', async () => {
    if (await any(s.leadRules)) return;
    await db.insert(s.leadRules).values({
      rule_name: 'High-Value Individual Prospect',
      criteria_json: { aum_gte: 5_000_000, entity_type: 'INDIVIDUAL', kyc_status: 'VERIFIED' },
      is_active: true,
      ...AUD,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WAVE 14 — CRM: child tables (depend on parent CRM rows above)
  // ══════════════════════════════════════════════════════════════════════════

  await seed('leadListMembers', async () => {
    if (await any(s.leadListMembers)) return;
    await db.insert(s.leadListMembers).values({
      lead_list_id: leadListId,
      lead_id: leadId,
      is_removed: false,
      added_at: new Date(),
      added_by: 'SYSTEM',
    });
  });

  await seed('campaignLists', async () => {
    if (await any(s.campaignLists)) return;
    await db.insert(s.campaignLists).values({
      campaign_id: campaignId,
      lead_list_id: leadListId,
      assigned_at: new Date(),
      assigned_by: 'SYSTEM',
    });
  });

  await seed('campaignResponses', async () => {
    if (await any(s.campaignResponses)) return;
    await db.insert(s.campaignResponses).values({
      campaign_id: campaignId,
      lead_id: leadId,
      response_type: 'INTERESTED',
      response_date: new Date(),
      follow_up_required: true,
      ...AUD,
    });
  });

  await seed('campaignCommunications', async () => {
    if (await any(s.campaignCommunications)) return;
    await db.insert(s.campaignCommunications).values({
      campaign_id: campaignId,
      channel: 'EMAIL',
      body: 'Dear Client, we would like to inform you about our trust fee structure...',
      dispatch_status: 'SENT',
      total_recipients: 1,
      delivered_count: 1,
      bounced_count: 0,
      ...AUD,
    });
  });

  await seed('campaignTranslations', async () => {
    if (await any(s.campaignTranslations)) return;
    await db.insert(s.campaignTranslations).values({
      campaign_id: campaignId,
      locale: 'fil',
      name: 'Kampanya sa Bayarin ng Tiwala',
      ...AUD,
    });
  });

  await seed('meetingInvitees', async () => {
    if (await any(s.meetingInvitees)) return;
    await db.insert(s.meetingInvitees).values({
      meeting_id: meetingId,
      user_id: r.userId,
      rsvp_status: 'ACCEPTED',
      is_required: true,
      attended: true,
      ...AUD,
    });
  });

  let callReportId = 1;
  await seed('callReports', async () => {
    if (await any(s.callReports)) { const [c] = await db.select().from(s.callReports).limit(1); callReportId = c!.id; return; }
    const [c] = await db.insert(s.callReports).values({
      report_code: 'CR-SEED-001',
      report_type: 'MEETING_LINKED',
      meeting_id: meetingId,
      filed_by: r.userId,
      meeting_date: new Date('2024-05-10'),
      meeting_type: 'CLIENT_REVIEW',
      subject: 'Quarterly portfolio review and trust fee discussion',
      summary: 'Client satisfied with portfolio performance. Discussed upcoming trust fee changes.',
      report_status: 'SUBMITTED',
      ...AUD,
    }).returning({ id: s.callReports.id });
    callReportId = c!.id;
  });

  await seed('callReportFeedback', async () => {
    if (await any(s.callReportFeedback)) return;
    await db.insert(s.callReportFeedback).values({
      call_report_id: callReportId,
      feedback_by: r.userId,
      feedback_type: 'QUALITY_RATING',
      comment: 'Well-documented call report with clear action items',
      sentiment: 'POSITIVE',
      is_private: false,
      source: 'SYSTEM',
      created_at: new Date(),
      tenant_id: 'default',
    } as any);
  });

  await seed('actionItems', async () => {
    if (await any(s.actionItems)) return;
    await db.insert(s.actionItems).values({
      call_report_id: callReportId,
      description: 'Send updated trust fee schedule to client',
      assigned_to: r.userId,
      due_date: new Date(Date.now() + 7 * 86_400_000),
      priority: 'HIGH',
      action_status: 'OPEN',
      ...AUD,
    });
  });

  await seed('callReportApprovals', async () => {
    if (await any(s.callReportApprovals)) return;
    await db.insert(s.callReportApprovals).values({
      call_report_id: callReportId,
      supervisor_id: r.userId,
      action: 'APPROVE',
      ...AUD,
    });
  });

  await seed('conversationHistory', async () => {
    if (await any(s.conversationHistory)) return;
    await db.insert(s.conversationHistory).values({
      lead_id: leadId,
      interaction_type: 'MEETING_COMPLETED',
      interaction_date: new Date('2024-04-20'),
      summary: 'Initial discovery meeting – client expressed interest in UITF products',
      created_at: new Date(),
      created_by: 'SYSTEM',
      tenant_id: 'default',
    } as any);
  });

  await seed('crmExpenses', async () => {
    if (await any(s.crmExpenses)) return;
    await db.insert(s.crmExpenses).values({
      expense_ref: 'EXP-SEED-001',
      call_report_id: callReportId,
      expense_type: 'ENTERTAINMENT',
      amount: 2_500,
      currency: 'PHP',
      expense_date: new Date('2024-05-10'),
      description: 'Business lunch with client during quarterly review',
      expense_status: 'APPROVED',
      submitted_by: r.userId,
      ...AUD,
    });
  });

  await seed('rmHandovers', async () => {
    if (await any(s.rmHandovers)) return;
    await db.insert(s.rmHandovers).values({
      handover_type: 'PERMANENT',
      entity_type: 'CLIENT',
      entity_id: r.clientId,
      from_rm_id: r.userId,
      to_rm_id: r.userId,
      reason: 'Branch transfer',
      effective_date: new Date('2024-04-01'),
      handover_status: 'COMPLETED',
      ...AUD,
    });
  });

  await seed('leadListGenerationJobs', async () => {
    if (await any(s.leadListGenerationJobs)) return;
    await db.insert(s.leadListGenerationJobs).values({
      lead_list_id: leadListId,
      job_status: 'COMPLETED',
      matched_count: 1,
      ...AUD,
    });
  });

  await seed('leadFamilyMembers', async () => {
    if (await any(s.leadFamilyMembers)) return;
    await db.insert(s.leadFamilyMembers).values({
      lead_id: leadId,
      relationship: 'SPOUSE',
      first_name: 'Ana',
      last_name: 'Dela Cruz',
      ...AUD,
    });
  });

  await seed('leadAddresses', async () => {
    if (await any(s.leadAddresses)) return;
    await db.insert(s.leadAddresses).values({
      lead_id: leadId,
      address_type: 'HOME',
      address_line_1: '123 Rizal Avenue',
      city: 'Makati',
      country: 'PH',
      is_primary: true,
      ...AUD,
    });
  });

  await seed('leadIdentifications', async () => {
    if (await any(s.leadIdentifications)) return;
    await db.insert(s.leadIdentifications).values({
      lead_id: leadId,
      id_type: 'SSS',
      id_number: '33-1234567-8',
      ...AUD,
    });
  });

  await seed('leadLifestyle', async () => {
    if (await any(s.leadLifestyle)) return;
    await db.insert(s.leadLifestyle).values({
      lead_id: leadId,
      hobbies: ['golf', 'travel', 'photography'],
      ...AUD,
    });
  });

  await seed('leadDocuments', async () => {
    if (await any(s.leadDocuments)) return;
    await db.insert(s.leadDocuments).values({
      lead_id: leadId,
      document_type: 'VALID_ID',
      file_name: 'juan-passport.pdf',
      file_url: '/uploads/leads/juan-passport.pdf',
      ...AUD,
    });
  });

  await seed('prospectFamilyMembers', async () => {
    if (await any(s.prospectFamilyMembers)) return;
    await db.insert(s.prospectFamilyMembers).values({
      prospect_id: prospectId,
      relationship: 'CHILD',
      first_name: 'Marco',
      last_name: 'Santos',
      ...AUD,
    });
  });

  await seed('prospectAddresses', async () => {
    if (await any(s.prospectAddresses)) return;
    await db.insert(s.prospectAddresses).values({
      prospect_id: prospectId,
      address_type: 'OFFICE',
      address_line_1: '456 Ayala Avenue',
      city: 'Makati',
      country: 'PH',
      is_primary: true,
      ...AUD,
    });
  });

  await seed('prospectIdentifications', async () => {
    if (await any(s.prospectIdentifications)) return;
    await db.insert(s.prospectIdentifications).values({
      prospect_id: prospectId,
      id_type: 'PASSPORT',
      id_number: 'PH-PP-987654321',
      ...AUD,
    });
  });

  await seed('prospectLifestyle', async () => {
    if (await any(s.prospectLifestyle)) return;
    await db.insert(s.prospectLifestyle).values({
      prospect_id: prospectId,
      hobbies: ['tennis', 'reading'],
      ...AUD,
    });
  });

  await seed('prospectDocuments', async () => {
    if (await any(s.prospectDocuments)) return;
    await db.insert(s.prospectDocuments).values({
      prospect_id: prospectId,
      document_type: 'VALID_ID',
      file_name: 'maria-passport.pdf',
      file_url: '/uploads/prospects/maria-passport.pdf',
      ...AUD,
    });
  });

  await seed('dedupeOverrides', async () => {
    if (await any(s.dedupeOverrides)) return;
    await db.insert(s.dedupeOverrides).values({
      entity_type: 'LEAD',
      entity_id: String(leadId),
      matched_entity_type: 'LEAD',
      matched_entity_id: String(leadId),
      override_reason: 'Same person; different nickname detected by system',
      override_user_id: r.userId,
      ...AUD,
    });
  });

  await seed('conversionHistory', async () => {
    if (await any(s.conversionHistory)) return;
    await db.insert(s.conversionHistory).values({
      source_entity_type: 'LEAD',
      source_entity_id: String(leadId),
      target_entity_type: 'PROSPECT',
      converted_by: r.userId,
      ...AUD,
    });
  });

  await seed('uploadLogs', async () => {
    if (await any(s.uploadLogs)) return;
    await db.insert(s.uploadLogs).values({
      upload_type: 'LEAD_LIST',
      file_name: 'seed-leads.csv',
      upload_status: 'COMPLETED',
      ...AUD,
    });
  });

  await seed('rmHistory', async () => {
    if (await any(s.rmHistory)) return;
    await db.insert(s.rmHistory).values({
      entity_type: 'CLIENT',
      entity_id: r.userId,
      new_rm_id: r.userId,
      change_type: 'INITIAL_ASSIGNMENT',
      effective_date: new Date('2024-01-01'),
      ...AUD,
    });
  });

  await seed('opportunities', async () => {
    if (await any(s.opportunities)) return;
    await db.insert(s.opportunities).values({
      opportunity_code: 'OPP-SEED-001',
      name: 'UITF Investment – Juan Dela Cruz',
      lead_id: leadId,
      stage: 'PROPOSAL',
      ...AUD,
    });
  });

  await seed('crmTasks', async () => {
    if (await any(s.crmTasks)) return;
    await db.insert(s.crmTasks).values({
      task_code: 'TSK-SEED-001',
      title: 'Follow up on UITF proposal',
      priority: 'HIGH',
      task_status: 'OPEN',
      assigned_to: r.userId,
      ...AUD,
    });
  });

  await seed('crmNotifications', async () => {
    if (await any(s.crmNotifications)) return;
    await db.insert(s.crmNotifications).values({
      recipient_user_id: r.userId,
      type: 'TASK_DUE',
      title: 'Task due tomorrow: Follow up on UITF proposal',
      channel: 'IN_APP',
      is_read: false,
      ...AUD,
    });
  });

  console.log('\n[seed-group-c] Done.');
}

export { main as seedGroupC };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-group-c] Fatal:', err);
      process.exit(1);
    });
}
