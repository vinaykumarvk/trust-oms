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
  uuid,
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
  'DIVIDEND_CASH', 'DIVIDEND_STOCK', 'BONUS_ISSUE', 'SPLIT', 'REVERSE_SPLIT', 'CONSOLIDATION',
  'COUPON', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION', 'MATURITY',
  'CAPITAL_DISTRIBUTION', 'CAPITAL_GAINS_DISTRIBUTION', 'RETURN_OF_CAPITAL',
  'NAME_CHANGE', 'ISIN_CHANGE', 'TICKER_CHANGE', 'PAR_VALUE_CHANGE', 'SECURITY_RECLASSIFICATION',
  'RIGHTS', 'TENDER', 'BUYBACK', 'DUTCH_AUCTION', 'EXCHANGE_OFFER', 'WARRANT_EXERCISE', 'CONVERSION',
  'MERGER', 'PROXY_VOTE', 'CLASS_ACTION',
  'DIVIDEND_WITH_OPTION', 'MERGER_WITH_ELECTION', 'SPINOFF_WITH_OPTION',
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
// TRUST-CA 360 — Enums
// ============================================================================

export const corporateActionStatusEnum = pgEnum('corporate_action_status', [
  'ANNOUNCED', 'SCRUBBED', 'GOLDEN_COPY', 'ENTITLED', 'ELECTED', 'SETTLED', 'CANCELLED', 'REVERSED',
]);

export const ttraStatusEnum = pgEnum('ttra_status', [
  'APPLIED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'RENEWAL_PENDING',
]);

export const claimStatusEnum = pgEnum('claim_status', [
  'DRAFT', 'INVESTIGATING', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED', 'WITHDRAWN', 'DISCLOSED',
]);

export const claimOriginationEnum = pgEnum('claim_origination', [
  'CLIENT_RAISED', 'INTERNALLY_DETECTED', 'REGULATOR_RAISED',
]);

export const claimRootCauseEnum = pgEnum('claim_root_cause', [
  'DEADLINE_MISSED', 'TAX_ERROR', 'FEE_ERROR', 'WRONG_OPTION', 'SYSTEM_OUTAGE', 'DATA_QUALITY', 'VENDOR_FAILURE', 'OTHER',
]);

export const claimApprovalTierEnum = pgEnum('claim_approval_tier', [
  'AUTO', 'MANAGER', 'HEAD', 'EXEC_COMMITTEE',
]);

export const degradedModeComponentEnum = pgEnum('degraded_mode_component', [
  'BLOOMBERG', 'REUTERS', 'DTCC', 'PDTC', 'SWIFT', 'AI', 'DB',
]);

export const consentPurposeEnum = pgEnum('consent_purpose', [
  'OPERATIONAL', 'MARKETING', 'AUTOMATED_DECISION', 'RESEARCH_AGGREGATE',
]);

export const consentLegalBasisEnum = pgEnum('consent_legal_basis', [
  'CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'LEGITIMATE_INTEREST',
]);

export const feedCostTierEnum = pgEnum('feed_cost_tier', [
  'BASELINE', 'PREMIUM',
]);

export const securitySegmentEnum = pgEnum('security_segment', [
  'PH_BLUE_CHIP', 'PH_MID_CAP', 'PH_SMALL_CAP', 'FOREIGN_G10', 'FOREIGN_EM', 'FIXED_INCOME',
]);

export const dataSegregationEnum = pgEnum('data_segregation_scope', [
  'HARD', 'SOFT',
]);

export const stewardshipApprovalEnum = pgEnum('stewardship_approval', [
  'SINGLE_APPROVER', 'DUAL_APPROVAL', 'COMMITTEE_APPROVAL',
]);

// ============================================================================
// TrustFees Pro — Enums
// ============================================================================

export const chargeBasisEnum = pgEnum('charge_basis', ['EVENT', 'PERIOD']);

export const pricingTypeEnum = pgEnum('pricing_type', [
  'FIXED_AMOUNT', 'FIXED_RATE',
  'SLAB_CUMULATIVE_AMOUNT', 'SLAB_CUMULATIVE_RATE',
  'SLAB_INCREMENTAL_AMOUNT', 'SLAB_INCREMENTAL_RATE',
  'STEP_FUNCTION',
]);

export const pricingBindingModeEnum = pgEnum('pricing_binding_mode', ['STRICT', 'LATEST_APPROVED']);

export const feePlanStatusEnum = pgEnum('fee_plan_status', [
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'SUPERSEDED',
]);

export const feePlanFeeTypeEnum = pgEnum('fee_plan_fee_type', [
  'CUSTODY', 'MANAGEMENT', 'PERFORMANCE', 'SUBSCRIPTION', 'REDEMPTION',
  'COMMISSION', 'TAX', 'TRUST', 'ESCROW', 'ADMIN', 'OTHER',
]);

export const sourcePartyEnum = pgEnum('source_party', ['INVESTOR', 'ISSUER']);
export const targetPartyEnum = pgEnum('target_party', ['BANK', 'BROKER', 'PORTFOLIO_MANAGER']);

export const comparisonBasisEnum = pgEnum('comparison_basis', [
  'PRICE', 'TXN_AMOUNT', 'NUM_TXNS', 'AUM', 'NOMINAL',
  'XIRR', 'YTM', 'COUPON_PCT', 'DIVIDEND_PCT',
]);

export const valueBasisEnum = pgEnum('value_basis', [
  'AUM', 'BUM', 'TXN_AMOUNT', 'NOTIONAL', 'AVG_INVESTMENT',
  'FACE_VALUE', 'PRINCIPAL', 'COST',
]);

export const rateTypeEnum = pgEnum('rate_type', ['FLAT', 'ANNUALIZED']);

export const accrualFrequencyEnum = pgEnum('accrual_frequency', [
  'DAILY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL',
]);

export const accrualMethodEnum = pgEnum('accrual_method', [
  'ABSOLUTE', 'AVERAGE', 'ABSOLUTE_INCR', 'AVERAGE_INCR',
]);

export const tfpAccrualStatusEnum = pgEnum('tfp_accrual_status', [
  'OPEN', 'ACCOUNTED', 'INVOICED', 'REVERSED',
]);

export const tfpInvoiceStatusEnum = pgEnum('tfp_invoice_status', [
  'DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'DISPUTED', 'CANCELLED',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'DEBIT_MEMO', 'CHECK', 'PESONET', 'INSTAPAY', 'SWIFT', 'INTERNAL_JV',
]);

export const paymentStatusEnum = pgEnum('payment_status', ['POSTED', 'REVERSED', 'FAILED']);

export const overrideStageEnum = pgEnum('override_stage', [
  'ORDER_CAPTURE', 'ACCRUAL', 'INVOICE', 'PAYMENT',
]);

export const overrideStatusEnum = pgEnum('override_status', [
  'PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED',
]);

export const exceptionTypeEnum = pgEnum('exception_type', [
  'MISSING_FX', 'ACCRUAL_MISMATCH', 'INVOICE_PDF_FAILURE',
  'PAYMENT_AMBIGUITY', 'DISPUTE_OPEN', 'REVERSAL_CANDIDATE', 'OTHER',
]);

export const exceptionSeverityEnum = pgEnum('exception_severity', ['P1', 'P2', 'P3']);

export const exceptionStatusEnum = pgEnum('exception_status', [
  'OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'WONT_FIX',
]);

export const contentPackCategoryEnum = pgEnum('content_pack_category', [
  'TAX_RULE_PACK', 'REPORT_PACK', 'TEMPLATE_PACK',
]);

export const contentPackStatusEnum = pgEnum('content_pack_status', [
  'STAGED', 'ACTIVE', 'SUPERSEDED', 'ROLLED_BACK',
]);

export const dsarTypeEnum = pgEnum('dsar_type', [
  'ACCESS', 'ERASURE', 'RECTIFICATION', 'PORTABILITY', 'RESTRICTION',
]);

export const dsarStatusEnum = pgEnum('dsar_status', [
  'NEW', 'IN_PROGRESS', 'DPO_REVIEW', 'COMPLETED', 'REJECTED',
]);

export const disputeStatusEnum = pgEnum('dispute_status', [
  'OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED',
]);

export const creditNoteStatusEnum = pgEnum('credit_note_status', ['ISSUED', 'APPLIED', 'CANCELLED']);

export const tfpTaxTypeEnum = pgEnum('tfp_tax_type', ['VAT', 'WHT', 'DST', 'OTHER']);

