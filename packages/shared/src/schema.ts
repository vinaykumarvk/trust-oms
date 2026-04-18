// ============================================================================
// TrustOMS Philippines - Complete Core Database Schema (Phase 0B)
// Drizzle ORM + PostgreSQL
// ============================================================================

import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  jsonb,
  bigserial,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// PostgreSQL Enums
// ============================================================================

export const trustProductTypeEnum = pgEnum('trust_product_type', [
  'IMA_DIRECTED',
  'IMA_DISCRETIONARY',
  'PMT',
  'UITF',
  'PRE_NEED',
  'EMPLOYEE_BENEFIT',
  'ESCROW',
  'AGENCY',
  'SAFEKEEPING',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'DRAFT',
  'PENDING_AUTH',
  'AUTHORIZED',
  'REJECTED',
  'AGGREGATED',
  'PLACED',
  'PARTIALLY_FILLED',
  'FILLED',
  'CONFIRMED',
  'SETTLED',
  'REVERSAL_PENDING',
  'REVERSED',
  'CANCELLED',
]);

export const orderSideEnum = pgEnum('order_side', ['BUY', 'SELL']);

export const orderTypeEnum = pgEnum('order_type', ['MARKET', 'LIMIT', 'STOP']);

export const piiClassificationEnum = pgEnum('pii_classification', [
  'NONE',
  'PII',
  'SENSITIVE_PII',
  'FINANCIAL_PII',
]);

export const dataResidencyEnum = pgEnum('data_residency', [
  'PH_ONLY',
  'ALLOWED_OFFSHORE',
]);

export const approvalStatusEnum = pgEnum('approval_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'ACCESS',
  'EXPORT',
  'AUTHORIZE',
  'REJECT',
  'REVERSE',
]);

export const riskProfileEnum = pgEnum('risk_profile', [
  'CONSERVATIVE',
  'MODERATE',
  'BALANCED',
  'GROWTH',
  'AGGRESSIVE',
]);

export const kycStatusEnum = pgEnum('kyc_status', [
  'PENDING',
  'VERIFIED',
  'EXPIRED',
  'REJECTED',
]);

export const settlementStatusEnum = pgEnum('settlement_status', [
  'PENDING',
  'MATCHED',
  'FAILED',
  'SETTLED',
  'REVERSED',
]);

export const feeTypeEnum = pgEnum('fee_type_enum', [
  'TRUSTEE',
  'MANAGEMENT',
  'CUSTODY',
  'PERFORMANCE',
  'UITF_TER',
]);

export const taxTypeEnum = pgEnum('tax_type', [
  'WHT',
  'FATCA',
  'CRS',
]);

export const corporateActionTypeEnum = pgEnum('corporate_action_type', [
  'DIVIDEND_CASH',
  'DIVIDEND_STOCK',
  'SPLIT',
  'REVERSE_SPLIT',
  'RIGHTS',
  'MERGER',
  'TENDER',
  'BONUS',
]);

export const surveillancePatternEnum = pgEnum('surveillance_pattern', [
  'LAYERING',
  'SPOOFING',
  'WASH_TRADING',
  'FRONT_RUNNING',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'IN_APP',
  'EMAIL',
  'SMS',
  'PUSH',
  'PAGER_DUTY',
]);

export const makerCheckerTierEnum = pgEnum('maker_checker_tier', [
  'TWO_EYES',
  'FOUR_EYES',
  'SIX_EYES',
]);

export const timeInForceTypeEnum = pgEnum('time_in_force_type', ['DAY', 'GTC', 'IOC', 'FOK']);
export const paymentModeTypeEnum = pgEnum('payment_mode_type', ['DEBIT_CA_SA', 'CASH', 'CHEQUE', 'WIRE_TRANSFER']);
export const disposalMethodEnum = pgEnum('disposal_method', ['FIFO', 'LIFO', 'WEIGHTED_AVG', 'SPECIFIC_LOT', 'HIGHEST_COST']);
export const validationSeverityEnum = pgEnum('validation_severity', ['HARD', 'SOFT']);
export const scheduledPlanTypeEnum = pgEnum('scheduled_plan_type', ['EIP', 'ERP']);
export const scheduledPlanStatusEnum = pgEnum('scheduled_plan_status', ['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']);
export const peraTransactionTypeEnum = pgEnum('pera_transaction_type', ['CONTRIBUTION', 'QUALIFIED_WITHDRAWAL', 'UNQUALIFIED_WITHDRAWAL', 'TRANSFER_PRODUCT', 'TRANSFER_ADMIN', 'TCC']);
export const standingInstructionTypeEnum = pgEnum('standing_instruction_type', ['AUTO_ROLL', 'AUTO_CREDIT', 'AUTO_WITHDRAWAL']);
export const rebalancingStatusEnum = pgEnum('rebalancing_status', ['DRAFT', 'APPROVED', 'EXECUTED', 'CANCELLED']);

// ============================================================================
// Helper: Audit fields added to every table
// ============================================================================

const auditFields = {
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  created_by: text('created_by'),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updated_by: text('updated_by'),
  version: integer('version').default(1).notNull(),
  status: text('status').default('active').notNull(),
  is_deleted: boolean('is_deleted').default(false).notNull(),
  tenant_id: text('tenant_id').default('default').notNull(),
  correlation_id: text('correlation_id'),
  audit_hash: text('audit_hash'),
};

// ============================================================================
// 1. IAM (Identity & Access Management)
// ============================================================================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').unique(),
  password_hash: text('password_hash'),
  full_name: text('full_name'),
  email: text('email').unique(),
  role: text('role'),
  department: text('department'),
  office: text('office'),
  branch_id: integer('branch_id'),
  is_active: boolean('is_active').default(true),
  mfa_enabled: boolean('mfa_enabled').default(false),
  last_login: timestamp('last_login', { withTimezone: true }),
  ...auditFields,
});

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').unique(),
  office: text('office'),
  description: text('description'),
  azure_ad_group: text('azure_ad_group'),
  ...auditFields,
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  role_id: integer('role_id').references(() => roles.id),
  resource: text('resource'),
  action: text('action'),
  conditions: jsonb('conditions'),
  ...auditFields,
});

export const userRoles = pgTable(
  'user_roles',
  {
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    role_id: integer('role_id')
      .notNull()
      .references(() => roles.id),
    ...auditFields,
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.role_id] }),
  ],
);

// ============================================================================
// 2. Client & KYC
// ============================================================================

export const clients = pgTable('clients', {
  client_id: text('client_id').primaryKey(),
  legal_name: text('legal_name'),
  type: text('type'),
  tin: text('tin'),
  birth_date: date('birth_date'),
  address: jsonb('address'),
  contact: jsonb('contact'),
  risk_profile: riskProfileEnum('risk_profile'),
  client_status: text('client_status'),
  ...auditFields,
});

