/**
 * Seed TrustFees Pro Operational Data
 *
 * Adds sample operational data (fee plans, accruals, invoices, payments,
 * exceptions, overrides, PII classifications, audit events) on top of the
 * base reference data already seeded by seed-reference-data.ts.
 *
 * Safe to run multiple times — uses idempotent checks before inserts.
 *
 * Usage (standalone):
 *   npx tsx server/scripts/seed-trustfees-pro.ts
 *
 * Or called from seed-reference-data.ts as the final step.
 */

import 'dotenv/config';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helper: date math
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function seedTrustFeesProData() {
  console.log('Seeding TrustFees Pro operational data...');

  // =========================================================================
  // 1. Look up existing reference data IDs
  // =========================================================================

  const pricingDefs = await db.select().from(schema.pricingDefinitions).limit(5);
  const eligExprs = await db.select().from(schema.eligibilityExpressions).limit(4);
  const schedules = await db.select().from(schema.accrualSchedules).limit(3);
  const jurisdictions = await db.select().from(schema.jurisdictions).limit(2);
  const templates = await db.select().from(schema.feePlanTemplates).limit(5);

  if (pricingDefs.length === 0) {
    console.warn('  No pricing definitions found — skipping TFP operational seed (run base seed first).');
    return;
  }

  const phJurisdictionId = jurisdictions[0]?.id ?? 1;
  const sgJurisdictionId = jurisdictions[1]?.id ?? phJurisdictionId;

  // =========================================================================
  // 2. Create 5 sample Fee Plans (ACTIVE)
  // =========================================================================

  console.log('  Seeding fee plans...');

  const feePlansData = [
    {
      fee_plan_code: 'TRUST_DISC_DFLT',
      fee_plan_name: 'Discretionary Trust Default',
      description: 'Standard discretionary trust management fee — tiered cumulative slab on AUM',
      charge_basis: 'PERIOD' as const,
      fee_type: 'TRUST' as const,
      jurisdiction_id: phJurisdictionId,
      pricing_definition_id: pricingDefs[0]?.id ?? 1,
      pricing_binding_mode: 'STRICT' as const,
      pricing_binding_version: 1,
      eligibility_expression_id: eligExprs[0]?.id ?? 1,
      accrual_schedule_id: schedules[0]?.id ?? 1,
      source_party: 'INVESTOR' as const,
      target_party: 'BANK' as const,
      comparison_basis: 'AUM' as const,
      value_basis: 'AUM' as const,
      rate_type: 'ANNUALIZED' as const,
      effective_date: '2026-01-01',
      plan_status: 'ACTIVE' as const,
      template_id: templates[0]?.id ?? undefined,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      fee_plan_code: 'TRUST_DIR_BOND',
      fee_plan_name: 'Directional Trust — Bond',
      description: 'Directed bond trust management fee — fixed rate on face value',
      charge_basis: 'PERIOD' as const,
      fee_type: 'TRUST' as const,
      jurisdiction_id: phJurisdictionId,
      pricing_definition_id: pricingDefs[3]?.id ?? pricingDefs[0]?.id ?? 1,
      pricing_binding_mode: 'STRICT' as const,
      pricing_binding_version: 1,
      eligibility_expression_id: eligExprs[1]?.id ?? eligExprs[0]?.id ?? 1,
      accrual_schedule_id: schedules[1]?.id ?? schedules[0]?.id ?? 1,
      source_party: 'INVESTOR' as const,
      target_party: 'BANK' as const,
      comparison_basis: 'AUM' as const,
      value_basis: 'FACE_VALUE' as const,
      rate_type: 'ANNUALIZED' as const,
      effective_date: '2026-01-01',
      plan_status: 'ACTIVE' as const,
      template_id: templates[3]?.id ?? undefined,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      fee_plan_code: 'CUSTODY_STD_PH',
      fee_plan_name: 'Custody Fee — Standard PH',
      description: 'Standard custody fee for Philippine onshore accounts — 3-tier slab',
      charge_basis: 'PERIOD' as const,
      fee_type: 'CUSTODY' as const,
      jurisdiction_id: phJurisdictionId,
      pricing_definition_id: pricingDefs[0]?.id ?? 1,
      pricing_binding_mode: 'LATEST_APPROVED' as const,
      eligibility_expression_id: eligExprs[0]?.id ?? 1,
      accrual_schedule_id: schedules[0]?.id ?? 1,
      source_party: 'INVESTOR' as const,
      target_party: 'BANK' as const,
      comparison_basis: 'AUM' as const,
      value_basis: 'AUM' as const,
      rate_type: 'ANNUALIZED' as const,
      effective_date: '2026-01-01',
      plan_status: 'ACTIVE' as const,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      fee_plan_code: 'ESCROW_BUYSELL_PH',
      fee_plan_name: 'Escrow Buy-Sell — Step Function',
      description: 'Buy-sell escrow fee with 3-month step (60k initial, 10k recurring)',
      charge_basis: 'PERIOD' as const,
      fee_type: 'ESCROW' as const,
      jurisdiction_id: phJurisdictionId,
      pricing_definition_id: pricingDefs[2]?.id ?? pricingDefs[0]?.id ?? 1,
      pricing_binding_mode: 'STRICT' as const,
      pricing_binding_version: 1,
      eligibility_expression_id: eligExprs[0]?.id ?? 1,
      accrual_schedule_id: schedules[2]?.id ?? schedules[0]?.id ?? 1,
      source_party: 'INVESTOR' as const,
      target_party: 'BANK' as const,
      comparison_basis: 'AUM' as const,
      value_basis: 'PRINCIPAL' as const,
      rate_type: 'FLAT' as const,
      effective_date: '2026-01-01',
      plan_status: 'ACTIVE' as const,
      template_id: templates[1]?.id ?? undefined,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      fee_plan_code: 'EQ_BROKERAGE_SG',
      fee_plan_name: 'Equity Brokerage Commission — SG',
      description: 'Per-trade equity brokerage commission for Singapore segment',
      charge_basis: 'EVENT' as const,
      fee_type: 'COMMISSION' as const,
      jurisdiction_id: sgJurisdictionId,
      pricing_definition_id: pricingDefs[4]?.id ?? pricingDefs[0]?.id ?? 1,
      pricing_binding_mode: 'STRICT' as const,
      pricing_binding_version: 1,
      eligibility_expression_id: eligExprs[2]?.id ?? eligExprs[0]?.id ?? 1,
      accrual_schedule_id: schedules[0]?.id ?? 1,
      source_party: 'INVESTOR' as const,
      target_party: 'BROKER' as const,
      comparison_basis: 'TXN_AMOUNT' as const,
      value_basis: 'TXN_AMOUNT' as const,
      event_type: 'BUY' as const,
      rate_type: 'FLAT' as const,
      effective_date: '2026-01-01',
      plan_status: 'ACTIVE' as const,
      template_id: templates[4]?.id ?? undefined,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  let feePlanIds: number[] = [];

  for (const fp of feePlansData) {
    const existing = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.fee_plan_code, fp.fee_plan_code))
      .limit(1);

    if (existing.length > 0) {
      feePlanIds.push(existing[0].id);
      continue;
    }

    const [inserted] = await db
      .insert(schema.feePlans)
      .values(fp as any)
      .returning({ id: schema.feePlans.id });

    feePlanIds.push(inserted.id);
  }

  console.log(`    ${feePlanIds.length} fee plans ready (IDs: ${feePlanIds.join(', ')})`);

  // =========================================================================
  // 3. Create 10 sample accruals across different plans and dates (last 7 days)
  // =========================================================================

  console.log('  Seeding accruals...');

  const customerIds = ['CUST-001', 'CUST-002', 'CUST-003', 'CUST-004', 'CUST-005'];
  const portfolioIds = ['PF-001', 'PF-002', 'PF-003', 'PF-004', 'PF-005'];

  const accrualRows = [
    // Plan 0 (TRUST_DISC_DFLT) — daily accruals for CUST-001
    { planIdx: 0, custIdx: 0, pfIdx: 0, daysBack: 7, base: '25000000.0000', computed: '1027.3973', applied: '1027.3973', status: 'OPEN' as const },
    { planIdx: 0, custIdx: 0, pfIdx: 0, daysBack: 6, base: '25100000.0000', computed: '1031.5068', applied: '1031.5068', status: 'OPEN' as const },
    { planIdx: 0, custIdx: 0, pfIdx: 0, daysBack: 5, base: '24800000.0000', computed: '1019.1781', applied: '1019.1781', status: 'OPEN' as const },
    // Plan 1 (TRUST_DIR_BOND) — daily accruals for CUST-002
    { planIdx: 1, custIdx: 1, pfIdx: 1, daysBack: 7, base: '50000000.0000', computed: '1369.8630', applied: '1369.8630', status: 'INVOICED' as const },
    { planIdx: 1, custIdx: 1, pfIdx: 1, daysBack: 6, base: '50000000.0000', computed: '1369.8630', applied: '1369.8630', status: 'INVOICED' as const },
    // Plan 2 (CUSTODY_STD_PH) — CUST-003
    { planIdx: 2, custIdx: 2, pfIdx: 2, daysBack: 4, base: '12000000.0000', computed: '460.2740', applied: '460.2740', status: 'OPEN' as const },
    { planIdx: 2, custIdx: 2, pfIdx: 2, daysBack: 3, base: '12050000.0000', computed: '462.1918', applied: '462.1918', status: 'OPEN' as const },
    // Plan 3 (ESCROW_BUYSELL_PH) — CUST-004
    { planIdx: 3, custIdx: 3, pfIdx: 3, daysBack: 2, base: '100000000.0000', computed: '10000.0000', applied: '10000.0000', status: 'ACCOUNTED' as const },
    // Plan 4 (EQ_BROKERAGE_SG) — CUST-005, event-based
    { planIdx: 4, custIdx: 4, pfIdx: 4, daysBack: 1, base: '2500000.0000', computed: '5500.0000', applied: '5500.0000', status: 'OPEN' as const },
    // Override scenario — CUST-001 with reduced fee
    { planIdx: 0, custIdx: 0, pfIdx: 0, daysBack: 4, base: '25200000.0000', computed: '1035.6164', applied: '900.0000', status: 'OPEN' as const },
  ];

  let accrualIds: number[] = [];

  for (let i = 0; i < accrualRows.length; i++) {
    const r = accrualRows[i];
    const accrualDate = daysAgo(r.daysBack);
    const idempotencyKey = `SEED-ACCRUAL-${String(i + 1).padStart(3, '0')}`;

    const existing = await db
      .select()
      .from(schema.tfpAccruals)
      .where(eq(schema.tfpAccruals.idempotency_key, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      accrualIds.push(existing[0].id);
      continue;
    }

    const [inserted] = await db
      .insert(schema.tfpAccruals)
      .values({
        fee_plan_id: feePlanIds[r.planIdx],
        customer_id: customerIds[r.custIdx],
        portfolio_id: portfolioIds[r.pfIdx],
        base_amount: r.base,
        computed_fee: r.computed,
        applied_fee: r.applied,
        currency: r.planIdx === 4 ? 'SGD' : 'PHP',
        accrual_date: accrualDate,
        accrual_status: r.status,
        idempotency_key: idempotencyKey,
        created_by: 'system-seed',
        updated_by: 'system-seed',
      })
      .returning({ id: schema.tfpAccruals.id });

    accrualIds.push(inserted.id);
  }

  console.log(`    ${accrualIds.length} accruals ready`);

  // =========================================================================
  // 4. Create 3 sample invoices (1 DRAFT, 1 ISSUED, 1 PAID with payment)
  // =========================================================================

  console.log('  Seeding invoices...');

  const invoicesData = [
    {
      invoice_number: 'INV-SEED-001',
      customer_id: 'CUST-001',
      jurisdiction_id: phJurisdictionId,
      currency: 'PHP',
      total_amount: '3078.0822',
      tax_amount: '369.3699',
      grand_total: '3447.4521',
      invoice_date: daysAgo(3),
      due_date: daysFromNow(17),
      invoice_status: 'DRAFT' as const,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      invoice_number: 'INV-SEED-002',
      customer_id: 'CUST-002',
      jurisdiction_id: phJurisdictionId,
      currency: 'PHP',
      total_amount: '2739.7260',
      tax_amount: '328.7671',
      grand_total: '3068.4931',
      invoice_date: daysAgo(10),
      due_date: daysFromNow(10),
      invoice_status: 'ISSUED' as const,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      invoice_number: 'INV-SEED-003',
      customer_id: 'CUST-003',
      jurisdiction_id: phJurisdictionId,
      currency: 'PHP',
      total_amount: '922.4658',
      tax_amount: '110.6959',
      grand_total: '1033.1617',
      invoice_date: daysAgo(20),
      due_date: daysAgo(1),
      invoice_status: 'PAID' as const,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  let invoiceIds: number[] = [];

  for (const inv of invoicesData) {
    const existing = await db
      .select()
      .from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.invoice_number, inv.invoice_number))
      .limit(1);

    if (existing.length > 0) {
      invoiceIds.push(existing[0].id);
      continue;
    }

    const [inserted] = await db
      .insert(schema.tfpInvoices)
      .values(inv as any)
      .returning({ id: schema.tfpInvoices.id });

    invoiceIds.push(inserted.id);
  }

  console.log(`    ${invoiceIds.length} invoices ready`);

  // =========================================================================
  // 4b. Create invoice lines linking accruals to invoices
  // =========================================================================

  console.log('  Seeding invoice lines...');

  // Link the INVOICED accruals (indices 3,4) to invoice 2 (INV-SEED-002)
  // Link the ACCOUNTED accrual (index 7) to invoice 3 (INV-SEED-003)
  const invoiceLineData = [
    {
      invoice_id: invoiceIds[1], // INV-SEED-002
      accrual_id: accrualIds[3], // INVOICED accrual from TRUST_DIR_BOND day -7
      description: 'Directional Trust — Bond fee accrual',
      quantity: '1.0000',
      unit_amount: '1369.8630',
      line_amount: '1369.8630',
      tax_code: 'VAT12',
      tax_amount: '164.3836',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      invoice_id: invoiceIds[1], // INV-SEED-002
      accrual_id: accrualIds[4], // INVOICED accrual from TRUST_DIR_BOND day -6
      description: 'Directional Trust — Bond fee accrual',
      quantity: '1.0000',
      unit_amount: '1369.8630',
      line_amount: '1369.8630',
      tax_code: 'VAT12',
      tax_amount: '164.3836',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      invoice_id: invoiceIds[2], // INV-SEED-003
      accrual_id: accrualIds[5], // Custody accrual
      description: 'Custody Fee — Standard PH accrual',
      quantity: '1.0000',
      unit_amount: '460.2740',
      line_amount: '460.2740',
      tax_code: 'VAT12',
      tax_amount: '55.2329',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      invoice_id: invoiceIds[2], // INV-SEED-003
      accrual_id: accrualIds[6], // Custody accrual day -3
      description: 'Custody Fee — Standard PH accrual',
      quantity: '1.0000',
      unit_amount: '462.1918',
      line_amount: '462.1918',
      tax_code: 'VAT12',
      tax_amount: '55.4630',
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  for (const line of invoiceLineData) {
    // Check if this exact line already exists (by invoice_id + accrual_id)
    const existing = await db
      .select()
      .from(schema.tfpInvoiceLines)
      .where(
        sql`${schema.tfpInvoiceLines.invoice_id} = ${line.invoice_id} AND ${schema.tfpInvoiceLines.accrual_id} = ${line.accrual_id}`,
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.tfpInvoiceLines).values(line as any);
    }
  }

  console.log('    Invoice lines ready');

  // =========================================================================
  // 4c. Create a payment for the PAID invoice (INV-SEED-003)
  // =========================================================================

  console.log('  Seeding payments...');

  const paymentRefNo = 'PAY-SEED-001';
  const existingPayment = await db
    .select()
    .from(schema.tfpPayments)
    .where(eq(schema.tfpPayments.reference_no, paymentRefNo))
    .limit(1);

  if (existingPayment.length === 0) {
    await db.insert(schema.tfpPayments).values({
      invoice_id: invoiceIds[2], // INV-SEED-003
      amount: '1033.1617',
      currency: 'PHP',
      payment_date: daysAgo(1),
      method: 'DEBIT_MEMO' as const,
      reference_no: paymentRefNo,
      payment_status: 'POSTED' as const,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    });
  }

  console.log('    Payment ready');

  // =========================================================================
  // 5. Create 2 sample exceptions (1 OPEN P1, 1 IN_PROGRESS P2)
  // =========================================================================

  console.log('  Seeding exceptions...');

  const exceptionsData = [
    {
      exception_type: 'MISSING_FX' as const,
      severity: 'P1' as const,
      customer_id: 'CUST-005',
      source_aggregate_type: 'TFP_ACCRUAL',
      source_aggregate_id: String(accrualIds[8] ?? 'SEED-ACCRUAL-009'),
      title: 'Missing FX rate for SGD/PHP on accrual date',
      details: {
        fee_plan_code: 'EQ_BROKERAGE_SG',
        accrual_date: daysAgo(1),
        missing_pair: 'SGD/PHP',
        impact: 'Cannot convert SGD accrual to PHP for consolidated reporting',
      },
      assigned_to_team: 'FX_OPS',
      exception_status: 'OPEN' as const,
      sla_due_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      exception_type: 'ACCRUAL_MISMATCH' as const,
      severity: 'P2' as const,
      customer_id: 'CUST-001',
      source_aggregate_type: 'TFP_ACCRUAL',
      source_aggregate_id: String(accrualIds[9] ?? 'SEED-ACCRUAL-010'),
      title: 'Accrual amount exceeds upper threshold after override',
      details: {
        fee_plan_code: 'TRUST_DISC_DFLT',
        accrual_date: daysAgo(4),
        computed_fee: '1035.6164',
        applied_fee: '900.0000',
        delta_pct: '-13.09',
        threshold_pct: '40.00',
        override_reason: 'Client negotiation discount — under review',
      },
      assigned_to_team: 'FEE_OPS',
      assigned_to_user: 'jcruz',
      exception_status: 'IN_PROGRESS' as const,
      sla_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  for (const exc of exceptionsData) {
    // Idempotent check by title + source_aggregate_id
    const existing = await db
      .select()
      .from(schema.exceptionItems)
      .where(
        sql`${schema.exceptionItems.source_aggregate_id} = ${exc.source_aggregate_id} AND ${schema.exceptionItems.title} = ${exc.title}`,
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.exceptionItems).values(exc as any);
    }
  }

  console.log('    Exceptions ready');

  // =========================================================================
  // 6. Create 2 sample overrides (1 AUTO_APPROVED, 1 PENDING)
  // =========================================================================

  console.log('  Seeding overrides...');

  const overridesData = [
    {
      stage: 'ACCRUAL' as const,
      accrual_id: accrualIds[9] ?? null, // The override-scenario accrual
      original_amount: '1035.6164',
      overridden_amount: '900.0000',
      delta_pct: '-13.090000',
      reason_code: 'CLIENT_NEGOTIATION',
      reason_notes: 'Approved per client annual fee negotiation agreement ref FN-2026-0042',
      requested_by: 'jcruz',
      approved_by: 'mreyes',
      override_status: 'AUTO_APPROVED' as const,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
    {
      stage: 'INVOICE' as const,
      invoice_id: invoiceIds[0] ?? null, // DRAFT invoice
      original_amount: '3447.4521',
      overridden_amount: '3200.0000',
      delta_pct: '-7.178000',
      reason_code: 'GOODWILL_CREDIT',
      reason_notes: 'Goodwill adjustment for delayed statement delivery — pending supervisor approval',
      requested_by: 'anavarro',
      override_status: 'PENDING' as const,
      created_by: 'system-seed',
      updated_by: 'system-seed',
    },
  ];

  for (const ovr of overridesData) {
    // Idempotent check by reason_notes (unique enough for seed data)
    const existing = await db
      .select()
      .from(schema.feeOverrides)
      .where(eq(schema.feeOverrides.reason_notes, ovr.reason_notes))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.feeOverrides).values(ovr as any);
    }
  }

  console.log('    Overrides ready');

  // =========================================================================
  // 7. Create sample audit events
  // =========================================================================

  console.log('  Seeding audit events...');

  const auditEventsData = [
    {
      aggregate_type: 'FEE_PLAN',
      aggregate_id: String(feePlanIds[0] ?? 1),
      event_type: 'FEE_PLAN_CREATED',
      payload: { fee_plan_code: 'TRUST_DISC_DFLT', created_via: 'seed-script' },
      actor_id: 'system-seed',
    },
    {
      aggregate_type: 'FEE_PLAN',
      aggregate_id: String(feePlanIds[0] ?? 1),
      event_type: 'FEE_PLAN_ACTIVATED',
      payload: { fee_plan_code: 'TRUST_DISC_DFLT', previous_status: 'DRAFT', new_status: 'ACTIVE' },
      actor_id: 'system-seed',
    },
    {
      aggregate_type: 'TFP_ACCRUAL',
      aggregate_id: String(accrualIds[0] ?? 1),
      event_type: 'ACCRUAL_COMPUTED',
      payload: {
        fee_plan_code: 'TRUST_DISC_DFLT',
        customer_id: 'CUST-001',
        base_amount: '25000000.0000',
        computed_fee: '1027.3973',
        accrual_date: daysAgo(7),
      },
      actor_id: 'eod-engine',
    },
    {
      aggregate_type: 'TFP_INVOICE',
      aggregate_id: String(invoiceIds[1] ?? 2),
      event_type: 'INVOICE_ISSUED',
      payload: {
        invoice_number: 'INV-SEED-002',
        customer_id: 'CUST-002',
        grand_total: '3068.4931',
        line_count: 2,
      },
      actor_id: 'eod-engine',
    },
    {
      aggregate_type: 'TFP_INVOICE',
      aggregate_id: String(invoiceIds[2] ?? 3),
      event_type: 'INVOICE_PAID',
      payload: {
        invoice_number: 'INV-SEED-003',
        customer_id: 'CUST-003',
        payment_method: 'DEBIT_MEMO',
        payment_ref: 'PAY-SEED-001',
      },
      actor_id: 'system-seed',
    },
    {
      aggregate_type: 'FEE_OVERRIDE',
      aggregate_id: '1',
      event_type: 'OVERRIDE_AUTO_APPROVED',
      payload: {
        stage: 'ACCRUAL',
        delta_pct: '-13.09%',
        reason_code: 'CLIENT_NEGOTIATION',
        approved_by: 'mreyes',
      },
      actor_id: 'system-seed',
    },
  ];

  // Only insert if we have fewer than expected audit events from seed
  const existingSeedAudits = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.actor_id, 'system-seed'));
  const seedAuditCount = Number(existingSeedAudits[0]?.count ?? 0);

  if (seedAuditCount < auditEventsData.length) {
    for (const evt of auditEventsData) {
      await db.insert(schema.auditEvents).values(evt);
    }
    console.log(`    ${auditEventsData.length} audit events inserted`);
  } else {
    console.log('    Audit events already seeded');
  }

  // =========================================================================
  // 8. Create PII classifications for customer fields
  // =========================================================================

  console.log('  Seeding PII classifications...');

  const piiData = [
    { aggregate_type: 'CUSTOMER', field_path: 'full_name', classification: 'PII' as const, redaction_rule: 'MASK' as const },
    { aggregate_type: 'CUSTOMER', field_path: 'email', classification: 'PII' as const, redaction_rule: 'MASK' as const },
    { aggregate_type: 'CUSTOMER', field_path: 'phone', classification: 'PII' as const, redaction_rule: 'MASK' as const },
    { aggregate_type: 'CUSTOMER', field_path: 'tax_id', classification: 'SPI' as const, redaction_rule: 'HASH' as const },
    { aggregate_type: 'CUSTOMER', field_path: 'bank_account_number', classification: 'FINANCIAL_PII' as const, redaction_rule: 'TOKENIZE' as const },
    { aggregate_type: 'CUSTOMER', field_path: 'address', classification: 'PII' as const, redaction_rule: 'MASK' as const },
    { aggregate_type: 'TFP_INVOICE', field_path: 'customer_id', classification: 'PII' as const, redaction_rule: 'NONE' as const },
    { aggregate_type: 'TFP_ACCRUAL', field_path: 'customer_id', classification: 'PII' as const, redaction_rule: 'NONE' as const },
  ];

  for (const pii of piiData) {
    const existing = await db
      .select()
      .from(schema.piiClassifications)
      .where(
        sql`${schema.piiClassifications.aggregate_type} = ${pii.aggregate_type} AND ${schema.piiClassifications.field_path} = ${pii.field_path}`,
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.piiClassifications).values({
        ...pii,
        created_by: 'system-seed',
        updated_by: 'system-seed',
      } as any);
    }
  }

  console.log('    PII classifications ready');

  // =========================================================================
  // Done
  // =========================================================================

  console.log('TrustFees Pro operational data seeded successfully.');
}

// ---------------------------------------------------------------------------
// Standalone execution
// ---------------------------------------------------------------------------

if (require.main === module) {
  seedTrustFeesProData()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('TrustFees Pro seed failed:', err);
      process.exit(1);
    });
}