export const tfpPiiClassEnum = pgEnum('tfp_pii_class', ['NON_PII', 'PII', 'SPI', 'FINANCIAL_PII']);

export const redactionRuleEnum = pgEnum('redaction_rule', [
  'NONE', 'MASK', 'HASH', 'TOKENIZE', 'EXCLUDE',
]);

export const templateCategoryEnum = pgEnum('template_category', [
  'TRUST_DISC', 'TRUST_DIR', 'RETIREMENT', 'ESCROW', 'TXN', 'ADHOC',
]);

export const libraryStatusEnum = pgEnum('library_status', [
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED',
]);

export const feeEventTypeEnum = pgEnum('fee_event_type', [
  'BUY', 'SELL', 'MATURITY', 'COUPON', 'DIVIDEND',
  'PRE_TERMINATION', 'REDEMPTION', 'CORPORATE_ACTION',
]);

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

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  refresh_token_hash: text('refresh_token_hash').notNull(),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

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
  dpa_erasure_requested_at: timestamp('dpa_erasure_requested_at', { withTimezone: true }),
  automated_decision_consent: boolean('automated_decision_consent').default(false),
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
  legal_entity_id: integer('legal_entity_id'),
  marketing_consent: boolean('marketing_consent').default(false),
  ttra_id: text('ttra_id'),
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
  legal_entity_id: integer('legal_entity_id'),
  calendar_key: text('calendar_key'),
  degraded_mode_flag: boolean('degraded_mode_flag').default(false),
  golden_copy_source: text('golden_copy_source'),
  scrub_status: text('scrub_status'),
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
// 10c. TrustFees Pro — Unified Fees & Charges Platform
// ============================================================================

export const jurisdictions = pgTable('jurisdictions', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  locale: text('locale').notNull(),
  tax_pack_id: integer('tax_pack_id'),
  report_pack_id: integer('report_pack_id'),
  residency_zone: text('residency_zone'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

export const pricingDefinitions = pgTable('pricing_definitions', {
  id: serial('id').primaryKey(),
  pricing_code: text('pricing_code').unique().notNull(),
  pricing_name: text('pricing_name').notNull(),
  pricing_type: pricingTypeEnum('pricing_type').notNull(),
  currency: text('currency').default('PHP').notNull(),
  pricing_tiers: jsonb('pricing_tiers').default([]).notNull(),
  step_windows: jsonb('step_windows'),
  pricing_version: integer('pricing_version').default(1).notNull(),
  library_status: libraryStatusEnum('library_status').default('DRAFT').notNull(),
  ...auditFields,
});

export const eligibilityExpressions = pgTable('eligibility_expressions', {
  id: serial('id').primaryKey(),
  eligibility_code: text('eligibility_code').unique().notNull(),
  eligibility_name: text('eligibility_name').notNull(),
  expression: jsonb('expression').notNull(),
  library_status: libraryStatusEnum('library_status').default('DRAFT').notNull(),
  ...auditFields,
});

export const accrualSchedules = pgTable('accrual_schedules', {
  id: serial('id').primaryKey(),
  schedule_code: text('schedule_code').unique().notNull(),
  schedule_name: text('schedule_name').notNull(),
  accrual_enabled: boolean('accrual_enabled').default(true).notNull(),
  accrual_frequency: accrualFrequencyEnum('accrual_frequency'),
  accrual_method: accrualMethodEnum('accrual_method').default('ABSOLUTE'),
  basis_frequency: accrualFrequencyEnum('basis_frequency'),
  accounting_enabled: boolean('accounting_enabled').default(false).notNull(),
  accounting_frequency: accrualFrequencyEnum('accounting_frequency'),
  invoice_frequency: accrualFrequencyEnum('invoice_frequency').default('MONTHLY'),
  due_date_offset_days: integer('due_date_offset_days').default(20).notNull(),
  reversal_enabled: boolean('reversal_enabled').default(false).notNull(),
  reversal_age_days: integer('reversal_age_days'),
  recovery_mode: text('recovery_mode').default('USER'),
  recovery_frequency: accrualFrequencyEnum('recovery_frequency'),
  upfront_amortization: boolean('upfront_amortization').default(false).notNull(),
  library_status: libraryStatusEnum('library_status').default('DRAFT').notNull(),
  ...auditFields,
});

export const feePlanTemplates = pgTable('fee_plan_templates', {
  id: serial('id').primaryKey(),
  template_code: text('template_code').unique().notNull(),
  template_name: text('template_name').notNull(),
  category: templateCategoryEnum('category').notNull(),
  default_payload: jsonb('default_payload').notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

export const feePlans = pgTable('fee_plans', {
  id: serial('id').primaryKey(),
  fee_plan_code: text('fee_plan_code').unique().notNull(),
  fee_plan_name: text('fee_plan_name').notNull(),
  description: text('description'),
  charge_basis: chargeBasisEnum('charge_basis').notNull(),
  fee_type: feePlanFeeTypeEnum('fee_type').notNull(),
  pricing_definition_id: integer('pricing_definition_id').references(() => pricingDefinitions.id),
  pricing_binding_mode: pricingBindingModeEnum('pricing_binding_mode').default('STRICT').notNull(),
  pricing_binding_version: integer('pricing_binding_version'),
  eligibility_expression_id: integer('eligibility_expression_id').references(() => eligibilityExpressions.id),
  accrual_schedule_id: integer('accrual_schedule_id').references(() => accrualSchedules.id),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  source_party: sourcePartyEnum('source_party').notNull(),
  target_party: targetPartyEnum('target_party').notNull(),
  comparison_basis: comparisonBasisEnum('comparison_basis').notNull(),
  value_basis: valueBasisEnum('value_basis').notNull(),
  event_type: feeEventTypeEnum('event_type'),
  min_charge_amount: numeric('min_charge_amount', { precision: 21, scale: 4 }).default('0'),
  max_charge_amount: numeric('max_charge_amount', { precision: 21, scale: 4 }),
  lower_threshold_pct: numeric('lower_threshold_pct', { precision: 9, scale: 6 }).default('0.050000'),
  upper_threshold_pct: numeric('upper_threshold_pct', { precision: 9, scale: 6 }).default('0.400000'),
  rate_type: rateTypeEnum('rate_type').default('FLAT').notNull(),
  modification_allowed: boolean('modification_allowed').default(true).notNull(),
  aum_basis_include_uitf: boolean('aum_basis_include_uitf').default(false).notNull(),
  aum_basis_include_3p_funds: boolean('aum_basis_include_3p_funds').default(false).notNull(),
  market_value_includes_accruals_override: boolean('market_value_includes_accruals_override'),
  effective_date: date('effective_date').notNull(),
  expiry_date: date('expiry_date'),
  plan_status: feePlanStatusEnum('plan_status').default('DRAFT').notNull(),
  template_id: integer('template_id').references(() => feePlanTemplates.id),
  ...auditFields,
});

export const tfpAccruals = pgTable('tfp_accruals', {
  id: serial('id').primaryKey(),
  fee_plan_id: integer('fee_plan_id').references(() => feePlans.id).notNull(),
  customer_id: text('customer_id').notNull(),
  portfolio_id: text('portfolio_id'),
  security_id: text('security_id'),
  transaction_id: text('transaction_id'),
  base_amount: numeric('base_amount', { precision: 21, scale: 4 }).notNull(),
  computed_fee: numeric('computed_fee', { precision: 21, scale: 4 }).notNull(),
  applied_fee: numeric('applied_fee', { precision: 21, scale: 4 }).notNull(),
  currency: text('currency').default('PHP').notNull(),
  fx_rate_locked: numeric('fx_rate_locked', { precision: 18, scale: 8 }),
  accrual_date: date('accrual_date').notNull(),
  accrual_status: tfpAccrualStatusEnum('accrual_status').default('OPEN').notNull(),
  override_id: integer('override_id'),
  exception_id: integer('exception_id'),
  idempotency_key: text('idempotency_key').notNull(),
  ...auditFields,
});

export const tfpInvoices = pgTable('tfp_invoices', {
  id: serial('id').primaryKey(),
  invoice_number: text('invoice_number').unique().notNull(),
  customer_id: text('customer_id').notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  currency: text('currency').default('PHP').notNull(),
  fx_rate: numeric('fx_rate', { precision: 18, scale: 8 }),
  total_amount: numeric('total_amount', { precision: 21, scale: 4 }).notNull(),
  tax_amount: numeric('tax_amount', { precision: 21, scale: 4 }).default('0').notNull(),
  grand_total: numeric('grand_total', { precision: 21, scale: 4 }).notNull(),
  invoice_date: date('invoice_date').notNull(),
  due_date: date('due_date').notNull(),
  invoice_status: tfpInvoiceStatusEnum('invoice_status').default('DRAFT').notNull(),
  pdf_url: text('pdf_url'),
  tax_pack_version: text('tax_pack_version'),
  ...auditFields,
});

export const tfpInvoiceLines = pgTable('tfp_invoice_lines', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id').references(() => tfpInvoices.id).notNull(),
  accrual_id: integer('accrual_id').references(() => tfpAccruals.id).notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 21, scale: 4 }).default('1').notNull(),
  unit_amount: numeric('unit_amount', { precision: 21, scale: 4 }).notNull(),
  line_amount: numeric('line_amount', { precision: 21, scale: 4 }).notNull(),
  tax_code: text('tax_code'),
  tax_amount: numeric('tax_amount', { precision: 21, scale: 4 }).default('0').notNull(),
  ...auditFields,
});

export const tfpPayments = pgTable('tfp_payments', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id').references(() => tfpInvoices.id),
  amount: numeric('amount', { precision: 21, scale: 4 }).notNull(),
  currency: text('currency').default('PHP').notNull(),
  payment_date: date('payment_date').notNull(),
  method: paymentMethodEnum('method').notNull(),
  reference_no: text('reference_no').notNull(),
  payment_status: paymentStatusEnum('payment_status').default('POSTED').notNull(),
  ...auditFields,
});