export const clientProfiles = pgTable('client_profiles', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  risk_tolerance: text('risk_tolerance'),
  investment_horizon: text('investment_horizon'),
  knowledge_level: text('knowledge_level'),
  source_of_wealth: text('source_of_wealth'),
  income: numeric('income'),
  net_worth: numeric('net_worth'),
  ...auditFields,
});

export const kycCases = pgTable('kyc_cases', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  risk_rating: text('risk_rating'),
  kyc_status: kycStatusEnum('kyc_status'),
  id_number: text('id_number'),
  id_type: text('id_type'),
  expiry_date: date('expiry_date'),
  refresh_cadence_years: integer('refresh_cadence_years'),
  next_review_date: date('next_review_date'),
  ...auditFields,
});

export const beneficialOwners = pgTable('beneficial_owners', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  ubo_name: text('ubo_name'),
  ubo_tin: text('ubo_tin'),
  ownership_pct: numeric('ownership_pct'),
  verified: boolean('verified'),
  ...auditFields,
});

export const clientFatcaCrs = pgTable('client_fatca_crs', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  us_person: boolean('us_person'),
  reporting_jurisdictions: jsonb('reporting_jurisdictions'),
  tin_foreign: text('tin_foreign'),
  ...auditFields,
});

// ============================================================================
// 3. Portfolio & Mandate
// ============================================================================

export const portfolios = pgTable('portfolios', {
  portfolio_id: text('portfolio_id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  type: trustProductTypeEnum('type'),
  base_currency: text('base_currency'),
  aum: numeric('aum'),
  inception_date: date('inception_date'),
  portfolio_status: text('portfolio_status'),
  ...auditFields,
});

export const mandates = pgTable('mandates', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  min_allocation: jsonb('min_allocation'),
  max_allocation: jsonb('max_allocation'),
  restricted_securities: jsonb('restricted_securities'),
  benchmark_id: text('benchmark_id'),
  max_single_issuer_pct: numeric('max_single_issuer_pct'),
  max_sector_pct: numeric('max_sector_pct'),
  duration_band: text('duration_band'),
  credit_floor: text('credit_floor'),
  currency_constraints: jsonb('currency_constraints'),
  ...auditFields,
});

// ============================================================================
// 4. Securities & Counterparties
// ============================================================================

export const securities = pgTable('securities', {
  id: serial('id').primaryKey(),
  isin: text('isin'),
  cusip: text('cusip'),
  sedol: text('sedol'),
  bloomberg_ticker: text('bloomberg_ticker'),
  local_code: text('local_code'),
  name: text('name'),
  asset_class: text('asset_class'),
  sector: text('sector'),
  exchange: text('exchange'),
  currency: text('currency'),
  pricing_source_hierarchy: jsonb('pricing_source_hierarchy'),
  is_active: boolean('is_active').default(true),
  is_derivative: boolean('is_derivative').default(false),
  derivative_type: text('derivative_type'),
  underlying_security_id: integer('underlying_security_id'),
  embedded_derivative: boolean('embedded_derivative').default(false),
  consent_fee_pct: numeric('consent_fee_pct'),
  coupon_rate: numeric('coupon_rate'),
  maturity_date: date('maturity_date'),
  yield_rate: numeric('yield_rate'),
  coupon_frequency: integer('coupon_frequency'),
  ...auditFields,
});

