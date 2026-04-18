// ─── Trust Product Types ─────────────────────────────────────────────────────

export const TrustProductType = {
  IMA_DIRECTED: 'IMA_DIRECTED',
  IMA_DISCRETIONARY: 'IMA_DISCRETIONARY',
  PMT: 'PMT',
  UITF: 'UITF',
  PRE_NEED: 'PRE_NEED',
  EMPLOYEE_BENEFIT: 'EMPLOYEE_BENEFIT',
  ESCROW: 'ESCROW',
  AGENCY: 'AGENCY',
  SAFEKEEPING: 'SAFEKEEPING',
} as const;

export type TrustProductType = (typeof TrustProductType)[keyof typeof TrustProductType];

// ─── Order Status ────────────────────────────────────────────────────────────

export const OrderStatus = {
  DRAFT: 'DRAFT',
  PENDING_AUTH: 'PENDING_AUTH',
  AUTHORIZED: 'AUTHORIZED',
  REJECTED: 'REJECTED',
  AGGREGATED: 'AGGREGATED',
  PLACED: 'PLACED',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  CONFIRMED: 'CONFIRMED',
  SETTLED: 'SETTLED',
  REVERSAL_PENDING: 'REVERSAL_PENDING',
  REVERSED: 'REVERSED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

// ─── Order Side ──────────────────────────────────────────────────────────────

export const OrderSide = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;

export type OrderSide = (typeof OrderSide)[keyof typeof OrderSide];

// ─── Order Type ──────────────────────────────────────────────────────────────

export const OrderType = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP: 'STOP',
} as const;

export type OrderType = (typeof OrderType)[keyof typeof OrderType];

// ─── PII Classification ─────────────────────────────────────────────────────

export const PiiClassification = {
  NONE: 'NONE',
  PII: 'PII',
  SENSITIVE_PII: 'SENSITIVE_PII',
  FINANCIAL_PII: 'FINANCIAL_PII',
} as const;

export type PiiClassification = (typeof PiiClassification)[keyof typeof PiiClassification];

// ─── Data Residency ──────────────────────────────────────────────────────────

export const DataResidency = {
  PH_ONLY: 'PH_ONLY',
  ALLOWED_OFFSHORE: 'ALLOWED_OFFSHORE',
} as const;

export type DataResidency = (typeof DataResidency)[keyof typeof DataResidency];

// ─── Approval Status ─────────────────────────────────────────────────────────

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

// ─── Risk Profile ────────────────────────────────────────────────────────────

export const RiskProfile = {
  CONSERVATIVE: 'CONSERVATIVE',
  MODERATE: 'MODERATE',
  BALANCED: 'BALANCED',
  GROWTH: 'GROWTH',
  AGGRESSIVE: 'AGGRESSIVE',
} as const;

export type RiskProfile = (typeof RiskProfile)[keyof typeof RiskProfile];

// ─── KYC Status ──────────────────────────────────────────────────────────────

export const KycStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  EXPIRED: 'EXPIRED',
  REJECTED: 'REJECTED',
} as const;

export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

// ─── Maker-Checker Tier ──────────────────────────────────────────────────────

export const MakerCheckerTier = {
  TWO_EYES: 'TWO_EYES',
  FOUR_EYES: 'FOUR_EYES',
  SIX_EYES: 'SIX_EYES',
} as const;

export type MakerCheckerTier = (typeof MakerCheckerTier)[keyof typeof MakerCheckerTier];

// ─── User Roles (all 23 BRD roles) ──────────────────────────────────────────

export const UserRole = {
  BRANCH_ASSOCIATE: 'BRANCH_ASSOCIATE',
  RELATIONSHIP_MANAGER: 'RELATIONSHIP_MANAGER',
  SENIOR_RM: 'SENIOR_RM',
  TRADER: 'TRADER',
  SENIOR_TRADER: 'SENIOR_TRADER',
  MO_MAKER: 'MO_MAKER',
  MO_CHECKER: 'MO_CHECKER',
  BO_MAKER: 'BO_MAKER',
  BO_CHECKER: 'BO_CHECKER',
  BO_HEAD: 'BO_HEAD',
  RISK_OFFICER: 'RISK_OFFICER',
  COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER',
  FUND_ACCOUNTANT: 'FUND_ACCOUNTANT',
  FEE_BILLING_OFFICER: 'FEE_BILLING_OFFICER',
  TREASURY_LIAISON: 'TREASURY_LIAISON',
  TRUST_BUSINESS_HEAD: 'TRUST_BUSINESS_HEAD',
  CRO: 'CRO',
  CCO: 'CCO',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  DPO: 'DPO',
  INTERNAL_AUDITOR: 'INTERNAL_AUDITOR',
  CLIENT: 'CLIENT',
  CLIENT_POA: 'CLIENT_POA',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ─── Office ──────────────────────────────────────────────────────────────────

export const Office = {
  FRONT: 'FRONT',
  MIDDLE: 'MIDDLE',
  BACK: 'BACK',
  CROSS: 'CROSS',
  EXECUTIVE: 'EXECUTIVE',
  IT: 'IT',
  LEGAL: 'LEGAL',
  ASSURANCE: 'ASSURANCE',
  EXTERNAL: 'EXTERNAL',
} as const;

export type Office = (typeof Office)[keyof typeof Office];