export const feeOverrides = pgTable('fee_overrides', {
  id: serial('id').primaryKey(),
  stage: overrideStageEnum('stage').notNull(),
  accrual_id: integer('accrual_id').references(() => tfpAccruals.id),
  invoice_id: integer('invoice_id').references(() => tfpInvoices.id),
  original_amount: numeric('original_amount', { precision: 21, scale: 4 }).notNull(),
  overridden_amount: numeric('overridden_amount', { precision: 21, scale: 4 }).notNull(),
  delta_pct: numeric('delta_pct', { precision: 9, scale: 6 }).notNull(),
  reason_code: text('reason_code').notNull(),
  reason_notes: text('reason_notes').notNull(),
  requested_by: text('requested_by').notNull(),
  approved_by: text('approved_by'),
  override_status: overrideStatusEnum('override_status').default('PENDING').notNull(),
  ...auditFields,
});

export const exceptionItems = pgTable('exception_items', {
  id: serial('id').primaryKey(),
  exception_type: exceptionTypeEnum('exception_type').notNull(),
  severity: exceptionSeverityEnum('severity').default('P3').notNull(),
  customer_id: text('customer_id'),
  source_aggregate_type: text('source_aggregate_type').notNull(),
  source_aggregate_id: text('source_aggregate_id').notNull(),
  title: text('title').notNull(),
  details: jsonb('details').notNull(),
  assigned_to_team: text('assigned_to_team').notNull(),
  assigned_to_user: text('assigned_to_user'),
  exception_status: exceptionStatusEnum('exception_status').default('OPEN').notNull(),
  sla_due_at: timestamp('sla_due_at', { withTimezone: true }).notNull(),
  escalated_at: timestamp('escalated_at', { withTimezone: true }),
  resolution_notes: text('resolution_notes'),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  ...auditFields,
});

export const contentPacks = pgTable('content_packs', {
  id: serial('id').primaryKey(),
  category: contentPackCategoryEnum('category').notNull(),
  pack_version: text('pack_version').notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  effective_date: date('effective_date').notNull(),
  signed_by: text('signed_by').notNull(),
  signature: text('signature').notNull(),
  hash: text('hash').notNull(),
  pack_status: contentPackStatusEnum('pack_status').default('STAGED').notNull(),
  activated_at: timestamp('activated_at', { withTimezone: true }),
  ...auditFields,
});

export const taxRules = pgTable('tax_rules', {
  id: serial('id').primaryKey(),
  tax_code: text('tax_code').notNull(),
  name: text('name').notNull(),
  tax_rule_type: tfpTaxTypeEnum('tax_rule_type').notNull(),
  rate: numeric('rate', { precision: 9, scale: 6 }).notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  applicable_fee_types: jsonb('applicable_fee_types').default([]).notNull(),
  effective_date: date('effective_date').notNull(),
  expiry_date: date('expiry_date'),
  source_pack_id: integer('source_pack_id').references(() => contentPacks.id),
  ...auditFields,
});

export const disputes = pgTable('disputes', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id').references(() => tfpInvoices.id).notNull(),
  raised_by: text('raised_by').notNull(),
  reason: text('reason').notNull(),
  dispute_status: disputeStatusEnum('dispute_status').default('OPEN').notNull(),
  resolution_notes: text('resolution_notes'),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  credit_note_id: integer('credit_note_id'),
  ...auditFields,
});

export const creditNotes = pgTable('credit_notes', {
  id: serial('id').primaryKey(),
  credit_note_number: text('credit_note_number').unique().notNull(),
  related_invoice_id: integer('related_invoice_id').references(() => tfpInvoices.id).notNull(),
  amount: numeric('amount', { precision: 21, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  reason_code: text('reason_code').notNull(),
  cn_status: creditNoteStatusEnum('cn_status').default('ISSUED').notNull(),
  issued_at: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  ...auditFields,
});

export const dataSubjectRequests = pgTable('data_subject_requests', {
  id: serial('id').primaryKey(),
  subject_customer_id: text('subject_customer_id').notNull(),
  dsar_type: dsarTypeEnum('dsar_type').notNull(),
  submitted_via: text('submitted_via').notNull(),
  dsar_status: dsarStatusEnum('dsar_status').default('NEW').notNull(),
  response_deadline: date('response_deadline').notNull(),
  approver_id: text('approver_id'),
  artifact_bundle_url: text('artifact_bundle_url'),
  notes: text('notes'),
  ...auditFields,
});

export const piiClassifications = pgTable('pii_classifications', {
  id: serial('id').primaryKey(),
  aggregate_type: text('aggregate_type').notNull(),
  field_path: text('field_path').notNull(),
  classification: tfpPiiClassEnum('classification').notNull(),
  redaction_rule: redactionRuleEnum('redaction_rule').default('NONE').notNull(),
  ...auditFields,
});

export const auditEvents = pgTable('audit_events', {
  id: serial('id').primaryKey(),
  aggregate_type: text('aggregate_type').notNull(),
  aggregate_id: text('aggregate_id').notNull(),
  event_type: text('event_type').notNull(),
  payload: jsonb('payload'),
  actor_id: text('actor_id'),
  window_id: integer('window_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditWindowSignatures = pgTable('audit_window_signatures', {
  id: serial('id').primaryKey(),
  window_start: timestamp('window_start', { withTimezone: true }).notNull(),
  window_end: timestamp('window_end', { withTimezone: true }).notNull(),
  event_count: integer('event_count').notNull(),
  hash: text('hash').notNull(),
  previous_hash: text('previous_hash'),
  signature: text('signature').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customerReferences = pgTable('customer_references', {
  id: serial('id').primaryKey(),
  customer_id: text('customer_id').unique().notNull(),
  display_name: text('display_name').notNull(),
  customer_type: text('customer_type').notNull(),
  domicile: text('domicile').default('PH').notNull(),
  billing_currency: text('billing_currency').default('PHP').notNull(),
  tin: text('tin'),
  tax_exempt: boolean('tax_exempt').default(false).notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
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
  ttra_id: text('ttra_id'),
  model_version: text('model_version'),
  entitlement_id: integer('entitlement_id'),
  source: text('source').default('TRADE'),
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

// ============================================================================
// TrustFees Pro — Relations
// ============================================================================

export const feePlansRelations = relations(feePlans, ({ one, many }) => ({
  pricingDefinition: one(pricingDefinitions, {
    fields: [feePlans.pricing_definition_id],
    references: [pricingDefinitions.id],
  }),
  eligibilityExpression: one(eligibilityExpressions, {
    fields: [feePlans.eligibility_expression_id],
    references: [eligibilityExpressions.id],
  }),
  accrualSchedule: one(accrualSchedules, {
    fields: [feePlans.accrual_schedule_id],
    references: [accrualSchedules.id],
  }),
  jurisdiction: one(jurisdictions, {
    fields: [feePlans.jurisdiction_id],
    references: [jurisdictions.id],
  }),
  template: one(feePlanTemplates, {
    fields: [feePlans.template_id],
    references: [feePlanTemplates.id],
  }),
  accruals: many(tfpAccruals),
}));

export const tfpAccrualsRelations = relations(tfpAccruals, ({ one }) => ({
  feePlan: one(feePlans, {
    fields: [tfpAccruals.fee_plan_id],
    references: [feePlans.id],
  }),
}));

export const tfpInvoicesRelations = relations(tfpInvoices, ({ one, many }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [tfpInvoices.jurisdiction_id],
    references: [jurisdictions.id],
  }),
  lines: many(tfpInvoiceLines),
  payments: many(tfpPayments),
  disputes: many(disputes),
}));

export const tfpInvoiceLinesRelations = relations(tfpInvoiceLines, ({ one }) => ({
  invoice: one(tfpInvoices, {
    fields: [tfpInvoiceLines.invoice_id],
    references: [tfpInvoices.id],
  }),
  accrual: one(tfpAccruals, {
    fields: [tfpInvoiceLines.accrual_id],
    references: [tfpAccruals.id],
  }),
}));

export const tfpPaymentsRelations = relations(tfpPayments, ({ one }) => ({
  invoice: one(tfpInvoices, {
    fields: [tfpPayments.invoice_id],
    references: [tfpInvoices.id],
  }),
}));

export const feeOverridesRelations = relations(feeOverrides, ({ one }) => ({
  accrual: one(tfpAccruals, {
    fields: [feeOverrides.accrual_id],
    references: [tfpAccruals.id],
  }),
  invoice: one(tfpInvoices, {
    fields: [feeOverrides.invoice_id],
    references: [tfpInvoices.id],
  }),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  invoice: one(tfpInvoices, {
    fields: [disputes.invoice_id],
    references: [tfpInvoices.id],
  }),
}));

export const creditNotesRelations = relations(creditNotes, ({ one }) => ({
  invoice: one(tfpInvoices, {
    fields: [creditNotes.related_invoice_id],
    references: [tfpInvoices.id],
  }),
}));

export const taxRulesRelations = relations(taxRules, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [taxRules.jurisdiction_id],
    references: [jurisdictions.id],
  }),
  sourcePack: one(contentPacks, {
    fields: [taxRules.source_pack_id],
    references: [contentPacks.id],
  }),
}));