export const counterparties = pgTable('counterparties', {
  id: serial('id').primaryKey(),
  name: text('name'),
  lei: text('lei'),
  bic: text('bic'),
  settlement_instructions: jsonb('settlement_instructions'),
  type: text('type'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const brokers = pgTable('brokers', {
  id: serial('id').primaryKey(),
  counterparty_id: integer('counterparty_id').references(() => counterparties.id),
  commission_schedule: jsonb('commission_schedule'),
  fix_session_config: jsonb('fix_session_config'),
  ...auditFields,
});

// ============================================================================
// 5. Order Lifecycle
// ============================================================================

export const orders = pgTable('orders', {
  order_id: text('order_id').primaryKey(),
  order_no: text('order_no').unique(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  type: orderTypeEnum('type'),
  side: orderSideEnum('side'),
  security_id: integer('security_id').references(() => securities.id),
  quantity: numeric('quantity'),
  limit_price: numeric('limit_price'),
  stop_price: numeric('stop_price'),
  currency: text('currency'),
  value_date: date('value_date'),
  reason_code: text('reason_code'),
  client_reference: text('client_reference'),
  order_status: orderStatusEnum('order_status'),
  authorization_tier: makerCheckerTierEnum('authorization_tier'),
  suitability_check_result: jsonb('suitability_check_result'),
  created_by_role: text('created_by_role'),
  time_in_force: timeInForceTypeEnum('time_in_force').default('DAY'),
  payment_mode: paymentModeTypeEnum('payment_mode'),
  trader_id: integer('trader_id').references(() => users.id),
  future_trade_date: date('future_trade_date'),
  disposal_method: disposalMethodEnum('disposal_method'),
  parent_order_id: text('parent_order_id'),
  scheduled_plan_id: integer('scheduled_plan_id'),
  transaction_ref_no: text('transaction_ref_no').unique(),
  ...auditFields,
});

export const orderAuthorizations = pgTable('order_authorizations', {
  id: serial('id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  tier: makerCheckerTierEnum('tier'),
  approver_id: integer('approver_id').references(() => users.id),
  approver_role: text('approver_role'),
  decision: text('decision'),
  comment: text('comment'),
  decided_at: timestamp('decided_at', { withTimezone: true }),
  ...auditFields,
});

// ============================================================================
// 6. Trade & Execution
// ============================================================================

export const blocks = pgTable('blocks', {
  block_id: text('block_id').primaryKey(),
  security_id: integer('security_id').references(() => securities.id),
  side: orderSideEnum('side'),
  total_qty: numeric('total_qty'),
  allocation_policy: text('allocation_policy'),
  block_status: text('block_status'),
  trader_id: integer('trader_id').references(() => users.id),
  ...auditFields,
});

export const trades = pgTable('trades', {
  trade_id: text('trade_id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  block_id: text('block_id').references(() => blocks.block_id),
  broker_id: integer('broker_id').references(() => brokers.id),
  execution_price: numeric('execution_price'),
  execution_qty: numeric('execution_qty'),
  execution_time: timestamp('execution_time', { withTimezone: true }),
  slippage_bps: numeric('slippage_bps'),
  allocation_pct: numeric('allocation_pct'),
  fill_type: text('fill_type'),
  ...auditFields,
});

// ============================================================================
// 7. Confirmation & Settlement
// ============================================================================

export const confirmations = pgTable('confirmations', {
  id: serial('id').primaryKey(),
  trade_id: text('trade_id').references(() => trades.trade_id),
  match_method: text('match_method'),
  match_status: text('match_status'),
  counterparty_ref: text('counterparty_ref'),
  tolerance_check: jsonb('tolerance_check'),
  exception_reason: text('exception_reason'),
  confirmed_by: integer('confirmed_by').references(() => users.id),
  confirmed_at: timestamp('confirmed_at', { withTimezone: true }),
  ...auditFields,
});

export const settlementInstructions = pgTable('settlement_instructions', {
  id: serial('id').primaryKey(),
  trade_id: text('trade_id').references(() => trades.trade_id),
  ssi_id: text('ssi_id'),
  swift_message_type: text('swift_message_type'),
  routing_bic: text('routing_bic'),
  value_date: date('value_date'),
  settlement_status: settlementStatusEnum('settlement_status'),
  cash_amount: numeric('cash_amount'),
  currency: text('currency'),
  settled_at: timestamp('settled_at', { withTimezone: true }),
  finacle_gl_ref: text('finacle_gl_ref'),
  philpass_ref: text('philpass_ref'),
  is_book_only: boolean('is_book_only').default(false),
  official_receipt_no: text('official_receipt_no'),
  custodian_group: text('custodian_group'),
  settlement_account_level: text('settlement_account_level'),
  ...auditFields,
});

// ============================================================================
// 8. Position & Cash
// ============================================================================

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  security_id: integer('security_id').references(() => securities.id),
  quantity: numeric('quantity'),
  cost_basis: numeric('cost_basis'),
  market_value: numeric('market_value'),
  unrealized_pnl: numeric('unrealized_pnl'),
  as_of_date: date('as_of_date'),
  ...auditFields,
});

export const cashLedger = pgTable('cash_ledger', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  account_type: text('account_type'),
  currency: text('currency'),
  balance: numeric('balance'),
  available_balance: numeric('available_balance'),
  as_of_date: date('as_of_date'),
  ...auditFields,
});

export const cashTransactions = pgTable('cash_transactions', {
  id: serial('id').primaryKey(),
  cash_ledger_id: integer('cash_ledger_id').references(() => cashLedger.id),
  type: text('type'),
  amount: numeric('amount'),
  currency: text('currency'),
  counterparty: text('counterparty'),
  reference: text('reference'),
  value_date: date('value_date'),
  ...auditFields,
});

// ============================================================================
// 9. Corporate Actions
// ============================================================================

export const corporateActions = pgTable('corporate_actions', {
  id: serial('id').primaryKey(),
  security_id: integer('security_id').references(() => securities.id),
  type: corporateActionTypeEnum('type'),
  ex_date: date('ex_date'),
  record_date: date('record_date'),
  payment_date: date('payment_date'),
  ratio: numeric('ratio'),
  amount_per_share: numeric('amount_per_share'),
  election_deadline: date('election_deadline'),
  source: text('source'),
  ca_status: text('ca_status'),
  ...auditFields,
});

export const corporateActionEntitlements = pgTable('corporate_action_entitlements', {
  id: serial('id').primaryKey(),
  corporate_action_id: integer('corporate_action_id').references(() => corporateActions.id),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  entitled_qty: numeric('entitled_qty'),
  elected_option: text('elected_option'),
  tax_treatment: text('tax_treatment'),
  posted: boolean('posted'),
  ...auditFields,
});

// ============================================================================
// 10. Fee & Billing
// ============================================================================

export const feeSchedules = pgTable('fee_schedules', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  fee_type: feeTypeEnum('fee_type'),
  calculation_method: text('calculation_method'),
  rate_pct: numeric('rate_pct'),
  tiered_rates: jsonb('tiered_rates'),
  effective_from: date('effective_from'),
  effective_to: date('effective_to'),
  ...auditFields,
});

export const feeInvoices = pgTable('fee_invoices', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  fee_schedule_id: integer('fee_schedule_id').references(() => feeSchedules.id),
  period_from: date('period_from'),
  period_to: date('period_to'),
  gross_amount: numeric('gross_amount'),
  tax_amount: numeric('tax_amount'),
  net_amount: numeric('net_amount'),
  invoice_status: text('invoice_status'),
  gl_ref: text('gl_ref'),
  ...auditFields,
});

export const feeAccruals = pgTable('fee_accruals', {
  id: serial('id').primaryKey(),
  fee_schedule_id: integer('fee_schedule_id').references(() => feeSchedules.id),
  accrual_date: date('accrual_date'),
  amount: numeric('amount'),
  ...auditFields,
});

// ============================================================================
// 10b. Pricing Records
// ============================================================================

export const pricingRecords = pgTable('pricing_records', {
  id: serial('id').primaryKey(),
  security_id: integer('security_id').references(() => securities.id),
  price_date: date('price_date'),
  close_price: numeric('close_price'),
  source: text('source'),
  ...auditFields,
});

// ============================================================================
// 11. NAV & Fund Accounting
// ============================================================================

export const navComputations = pgTable('nav_computations', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  computation_date: date('computation_date'),
  nav_per_unit: numeric('nav_per_unit'),
  total_nav: numeric('total_nav'),
  units_outstanding: numeric('units_outstanding'),
  pricing_source: text('pricing_source'),
  fair_value_level: text('fair_value_level'),
  nav_status: text('nav_status'),
  published_at: timestamp('published_at', { withTimezone: true }),
  ...auditFields,
});

export const unitTransactions = pgTable('unit_transactions', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  type: text('type'),
  units: numeric('units'),
  nav_per_unit: numeric('nav_per_unit'),
  amount: numeric('amount'),
  investor_id: text('investor_id'),
  transaction_date: date('transaction_date'),
  cut_off_applied: boolean('cut_off_applied'),
  ...auditFields,
});

// ============================================================================
// 12. Tax
// ============================================================================

export const taxEvents = pgTable('tax_events', {
  id: serial('id').primaryKey(),
  trade_id: text('trade_id').references(() => trades.trade_id),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  tax_type: taxTypeEnum('tax_type'),
  gross_amount: numeric('gross_amount'),
  tax_rate: numeric('tax_rate'),
  tax_amount: numeric('tax_amount'),
  certificate_ref: text('certificate_ref'),
  tin: text('tin'),
  bir_form_type: text('bir_form_type'),
  filing_status: text('filing_status'),
  ...auditFields,
});

// ============================================================================
// 13. Reversal & Upload
// ============================================================================

export const reversalCases = pgTable('reversal_cases', {
  id: serial('id').primaryKey(),
  original_transaction_id: text('original_transaction_id'),
  type: text('type'),
  reason: text('reason'),
  evidence_url: text('evidence_url'),
  requested_by: integer('requested_by').references(() => users.id),
  approved_by: integer('approved_by').references(() => users.id),
  reversal_status: text('reversal_status'),
  reversing_entries: jsonb('reversing_entries'),
  ...auditFields,
});

export const uploadBatches = pgTable('upload_batches', {
  id: serial('id').primaryKey(),
  filename: text('filename'),
  row_count: integer('row_count'),
  accepted_rows: integer('accepted_rows'),
  rejected_rows: integer('rejected_rows'),
  error_report_url: text('error_report_url'),
  upload_status: text('upload_status'),
  uploaded_by: integer('uploaded_by').references(() => users.id),
  authorized_by: integer('authorized_by').references(() => users.id),
  rollback_status: text('rollback_status'),
  ...auditFields,
});

// ============================================================================
// 14. Transfer / Contribution / Withdrawal
// ============================================================================

export const transfers = pgTable('transfers', {
  id: serial('id').primaryKey(),
  from_portfolio_id: text('from_portfolio_id').references(() => portfolios.portfolio_id),
  to_portfolio_id: text('to_portfolio_id').references(() => portfolios.portfolio_id),
  security_id: integer('security_id').references(() => securities.id),
  quantity: numeric('quantity'),
  type: text('type'),
  transfer_status: text('transfer_status'),
  ...auditFields,
});

export const contributions = pgTable('contributions', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  amount: numeric('amount'),
  currency: text('currency'),
  source_account: text('source_account'),
  type: text('type'),
  contribution_status: text('contribution_status'),
  ...auditFields,
});

export const withdrawals = pgTable('withdrawals', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  amount: numeric('amount'),
  currency: text('currency'),
  destination_account: text('destination_account'),
  type: text('type'),
  tax_withholding: numeric('tax_withholding'),
  withdrawal_status: text('withdrawal_status'),
  ...auditFields,
});

// ============================================================================
// 15. Compliance & Risk
// ============================================================================