export const contentPacksRelations = relations(contentPacks, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [contentPacks.jurisdiction_id],
    references: [jurisdictions.id],
  }),
}));

export const feePlanTemplatesRelations = relations(feePlanTemplates, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [feePlanTemplates.jurisdiction_id],
    references: [jurisdictions.id],
  }),
}));

export const customerReferencesRelations = relations(customerReferences, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [customerReferences.jurisdiction_id],
    references: [jurisdictions.id],
  }),
}));

// ============================================================================
// TRUST-CA 360 — Corporate Actions Management Tables
// ============================================================================

export const legalEntities = pgTable('legal_entities', {
  id: serial('id').primaryKey(),
  entity_code: text('entity_code').unique().notNull(),
  entity_name: text('entity_name').notNull(),
  regulator: text('regulator').notNull(),
  license_ref: text('license_ref').notNull(),
  base_currency: text('base_currency').notNull().default('PHP'),
  data_segregation_scope: dataSegregationEnum('data_segregation_scope').notNull(),
  ...auditFields,
});

export const marketCalendar = pgTable('market_calendar', {
  id: serial('id').primaryKey(),
  calendar_key: text('calendar_key').notNull(),
  date: date('date').notNull(),
  is_business_day: boolean('is_business_day').notNull(),
  is_settlement_day: boolean('is_settlement_day').notNull(),
  holiday_name: text('holiday_name'),
  source: text('source').notNull(),
  ...auditFields,
}, (table) => [
  uniqueIndex('market_calendar_key_date_idx').on(table.calendar_key, table.date),
]);

export const ttraApplications = pgTable('ttra_applications', {
  id: serial('id').primaryKey(),
  ttra_id: text('ttra_id').unique().notNull(),
  client_id: text('client_id').references(() => clients.client_id),
  treaty_country: text('treaty_country').notNull(),
  cor_document_ref: text('cor_document_ref').notNull(),
  bir_ctrr_ruling_no: text('bir_ctrr_ruling_no'),
  ttra_status: ttraStatusEnum('ttra_status').notNull().default('APPLIED'),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to').notNull(),
  next_review_due: date('next_review_due').notNull(),
  ...auditFields,
});

export const claims = pgTable('claims', {
  id: serial('id').primaryKey(),
  claim_id: text('claim_id').unique().notNull(),
  claim_reference: text('claim_reference').unique().notNull(),
  event_id: integer('event_id').references(() => corporateActions.id),
  account_id: text('account_id'),
  origination: claimOriginationEnum('origination').notNull(),
  root_cause_code: claimRootCauseEnum('root_cause_code'),
  claim_amount: numeric('claim_amount').notNull(),
  currency: text('currency').notNull().default('PHP'),
  pnl_impact_account: text('pnl_impact_account'),
  approval_tier: claimApprovalTierEnum('approval_tier').notNull(),
  claim_status: claimStatusEnum('claim_status').notNull().default('DRAFT'),
  compensation_settlement_id: integer('compensation_settlement_id'),
  regulatory_disclosure_required: boolean('regulatory_disclosure_required').notNull().default(false),
  supporting_docs: jsonb('supporting_docs'),
  investigation_started_at: timestamp('investigation_started_at', { withTimezone: true }),
  investigation_sla_deadline: timestamp('investigation_sla_deadline', { withTimezone: true }),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  rejection_reason: text('rejection_reason'),
  ...auditFields,
});

export const dataStewardship = pgTable('data_stewardship', {
  id: serial('id').primaryKey(),
  dataset_key: text('dataset_key').unique().notNull(),
  steward_user_id: integer('steward_user_id').references(() => users.id),
  approval_policy: stewardshipApprovalEnum('approval_policy').notNull(),
  change_frequency_cap: text('change_frequency_cap'),
  last_reviewed_at: timestamp('last_reviewed_at', { withTimezone: true }).notNull(),
  ...auditFields,
});

export const consentRecords = pgTable('consent_records', {
  id: serial('id').primaryKey(),
  consent_id: text('consent_id').unique().notNull(),
  client_id: text('client_id').references(() => clients.client_id),
  purpose: consentPurposeEnum('purpose').notNull(),
  channel_scope: jsonb('channel_scope').notNull(),
  granted: boolean('granted').notNull(),
  granted_at: timestamp('granted_at', { withTimezone: true }).notNull(),
  withdrawn_at: timestamp('withdrawn_at', { withTimezone: true }),
  legal_basis: consentLegalBasisEnum('legal_basis').notNull(),
  dpa_ref: text('dpa_ref').notNull(),
  ...auditFields,
});

export const feedRouting = pgTable('feed_routing', {
  id: serial('id').primaryKey(),
  routing_id: text('routing_id').unique().notNull(),
  security_segment: securitySegmentEnum('security_segment').notNull(),
  primary_source: text('primary_source').notNull(),
  secondary_source: text('secondary_source').notNull(),
  cost_tier: feedCostTierEnum('cost_tier').notNull(),
  active_flag: boolean('active_flag').notNull().default(true),
  ...auditFields,
});

export const degradedModeLogs = pgTable('degraded_mode_logs', {
  id: serial('id').primaryKey(),
  incident_id: text('incident_id').unique().notNull(),
  started_at: timestamp('started_at', { withTimezone: true }).notNull(),
  ended_at: timestamp('ended_at', { withTimezone: true }),
  failed_component: degradedModeComponentEnum('failed_component').notNull(),
  fallback_path: text('fallback_path').notNull(),
  impacted_event_ids: jsonb('impacted_event_ids'),
  rca_completed: boolean('rca_completed').notNull().default(false),
  ...auditFields,
});

// --- TRUST-CA 360 Relations ---

export const legalEntitiesRelations = relations(legalEntities, ({ many }) => ({
  corporateActions: many(corporateActions),
  portfolios: many(portfolios),
}));

export const ttraApplicationsRelations = relations(ttraApplications, ({ one }) => ({
  client: one(clients, {
    fields: [ttraApplications.client_id],
    references: [clients.client_id],
  }),
}));

export const claimsRelations = relations(claims, ({ one }) => ({
  event: one(corporateActions, {
    fields: [claims.event_id],
    references: [corporateActions.id],
  }),
  approvedByUser: one(users, {
    fields: [claims.approved_by],
    references: [users.id],
  }),
}));