export const complianceRules = pgTable('compliance_rules', {
  id: serial('id').primaryKey(),
  rule_type: text('rule_type'),
  entity_type: text('entity_type'),
  condition: jsonb('condition'),
  action: text('action'),
  severity: text('severity'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const complianceBreaches = pgTable('compliance_breaches', {
  id: serial('id').primaryKey(),
  rule_id: integer('rule_id').references(() => complianceRules.id),
  portfolio_id: text('portfolio_id'),
  order_id: text('order_id'),
  breach_description: text('breach_description'),
  detected_at: timestamp('detected_at', { withTimezone: true }),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  resolution: text('resolution'),
  ...auditFields,
});

export const tradeSurveillanceAlerts = pgTable('trade_surveillance_alerts', {
  id: serial('id').primaryKey(),
  pattern: surveillancePatternEnum('pattern'),
  score: numeric('score'),
  order_ids: jsonb('order_ids'),
  disposition: text('disposition'),
  analyst_id: integer('analyst_id').references(() => users.id),
  disposition_date: timestamp('disposition_date', { withTimezone: true }),
  ...auditFields,
});

export const oreEvents = pgTable('ore_events', {
  id: serial('id').primaryKey(),
  basel_category: text('basel_category'),
  description: text('description'),
  gross_loss: numeric('gross_loss'),
  net_loss: numeric('net_loss'),
  recovery: numeric('recovery'),
  root_cause: text('root_cause'),
  corrective_action: text('corrective_action'),
  reported_to_bsp: boolean('reported_to_bsp'),
  ...auditFields,
});

export const killSwitchEvents = pgTable('kill_switch_events', {
  id: serial('id').primaryKey(),
  scope: jsonb('scope'),
  reason: text('reason'),
  invoked_by: jsonb('invoked_by'),
  active_since: timestamp('active_since', { withTimezone: true }),
  resumed_at: timestamp('resumed_at', { withTimezone: true }),
  resume_approved_by: jsonb('resume_approved_by'),
  ...auditFields,
});

// ============================================================================
// 16. Whistleblower
// ============================================================================

export const whistleblowerCases = pgTable('whistleblower_cases', {
  id: serial('id').primaryKey(),
  intake_channel: text('intake_channel'),
  anonymous: boolean('anonymous'),
  description: text('description'),
  cco_reviewer_id: integer('cco_reviewer_id').references(() => users.id),
  dpo_notified: boolean('dpo_notified'),
  case_status: text('case_status'),
  resolution: text('resolution'),
  ...auditFields,
});

// ============================================================================
// 17. Notification & Consent
// ============================================================================

export const notificationLog = pgTable('notification_log', {
  id: serial('id').primaryKey(),
  event_type: text('event_type'),
  channel: notificationChannelEnum('channel'),
  recipient_id: text('recipient_id'),
  recipient_type: text('recipient_type'),
  content_hash: text('content_hash'),
  sent_at: timestamp('sent_at', { withTimezone: true }),
  delivered_at: timestamp('delivered_at', { withTimezone: true }),
  notification_status: text('notification_status'),
  ...auditFields,
});

export const consentLog = pgTable('consent_log', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  processing_activity: text('processing_activity'),
  lawful_basis: text('lawful_basis'),
  purpose: text('purpose'),
  retention_period: text('retention_period'),
  consented_at: timestamp('consented_at', { withTimezone: true }),
  withdrawn_at: timestamp('withdrawn_at', { withTimezone: true }),
  ...auditFields,
});

// ============================================================================
// 18. Audit (hash-chained)
// ============================================================================

export const auditRecords = pgTable(
  'audit_records',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entity_type: text('entity_type'),
    entity_id: text('entity_id'),
    action: auditActionEnum('action'),
    actor_id: text('actor_id'),
    actor_role: text('actor_role'),
    changes: jsonb('changes'),
    previous_hash: text('previous_hash'),
    record_hash: text('record_hash'),
    metadata: jsonb('metadata'),
    ip_address: text('ip_address'),
    correlation_id: text('correlation_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_entity').on(table.entity_type, table.entity_id),
    index('idx_audit_actor').on(table.actor_id),
    index('idx_audit_created_at').on(table.created_at),
  ],
);

// ============================================================================
// 19. EDEF (Entity Definition Framework)
// ============================================================================

export const entityRegistry = pgTable('entity_registry', {
  entity_key: text('entity_key').primaryKey(),
  display_name: text('display_name'),
  display_name_plural: text('display_name_plural'),
  schema_table_name: text('schema_table_name'),
  category: text('category'),
  searchable_columns: jsonb('searchable_columns'),
  default_sort_column: text('default_sort_column'),
  max_page_size: integer('max_page_size'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const entityFieldConfig = pgTable('entity_field_config', {
  id: serial('id').primaryKey(),
  entity_key: text('entity_key').references(() => entityRegistry.entity_key),
  field_name: text('field_name'),
  label: text('label'),
  input_type: text('input_type'),
  group_name: text('group_name'),
  group_order: integer('group_order'),
  display_order: integer('display_order'),
  visible_in_table: boolean('visible_in_table'),
  visible_in_form: boolean('visible_in_form'),
  required: boolean('required'),
  editable: boolean('editable'),
  pii_sensitive: boolean('pii_sensitive'),
  validation_regex: text('validation_regex'),
  unique_check: boolean('unique_check'),
  select_options_source: text('select_options_source'),
  help_text: text('help_text'),
  ...auditFields,
});

export const entityCrossValidations = pgTable('entity_cross_validations', {
  id: serial('id').primaryKey(),
  entity_key: text('entity_key').references(() => entityRegistry.entity_key),
  rule_name: text('rule_name'),
  condition: jsonb('condition'),
  error_message: text('error_message'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const approvalWorkflowDefinitions = pgTable('approval_workflow_definitions', {
  id: serial('id').primaryKey(),
  entity_type: text('entity_type'),
  action: text('action'),
  required_approvers: integer('required_approvers'),
  sla_hours: integer('sla_hours'),
  auto_approve_roles: jsonb('auto_approve_roles'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const approvalRequests = pgTable('approval_requests', {
  id: serial('id').primaryKey(),
  entity_type: text('entity_type'),
  entity_id: text('entity_id'),
  action: text('action'),
  approval_status: approvalStatusEnum('approval_status'),
  payload: jsonb('payload'),
  previous_values: jsonb('previous_values'),
  submitted_by: integer('submitted_by').references(() => users.id),
  submitted_at: timestamp('submitted_at', { withTimezone: true }),
  reviewed_by: integer('reviewed_by').references(() => users.id),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  review_comment: text('review_comment'),
  sla_deadline: timestamp('sla_deadline', { withTimezone: true }),
  is_sla_breached: boolean('is_sla_breached'),
  ...auditFields,
});

// ============================================================================
// 20. Reference Data
// ============================================================================

export const countries = pgTable('countries', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  iso_alpha3: text('iso_alpha3'),
  ...auditFields,
});

export const currencies = pgTable('currencies', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  symbol: text('symbol'),
  decimal_places: integer('decimal_places'),
  ...auditFields,
});

export const assetClasses = pgTable('asset_classes', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  description: text('description'),
  ...auditFields,
});

export const branches = pgTable('branches', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  address: text('address'),
  region: text('region'),
  ...auditFields,
});

export const exchanges = pgTable('exchanges', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  country_code: text('country_code'),
  timezone: text('timezone'),
  ...auditFields,
});

export const trustProductTypes = pgTable('trust_product_types', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  description: text('description'),
  ...auditFields,
});

export const feeTypes = pgTable('fee_types', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  description: text('description'),
  calculation_method: text('calculation_method'),
  ...auditFields,
});

export const taxCodes = pgTable('tax_codes', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  rate: numeric('rate'),
  type: text('type'),
  applicability: text('applicability'),
  ...auditFields,
});

// ============================================================================
// 18. Portfolio Modeling & Rebalancing (BDO RFI Gap #5)
// ============================================================================

export const modelPortfolios = pgTable('model_portfolios', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  allocations: jsonb('allocations'), // [{asset_class, target_pct, min_pct, max_pct}]
  benchmark_id: integer('benchmark_id'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const rebalancingRuns = pgTable('rebalancing_runs', {
  id: serial('id').primaryKey(),
  portfolio_ids: jsonb('portfolio_ids'), // array of portfolio_id strings
  model_portfolio_id: integer('model_portfolio_id').references(() => modelPortfolios.id),
  run_type: text('run_type'), // SIMULATION, LIVE
  rebalancing_status: rebalancingStatusEnum('rebalancing_status').default('DRAFT'),
  input_params: jsonb('input_params'),
  generated_blotter: jsonb('generated_blotter'),
  executed_at: timestamp('executed_at', { withTimezone: true }),
  executed_by: integer('executed_by').references(() => users.id),
  ...auditFields,
});

// ============================================================================
// 19. Scheduled Plans — EIP / ERP (BDO RFI Gap #9)
// ============================================================================

export const scheduledPlans = pgTable('scheduled_plans', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  plan_type: scheduledPlanTypeEnum('plan_type').notNull(),
  product_id: integer('product_id'),
  amount: numeric('amount'),
  currency: text('currency').default('PHP'),
  frequency: text('frequency'), // DAILY, WEEKLY, BI_WEEKLY, MONTHLY, QUARTERLY
  ca_sa_account: text('ca_sa_account'),
  next_execution_date: date('next_execution_date'),
  scheduled_plan_status: scheduledPlanStatusEnum('scheduled_plan_status').default('ACTIVE'),
  ...auditFields,
});

// ============================================================================
// 20. PERA Accounts & Transactions (BDO RFI Gap #9 — BSP regulated)
// ============================================================================

export const peraAccounts = pgTable('pera_accounts', {
  id: serial('id').primaryKey(),
  contributor_id: text('contributor_id').references(() => clients.client_id),
  administrator: text('administrator'),
  product_id: integer('product_id'),
  balance: numeric('balance').default('0'),
  contribution_ytd: numeric('contribution_ytd').default('0'),
  max_contribution_annual: numeric('max_contribution_annual'),
  tin: text('tin'),
  bsp_pera_id: text('bsp_pera_id'),
  pera_status: text('pera_status').default('ACTIVE'),
  ...auditFields,
});

export const peraTransactions = pgTable('pera_transactions', {
  id: serial('id').primaryKey(),
  pera_account_id: integer('pera_account_id').references(() => peraAccounts.id),
  type: peraTransactionTypeEnum('type').notNull(),
  amount: numeric('amount'),
  penalty_amount: numeric('penalty_amount'),
  tcc_ref: text('tcc_ref'),
  target_product_id: integer('target_product_id'),
  target_admin: text('target_admin'),
  pera_txn_status: text('pera_txn_status').default('PENDING'),
  ...auditFields,
});

// ============================================================================
// 21. Compliance Limits (BDO RFI Gap #4 — Pre/Post-Trade)
// ============================================================================

export const complianceLimits = pgTable('compliance_limits', {
  id: serial('id').primaryKey(),
  limit_type: text('limit_type').notNull(), // trader, counterparty, broker, issuer, sector, sbl, group, outlet
  dimension: text('dimension').notNull(),
  dimension_id: text('dimension_id'),
  limit_amount: numeric('limit_amount'),
  current_exposure: numeric('current_exposure').default('0'),
  warning_threshold_pct: integer('warning_threshold_pct').default(80),
  is_active: boolean('is_active').default(true),
  effective_from: date('effective_from'),
  effective_to: date('effective_to'),
  ...auditFields,
});

// ============================================================================
// 22. Validation Overrides (BDO RFI Gap #4 — Hard/Soft)
// ============================================================================

export const validationOverrides = pgTable('validation_overrides', {
  id: serial('id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  validation_rule: text('validation_rule').notNull(),
  severity: validationSeverityEnum('severity').notNull(),
  breach_description: text('breach_description'),
  override_justification: text('override_justification'),
  overridden_by: integer('overridden_by').references(() => users.id),
  approved_by: integer('approved_by').references(() => users.id),
  overridden_at: timestamp('overridden_at', { withTimezone: true }),
  ...auditFields,
});

// ============================================================================
// 23. Held-Away Assets (BDO RFI Gap #6)
// ============================================================================

export const heldAwayAssets = pgTable('held_away_assets', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  asset_class: text('asset_class'),
  description: text('description'),
  custodian: text('custodian'),
  location: text('location'),
  market_value: numeric('market_value'),
  currency: text('currency').default('PHP'),
  as_of_date: date('as_of_date'),
  ...auditFields,
});

// ============================================================================
// 24. Standing Instructions (BDO RFI Gap #9 — IMA/TA)
// ============================================================================

export const standingInstructions = pgTable('standing_instructions', {
  id: serial('id').primaryKey(),
  account_id: text('account_id'),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  instruction_type: standingInstructionTypeEnum('instruction_type').notNull(),
  params: jsonb('params'), // { target_account, amount, frequency, etc. }
  is_active: boolean('is_active').default(true),
  next_execution_date: date('next_execution_date'),
  ...auditFields,
});

// ============================================================================
// 25. EOD Processing (Phase 3B)
// ============================================================================

export const eodJobStatusEnum = pgEnum('eod_job_status', [
  'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED',
]);

export const eodRuns = pgTable('eod_runs', {
  id: serial('id').primaryKey(),
  run_date: date('run_date').notNull(),
  run_status: eodJobStatusEnum('run_status').default('PENDING'),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  total_jobs: integer('total_jobs').default(0),
  completed_jobs: integer('completed_jobs').default(0),
  failed_jobs: integer('failed_jobs').default(0),
  triggered_by: integer('triggered_by').references(() => users.id),
  ...auditFields,
});

export const eodJobs = pgTable('eod_jobs', {
  id: serial('id').primaryKey(),
  run_id: integer('run_id').references(() => eodRuns.id),
  job_name: text('job_name').notNull(),
  display_name: text('display_name'),
  job_status: eodJobStatusEnum('job_status').default('PENDING'),
  depends_on: text('depends_on').array(),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  duration_ms: integer('duration_ms'),
  records_processed: integer('records_processed').default(0),
  error_message: text('error_message'),
  ...auditFields,
});

// ============================================================================
// 26. Reconciliation (Phase 3B)
// ============================================================================

export const reconRunStatusEnum = pgEnum('recon_run_status', [
  'RUNNING', 'COMPLETED', 'FAILED',
]);

export const reconBreakStatusEnum = pgEnum('recon_break_status', [
  'OPEN', 'INVESTIGATING', 'RESOLVED', 'ESCALATED',
]);

export const reconRuns = pgTable('recon_runs', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  run_date: date('run_date').notNull(),
  recon_status: reconRunStatusEnum('recon_status').default('RUNNING'),
  total_records: integer('total_records').default(0),
  matched_records: integer('matched_records').default(0),
  breaks_found: integer('breaks_found').default(0),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  triggered_by: integer('triggered_by').references(() => users.id),
  ...auditFields,
});

export const reconBreaks = pgTable('recon_breaks', {
  id: serial('id').primaryKey(),
  run_id: integer('run_id').references(() => reconRuns.id),
  type: text('type').notNull(),
  entity_id: text('entity_id'),
  break_type: text('break_type'),
  internal_value: text('internal_value'),
  external_value: text('external_value'),
  difference: numeric('difference'),
  break_status: reconBreakStatusEnum('break_status').default('OPEN'),
  resolved_by: integer('resolved_by').references(() => users.id),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  resolution_notes: text('resolution_notes'),
  ...auditFields,
});

// ============================================================================
// Drizzle Relations
// ============================================================================

// --- IAM Relations ---

export const usersRelations = relations(users, ({ one, many }) => ({
  branch: one(branches, {
    fields: [users.branch_id],
    references: [branches.id],
  }),
  userRoles: many(userRoles),
  orderAuthorizations: many(orderAuthorizations),
  blocks: many(blocks),
  confirmations: many(confirmations),
  tradeSurveillanceAlerts: many(tradeSurveillanceAlerts),
  whistleblowerCases: many(whistleblowerCases),
  reversalCasesRequested: many(reversalCases, { relationName: 'reversalRequester' }),
  reversalCasesApproved: many(reversalCases, { relationName: 'reversalApprover' }),
  uploadBatchesUploaded: many(uploadBatches, { relationName: 'uploader' }),
  uploadBatchesAuthorized: many(uploadBatches, { relationName: 'uploadAuthorizer' }),
  approvalRequestsSubmitted: many(approvalRequests, { relationName: 'approvalSubmitter' }),
  approvalRequestsReviewed: many(approvalRequests, { relationName: 'approvalReviewer' }),
  rebalancingRuns: many(rebalancingRuns),
  validationOverridesOverridden: many(validationOverrides, { relationName: 'validationOverrider' }),
  validationOverridesApproved: many(validationOverrides, { relationName: 'validationApprover' }),
  eodRunsTriggered: many(eodRuns, { relationName: 'eodRunsTrigger' }),
  reconRunsTriggered: many(reconRuns, { relationName: 'reconRunsTrigger' }),
  reconBreaksResolved: many(reconBreaks, { relationName: 'reconBreakResolver' }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(permissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  role: one(roles, {
    fields: [permissions.role_id],
    references: [roles.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.user_id],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.role_id],
    references: [roles.id],
  }),
}));

// --- Client & KYC Relations ---

export const clientsRelations = relations(clients, ({ many }) => ({
  profiles: many(clientProfiles),
  kycCases: many(kycCases),
  beneficialOwners: many(beneficialOwners),
  fatcaCrs: many(clientFatcaCrs),
  portfolios: many(portfolios),
  consentLogs: many(consentLog),
  scheduledPlans: many(scheduledPlans),
  peraAccounts: many(peraAccounts),
}));

export const clientProfilesRelations = relations(clientProfiles, ({ one }) => ({
  client: one(clients, {
    fields: [clientProfiles.client_id],
    references: [clients.client_id],
  }),
}));

export const kycCasesRelations = relations(kycCases, ({ one }) => ({
  client: one(clients, {
    fields: [kycCases.client_id],
    references: [clients.client_id],
  }),
}));

export const beneficialOwnersRelations = relations(beneficialOwners, ({ one }) => ({
  client: one(clients, {
    fields: [beneficialOwners.client_id],
    references: [clients.client_id],
  }),
}));

export const clientFatcaCrsRelations = relations(clientFatcaCrs, ({ one }) => ({
  client: one(clients, {
    fields: [clientFatcaCrs.client_id],
    references: [clients.client_id],
  }),
}));

// --- Portfolio & Mandate Relations ---

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  client: one(clients, {
    fields: [portfolios.client_id],
    references: [clients.client_id],
  }),
  mandates: many(mandates),
  orders: many(orders),
  positions: many(positions),
  cashLedgers: many(cashLedger),
  feeSchedules: many(feeSchedules),
  feeInvoices: many(feeInvoices),
  navComputations: many(navComputations),
  unitTransactions: many(unitTransactions),
  taxEvents: many(taxEvents),
  corporateActionEntitlements: many(corporateActionEntitlements),
  transfersFrom: many(transfers, { relationName: 'transferFrom' }),
  transfersTo: many(transfers, { relationName: 'transferTo' }),
  contributions: many(contributions),
  withdrawals: many(withdrawals),
  heldAwayAssets: many(heldAwayAssets),
  scheduledPlans: many(scheduledPlans),
  standingInstructions: many(standingInstructions),
}));