export const consentRecordsRelations = relations(consentRecords, ({ one }) => ({
  client: one(clients, {
    fields: [consentRecords.client_id],
    references: [clients.client_id],
  }),
}));

export const dataStewardshipRelations = relations(dataStewardship, ({ one }) => ({
  steward: one(users, {
    fields: [dataStewardship.steward_user_id],
    references: [users.id],
  }),
}));

// ============================================================================
// Enterprise GL — Enums
// ============================================================================

export const glTypeEnum = pgEnum('gl_type', ['ASSET', 'LIABILITY', 'INCOME', 'EXPENDITURE', 'EQUITY']);

export const glAccountStatusEnum = pgEnum('gl_account_status', ['OPEN', 'CLOSED', 'SUSPENDED']);

export const postingModeEnum = pgEnum('posting_mode', [
  'ONLINE', 'BATCH', 'MANUAL', 'EOD', 'SOD', 'MOD', 'NAV_FINALIZATION', 'YEAR_END',
]);

export const journalBatchStatusEnum = pgEnum('journal_batch_status', [
  'DRAFT', 'PENDING_VALIDATION', 'VALIDATED', 'PENDING_AUTH', 'AUTHORIZED', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED',
]);

export const drCrEnum = pgEnum('dr_cr', ['DR', 'CR']);

export const holdingClassificationEnum = pgEnum('holding_classification', [
  'HTM', 'AFS', 'HFT', 'FVPL', 'FVTPL', 'FVOCI', 'HTC',
]);

export const accountingStandardEnum = pgEnum('accounting_standard', ['PFRS', 'IFRS', 'LOCAL_GAAP']);

export const frptiContractualRelEnum = pgEnum('frpti_contractual_rel', [
  'TRUST', 'OTHER_FIDUCIARY', 'AGENCY', 'ADVISORY_CONSULTANCY', 'SPECIAL_PURPOSE_TRUST',
]);

export const frptiBookEnum = pgEnum('frpti_book', ['RBU', 'FCDU', 'EFCDU']);

export const navStatusEnum = pgEnum('nav_status', ['DRAFT', 'FINAL', 'REVERSED']);

export const fxRateTypeEnum = pgEnum('fx_rate_type', ['ACTUAL', 'NOTIONAL']);

export const fxRateFlagEnum = pgEnum('fx_rate_flag', ['DAILY', 'WEEKLY_AVG', 'QUARTERLY_AVG']);

export const glRevalDirectionEnum = pgEnum('gl_reval_direction', ['GAIN', 'LOSS']);

export const accountingRuleStatusEnum = pgEnum('accounting_rule_status', [
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED',
]);

export const postingExceptionCatEnum = pgEnum('posting_exception_cat', [
  'SCHEMA_ERROR', 'MASTER_DATA_ERROR', 'RULE_ERROR', 'VALIDATION_ERROR', 'AUTHORIZATION_ERROR', 'SYSTEM_ERROR',
]);

export const yearEndStatusEnum = pgEnum('year_end_status', ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REVERSED']);

export const frptiResidentStatusEnum = pgEnum('frpti_resident_status', ['RESIDENT', 'NON_RESIDENT']);

// ============================================================================
// Enterprise GL — Master Tables
// ============================================================================

/** GL Category — classifies GL heads: asset, liability, income, expense, etc. */
export const glCategories = pgTable('gl_categories', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  concise_name: text('concise_name'),
  category_type: glTypeEnum('category_type').notNull(),
  is_bank_gl: boolean('is_bank_gl').default(false).notNull(),
  is_nostro: boolean('is_nostro').default(false).notNull(),
  is_vostro: boolean('is_vostro').default(false).notNull(),
  description: text('description'),
  ...auditFields,
});

/** GL Hierarchy — parent-child structure for financial statements */
export const glHierarchy = pgTable('gl_hierarchy', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  parent_hierarchy_id: integer('parent_hierarchy_id'),
  level: integer('level').notNull().default(0),
  sort_order: integer('sort_order').notNull().default(0),
  description: text('description'),
  ...auditFields,
});

/** GL Head — Chart of Accounts nodes used for posting and reporting */
export const glHeads = pgTable('gl_heads', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  gl_type: glTypeEnum('gl_type').notNull(),
  category_id: integer('category_id').references(() => glCategories.id).notNull(),
  hierarchy_id: integer('hierarchy_id').references(() => glHierarchy.id),
  parent_gl_id: integer('parent_gl_id'),
  contra_gl_id: integer('contra_gl_id'),
  book_code: text('book_code'),
  account_status: glAccountStatusEnum('account_status').notNull().default('OPEN'),
  currency_restriction: text('currency_restriction'),
  opening_date: date('opening_date').notNull(),
  closing_date: date('closing_date'),
  is_manual_posting_allowed: boolean('is_manual_posting_allowed').default(true).notNull(),
  manual_restriction_effective_from: date('manual_restriction_effective_from'),
  is_revaluation_enabled: boolean('is_revaluation_enabled').default(false).notNull(),
  is_customer_account_enabled: boolean('is_customer_account_enabled').default(false).notNull(),
  is_nominal: boolean('is_nominal').default(false).notNull(),
  is_interunit: boolean('is_interunit').default(false).notNull(),
  nav_inclusion: boolean('nav_inclusion').default(true).notNull(),
  frpti_report_line: text('frpti_report_line'),
  frpti_schedule: text('frpti_schedule'),
  fs_mapping_code: text('fs_mapping_code'),
  description: text('description'),
  ...auditFields,
});