export const mandatesRelations = relations(mandates, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [mandates.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Securities & Counterparties Relations ---

export const securitiesRelations = relations(securities, ({ many }) => ({
  orders: many(orders),
  positions: many(positions),
  blocks: many(blocks),
  corporateActions: many(corporateActions),
  transfers: many(transfers),
  pricingRecords: many(pricingRecords),
}));

export const counterpartiesRelations = relations(counterparties, ({ many }) => ({
  brokers: many(brokers),
}));

export const brokersRelations = relations(brokers, ({ one, many }) => ({
  counterparty: one(counterparties, {
    fields: [brokers.counterparty_id],
    references: [counterparties.id],
  }),
  trades: many(trades),
}));

// --- Order Lifecycle Relations ---

export const ordersRelations = relations(orders, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [orders.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  security: one(securities, {
    fields: [orders.security_id],
    references: [securities.id],
  }),
  authorizations: many(orderAuthorizations),
  trades: many(trades),
  trader: one(users, {
    fields: [orders.trader_id],
    references: [users.id],
  }),
  parentOrder: one(orders, {
    fields: [orders.parent_order_id],
    references: [orders.order_id],
  }),
  validationOverrides: many(validationOverrides),
}));

export const orderAuthorizationsRelations = relations(orderAuthorizations, ({ one }) => ({
  order: one(orders, {
    fields: [orderAuthorizations.order_id],
    references: [orders.order_id],
  }),
  approver: one(users, {
    fields: [orderAuthorizations.approver_id],
    references: [users.id],
  }),
}));

// --- Trade & Execution Relations ---

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  security: one(securities, {
    fields: [blocks.security_id],
    references: [securities.id],
  }),
  trader: one(users, {
    fields: [blocks.trader_id],
    references: [users.id],
  }),
  trades: many(trades),
}));

export const tradesRelations = relations(trades, ({ one, many }) => ({
  order: one(orders, {
    fields: [trades.order_id],
    references: [orders.order_id],
  }),
  block: one(blocks, {
    fields: [trades.block_id],
    references: [blocks.block_id],
  }),
  broker: one(brokers, {
    fields: [trades.broker_id],
    references: [brokers.id],
  }),
  confirmations: many(confirmations),
  settlementInstructions: many(settlementInstructions),
  taxEvents: many(taxEvents),
}));

// --- Confirmation & Settlement Relations ---

export const confirmationsRelations = relations(confirmations, ({ one }) => ({
  trade: one(trades, {
    fields: [confirmations.trade_id],
    references: [trades.trade_id],
  }),
  confirmedByUser: one(users, {
    fields: [confirmations.confirmed_by],
    references: [users.id],
  }),
}));

export const settlementInstructionsRelations = relations(settlementInstructions, ({ one }) => ({
  trade: one(trades, {
    fields: [settlementInstructions.trade_id],
    references: [trades.trade_id],
  }),
}));

// --- Position & Cash Relations ---

export const positionsRelations = relations(positions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [positions.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  security: one(securities, {
    fields: [positions.security_id],
    references: [securities.id],
  }),
}));

export const cashLedgerRelations = relations(cashLedger, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [cashLedger.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  transactions: many(cashTransactions),
}));

export const cashTransactionsRelations = relations(cashTransactions, ({ one }) => ({
  ledger: one(cashLedger, {
    fields: [cashTransactions.cash_ledger_id],
    references: [cashLedger.id],
  }),
}));

// --- Corporate Actions Relations ---

export const corporateActionsRelations = relations(corporateActions, ({ one, many }) => ({
  security: one(securities, {
    fields: [corporateActions.security_id],
    references: [securities.id],
  }),
  entitlements: many(corporateActionEntitlements),
}));