/** GL Access Code — operational posting access codes */
export const glAccessCodes = pgTable('gl_access_codes', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  accounting_unit_id: integer('accounting_unit_id'),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Accounting Unit — replaces/extends branch for portfolio-level accounting */
export const accountingUnits = pgTable('accounting_units', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  branch_id: integer('branch_id').references(() => branches.id),
  legal_entity_id: integer('legal_entity_id').references(() => legalEntities.id),
  base_currency: text('base_currency').notNull().default('PHP'),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Fund Master — UITF/fund parameters for NAV, fees, valuation */
export const fundMaster = pgTable('fund_master', {
  id: serial('id').primaryKey(),
  fund_code: text('fund_code').unique().notNull(),
  fund_name: text('fund_name').notNull(),
  fund_structure: text('fund_structure').notNull(), // open-ended, close-ended, interval
  fund_type: text('fund_type').notNull(),
  fund_currency: text('fund_currency').notNull().default('PHP'),
  nav_frequency: text('nav_frequency').notNull().default('DAILY'), // DAILY, ALL_DAYS, WEEKLY, MONTHLY
  first_nav_date: date('first_nav_date'),
  first_eoy_date: date('first_eoy_date'),
  last_eoy_date: date('last_eoy_date'),
  unit_precision: integer('unit_precision').notNull().default(4),
  nav_decimals: integer('nav_decimals').notNull().default(4),
  nav_rounding_method: text('nav_rounding_method').notNull().default('ROUND_OFF'), // ROUND_OFF, ROUND_UP, NO_ROUND
  tax_on_interest: boolean('tax_on_interest').default(false).notNull(),
  default_operative_account: text('default_operative_account'),
  valuation_basis: text('valuation_basis'),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Portfolio Master (GL-specific extension) — accounting container under fund/customer/trust */
export const glPortfolioMaster = pgTable('gl_portfolio_master', {
  id: serial('id').primaryKey(),
  portfolio_code: text('portfolio_code').unique().notNull(),
  portfolio_name: text('portfolio_name').notNull(),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id),
  product_class: text('product_class'), // IMA, PRE_NEED, UITF, etc.
  contractual_relationship: frptiContractualRelEnum('contractual_relationship'),
  discretionary_flag: boolean('discretionary_flag').default(false).notNull(),
  tax_exempt: boolean('tax_exempt').default(false).notNull(),
  is_government_entity: boolean('is_government_entity').default(false).notNull(),
  is_specialized_institutional: boolean('is_specialized_institutional').default(false).notNull(),
  base_currency: text('base_currency').notNull().default('PHP'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

/** Counterparty Master (GL extension) — issuer/counterparty with FRPTI classification */
export const glCounterpartyMaster = pgTable('gl_counterparty_master', {
  id: serial('id').primaryKey(),
  counterparty_code: text('counterparty_code').unique().notNull(),
  counterparty_name: text('counterparty_name').notNull(),
  counterparty_id: integer('counterparty_id').references(() => counterparties.id),
  frpti_sector: text('frpti_sector'),
  frpti_sub_sector: text('frpti_sub_sector'),
  resident_status: frptiResidentStatusEnum('resident_status'),
  is_government: boolean('is_government').default(false).notNull(),
  country_code: text('country_code'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

/** FRPTI Mapping — GL-to-FRPTI report line/schedule mapping */
export const frptiMappings = pgTable('frpti_mappings', {
  id: serial('id').primaryKey(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  frpti_report_line: text('frpti_report_line').notNull(),
  frpti_schedule: text('frpti_schedule').notNull(),
  frpti_book: frptiBookEnum('frpti_book').notNull().default('RBU'),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  mapping_version: integer('mapping_version').notNull().default(1),
  description: text('description'),
  ...auditFields,
});

/** Financial Statement Mapping — GL-to-BS/IS/TB mapping */
export const fsMapping = pgTable('fs_mapping', {
  id: serial('id').primaryKey(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  report_type: text('report_type').notNull(), // BALANCE_SHEET, INCOME_STATEMENT, TRIAL_BALANCE
  report_section: text('report_section').notNull(),
  report_line: text('report_line').notNull(),
  sort_order: integer('sort_order').notNull().default(0),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  mapping_version: integer('mapping_version').notNull().default(1),
  ...auditFields,
});

/** FX Rate — exchange rates by currency pair and date */
export const fxRates = pgTable('fx_rates', {
  id: serial('id').primaryKey(),
  rate_type_code: text('rate_type_code').notNull(),
  rate_type: fxRateTypeEnum('rate_type').notNull().default('ACTUAL'),
  rate_flag: fxRateFlagEnum('rate_flag').notNull().default('DAILY'),
  currency_from: text('currency_from').notNull(),
  currency_to: text('currency_to').notNull(),
  business_date: date('business_date').notNull(),
  date_serial: integer('date_serial').notNull().default(1),
  purchase_rate: numeric('purchase_rate'),
  selling_rate: numeric('selling_rate'),
  mid_rate: numeric('mid_rate'),
  source: text('source'), // MANUAL, BLOOMBERG, REUTERS
  ...auditFields,
}, (table) => [
  uniqueIndex('fx_rate_unique_idx').on(table.currency_from, table.currency_to, table.business_date, table.rate_type_code, table.date_serial),
]);

/** Revaluation Parameter — FCY GL revaluation setup */
export const revalParameters = pgTable('reval_parameters', {
  id: serial('id').primaryKey(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  gain_gl_id: integer('gain_gl_id').references(() => glHeads.id).notNull(),
  loss_gl_id: integer('loss_gl_id').references(() => glHeads.id).notNull(),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  revaluation_frequency: text('revaluation_frequency').notNull().default('DAILY'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — Event & Accounting Rule Tables
// ============================================================================

/** Event Definition — registry of business events that generate accounting */
export const glEventDefinitions = pgTable('gl_event_definitions', {
  id: serial('id').primaryKey(),
  product: text('product').notNull(),
  event_code: text('event_code').unique().notNull(),
  event_name: text('event_name').notNull(),
  payload_schema: jsonb('payload_schema'),
  posting_mode: postingModeEnum('posting_mode').notNull(),
  authorization_policy: text('authorization_policy').notNull().default('AUTO'),
  reversal_policy: text('reversal_policy'),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Criteria Definition — header for selecting applicable rule set */
export const glCriteriaDefinitions = pgTable('gl_criteria_definitions', {
  id: serial('id').primaryKey(),
  event_id: integer('event_id').references(() => glEventDefinitions.id).notNull(),
  criteria_name: text('criteria_name').notNull(),
  priority: integer('priority').notNull().default(100),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  is_default: boolean('is_default').default(false).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Criteria Condition — field/relation/value for criteria matching */
export const glCriteriaConditions = pgTable('gl_criteria_conditions', {
  id: serial('id').primaryKey(),
  criteria_id: integer('criteria_id').references(() => glCriteriaDefinitions.id).notNull(),
  field_name: text('field_name').notNull(),
  relation: text('relation').notNull(), // =, !=, in, not in, >, <
  field_value: text('field_value').notNull(),
  ...auditFields,
});

/** Accounting Rule Set — versioned rule header */
export const glAccountingRuleSets = pgTable('gl_accounting_rule_sets', {
  id: serial('id').primaryKey(),
  criteria_id: integer('criteria_id').references(() => glCriteriaDefinitions.id).notNull(),
  rule_code: text('rule_code').notNull(),
  rule_name: text('rule_name').notNull(),
  rule_version: integer('rule_version').notNull().default(1),
  rule_status: accountingRuleStatusEnum('rule_status').notNull().default('DRAFT'),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  description: text('description'),
  ...auditFields,
}, (table) => [
  uniqueIndex('gl_rule_set_version_idx').on(table.rule_code, table.rule_version),
]);

/** Accounting Entry Definition — journal line generation logic */
export const glAccountingEntryDefinitions = pgTable('gl_accounting_entry_definitions', {
  id: serial('id').primaryKey(),
  rule_set_id: integer('rule_set_id').references(() => glAccountingRuleSets.id).notNull(),
  line_order: integer('line_order').notNull(),
  dr_cr: drCrEnum('dr_cr').notNull(),
  gl_selector: text('gl_selector').notNull(), // Static GL code, field reference, or expression
  gl_selector_type: text('gl_selector_type').notNull().default('STATIC'), // STATIC, FIELD, EXPRESSION
  amount_type: text('amount_type').notNull().default('FIELD'), // FIELD, EXPRESSION
  amount_field: text('amount_field'),
  amount_expression: text('amount_expression'),
  currency_expression: text('currency_expression').notNull().default('event.currency'),
  narration_template: text('narration_template'),
  posting_trigger: text('posting_trigger'),
  accounting_standard: accountingStandardEnum('accounting_standard'),
  dimension_mapping: jsonb('dimension_mapping'),
  description: text('description'),
  ...auditFields,
});

/** Rule Test Case — expected input/output for golden accounting tests */
export const glRuleTestCases = pgTable('gl_rule_test_cases', {
  id: serial('id').primaryKey(),
  rule_set_id: integer('rule_set_id').references(() => glAccountingRuleSets.id).notNull(),
  test_name: text('test_name').notNull(),
  sample_event_payload: jsonb('sample_event_payload').notNull(),
  expected_journal_lines: jsonb('expected_journal_lines').notNull(),
  is_rejection_case: boolean('is_rejection_case').default(false).notNull(),
  expected_error: text('expected_error'),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — Ledger Core Tables
// ============================================================================

/** Business Event — raw event from source systems */
export const glBusinessEvents = pgTable('gl_business_events', {
  id: serial('id').primaryKey(),
  source_system: text('source_system').notNull(),
  source_reference: text('source_reference').notNull(),
  idempotency_key: text('idempotency_key').unique().notNull(),
  event_code: text('event_code').notNull(),
  event_payload: jsonb('event_payload').notNull(),
  event_hash: text('event_hash').notNull(),
  business_date: date('business_date').notNull(),
  event_time: timestamp('event_time', { withTimezone: true }).defaultNow().notNull(),
  processed: boolean('processed').default(false).notNull(),
  ...auditFields,
});

/** Accounting Intent — event matched to rule/criteria */
export const glAccountingIntents = pgTable('gl_accounting_intents', {
  id: serial('id').primaryKey(),
  event_id: integer('event_id').references(() => glBusinessEvents.id).notNull(),
  event_code: text('event_code').notNull(),
  criteria_id: integer('criteria_id').references(() => glCriteriaDefinitions.id),
  rule_set_id: integer('rule_set_id').references(() => glAccountingRuleSets.id),
  rule_version: integer('rule_version'),
  intent_status: text('intent_status').notNull().default('PENDING'), // PENDING, RESOLVED, POSTED, FAILED
  error_message: text('error_message'),
  ...auditFields,
});

/** Journal Batch — batch header for posted entries */
export const glJournalBatches = pgTable('gl_journal_batches', {
  id: serial('id').primaryKey(),
  batch_ref: text('batch_ref').unique().notNull(),
  source_system: text('source_system').notNull(),
  source_event_id: integer('source_event_id').references(() => glBusinessEvents.id),
  event_code: text('event_code'),
  rule_version: text('rule_version'),
  posting_mode: postingModeEnum('posting_mode').notNull(),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id).notNull(),
  transaction_date: date('transaction_date').notNull(),
  value_date: date('value_date').notNull(),
  posting_date: timestamp('posting_date', { withTimezone: true }),
  batch_status: journalBatchStatusEnum('batch_status').notNull().default('DRAFT'),
  total_debit: numeric('total_debit').notNull().default('0'),
  total_credit: numeric('total_credit').notNull().default('0'),
  line_count: integer('line_count').notNull().default(0),
  narration: text('narration'),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  financial_year: text('financial_year'),
  financial_period: text('financial_period'),
  maker_id: integer('maker_id').references(() => users.id),
  checker_id: integer('checker_id').references(() => users.id),
  authorized_at: timestamp('authorized_at', { withTimezone: true }),
  rejection_reason: text('rejection_reason'),
  ...auditFields,
});

/** Journal Line — individual debit/credit entry */
export const glJournalLines = pgTable('gl_journal_lines', {
  id: serial('id').primaryKey(),
  batch_id: integer('batch_id').references(() => glJournalBatches.id).notNull(),
  line_no: integer('line_no').notNull(),
  dr_cr: drCrEnum('dr_cr').notNull(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  gl_access_code: text('gl_access_code'),
  amount: numeric('amount').notNull(),
  currency: text('currency').notNull().default('PHP'),
  conversion_rate: numeric('conversion_rate'),
  base_currency: text('base_currency').notNull().default('PHP'),
  base_amount: numeric('base_amount').notNull(),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  portfolio_id: integer('portfolio_id').references(() => glPortfolioMaster.id),
  account_number: text('account_number'),
  contract_number: text('contract_number'),
  security_id: integer('security_id').references(() => securities.id),
  counterparty_id: integer('counterparty_id').references(() => glCounterpartyMaster.id),
  holding_classification: holdingClassificationEnum('holding_classification'),
  product_class: text('product_class'),
  frpti_code: text('frpti_code'),
  frpti_contractual_rel: frptiContractualRelEnum('frpti_contractual_rel'),
  frpti_book: frptiBookEnum('frpti_book'),
  accounting_standard: accountingStandardEnum('accounting_standard'),
  narration: text('narration'),
  transaction_code: text('transaction_code'),
  ...auditFields,
});

/** Authorization Task — maker/checker workflow for GL operations */
export const glAuthorizationTasks = pgTable('gl_authorization_tasks', {
  id: serial('id').primaryKey(),
  object_type: text('object_type').notNull(), // JOURNAL_BATCH, GL_HEAD, RULE_SET, REVERSAL, etc.
  object_id: integer('object_id').notNull(),
  action: text('action').notNull(), // CREATE, MODIFY, CANCEL, REVERSE, YEAR_END
  maker_id: integer('maker_id').references(() => users.id).notNull(),
  checker_id: integer('checker_id').references(() => users.id),
  auth_status: text('auth_status').notNull().default('PENDING'), // PENDING, APPROVED, REJECTED
  reason: text('reason'),
  maker_timestamp: timestamp('maker_timestamp', { withTimezone: true }).defaultNow().notNull(),
  checker_timestamp: timestamp('checker_timestamp', { withTimezone: true }),
  ...auditFields,
});

/** Reversal Link — tracks original-to-reversal/cancellation relationships */
export const glReversalLinks = pgTable('gl_reversal_links', {
  id: serial('id').primaryKey(),
  original_batch_id: integer('original_batch_id').references(() => glJournalBatches.id).notNull(),
  reversal_batch_id: integer('reversal_batch_id').references(() => glJournalBatches.id).notNull(),
  reversal_type: text('reversal_type').notNull(), // CANCELLATION, REVERSAL, ADJUSTMENT
  reversal_reason: text('reversal_reason').notNull(),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  ...auditFields,
});

/** Ledger Balance — current balance by dimension set */
export const glLedgerBalances = pgTable('gl_ledger_balances', {
  id: serial('id').primaryKey(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  gl_access_code: text('gl_access_code'),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id).notNull(),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  portfolio_id: integer('portfolio_id').references(() => glPortfolioMaster.id),
  account_number: text('account_number'),
  contract_number: text('contract_number'),
  security_id: integer('security_id'),
  counterparty_id: integer('counterparty_id'),
  currency: text('currency').notNull().default('PHP'),
  accounting_standard: accountingStandardEnum('accounting_standard'),
  balance_date: date('balance_date').notNull(),
  opening_balance: numeric('opening_balance').notNull().default('0'),
  debit_turnover: numeric('debit_turnover').notNull().default('0'),
  credit_turnover: numeric('credit_turnover').notNull().default('0'),
  closing_balance: numeric('closing_balance').notNull().default('0'),
  fcy_balance: numeric('fcy_balance'),
  base_amount: numeric('base_amount'),
  revaluation_amount: numeric('revaluation_amount'),
  last_posting_ref: text('last_posting_ref'),
  ...auditFields,
});

/** Balance Snapshot — daily/period snapshots for reporting */
export const glBalanceSnapshots = pgTable('gl_balance_snapshots', {
  id: serial('id').primaryKey(),
  snapshot_date: date('snapshot_date').notNull(),
  snapshot_type: text('snapshot_type').notNull().default('DAILY'), // DAILY, MONTH_END, QUARTER_END, YEAR_END
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  gl_access_code: text('gl_access_code'),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id).notNull(),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  portfolio_id: integer('portfolio_id').references(() => glPortfolioMaster.id),
  currency: text('currency').notNull().default('PHP'),
  opening_balance: numeric('opening_balance').notNull().default('0'),
  debit_turnover: numeric('debit_turnover').notNull().default('0'),
  credit_turnover: numeric('credit_turnover').notNull().default('0'),
  closing_balance: numeric('closing_balance').notNull().default('0'),
  fcy_balance: numeric('fcy_balance'),
  base_amount: numeric('base_amount'),
  ...auditFields,
});

/** Posting Exception — error and exception queue */
export const glPostingExceptions = pgTable('gl_posting_exceptions', {
  id: serial('id').primaryKey(),
  event_id: integer('event_id').references(() => glBusinessEvents.id),
  batch_id: integer('batch_id').references(() => glJournalBatches.id),
  source_system: text('source_system'),
  exception_category: postingExceptionCatEnum('exception_category').notNull(),
  error_message: text('error_message').notNull(),
  business_date: date('business_date'),
  assigned_to: integer('assigned_to').references(() => users.id),
  retry_eligible: boolean('retry_eligible').default(true).notNull(),
  resolved: boolean('resolved').default(false).notNull(),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  resolved_by: integer('resolved_by').references(() => users.id),
  related_object_type: text('related_object_type'),
  related_object_id: integer('related_object_id'),
  ...auditFields,
});

/** GL Audit Log — immutable audit events for GL operations */
export const glAuditLog = pgTable('gl_audit_log', {
  id: serial('id').primaryKey(),
  action: text('action').notNull(),
  object_type: text('object_type').notNull(),
  object_id: integer('object_id').notNull(),
  user_id: integer('user_id').references(() => users.id),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  old_values: jsonb('old_values'),
  new_values: jsonb('new_values'),
  source_payload_hash: text('source_payload_hash'),
  rule_version: text('rule_version'),
  ip_address: text('ip_address'),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — NAV Processing Tables
// ============================================================================

/** NAV Computation — tracks draft and final NAV calculations */
export const glNavComputations = pgTable('gl_nav_computations', {
  id: serial('id').primaryKey(),
  fund_id: integer('fund_id').references(() => fundMaster.id).notNull(),
  nav_date: date('nav_date').notNull(),
  nav_status: navStatusEnum('nav_status').notNull().default('DRAFT'),
  previous_nav_date: date('previous_nav_date'),
  next_nav_date: date('next_nav_date'),
  outstanding_units: numeric('outstanding_units'),
  total_assets: numeric('total_assets'),
  total_liabilities: numeric('total_liabilities'),
  gross_nav: numeric('gross_nav'),
  total_fees: numeric('total_fees'),
  total_taxes: numeric('total_taxes'),
  net_nav: numeric('net_nav'),
  navpu: numeric('navpu'),
  accrued_income: numeric('accrued_income'),
  accrued_expenses: numeric('accrued_expenses'),
  market_value: numeric('market_value'),
  book_value: numeric('book_value'),
  unrealized_gain_loss: numeric('unrealized_gain_loss'),
  journal_batch_id: integer('journal_batch_id').references(() => glJournalBatches.id),
  finalized_by: integer('finalized_by').references(() => users.id),
  finalized_at: timestamp('finalized_at', { withTimezone: true }),
  reversal_of_id: integer('reversal_of_id'),
  ...auditFields,
});

/** Portfolio Classification — security classification within fund */
export const glPortfolioClassifications = pgTable('gl_portfolio_classifications', {
  id: serial('id').primaryKey(),
  fund_id: integer('fund_id').references(() => fundMaster.id).notNull(),
  security_id: integer('security_id').references(() => securities.id).notNull(),
  classification: holdingClassificationEnum('classification').notNull(),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  ...auditFields,
}, (table) => [
  uniqueIndex('portfolio_class_unique_idx').on(table.fund_id, table.security_id),
]);

// ============================================================================
// Enterprise GL — Year-End & Period Control Tables
// ============================================================================

/** Financial Year — defines financial year and period boundaries */
export const glFinancialYears = pgTable('gl_financial_years', {
  id: serial('id').primaryKey(),
  year_code: text('year_code').unique().notNull(),
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  is_closed: boolean('is_closed').default(false).notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  closed_by: integer('closed_by').references(() => users.id),
  year_end_status: yearEndStatusEnum('year_end_status'),
  year_end_batch_id: integer('year_end_batch_id').references(() => glJournalBatches.id),
  income_transfer_gl_id: integer('income_transfer_gl_id').references(() => glHeads.id),
  expense_transfer_gl_id: integer('expense_transfer_gl_id').references(() => glHeads.id),
  retained_earnings_gl_id: integer('retained_earnings_gl_id').references(() => glHeads.id),
  year_end_txn_code: text('year_end_txn_code'),
  ...auditFields,
});

/** Financial Period — month/quarter periods within a financial year */
export const glFinancialPeriods = pgTable('gl_financial_periods', {
  id: serial('id').primaryKey(),
  year_id: integer('year_id').references(() => glFinancialYears.id).notNull(),
  period_code: text('period_code').notNull(), // 2026-01, 2026-Q1, etc.
  period_type: text('period_type').notNull(), // MONTHLY, QUARTERLY
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  is_closed: boolean('is_closed').default(false).notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  closed_by: integer('closed_by').references(() => users.id),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — FRPTI Data Mart Tables
// ============================================================================

/** FRPTI Extract — quarterly FRPTI reporting data */
export const glFrptiExtracts = pgTable('gl_frpti_extracts', {
  id: serial('id').primaryKey(),
  reporting_period: text('reporting_period').notNull(), // 2026-Q1
  reporting_date: date('reporting_date').notNull(),
  frpti_book: frptiBookEnum('frpti_book').notNull().default('RBU'),
  frpti_schedule: text('frpti_schedule').notNull(),
  frpti_report_line: text('frpti_report_line').notNull(),
  contractual_relationship: frptiContractualRelEnum('contractual_relationship'),
  resident_status: frptiResidentStatusEnum('resident_status'),
  sector: text('sector'),
  currency: text('currency').notNull().default('PHP'),
  amount: numeric('amount').notNull().default('0'),
  count: integer('count'),
  functional_currency: text('functional_currency'),
  presentation_currency: text('presentation_currency').default('PHP'),
  is_validated: boolean('is_validated').default(false).notNull(),
  validation_errors: jsonb('validation_errors'),
  ...auditFields,
});

/** FX Revaluation Run — tracks daily revaluation processing */
export const glFxRevaluationRuns = pgTable('gl_fx_revaluation_runs', {
  id: serial('id').primaryKey(),
  business_date: date('business_date').notNull(),
  run_status: text('run_status').notNull().default('PENDING'), // PENDING, IN_PROGRESS, COMPLETED, FAILED
  total_gls_processed: integer('total_gls_processed').default(0),
  total_gain: numeric('total_gain').default('0'),
  total_loss: numeric('total_loss').default('0'),
  journal_batch_id: integer('journal_batch_id').references(() => glJournalBatches.id),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  run_by: integer('run_by').references(() => users.id),
  ...auditFields,
});

/** FX Revaluation Detail — per-GL revaluation results */
export const glFxRevaluationDetails = pgTable('gl_fx_revaluation_details', {
  id: serial('id').primaryKey(),
  run_id: integer('run_id').references(() => glFxRevaluationRuns.id).notNull(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  currency: text('currency').notNull(),
  fcy_balance: numeric('fcy_balance').notNull(),
  old_base_equivalent: numeric('old_base_equivalent').notNull(),
  closing_mid_rate: numeric('closing_mid_rate').notNull(),
  new_base_equivalent: numeric('new_base_equivalent').notNull(),
  revaluation_amount: numeric('revaluation_amount').notNull(),
  direction: glRevalDirectionEnum('direction').notNull(),
  posted_to_gl: text('posted_to_gl'),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — Relations
// ============================================================================

export const glHeadsRelations = relations(glHeads, ({ one, many }) => ({
  category: one(glCategories, {
    fields: [glHeads.category_id],
    references: [glCategories.id],
  }),
  hierarchy: one(glHierarchy, {
    fields: [glHeads.hierarchy_id],
    references: [glHierarchy.id],
  }),
  accessCodes: many(glAccessCodes),
  journalLines: many(glJournalLines),
  balances: many(glLedgerBalances),
}));

export const glAccessCodesRelations = relations(glAccessCodes, ({ one }) => ({
  glHead: one(glHeads, {
    fields: [glAccessCodes.gl_head_id],
    references: [glHeads.id],
  }),
}));

export const glJournalBatchesRelations = relations(glJournalBatches, ({ one, many }) => ({
  accountingUnit: one(accountingUnits, {
    fields: [glJournalBatches.accounting_unit_id],
    references: [accountingUnits.id],
  }),
  fund: one(fundMaster, {
    fields: [glJournalBatches.fund_id],
    references: [fundMaster.id],
  }),
  sourceEvent: one(glBusinessEvents, {
    fields: [glJournalBatches.source_event_id],
    references: [glBusinessEvents.id],
  }),
  maker: one(users, {
    fields: [glJournalBatches.maker_id],
    references: [users.id],
    relationName: 'batchMaker',
  }),
  checker: one(users, {
    fields: [glJournalBatches.checker_id],
    references: [users.id],
    relationName: 'batchChecker',
  }),
  lines: many(glJournalLines),
}));

export const glJournalLinesRelations = relations(glJournalLines, ({ one }) => ({
  batch: one(glJournalBatches, {
    fields: [glJournalLines.batch_id],
    references: [glJournalBatches.id],
  }),
  glHead: one(glHeads, {
    fields: [glJournalLines.gl_head_id],
    references: [glHeads.id],
  }),
  fund: one(fundMaster, {
    fields: [glJournalLines.fund_id],
    references: [fundMaster.id],
  }),
  portfolio: one(glPortfolioMaster, {
    fields: [glJournalLines.portfolio_id],
    references: [glPortfolioMaster.id],
  }),
  security: one(securities, {
    fields: [glJournalLines.security_id],
    references: [securities.id],
  }),
  counterparty: one(glCounterpartyMaster, {
    fields: [glJournalLines.counterparty_id],
    references: [glCounterpartyMaster.id],
  }),
}));

export const glCriteriaRelations = relations(glCriteriaDefinitions, ({ one, many }) => ({
  event: one(glEventDefinitions, {
    fields: [glCriteriaDefinitions.event_id],
    references: [glEventDefinitions.id],
  }),
  conditions: many(glCriteriaConditions),
  ruleSets: many(glAccountingRuleSets),
}));

export const glAccountingRuleSetsRelations = relations(glAccountingRuleSets, ({ one, many }) => ({
  criteria: one(glCriteriaDefinitions, {
    fields: [glAccountingRuleSets.criteria_id],
    references: [glCriteriaDefinitions.id],
  }),
  entryDefinitions: many(glAccountingEntryDefinitions),
  testCases: many(glRuleTestCases),
}));

export const fundMasterRelations = relations(fundMaster, ({ one, many }) => ({
  accountingUnit: one(accountingUnits, {
    fields: [fundMaster.accounting_unit_id],
    references: [accountingUnits.id],
  }),
  navComputations: many(glNavComputations),
  portfolioClassifications: many(glPortfolioClassifications),
}));

export const glNavComputationsRelations = relations(glNavComputations, ({ one }) => ({
  fund: one(fundMaster, {
    fields: [glNavComputations.fund_id],
    references: [fundMaster.id],
  }),
  journalBatch: one(glJournalBatches, {
    fields: [glNavComputations.journal_batch_id],
    references: [glJournalBatches.id],
  }),
}));