export const corporateActionEntitlementsRelations = relations(corporateActionEntitlements, ({ one }) => ({
  corporateAction: one(corporateActions, {
    fields: [corporateActionEntitlements.corporate_action_id],
    references: [corporateActions.id],
  }),
  portfolio: one(portfolios, {
    fields: [corporateActionEntitlements.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Fee & Billing Relations ---

export const feeSchedulesRelations = relations(feeSchedules, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [feeSchedules.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  invoices: many(feeInvoices),
  accruals: many(feeAccruals),
}));

export const feeInvoicesRelations = relations(feeInvoices, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [feeInvoices.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  feeSchedule: one(feeSchedules, {
    fields: [feeInvoices.fee_schedule_id],
    references: [feeSchedules.id],
  }),
}));

export const feeAccrualsRelations = relations(feeAccruals, ({ one }) => ({
  feeSchedule: one(feeSchedules, {
    fields: [feeAccruals.fee_schedule_id],
    references: [feeSchedules.id],
  }),
}));

// --- NAV & Fund Accounting Relations ---

export const navComputationsRelations = relations(navComputations, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [navComputations.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

export const unitTransactionsRelations = relations(unitTransactions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [unitTransactions.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

export const pricingRecordsRelations = relations(pricingRecords, ({ one }) => ({
  security: one(securities, {
    fields: [pricingRecords.security_id],
    references: [securities.id],
  }),
}));

// --- Tax Relations ---

export const taxEventsRelations = relations(taxEvents, ({ one }) => ({
  trade: one(trades, {
    fields: [taxEvents.trade_id],
    references: [trades.trade_id],
  }),
  portfolio: one(portfolios, {
    fields: [taxEvents.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Reversal & Upload Relations ---

export const reversalCasesRelations = relations(reversalCases, ({ one }) => ({
  requestedBy: one(users, {
    fields: [reversalCases.requested_by],
    references: [users.id],
    relationName: 'reversalRequester',
  }),
  approvedBy: one(users, {
    fields: [reversalCases.approved_by],
    references: [users.id],
    relationName: 'reversalApprover',
  }),
}));

export const uploadBatchesRelations = relations(uploadBatches, ({ one }) => ({
  uploadedBy: one(users, {
    fields: [uploadBatches.uploaded_by],
    references: [users.id],
    relationName: 'uploader',
  }),
  authorizedBy: one(users, {
    fields: [uploadBatches.authorized_by],
    references: [users.id],
    relationName: 'uploadAuthorizer',
  }),
}));

// --- Transfer / Contribution / Withdrawal Relations ---

export const transfersRelations = relations(transfers, ({ one }) => ({
  fromPortfolio: one(portfolios, {
    fields: [transfers.from_portfolio_id],
    references: [portfolios.portfolio_id],
    relationName: 'transferFrom',
  }),
  toPortfolio: one(portfolios, {
    fields: [transfers.to_portfolio_id],
    references: [portfolios.portfolio_id],
    relationName: 'transferTo',
  }),
  security: one(securities, {
    fields: [transfers.security_id],
    references: [securities.id],
  }),
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [contributions.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [withdrawals.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Compliance & Risk Relations ---

export const complianceRulesRelations = relations(complianceRules, ({ many }) => ({
  breaches: many(complianceBreaches),
}));

export const complianceBreachesRelations = relations(complianceBreaches, ({ one }) => ({
  rule: one(complianceRules, {
    fields: [complianceBreaches.rule_id],
    references: [complianceRules.id],
  }),
}));

export const tradeSurveillanceAlertsRelations = relations(tradeSurveillanceAlerts, ({ one }) => ({
  analyst: one(users, {
    fields: [tradeSurveillanceAlerts.analyst_id],
    references: [users.id],
  }),
}));

// --- Whistleblower Relations ---

export const whistleblowerCasesRelations = relations(whistleblowerCases, ({ one }) => ({
  ccoReviewer: one(users, {
    fields: [whistleblowerCases.cco_reviewer_id],
    references: [users.id],
  }),
}));

// --- Consent Log Relations ---

export const consentLogRelations = relations(consentLog, ({ one }) => ({
  client: one(clients, {
    fields: [consentLog.client_id],
    references: [clients.client_id],
  }),
}));

// --- EDEF Relations ---

export const entityRegistryRelations = relations(entityRegistry, ({ many }) => ({
  fieldConfigs: many(entityFieldConfig),
  crossValidations: many(entityCrossValidations),
}));

export const entityFieldConfigRelations = relations(entityFieldConfig, ({ one }) => ({
  entity: one(entityRegistry, {
    fields: [entityFieldConfig.entity_key],
    references: [entityRegistry.entity_key],
  }),
}));

export const entityCrossValidationsRelations = relations(entityCrossValidations, ({ one }) => ({
  entity: one(entityRegistry, {
    fields: [entityCrossValidations.entity_key],
    references: [entityRegistry.entity_key],
  }),
}));

// --- Approval Requests Relations ---

export const approvalRequestsRelations = relations(approvalRequests, ({ one }) => ({
  submitter: one(users, {
    fields: [approvalRequests.submitted_by],
    references: [users.id],
    relationName: 'approvalSubmitter',
  }),
  reviewer: one(users, {
    fields: [approvalRequests.reviewed_by],
    references: [users.id],
    relationName: 'approvalReviewer',
  }),
}));

// --- Branches Relations ---

export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
}));

// --- Portfolio Modeling Relations ---

export const modelPortfoliosRelations = relations(modelPortfolios, ({ many }) => ({
  rebalancingRuns: many(rebalancingRuns),
}));

export const rebalancingRunsRelations = relations(rebalancingRuns, ({ one }) => ({
  modelPortfolio: one(modelPortfolios, {
    fields: [rebalancingRuns.model_portfolio_id],
    references: [modelPortfolios.id],
  }),
  executedByUser: one(users, {
    fields: [rebalancingRuns.executed_by],
    references: [users.id],
  }),
}));

// --- Scheduled Plans Relations ---

export const scheduledPlansRelations = relations(scheduledPlans, ({ one }) => ({
  client: one(clients, {
    fields: [scheduledPlans.client_id],
    references: [clients.client_id],
  }),
  portfolio: one(portfolios, {
    fields: [scheduledPlans.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- PERA Relations ---

export const peraAccountsRelations = relations(peraAccounts, ({ one, many }) => ({
  contributor: one(clients, {
    fields: [peraAccounts.contributor_id],
    references: [clients.client_id],
  }),
  transactions: many(peraTransactions),
}));

export const peraTransactionsRelations = relations(peraTransactions, ({ one }) => ({
  peraAccount: one(peraAccounts, {
    fields: [peraTransactions.pera_account_id],
    references: [peraAccounts.id],
  }),
}));

// --- Compliance Limits Relations (standalone, no FK) ---

// --- Validation Overrides Relations ---

export const validationOverridesRelations = relations(validationOverrides, ({ one }) => ({
  order: one(orders, {
    fields: [validationOverrides.order_id],
    references: [orders.order_id],
  }),
  overriddenByUser: one(users, {
    fields: [validationOverrides.overridden_by],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [validationOverrides.approved_by],
    references: [users.id],
  }),
}));

// --- Held-Away Assets Relations ---

export const heldAwayAssetsRelations = relations(heldAwayAssets, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [heldAwayAssets.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Standing Instructions Relations ---

export const standingInstructionsRelations = relations(standingInstructions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [standingInstructions.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- EOD Processing Relations ---

export const eodRunsRelations = relations(eodRuns, ({ one, many }) => ({
  triggeredBy: one(users, {
    fields: [eodRuns.triggered_by],
    references: [users.id],
    relationName: 'eodRunsTrigger',
  }),
  jobs: many(eodJobs),
}));

export const eodJobsRelations = relations(eodJobs, ({ one }) => ({
  run: one(eodRuns, {
    fields: [eodJobs.run_id],
    references: [eodRuns.id],
  }),
}));

// --- Reconciliation Relations ---

export const reconRunsRelations = relations(reconRuns, ({ one, many }) => ({
  triggeredBy: one(users, {
    fields: [reconRuns.triggered_by],
    references: [users.id],
    relationName: 'reconRunsTrigger',
  }),
  breaks: many(reconBreaks),
}));

export const reconBreaksRelations = relations(reconBreaks, ({ one }) => ({
  run: one(reconRuns, {
    fields: [reconBreaks.run_id],
    references: [reconRuns.id],
  }),
  resolvedByUser: one(users, {
    fields: [reconBreaks.resolved_by],
    references: [users.id],
    relationName: 'reconBreakResolver',
  }),
}));
