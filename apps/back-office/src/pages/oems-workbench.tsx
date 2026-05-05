import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Textarea } from "@ui/components/ui/textarea";
import {
  AlertTriangle,
  Banknote,
  Bell,
  CheckCircle,
  Download,
  FileBarChart,
  FilePlus2,
  History,
  Landmark,
  ListChecks,
  MailWarning,
  Plug,
  RefreshCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

type ProductFamily = "ODA" | "MLD" | "MUTUAL_FUND" | "BOND" | "FX_TODAY" | "WEALTH_LENDING";
type OemsChannel =
  | "OEMS_DIRECT"
  | "CRM_MICROSITE"
  | "DBANK_PRO_MICROSITE"
  | "BRANCH"
  | "CRM"
  | "RM_MOBILE"
  | "SECURE_MICROSITE"
  | "BACK_OFFICE"
  | "TREASURY";
type OemsStatus = string;

interface Summary {
  openOrders: number;
  validationFailures: number;
  pendingIntegrations: number;
  ltvBreaches: number;
  activeParameters: number;
}

interface OemsOrder {
  order_id: string;
  order_no: string;
  product_family: ProductFamily;
  transaction_type: string;
  customer_id: string | null;
  portfolio_id: string | null;
  channel: OemsChannel;
  assisted_by_user_id: string | null;
  branch_code: string | null;
  currency: string;
  amount: string | null;
  order_status: OemsStatus;
  document_status: string | null;
  verification_status: string | null;
  processing_date: string | null;
  created_at: string;
}

interface DigitalVerification {
  id: number;
  verification_id: string;
  order_id: string;
  customer_id: string | null;
  verification_type: string;
  channel: OemsChannel;
  request_method: string;
  verification_status: string;
  provider: string | null;
  authentication_link: string | null;
  payload_hash: string;
  max_attempts: number;
  failed_attempts: number;
  sent_at: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
  signed_document_url: string | null;
  fallback_allowed: boolean;
  third_party_status: string | null;
  operations_alerted: boolean;
}

interface DocumentRule {
  id: number;
  rule_code: string;
  product_family: ProductFamily | null;
  transaction_type: string | null;
  channel: OemsChannel | null;
  document_type: string;
  requirement_type: string;
  blocking_stage: string;
  template_code: string | null;
  template_version: number;
  dms_required: boolean;
  ncbs_required: boolean;
  is_active: boolean;
}

interface DocumentRegistration {
  id: number;
  document_id: string;
  order_id: string;
  document_type: string;
  document_status: string;
  requirement_type: string;
  blocking_stage: string;
  template_code: string | null;
  template_version: number;
  file_hash: string | null;
  expected_file_hash: string | null;
  hash_verified: boolean;
  dms_status: string | null;
  ncbs_status: string | null;
  next_retry_at: string | null;
  expires_at: string | null;
  renewal_required: boolean;
  quarantine_reason: string | null;
}

interface DocumentChecklist {
  orderId: string;
  documents: DocumentRegistration[];
  submissionBlockers: DocumentRegistration[];
  executionBlockers: DocumentRegistration[];
  readyForSubmission: boolean;
  readyForExecution: boolean;
}

interface RiskQuestionnaire {
  id: number;
  questionnaire_code: string;
  version_no: number;
  questionnaire_name: string;
  questionnaire_status: string;
  effective_from: string;
  effective_to: string | null;
}

interface RiskAssessment {
  id: number;
  assessment_id: string;
  customer_id: string;
  risk_profile: string;
  risk_score: number;
  strict_risk_profile: string | null;
  strict_risk_score: number | null;
  effective_from: string;
  effective_to: string;
  conflict_status: string;
  rbs_sync_status: string | null;
  avantrade_sync_status: string | null;
}

interface RiskProfileReport {
  summary: {
    activeProfiles: number;
    expiredProfiles: number;
    expiringProfiles: number;
    conflictProfiles: number;
  };
  expiring: RiskAssessment[];
  expired: RiskAssessment[];
  conflicts: RiskAssessment[];
}

interface ListResponse<T> {
  data: T[];
  total: number;
}

interface Product {
  id: number;
  product_code: string;
  product_name: string;
  product_family: ProductFamily;
  currency: string;
  is_active: boolean;
}

interface ParameterSet {
  id: number;
  product_id: number;
  parameter_type: string;
  channel: OemsChannel;
  parameter_status: string;
  effective_from: string;
  effective_to: string | null;
  cutoff_time: string | null;
  cutoff_action: string | null;
  product_timezone: string;
}

interface OdaRecommendation {
  id: number;
  recommendation_no: string;
  customer_id: string | null;
  customer_type: string;
  channel: OemsChannel;
  direction: string;
  currency_pair: string;
  oda_type: string;
  currency: string;
  tenor_days: number;
  nominal_amount: string;
  rate: string;
  reference_rate: string | null;
  order_cost_before_swap: string | null;
  minimum_collective_amount: string | null;
  authorization_status: string;
  ncbs_hold_status: string | null;
  fp8007_status: string | null;
  lifecycle: string;
  cutoff_at: string;
}

interface OdaReferenceRate {
  id: number;
  rate_id: string;
  currency_pair: string;
  retrieval_mode: string;
  mid_rate: string | null;
  rate_date: string;
  rate_status: string;
  source_system: string;
}

interface OdaDailySummary {
  summaryDate: string;
  direction: string;
  currencyPair: string;
  rate: number;
  totalNominal: number;
  orderCostBeforeSwap: number;
  orderCount: number;
  minimumCollectiveAmount: number;
  qualifiesMinimumCollective: boolean;
  recommendationIds: number[];
}

interface OdaFundInstruction {
  id: number;
  instruction_id: string;
  recommendation_id: number;
  instruction_type: string;
  instruction_status: string;
  amount: string;
  currency: string;
  failure_reason: string | null;
  next_retry_at: string | null;
}

interface MldTranche {
  id: number;
  tranche_code: string;
  tranche_name: string;
  currency: string;
  option_type: string | null;
  indicative_rate: string | null;
  minimum_interest_rate: string | null;
  bonus_payout_rate: string | null;
  offering_start: string;
  offering_end: string;
  trade_date: string;
  value_date: string;
  fixing_date: string;
  maturity_date: string;
  quota_amount: string;
  booked_amount: string;
  final_master_blotter_status: string | null;
  treasury_dealing_id: string | null;
  lifecycle: string;
}

interface MldOrderDetail {
  id: number;
  order_id: string;
  tranche_id: number;
  customer_id: string | null;
  cif_status: string;
  hold_instruction_status: string | null;
  td_creation_status: string | null;
  maturity_credit_status: string | null;
  td_account_no: string | null;
  treasury_dealing_id: string | null;
  callback_status: string | null;
  final_master_blotter_eligible: boolean;
  pretrade_recheck_status: string | null;
  fixing_outcome: string | null;
  net_payout_amount: string | null;
  trade_status: string | null;
  maturity_status: string | null;
}

interface MldFundInstruction {
  id: number;
  instruction_id: string;
  order_id: string;
  instruction_type: string;
  instruction_status: string;
  amount: string;
  currency: string;
  failure_reason: string | null;
  next_retry_at: string | null;
}

interface WealthStaticData {
  id: number;
  static_data_id: string;
  customer_id: string | null;
  cif: string | null;
  source_system: string;
  retrieval_status: string;
  conflict_status: string;
  conflict_fields: unknown;
  failure_reason: string | null;
  last_retrieved_at: string | null;
}

interface WealthProductSnapshot {
  id: number;
  snapshot_id: string;
  product_code: string;
  product_family: ProductFamily;
  setup_status: string;
  quota_remaining: string | null;
  offering_start: string | null;
  offering_end: string | null;
  performance_status: string;
}

interface MfBondOrderDetail {
  id: number;
  order_id: string;
  product_family: ProductFamily;
  product_code: string | null;
  transaction_variant: string;
  sid_status: string;
  pfe_status: string;
  risk_profile_status: string;
  static_data_status: string;
  sales_certification_status: string;
  digital_verification_status: string;
  wealth_core_status: string;
  wealth_core_order_id: string | null;
  wealth_core_rejection_reason: string | null;
  performance_claim_status: string | null;
}

interface BondPricingLock {
  id: number;
  lock_id: string;
  order_id: string;
  bond_code: string;
  requested_price: string;
  locked_price: string;
  locked_until: string;
  approval_route: string;
  lock_status: string;
  approval_status: string;
}

interface FxLiveRate {
  id: number;
  rate_id: string;
  currency_pair: string;
  bid_rate: string | null;
  ask_rate: string | null;
  mid_rate: string;
  source_system: string;
  rate_status: string;
  expires_at: string | null;
}

interface FxTodayDetail {
  id: number;
  order_id: string;
  currency_pair: string;
  amount: string;
  quote_rate: string;
  latest_rate: string | null;
  customer_detail_status: string;
  account_status: string;
  sku_status: string;
  pfe_status: string;
  digital_auth_status: string;
  treasury_snd_approval_status: string;
  lhbu_confirmation_status: string;
  settlement_status: string;
  overbook_status: string;
  blotter_status: string;
  confirmation_status: string;
  eod_alert_status: string;
}

interface FxBlotterEntry {
  id: number;
  blotter_id: string;
  order_id: string;
  currency_pair: string;
  amount: string;
  booked_rate: string;
  ncbs_reference: string | null;
  treasury_reference: string | null;
  blotter_status: string;
  settlement_status: string;
}

interface IntegrationMessage {
  id: number;
  target_system: string;
  message_type: string;
  entity_type: string;
  entity_id: string;
  integration_status: string;
  retry_count: number;
  created_at: string;
}

interface IntegrationAdapter {
  id: number;
  adapter_id: string;
  target_system: string;
  adapter_type: string;
  contract_version: string;
  adapter_status: string;
  certification_status: string;
  mock_mode: boolean;
  reconciliation_required: boolean;
  require_tls: boolean;
  allowed_address_patterns: string[] | null;
  allowed_source_cidrs: string[] | null;
  payload_classification: string;
  mask_log_payloads: boolean;
  encryption_required: boolean;
  encryption_profile_ref: string | null;
  security_policy_status: string;
  last_health_status: string | null;
  owner_team: string | null;
}

interface IntegrationAdapterExecution {
  id: number;
  execution_id: string;
  adapter_id: string;
  target_system: string;
  message_type: string;
  execution_status: string;
  idempotency_key: string;
  reconciliation_status: string;
  payload_encrypted: boolean;
  security_decision: Record<string, unknown>;
  source_address: string | null;
  destination_address: string | null;
  error_message: string | null;
  created_at: string;
}

interface WealthLendingInstruction {
  id: number;
  instruction_id: string;
  facility_id: string;
  instruction_type: string;
  target_system: string;
  instruction_status: string;
  amount: string | null;
  currency: string;
  failure_reason: string | null;
  created_at: string;
}

interface WealthLendingVisibility {
  channel: string;
  facilityId: string;
  facilityNo: string;
  customerId: string | null;
  currency: string;
  limitAmount: number;
  outstandingAmount: number;
  collateralValue: number;
  currentLtv: number;
  ltvLimit: number;
  ltvWarning: number;
  cureStatus: string;
  cureDueAt: string | null;
  repaymentRequired: number;
  topUpRequired: number;
  dbankVisibilityStatus: string;
  salesVisibilityStatus: string;
  overdraftBlockStatus: string;
}

interface ApprovalWorkflow {
  id: number;
  workflow_code: string;
  product_family: ProductFamily | null;
  transaction_type: string | null;
  channel: OemsChannel | null;
  entity_type: string;
  checker_roles: string[] | null;
  workflow_status: string;
  sla_minutes: number;
}

interface ApprovalQueueItem {
  id: number;
  queue_item_id: string;
  order_id: string | null;
  entity_type: string;
  entity_id: string;
  approval_status: string;
  assigned_role: string;
  maker_user_id: string;
  due_at: string | null;
  decision_by: string | null;
}

type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "DBANK_PRO" | "PUSH" | "PAGER_DUTY";

interface NotificationTemplate {
  id: number;
  event_code: string;
  template_code: string;
  product_family: ProductFamily | null;
  delivery_channels: NotificationChannel[] | null;
  recipient_role: string;
  template_status: string;
  critical: boolean;
  requires_attachment: boolean;
  is_active: boolean;
}

interface NotificationDelivery {
  id: number;
  event_code: string;
  order_id: string | null;
  recipient_id: string | null;
  channel: NotificationChannel;
  delivery_group_id: string | null;
  delivery_status: string;
  attempt_count: number;
  max_attempts: number;
  failure_reason: string | null;
  exception_reason: string | null;
  last_attempt_at: string | null;
}

interface NotificationOperationsReport {
  summary: {
    totalGroups: number;
    failedGroups: number;
    partiallyDeliveredGroups: number;
    retryableGroups: number;
  };
  rows: {
    deliveryGroupId: string;
    eventCode: string;
    orderId: string | null;
    groupStatus: string;
    channels: NotificationChannel[];
    failedChannels: NotificationChannel[];
    failureReasons: string[];
    retryable: boolean;
  }[];
}

interface ReportDefinition {
  id: number;
  report_code: string;
  report_name: string;
  report_category: string;
  product_family: ProductFamily | null;
  allowed_formats: string[] | null;
  sync_row_threshold: number;
  is_active: boolean;
}

interface ExportJob {
  id: number;
  export_job_id: string;
  requested_format: string;
  export_status: string;
  execution_mode: string;
  row_count: number | null;
  async_required: boolean;
  protected_file: boolean;
  file_url: string | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

interface ReportRenderArtifact {
  id: number;
  artifact_id: string;
  export_job_id: string;
  report_code: string;
  requested_format: string;
  render_status: string;
  file_url: string;
  file_hash: string;
  protected_file: boolean;
  row_count: number;
  generated_at: string;
}

interface MigrationRollback {
  id: number;
  rollback_id: string;
  migration_name: string;
  rollback_script_path: string;
  checksum: string;
  verification_status: string;
  verified_by: string | null;
  verified_at: string | null;
}

interface ReportPreview {
  reportCode: string;
  reportName: string;
  reportCategory: string;
  allowedFormats: string[];
  sourcePlan: {
    ageBucket: string;
    sources: string[];
    bigDataAvailable: boolean;
  };
  rows: unknown[];
}

interface PortfolioHolding {
  id: number;
  productFamily: ProductFamily;
  productCode: string;
  productName: string | null;
  holdingAmount: number;
  currency: string;
  originalMarketValue: number;
  localCurrency: string;
  localMarketValue: number | undefined;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
  profitGain: number;
  leftPrincipal: number;
  leftTermDays: number;
  sourceSystem: string;
  sourceStatus: string;
  stale: boolean;
  transactionRedirectUrl: string | null;
}

interface PortfolioView {
  customerId: string;
  portfolioId: string | null;
  asOfDate: string;
  localCurrency: string;
  isPartial: boolean;
  sourceStatus: {
    OEMS: string;
    WEALTH_CORE: string;
    CORE_BANKING: string;
    unavailableSources: string[];
  };
  valuationPolicy: {
    fxRateSource: string;
    asOfDate: string;
    missingSourcesNotMergedAsZero: boolean;
  };
  totals: {
    localMarketValue: number;
    realizedGainLoss: number;
    unrealizedGainLoss: number;
  };
  holdings: PortfolioHolding[];
}

const productFamilies: ProductFamily[] = ["ODA", "MLD", "MUTUAL_FUND", "BOND", "FX_TODAY", "WEALTH_LENDING"];
const oemsChannels: OemsChannel[] = [
  "OEMS_DIRECT",
  "CRM_MICROSITE",
  "DBANK_PRO_MICROSITE",
  "BRANCH",
  "CRM",
  "RM_MOBILE",
  "SECURE_MICROSITE",
  "BACK_OFFICE",
  "TREASURY",
];

const statusTone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  VALIDATION_FAILED: "destructive",
  PENDING_DOCUMENTS: "outline",
  PENDING_CUSTOMER_CONFIRMATION: "outline",
  PENDING_CUSTOMER_VERIFICATION: "outline",
  PENDING_APPROVAL: "default",
  APPROVED: "default",
  EXECUTED: "secondary",
  BOOKED: "secondary",
  FAILED: "destructive",
  RETRYING: "outline",
  PARTIALLY_DELIVERED: "outline",
  DELIVERED: "secondary",
  QUEUED: "outline",
  ACTIVE: "default",
  AVAILABLE: "secondary",
  STALE: "outline",
  UNAVAILABLE: "destructive",
  MARGIN_CALL: "destructive",
  CANCELLED: "outline",
  LOCKED: "destructive",
  INVALIDATED: "destructive",
  SENT: "outline",
  CONFIRMED: "secondary",
  MANUAL_VERIFIED: "secondary",
  EXPIRED: "destructive",
  MISSING: "destructive",
  GENERATED: "outline",
  UPLOADED: "outline",
  SIGNED: "secondary",
  VERIFIED: "secondary",
  REGISTERED_NCBS: "secondary",
  REGISTERED_DMS: "secondary",
  NCBS_RETRY_PENDING: "outline",
  DMS_RETRY_PENDING: "outline",
  QUARANTINED: "destructive",
  CONSERVATIVE: "secondary",
  MODERATE: "secondary",
  BALANCED: "default",
  GROWTH: "outline",
  AGGRESSIVE: "destructive",
  CONFLICT_REVIEW: "destructive",
  MATCHED: "secondary",
};

function formatMoney(value: string | number | null | undefined, currency = "IDR") {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "-";
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const status = value ?? "UNKNOWN";
  return <Badge variant={statusTone[status] ?? "outline"}>{status.replace(/_/g, " ")}</Badge>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | undefined;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value ?? 0}</p>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export default function OemsWorkbench() {
  const queryClient = useQueryClient();
  const [familyFilter, setFamilyFilter] = useState<ProductFamily | "ALL">("ALL");
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({
    productCode: "ODA-IDR-1M",
    productName: "IDR ODA 1 Month",
    productFamily: "ODA" as ProductFamily,
    currency: "IDR",
    riskScore: "2",
    productScore: "2",
    minSubscriptionAmount: "10000000",
  });

  const [parameterForm, setParameterForm] = useState({
    productId: "",
    parameterType: "COT",
    channel: "OEMS_DIRECT" as OemsChannel,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
    productTimezone: "Asia/Jakarta",
    calendarKey: "ID",
    cutoffTime: "15:00",
    cutoffAction: "REJECT_AFTER_COT",
    allowCheckerRepairAfterCutoff: false,
    parameters: "{\"cutoff\":{\"calendarKeys\":[\"ID\"],\"time\":\"15:00\",\"action\":\"REJECT_AFTER_COT\"}}",
  });

  const [orderForm, setOrderForm] = useState({
    productFamily: "MUTUAL_FUND" as ProductFamily,
    transactionType: "SUBSCRIPTION",
    customerId: "",
    portfolioId: "",
    channel: "OEMS_DIRECT" as OemsChannel,
    assistedByUserId: "",
    branchCode: "",
    channelSessionId: "",
    channelSignatureHash: "",
    channelCustomerRef: "",
    currency: "IDR",
    amount: "10000000",
    customerRiskScore: "3",
    productScore: "2",
  });

  const [verificationForm, setVerificationForm] = useState({
    orderId: "",
    verificationId: "",
    verificationType: "TRANSACTION_AUTHORIZATION",
    requestMethod: "AUTH_LINK",
    channel: "DBANK_PRO_MICROSITE" as OemsChannel,
    provider: "DANAMON_IDENTITY",
    ttlMinutes: "15",
    maxAttempts: "3",
    boundDocumentTypes: "SKU,PFE,TERM_SHEET",
    payload: "{\"consent\":\"ORDER_AUTHORIZATION\"}",
    evidence: "{\"deviceId\":\"trusted-device\",\"ipAddress\":\"127.0.0.1\"}",
    fallbackAllowed: false,
    digitalImplemented: true,
    providerOutage: false,
  });

  const [documentRuleForm, setDocumentRuleForm] = useState({
    ruleCode: "DOC-MF-SKU",
    productFamily: "MUTUAL_FUND" as ProductFamily,
    transactionType: "SUBSCRIPTION",
    channel: "OEMS_DIRECT" as OemsChannel,
    documentType: "SKU",
    requirementType: "REQUIRED",
    blockingStage: "SUBMISSION",
    templateCode: "SKU-MF",
    templateVersion: "1",
    dmsRequired: true,
    ncbsRequired: true,
  });

  const [documentForm, setDocumentForm] = useState({
    orderId: "",
    documentId: "",
    documentType: "SKU",
    documentStatus: "UPLOADED",
    fileName: "sku.pdf",
    fileUrl: "/documents/oems/uploads/sku.pdf",
    expectedFileHash: "HASH-001",
    fileHash: "HASH-001",
    templateCode: "SKU-MF",
    templateVersion: "1",
    expiresAt: "",
    evidence: "{\"source\":\"branch-upload\"}",
  });

  const [riskQuestionnaireForm, setRiskQuestionnaireForm] = useState({
    questionnaireId: "",
    questionnaireCode: "RPQ-WM",
    versionNo: "1",
    questionnaireName: "Wealth Management Risk Profile",
    mandatoryQuestionCodes: "Q1,Q2,Q3",
    questions: "[{\"code\":\"Q1\",\"text\":\"Investment horizon\"},{\"code\":\"Q2\",\"text\":\"Loss tolerance\"},{\"code\":\"Q3\",\"text\":\"Product knowledge\"}]",
    scoreBands: "[{\"from\":0,\"to\":20,\"riskProfile\":\"CONSERVATIVE\"},{\"from\":21,\"to\":40,\"riskProfile\":\"MODERATE\"},{\"from\":41,\"to\":60,\"riskProfile\":\"BALANCED\"},{\"from\":61,\"to\":80,\"riskProfile\":\"GROWTH\"},{\"from\":81,\"to\":100,\"riskProfile\":\"AGGRESSIVE\"}]",
    validPeriodMonths: "12",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });

  const [riskAssessmentForm, setRiskAssessmentForm] = useState({
    customerId: "",
    assessmentId: "",
    questionnaireId: "",
    answers: "[{\"questionCode\":\"Q1\",\"score\":20},{\"questionCode\":\"Q2\",\"score\":20},{\"questionCode\":\"Q3\",\"score\":15}]",
    externalRiskProfile: "MODERATE",
    orderId: "",
  });

  const [riskMappingForm, setRiskMappingForm] = useState({
    mappingCode: "RISK-MF-BALANCED",
    productFamily: "MUTUAL_FUND" as ProductFamily,
    transactionType: "SUBSCRIPTION",
    productRiskProfile: "BALANCED",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });

  const [wealthForm, setWealthForm] = useState({
    customerId: "",
    cif: "",
    portfolioId: "",
    sourceSystems: "NCBS,RBS,AVANTRADE",
    sourceStatus: "{\"NCBS\":\"AVAILABLE\",\"RBS\":\"AVAILABLE\",\"AVANTRADE\":\"AVAILABLE\"}",
    staticDataId: "",
    resolutionComment: "Reviewed and resolved by operations",
    productCode: "MF-IDR-BALANCED",
    productFamily: "MUTUAL_FUND" as ProductFamily,
    quotaAmount: "10000000000",
    quotaRemaining: "5000000000",
    offeringStart: new Date().toISOString().slice(0, 10),
    offeringEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    performance1m: "0.8",
    performance1y: "5.5",
    performance3y: "18",
    performance5y: "35",
    performanceRequired: false,
    salesUserId: "",
  });

  const [mfBondForm, setMfBondForm] = useState({
    orderId: "",
    productFamily: "MUTUAL_FUND" as "MUTUAL_FUND" | "BOND",
    transactionVariant: "SUBSCRIPTION",
    customerId: "",
    portfolioId: "",
    productCode: "MF-IDR-BALANCED",
    amount: "50000000",
    currency: "IDR",
    sidStatus: "OPENED",
    accountPortfolioStatus: "OPENED",
    pfeStatus: "CAPTURED",
    riskProfileStatus: "CURRENT",
    staticDataStatus: "SYNCED",
    salesCertificationStatus: "ACTIVE",
    digitalVerificationStatus: "CONFIRMED",
    digitalVerificationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 16),
    quotaRemaining: "1000000000",
    performanceStatus: "AVAILABLE",
    cherryPickLots: "[{\"lotId\":\"BOND-LOT-001\",\"nominal\":100000000,\"price\":99.5}]",
    switchDetails: "{\"fromProductCode\":\"MF-IDR-BALANCED\",\"toProductCode\":\"MF-IDR-GROWTH\"}",
    requestedPrice: "99.5",
    lowerBound: "99",
    upperBound: "100",
    wealthCoreOrderId: "",
    wealthCoreStatus: "BOOKED",
    rejectionReason: "",
  });

  const [odaForm, setOdaForm] = useState({
    customerId: "",
    customerType: "INDIVIDUAL",
    portfolioId: "",
    channel: "OEMS_DIRECT" as OemsChannel,
    assistedByUserId: "",
    branchCode: "",
    direction: "BUY",
    currencyPair: "USD/IDR",
    debitCurrency: "USD",
    creditCurrency: "IDR",
    currency: "USD",
    odaType: "SINGLE",
    effectiveType: "INTRADAY",
    nominalAmount: "50000000",
    ratePercent: "16100",
    referenceRate: "16100",
    referenceRateSource: "TREASURY",
    tenorDays: "30",
    taxRatePercent: "20",
    minimumPlacementAmount: "10000000",
    minimumCollectiveAmount: "100000000",
    availableBalance: "100000000",
    ledgerBalance: "100000000",
    cifStatus: "PASS",
    skuStatus: "PASS",
    pfeStatus: "PASS",
    salesCertificationStatus: "ACTIVE",
    debitAccountNo: "",
    creditAccountNo: "",
    expiryAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    effectiveDate: new Date().toISOString().slice(0, 10),
    cutoffAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    digitalVerificationUnavailable: false,
    holdFundsImmediately: false,
    legs: "[{\"legNo\":1,\"legType\":\"PRIMARY\",\"direction\":\"BUY\",\"currencyPair\":\"USD/IDR\",\"targetRate\":16100,\"amount\":50000000}]",
  });

  const [odaRateForm, setOdaRateForm] = useState({
    currencyPair: "USD/IDR",
    retrievalMode: "DAILY",
    sourceSystem: "TREASURY",
    bidRate: "16090",
    askRate: "16110",
    midRate: "16100",
    spreadRate: "10",
    rateDate: new Date().toISOString().slice(0, 10),
    rateStatus: "AVAILABLE",
  });

  const [odaActionForm, setOdaActionForm] = useState({
    recommendationId: "",
    groupId: "",
    updateId: "",
    valueDate: new Date().toISOString().slice(0, 10),
    minimumCollectiveAmount: "100000000",
    requestedLifecycle: "EXECUTED",
    swapPoints: "0",
    treasuryDealId: "",
    autoSettleResult: "AUTO_SETTLED",
  });

  const [odaPrecheckResult, setOdaPrecheckResult] = useState<unknown>(null);

  const [mldForm, setMldForm] = useState({
    trancheCode: "MLD-IDR-2026-01",
    trancheName: "IDR Protected MLD 2026 Series 1",
    currency: "IDR",
    optionType: "CALL_SPREAD",
    underlyingReference: "USD/IDR",
    indicativeRate: "5.5",
    minimumInterestRate: "1.25",
    bonusPayoutRate: "4.75",
    participationRate: "100",
    strikeRate: "16100",
    taxRate: "20",
    offeringStart: new Date().toISOString().slice(0, 10),
    offeringEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    tradeDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    valueDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    fixingDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    quotaAmount: "10000000000",
    minInvestment: "10000000",
    maxInvestment: "1000000000",
    minimumCollectiveNominal: "1000000000",
    productScore: "3",
    indicativeTermSheetUrl: "/documents/mld/indicative-term-sheet.pdf",
    finalTermSheetUrl: "/documents/mld/final-term-sheet.pdf",
    treasuryCounterparty: "DANAMON_TREASURY",
    orderId: "",
    trancheId: "",
    customerId: "",
    portfolioId: "",
    amount: "100000000",
    ninetyDayAverageBalance: "150000000",
    availableBalance: "150000000",
    cifStatus: "PASS",
    debitAccountNo: "",
    tdAccountNo: "",
    treasuryDealingId: "",
    fixingOutcome: "MAX_RETURN",
    fixingLevel: "16250",
  });

  const [fxForm, setFxForm] = useState({
    orderId: "",
    customerId: "",
    portfolioId: "",
    currencyPair: "USD/IDR",
    dealtCurrency: "USD",
    counterCurrency: "IDR",
    debitCurrency: "IDR",
    debitAccountNo: "",
    creditAccountNo: "",
    amount: "100000",
    specialRate: "16100",
    quoteTtlSeconds: "45",
    underlyingDocumentThreshold: "100000",
    underlyingDocumentId: "",
    customerDetailStatus: "AVAILABLE",
    accountStatus: "AVAILABLE",
    skuStatus: "AVAILABLE",
    pfeStatus: "AVAILABLE",
    fallbackVerifierRole: "BSM",
    quoteHash: "",
    latestRate: "16105",
    lhbuPurposeCode: "2012",
    settlementStatus: "SETTLED",
    ncbsReference: "",
    treasuryReference: "",
    confirmationNoticeUrl: "",
  });

  const [fxRateForm, setFxRateForm] = useState({
    currencyPair: "USD/IDR",
    bidRate: "16095",
    askRate: "16105",
    midRate: "16100",
    sourceSystem: "TREASURY",
    ttlSeconds: "30",
  });

  const [lendingForm, setLendingForm] = useState({
    facilityId: "",
    customerId: "",
    portfolioId: "",
    loanSystemRef: "",
    coreBankingRef: "",
    loanAccountNo: "",
    currency: "IDR",
    limitAmount: "2500000000",
    outstandingAmount: "1000000000",
    ltvLimit: "0.65",
    ltvWarning: "0.55",
    collateralDecreasePercent: "0",
    curePeriodDays: "5",
    collateralProductFamily: "MUTUAL_FUND" as ProductFamily,
    collateralProductCode: "MF-IDR-BALANCED",
    collateralMarketValue: "1800000000",
    collateralHaircutPercent: "10",
    collateralSourceSystem: "AVANTRADE",
    collateralMaturityDate: "",
    priceSourceSystems: "RBS,AVANTRADE",
    priceStatus: "AVAILABLE",
    pricePayload: "{}",
    outstandingSourceSystem: "LOAN_SYSTEM",
    visibilityChannel: "DBANK_PRO",
    repaymentAmount: "250000000",
    topUpMarketValue: "500000000",
    sellAmount: "250000000",
    sellInstructionStatus: "QUEUED",
  });

  const [lendingVisibility, setLendingVisibility] = useState<WealthLendingVisibility | null>(null);

  const [portfolioHoldingForm, setPortfolioHoldingForm] = useState({
    customerId: "",
    portfolioId: "",
    productFamily: "MUTUAL_FUND" as ProductFamily,
    productCode: "MF-IDR-BALANCED",
    productName: "IDR Balanced Fund",
    holdingAmount: "1000",
    marketValue: "100000000",
    currency: "IDR",
    localMarketValue: "100000000",
    realizedGainLoss: "2500000",
    unrealizedGainLoss: "1500000",
    profitGain: "4000000",
    leftPrincipal: "100000000",
    leftTermDays: "90",
    sourceSystem: "WEALTH_CORE",
    transactionRedirectUrl: "/operations/oems",
  });

  const [portfolioViewForm, setPortfolioViewForm] = useState({
    customerId: "",
    portfolioId: "",
    productFamily: "MUTUAL_FUND" as ProductFamily,
    holdingMetric: "",
    sourceStatus: "{\"OEMS\":\"AVAILABLE\",\"WEALTH_CORE\":\"AVAILABLE\",\"CORE_BANKING\":\"AVAILABLE\"}",
    fxRates: "{\"USD\":16000,\"IDR\":1}",
  });

  const [portfolioView, setPortfolioView] = useState<PortfolioView | null>(null);

  const [reportForm, setReportForm] = useState({
    reportCode: "OEMS-ODA-SUMMARY",
    reportName: "ODA Placement Summary",
    reportCategory: "ODA",
    productFamily: "ODA" as ProductFamily,
    allowedFormats: "XLSX,CSV,PDF",
    syncRowThreshold: "10000",
    protectionPolicy: "{\"watermark\":\"Danamon OEMS Confidential\"}",
    columns: "recommendation_no,currency,tenor_days,nominal_amount,rate,lifecycle",
  });

  const [reportExportForm, setReportExportForm] = useState({
    reportCode: "OEMS-ODA-SUMMARY",
    requestedFormat: "XLSX",
    filters: "{\"dateFrom\":\"2026-05-01\",\"dateTo\":\"2026-05-04\",\"productFamily\":\"ODA\",\"rowEstimate\":250}",
    rowEstimate: "250",
    bigDataAvailable: true,
  });

  const [historyForm, setHistoryForm] = useState({
    customerId: "",
    cif: "",
    productFamily: "MLD" as ProductFamily,
    dateFrom: "2026-01-01",
    dateTo: new Date().toISOString().slice(0, 10),
    bigDataAvailable: true,
  });

  const [adapterForm, setAdapterForm] = useState({
    adapterId: "ADP-WEALTH-CORE",
    targetSystem: "WEALTH_CORE",
    adapterType: "REST",
    endpointUrl: "/integrations/wealth-core/v1",
    authProfileRef: "vault://oems/wealth-core",
    contractVersion: "v1.0",
    contractSchema: "{\"operations\":[\"orderRegistration\",\"statusSync\"],\"idempotencyRequired\":true}",
    transformationMap: "{\"orderId\":\"external_refs.wealthCoreOrderId\"}",
    adapterStatus: "ACTIVE",
    certificationStatus: "CERTIFICATION_PENDING",
    mockMode: true,
    reconciliationRequired: true,
    requireTls: true,
    allowedAddressPatterns: "/integrations/*,*.danamon.co.id",
    allowedSourceCidrs: "10.0.0.0/8,192.168.0.0/16",
    payloadClassification: "CONFIDENTIAL",
    sensitiveFieldPaths: "customerId,loanAccountNo,accountNo,amount,marketValue,outstandingAmount",
    encryptedFieldPaths: "payload,requestPayload,responsePayload",
    maskLogPayloads: true,
    encryptionRequired: true,
    encryptionProfileRef: "vault://oems/adapter-payload",
    transportPolicy: "{\"requireTls\":true,\"addressFiltering\":\"ENFORCED\"}",
    securityPolicyStatus: "ACTIVE",
    ownerTeam: "Wealth Platform",
    messageType: "OEMS_ADAPTER_CERTIFICATION_TEST",
    entityType: "OEMS_ORDER",
    entityId: "",
    payload: "{\"contractTest\":true,\"customerId\":\"CUST-001\",\"loanAccountNo\":\"LN-001\",\"amount\":1000000}",
    sourceAddress: "10.10.1.25",
    destinationAddress: "/integrations/wealth-core/v1",
    simulatedStatus: "ACKNOWLEDGED",
  });

  const [approvalForm, setApprovalForm] = useState({
    workflowCode: "OEMS-ODA-ORDER-APPROVAL",
    productFamily: "ODA" as ProductFamily,
    transactionType: "ODA_ORDER",
    channel: "OEMS_DIRECT" as OemsChannel,
    entityType: "oems_order",
    entityId: "",
    orderId: "",
    assignedRole: "BO_CHECKER",
    makerUserId: "",
    queueItemId: "",
    decision: "APPROVED",
  });

  const [artifactForm, setArtifactForm] = useState({
    exportJobId: "",
    renderPayload: "{\"renderer\":\"OEMS_RENDERER\",\"requestedBy\":\"operations\"}",
    rollbackId: "RB-20260504-OEMS-LIFECYCLE",
    migrationName: "20260504_extend_danamon_oems_lifecycle.sql",
    rollbackScriptPath: "drizzle/20260504_extend_danamon_oems_lifecycle.rollback.sql",
    rollbackSql: "BEGIN;\n-- controlled rollback reviewed by DBA\nCOMMIT;",
    expectedChecksum: "",
  });

  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(null);

  const [notificationTemplateForm, setNotificationTemplateForm] = useState({
    eventCode: "OEMS_ORDER_EXECUTED",
    productFamily: "ODA" as ProductFamily,
    recipientRole: "CUSTOMER",
    deliveryChannels: "EMAIL,SMS,DBANK_PRO",
    subjectEn: "Order {{orderNo}} executed",
    bodyEn: "Your order {{orderNo}} has been executed.",
    subjectId: "Order {{orderNo}} berhasil dieksekusi",
    bodyId: "Order {{orderNo}} sudah dieksekusi.",
    critical: true,
    requiresAttachment: false,
    attachmentPasswordPolicy: "{\"passwordPolicy\":\"CUSTOMER_DOB_OR_CONFIGURED_SECRET\",\"passwordProtected\":true}",
  });

  const [notificationEventForm, setNotificationEventForm] = useState({
    eventCode: "OEMS_ORDER_EXECUTED",
    orderId: "",
    recipientId: "",
    recipientAddress: "",
    channels: "EMAIL,SMS",
    languageCode: "en-ID",
    channelResults: "{\"EMAIL\":{\"status\":\"DELIVERED\",\"providerMessageId\":\"SMTP-001\"},\"SMS\":{\"status\":\"FAILED\",\"failureReason\":\"INVALID_MSISDN\"}}",
    payload: "{\"orderNo\":\"OEMS-001\"}",
    attachmentRequired: false,
    attachmentPolicy: "{\"passwordPolicy\":\"CUSTOMER_DOB_OR_CONFIGURED_SECRET\",\"passwordProtected\":true}",
  });

  const productFamilyParam = familyFilter === "ALL" ? "" : `?productFamily=${familyFilter}`;

  const summaryQuery = useQuery<Summary>({
    queryKey: ["oems-summary"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/summary"),
  });

  const ordersQuery = useQuery<ListResponse<OemsOrder>>({
    queryKey: ["oems-orders", familyFilter],
    queryFn: () => apiRequest("GET", `/api/v1/oems/orders${productFamilyParam}`),
  });

  const productsQuery = useQuery<Product[]>({
    queryKey: ["oems-products", familyFilter],
    queryFn: () => apiRequest("GET", `/api/v1/oems/products${productFamilyParam}`),
  });

  const parameterSetsQuery = useQuery<ParameterSet[]>({
    queryKey: ["oems-parameter-sets"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/parameter-sets"),
  });

  const odaQuery = useQuery<OdaRecommendation[]>({
    queryKey: ["oems-oda"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/oda/recommendations"),
  });

  const odaRatesQuery = useQuery<OdaReferenceRate[]>({
    queryKey: ["oems-oda-rates"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/oda/reference-rates"),
  });

  const odaSummaryQuery = useQuery<OdaDailySummary[]>({
    queryKey: ["oems-oda-summary", odaActionForm.valueDate],
    queryFn: () => apiRequest("GET", `/api/v1/oems/oda/daily-summary?summaryDate=${odaActionForm.valueDate}&minimumCollectiveAmount=${odaActionForm.minimumCollectiveAmount}`),
  });

  const odaFundInstructionsQuery = useQuery<OdaFundInstruction[]>({
    queryKey: ["oems-oda-fund-instructions"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/oda/fund-instructions"),
  });

  const mldQuery = useQuery<MldTranche[]>({
    queryKey: ["oems-mld"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/mld/tranches"),
  });

  const mldOrderDetailsQuery = useQuery<MldOrderDetail[]>({
    queryKey: ["oems-mld-order-details", mldForm.trancheId],
    queryFn: () => apiRequest("GET", `/api/v1/oems/mld/order-details${mldForm.trancheId ? `?trancheId=${mldForm.trancheId}` : ""}`),
  });

  const mldFundInstructionsQuery = useQuery<MldFundInstruction[]>({
    queryKey: ["oems-mld-fund-instructions"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/mld/fund-instructions"),
  });

  const wealthStaticQuery = useQuery<WealthStaticData[]>({
    queryKey: ["oems-wealth-static", wealthForm.customerId, wealthForm.cif],
    queryFn: () => {
      const params = new URLSearchParams({
        ...(wealthForm.customerId ? { customerId: wealthForm.customerId } : {}),
        ...(wealthForm.cif ? { cif: wealthForm.cif } : {}),
      });
      return apiRequest("GET", `/api/v1/oems/wealth/static-data${params.toString() ? `?${params.toString()}` : ""}`);
    },
  });

  const wealthProductsQuery = useQuery<WealthProductSnapshot[]>({
    queryKey: ["oems-wealth-products", wealthForm.productFamily],
    queryFn: () => apiRequest("GET", `/api/v1/oems/wealth/products?productFamily=${wealthForm.productFamily}`),
  });

  const mfBondDetailsQuery = useQuery<MfBondOrderDetail[]>({
    queryKey: ["oems-mf-bond-details", mfBondForm.productFamily],
    queryFn: () => apiRequest("GET", `/api/v1/oems/mf-bond/order-details?productFamily=${mfBondForm.productFamily}`),
  });

  const bondPricingLocksQuery = useQuery<BondPricingLock[]>({
    queryKey: ["oems-bond-pricing-locks", mfBondForm.orderId],
    queryFn: () => apiRequest("GET", `/api/v1/oems/mf-bond/pricing-locks${mfBondForm.orderId ? `?orderId=${mfBondForm.orderId}` : ""}`),
  });

  const fxLiveRatesQuery = useQuery<FxLiveRate[]>({
    queryKey: ["oems-fx-live-rates", fxRateForm.currencyPair],
    queryFn: () => apiRequest("GET", `/api/v1/oems/fx-today/live-rates?currencyPair=${fxRateForm.currencyPair}`),
  });

  const fxDetailsQuery = useQuery<FxTodayDetail[]>({
    queryKey: ["oems-fx-details"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/fx-today/details"),
  });

  const fxBlotterQuery = useQuery<FxBlotterEntry[]>({
    queryKey: ["oems-fx-blotter"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/fx-today/blotter"),
  });

  const integrationsQuery = useQuery<IntegrationMessage[]>({
    queryKey: ["oems-integrations"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/integrations"),
  });

  const integrationAdaptersQuery = useQuery<IntegrationAdapter[]>({
    queryKey: ["oems-integration-adapters"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/integration-adapters"),
  });

  const integrationAdapterExecutionsQuery = useQuery<IntegrationAdapterExecution[]>({
    queryKey: ["oems-integration-adapter-executions"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/integration-adapter-executions"),
  });

  const wealthLendingInstructionsQuery = useQuery<WealthLendingInstruction[]>({
    queryKey: ["oems-wealth-lending-instructions", lendingForm.facilityId],
    queryFn: () => apiRequest("GET", `/api/v1/oems/wealth-lending/instructions${lendingForm.facilityId ? `?facilityId=${encodeURIComponent(lendingForm.facilityId)}` : ""}`),
  });

  const approvalWorkflowsQuery = useQuery<ApprovalWorkflow[]>({
    queryKey: ["oems-approval-workflows"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/approval-workflows"),
  });

  const approvalQueueQuery = useQuery<ApprovalQueueItem[]>({
    queryKey: ["oems-approval-queue"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/approval-queue"),
  });

  const notificationTemplatesQuery = useQuery<NotificationTemplate[]>({
    queryKey: ["oems-notification-templates", familyFilter],
    queryFn: () => apiRequest("GET", `/api/v1/oems/notifications/templates${productFamilyParam}`),
  });

  const notificationDeliveriesQuery = useQuery<NotificationDelivery[]>({
    queryKey: ["oems-notification-deliveries"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/notifications/deliveries?operationsOnly=true"),
  });

  const notificationReportQuery = useQuery<NotificationOperationsReport>({
    queryKey: ["oems-notification-report"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/notifications/operations-report"),
  });

  const reportsQuery = useQuery<ReportDefinition[]>({
    queryKey: ["oems-reports", familyFilter],
    queryFn: () => apiRequest("GET", `/api/v1/oems/reports${productFamilyParam}`),
  });

  const exportJobsQuery = useQuery<ExportJob[]>({
    queryKey: ["oems-export-jobs"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/reports/exports"),
  });

  const reportArtifactsQuery = useQuery<ReportRenderArtifact[]>({
    queryKey: ["oems-report-render-artifacts"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/reports/render-artifacts"),
  });

  const migrationRollbacksQuery = useQuery<MigrationRollback[]>({
    queryKey: ["oems-migration-rollbacks"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/migration-rollbacks"),
  });

  const digitalVerificationsQuery = useQuery<DigitalVerification[]>({
    queryKey: ["oems-digital-verifications", verificationForm.orderId],
    queryFn: () => apiRequest("GET", `/api/v1/oems/orders/${verificationForm.orderId}/digital-verifications`),
    enabled: Boolean(verificationForm.orderId),
  });

  const documentRulesQuery = useQuery<DocumentRule[]>({
    queryKey: ["oems-document-rules"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/document-rules"),
  });

  const documentsQuery = useQuery<DocumentRegistration[]>({
    queryKey: ["oems-documents", documentForm.orderId],
    queryFn: () => apiRequest("GET", `/api/v1/oems/orders/${documentForm.orderId}/documents`),
    enabled: Boolean(documentForm.orderId),
  });

  const checklistQuery = useQuery<DocumentChecklist>({
    queryKey: ["oems-document-checklist", documentForm.orderId],
    queryFn: () => apiRequest("GET", `/api/v1/oems/orders/${documentForm.orderId}/documents/checklist`),
    enabled: Boolean(documentForm.orderId),
  });

  const riskQuestionnairesQuery = useQuery<RiskQuestionnaire[]>({
    queryKey: ["oems-risk-questionnaires"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/risk/questionnaires"),
  });

  const riskReportQuery = useQuery<RiskProfileReport>({
    queryKey: ["oems-risk-report"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/risk/reports/profile-status?expiringWithinDays=30"),
  });

  const invalidateOems = () => {
    queryClient.invalidateQueries({ queryKey: ["oems-summary"] });
    queryClient.invalidateQueries({ queryKey: ["oems-orders"] });
    queryClient.invalidateQueries({ queryKey: ["oems-products"] });
    queryClient.invalidateQueries({ queryKey: ["oems-parameter-sets"] });
    queryClient.invalidateQueries({ queryKey: ["oems-oda"] });
    queryClient.invalidateQueries({ queryKey: ["oems-oda-rates"] });
    queryClient.invalidateQueries({ queryKey: ["oems-oda-summary"] });
    queryClient.invalidateQueries({ queryKey: ["oems-oda-fund-instructions"] });
    queryClient.invalidateQueries({ queryKey: ["oems-mld"] });
    queryClient.invalidateQueries({ queryKey: ["oems-mld-order-details"] });
    queryClient.invalidateQueries({ queryKey: ["oems-mld-fund-instructions"] });
    queryClient.invalidateQueries({ queryKey: ["oems-wealth-static"] });
    queryClient.invalidateQueries({ queryKey: ["oems-wealth-products"] });
    queryClient.invalidateQueries({ queryKey: ["oems-mf-bond-details"] });
    queryClient.invalidateQueries({ queryKey: ["oems-bond-pricing-locks"] });
    queryClient.invalidateQueries({ queryKey: ["oems-fx-live-rates"] });
    queryClient.invalidateQueries({ queryKey: ["oems-fx-details"] });
    queryClient.invalidateQueries({ queryKey: ["oems-fx-blotter"] });
    queryClient.invalidateQueries({ queryKey: ["oems-wealth-lending-instructions"] });
    queryClient.invalidateQueries({ queryKey: ["oems-integrations"] });
    queryClient.invalidateQueries({ queryKey: ["oems-integration-adapters"] });
    queryClient.invalidateQueries({ queryKey: ["oems-integration-adapter-executions"] });
    queryClient.invalidateQueries({ queryKey: ["oems-approval-workflows"] });
    queryClient.invalidateQueries({ queryKey: ["oems-approval-queue"] });
    queryClient.invalidateQueries({ queryKey: ["oems-notification-templates"] });
    queryClient.invalidateQueries({ queryKey: ["oems-notification-deliveries"] });
    queryClient.invalidateQueries({ queryKey: ["oems-notification-report"] });
    queryClient.invalidateQueries({ queryKey: ["oems-reports"] });
    queryClient.invalidateQueries({ queryKey: ["oems-export-jobs"] });
    queryClient.invalidateQueries({ queryKey: ["oems-report-render-artifacts"] });
    queryClient.invalidateQueries({ queryKey: ["oems-migration-rollbacks"] });
    queryClient.invalidateQueries({ queryKey: ["oems-digital-verifications"] });
    queryClient.invalidateQueries({ queryKey: ["oems-document-rules"] });
    queryClient.invalidateQueries({ queryKey: ["oems-documents"] });
    queryClient.invalidateQueries({ queryKey: ["oems-document-checklist"] });
    queryClient.invalidateQueries({ queryKey: ["oems-risk-questionnaires"] });
    queryClient.invalidateQueries({ queryKey: ["oems-risk-report"] });
  };

  const mutationOptions = (successMessage: string) => ({
    onSuccess: () => {
      setOperationMessage(successMessage);
      invalidateOems();
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const createProductMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/products", {
      ...productForm,
      riskScore: Number(productForm.riskScore),
      productScore: Number(productForm.productScore),
      minSubscriptionAmount: Number(productForm.minSubscriptionAmount),
    }),
    ...mutationOptions("Product setup captured"),
  });

  const createParameterSetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/parameter-sets", {
      productId: Number(parameterForm.productId),
      parameterType: parameterForm.parameterType,
      channel: parameterForm.channel,
      effectiveFrom: parameterForm.effectiveFrom,
      effectiveTo: parameterForm.effectiveTo || undefined,
      productTimezone: parameterForm.productTimezone,
      calendarKey: parameterForm.calendarKey,
      cutoffTime: parameterForm.cutoffTime || undefined,
      cutoffAction: parameterForm.cutoffAction,
      allowCheckerRepairAfterCutoff: parameterForm.allowCheckerRepairAfterCutoff,
      parameters: JSON.parse(parameterForm.parameters),
    }),
    ...mutationOptions("Parameter set saved"),
  });

  const submitParameterSetMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/parameter-sets/${id}/submit`),
    ...mutationOptions("Parameter set submitted"),
  });

  const approveParameterSetMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/parameter-sets/${id}/approve`),
    ...mutationOptions("Parameter set approved"),
  });

  const rejectParameterSetMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/parameter-sets/${id}/reject`, { reason: "Rejected from workbench" }),
    ...mutationOptions("Parameter set rejected"),
  });

  const retireParameterSetMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/parameter-sets/${id}/retire`, { reason: "Retired from workbench" }),
    ...mutationOptions("Parameter set retired"),
  });

  const createOrderMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/orders", {
      ...orderForm,
      customerId: orderForm.customerId || undefined,
      portfolioId: orderForm.portfolioId || undefined,
      assistedByUserId: orderForm.assistedByUserId || undefined,
      branchCode: orderForm.branchCode || undefined,
      channelSessionId: orderForm.channelSessionId || undefined,
      channelSignatureHash: orderForm.channelSignatureHash || undefined,
      channelCustomerRef: orderForm.channelCustomerRef || undefined,
      amount: Number(orderForm.amount),
      customerRiskScore: Number(orderForm.customerRiskScore),
      productScore: Number(orderForm.productScore),
      documentStatus: "REQUIRED",
      verificationStatus: orderForm.productFamily === "FX_TODAY" ? "PENDING" : "NOT_REQUIRED",
    }),
    ...mutationOptions("OEMS order drafted"),
  });

  const validateOrderMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("POST", `/api/v1/oems/orders/${orderId}/validate`),
    ...mutationOptions("Order validation completed"),
  });

  const acknowledgeWarningsMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("POST", `/api/v1/oems/orders/${orderId}/validation-warnings/acknowledge`, {
      ruleCodes: ["OEMS-DOC-001"],
    }),
    ...mutationOptions("Validation warning acknowledged"),
  });

  const submitOrderMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("POST", `/api/v1/oems/orders/${orderId}/submit`),
    ...mutationOptions("Order submitted"),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("POST", `/api/v1/oems/orders/${orderId}/cancel`, {
      reason: "Cancelled from workbench",
    }),
    ...mutationOptions("Order cancelled"),
  });

  const issueVerificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${verificationForm.orderId}/digital-verifications`, {
      verificationType: verificationForm.verificationType,
      requestMethod: verificationForm.requestMethod,
      channel: verificationForm.channel,
      provider: verificationForm.provider,
      ttlMinutes: Number(verificationForm.ttlMinutes),
      maxAttempts: Number(verificationForm.maxAttempts),
      boundDocumentTypes: verificationForm.boundDocumentTypes.split(",").map((item) => item.trim()).filter(Boolean),
      payload: JSON.parse(verificationForm.payload),
      evidence: JSON.parse(verificationForm.evidence),
      fallbackAllowed: verificationForm.fallbackAllowed,
      digitalImplemented: verificationForm.digitalImplemented,
      providerOutage: verificationForm.providerOutage,
      thirdPartyStatus: verificationForm.providerOutage ? "OUTAGE" : "REQUESTED",
    }),
    onSuccess: (data: DigitalVerification) => {
      setVerificationForm((current) => ({ ...current, verificationId: data.verification_id }));
      setOperationMessage("Digital verification issued");
      invalidateOems();
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const completeVerificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${verificationForm.orderId}/digital-verifications/${verificationForm.verificationId}/attempts`, {
      success: true,
      authMethod: verificationForm.requestMethod,
      evidence: JSON.parse(verificationForm.evidence),
    }),
    ...mutationOptions("Digital verification completed"),
  });

  const failVerificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${verificationForm.orderId}/digital-verifications/${verificationForm.verificationId}/attempts`, {
      success: false,
      authMethod: "OTP",
      failureReason: "OTP_MISMATCH",
      evidence: JSON.parse(verificationForm.evidence),
    }),
    ...mutationOptions("Digital verification failed attempt recorded"),
  });

  const expireVerificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${verificationForm.orderId}/digital-verifications/${verificationForm.verificationId}/expire`),
    ...mutationOptions("Digital verification expired"),
  });

  const cancelVerificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${verificationForm.orderId}/digital-verifications/${verificationForm.verificationId}/cancel`, {
      reason: "Cancelled from workbench",
    }),
    ...mutationOptions("Digital verification cancelled"),
  });

  const fallbackVerificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${verificationForm.orderId}/digital-verifications/${verificationForm.verificationId}/fallback-approve`, {
      fallbackReason: "Digital verification not implemented for selected channel/product",
      digitalImplemented: verificationForm.digitalImplemented,
      evidence: JSON.parse(verificationForm.evidence),
    }),
    ...mutationOptions("BSM fallback approved"),
  });

  const createDocumentRuleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/document-rules", {
      ...documentRuleForm,
      templateVersion: Number(documentRuleForm.templateVersion),
      dmsRequired: documentRuleForm.dmsRequired,
      ncbsRequired: documentRuleForm.ncbsRequired,
    }),
    ...mutationOptions("Document checklist rule saved"),
  });

  const generateChecklistMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${documentForm.orderId}/documents/checklist/generate`),
    ...mutationOptions("Document checklist generated"),
  });

  const registerDocumentMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${documentForm.orderId}/documents`, {
      documentType: documentForm.documentType,
      documentStatus: documentForm.documentStatus,
      fileName: documentForm.fileName,
      fileUrl: documentForm.fileUrl,
      expectedFileHash: documentForm.expectedFileHash || undefined,
      fileHash: documentForm.fileHash || undefined,
      templateCode: documentForm.templateCode || undefined,
      templateVersion: Number(documentForm.templateVersion),
      expiresAt: documentForm.expiresAt || undefined,
      evidence: JSON.parse(documentForm.evidence),
    }),
    onSuccess: (data: DocumentRegistration) => {
      setDocumentForm((current) => ({ ...current, documentId: data.document_id }));
      setOperationMessage("Document registered");
      invalidateOems();
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const generateEformMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${documentForm.orderId}/documents/eforms`, {
      documentType: documentForm.documentType,
      templateCode: documentForm.templateCode,
      templateVersion: Number(documentForm.templateVersion),
      metadata: { generatedFromWorkbench: true },
    }),
    ...mutationOptions("E-form generated"),
  });

  const signDocumentMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/documents/${documentForm.documentId}/sign`, {
      fileHash: documentForm.fileHash,
      evidence: JSON.parse(documentForm.evidence),
    }),
    ...mutationOptions("Document signed"),
  });

  const registerDmsMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/documents/${documentForm.documentId}/dms/register`, {
      accepted: true,
      dmsDocumentId: `DMS-${documentForm.documentId || "DOC"}`,
      ncbsRetryPending: true,
      responsePayload: { accepted: true },
    }),
    ...mutationOptions("Document registered in DMS"),
  });

  const registerNcbsMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/documents/${documentForm.documentId}/ncbs/register`, {
      accepted: false,
      failureReason: "NCBS_CIM13_TEMPORARY_FAILURE",
      responsePayload: { accepted: false },
    }),
    ...mutationOptions("NCBS retry pending recorded"),
  });

  const retryDocumentMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/documents/${documentForm.documentId}/retry`),
    ...mutationOptions("Document registration retry submitted"),
  });

  const createRiskQuestionnaireMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/risk/questionnaires", {
      questionnaireCode: riskQuestionnaireForm.questionnaireCode,
      versionNo: Number(riskQuestionnaireForm.versionNo),
      questionnaireName: riskQuestionnaireForm.questionnaireName,
      questions: JSON.parse(riskQuestionnaireForm.questions),
      mandatoryQuestionCodes: riskQuestionnaireForm.mandatoryQuestionCodes.split(",").map((item) => item.trim()).filter(Boolean),
      scoreBands: JSON.parse(riskQuestionnaireForm.scoreBands),
      validPeriodMonths: Number(riskQuestionnaireForm.validPeriodMonths),
      effectiveFrom: riskQuestionnaireForm.effectiveFrom,
    }),
    onSuccess: (data: RiskQuestionnaire) => {
      setRiskQuestionnaireForm((current) => ({ ...current, questionnaireId: String(data.id) }));
      setRiskAssessmentForm((current) => ({ ...current, questionnaireId: String(data.id) }));
      setOperationMessage("Risk questionnaire saved");
      invalidateOems();
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const submitRiskQuestionnaireMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/risk/questionnaires/${riskQuestionnaireForm.questionnaireId}/submit`),
    ...mutationOptions("Risk questionnaire submitted"),
  });

  const approveRiskQuestionnaireMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/risk/questionnaires/${riskQuestionnaireForm.questionnaireId}/approve`),
    ...mutationOptions("Risk questionnaire approved"),
  });

  const createRiskMappingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/risk/product-mappings", {
      ...riskMappingForm,
    }),
    ...mutationOptions("Product risk mapping saved"),
  });

  const createRiskAssessmentMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/risk/assessments", {
      customerId: riskAssessmentForm.customerId,
      questionnaireId: Number(riskAssessmentForm.questionnaireId || riskQuestionnaireForm.questionnaireId),
      answers: JSON.parse(riskAssessmentForm.answers),
    }),
    onSuccess: (data: RiskAssessment) => {
      setRiskAssessmentForm((current) => ({ ...current, assessmentId: data.assessment_id }));
      setOperationMessage("Risk assessment calculated");
      invalidateOems();
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const recordExternalRiskProfileMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/risk/customers/${riskAssessmentForm.customerId}/external-profile`, {
      externalSource: "WEALTH_CORE",
      externalRiskProfile: riskAssessmentForm.externalRiskProfile,
      sourcePayload: { checkedFromWorkbench: true },
    }),
    ...mutationOptions("External risk profile recorded"),
  });

  const syncRiskProfileMutation = useMutation({
    mutationFn: (targetSystem: "RBS" | "AVANTRADE") => apiRequest("POST", `/api/v1/oems/risk/assessments/${riskAssessmentForm.assessmentId}/sync/${targetSystem}`),
    ...mutationOptions("Risk profile sync queued"),
  });

  const validateOrderRiskMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${riskAssessmentForm.orderId}/risk/validate`, { persist: true }),
    ...mutationOptions("Order risk validation completed"),
  });

  const createOdaMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/oda/recommendations", {
      ...odaForm,
      customerId: odaForm.customerId || undefined,
      portfolioId: odaForm.portfolioId || undefined,
      assistedByUserId: odaForm.assistedByUserId || undefined,
      branchCode: odaForm.branchCode || undefined,
      nominalAmount: Number(odaForm.nominalAmount),
      ratePercent: Number(odaForm.ratePercent),
      referenceRate: Number(odaForm.referenceRate),
      tenorDays: Number(odaForm.tenorDays),
      taxRatePercent: Number(odaForm.taxRatePercent),
      minimumPlacementAmount: Number(odaForm.minimumPlacementAmount),
      minimumCollectiveAmount: Number(odaForm.minimumCollectiveAmount),
      availableBalance: Number(odaForm.availableBalance),
      ledgerBalance: Number(odaForm.ledgerBalance),
      expiryAt: odaForm.effectiveType === "GOOD_TILL_DATE" ? new Date(odaForm.expiryAt).toISOString() : undefined,
      cutoffAt: new Date(odaForm.cutoffAt).toISOString(),
      legs: JSON.parse(odaForm.legs),
    }),
    ...mutationOptions("ODA recommendation registered"),
  });

  const precheckOdaMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/oda/orders/precheck", {
      ...odaForm,
      nominalAmount: Number(odaForm.nominalAmount),
      ratePercent: Number(odaForm.ratePercent),
      referenceRate: Number(odaForm.referenceRate),
      tenorDays: Number(odaForm.tenorDays),
      minimumPlacementAmount: Number(odaForm.minimumPlacementAmount),
      minimumCollectiveAmount: Number(odaForm.minimumCollectiveAmount),
      availableBalance: Number(odaForm.availableBalance),
      ledgerBalance: Number(odaForm.ledgerBalance),
      expiryAt: odaForm.effectiveType === "GOOD_TILL_DATE" ? new Date(odaForm.expiryAt).toISOString() : undefined,
      cutoffAt: new Date(odaForm.cutoffAt).toISOString(),
      legs: JSON.parse(odaForm.legs),
    }),
    onSuccess: (data) => {
      setOdaPrecheckResult(data);
      setOperationMessage("ODA pre-order check completed");
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const createOdaRateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/oda/reference-rates", {
      ...odaRateForm,
      bidRate: Number(odaRateForm.bidRate),
      askRate: Number(odaRateForm.askRate),
      midRate: Number(odaRateForm.midRate),
      spreadRate: Number(odaRateForm.spreadRate),
    }),
    ...mutationOptions("Treasury reference rate captured"),
  });

  const authorizeOdaMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/oda/recommendations/${odaActionForm.recommendationId}/authorize`, {
      digitalVerificationUnavailable: true,
      fallbackReason: "Digital verification unavailable; BSM authorization applied",
      holdFunds: true,
      holdSucceeded: true,
    }),
    ...mutationOptions("ODA authorized and hold instruction queued"),
  });

  const holdOdaMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/oda/recommendations/${odaActionForm.recommendationId}/hold`, { holdSucceeded: true }),
    ...mutationOptions("NCBS hold instruction queued"),
  });

  const releaseOdaMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/oda/recommendations/${odaActionForm.recommendationId}/release`, { releaseSucceeded: true }),
    ...mutationOptions("NCBS release instruction queued"),
  });

  const cancelOdaMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/oda/recommendations/${odaActionForm.recommendationId}/cancel`, { reason: "Cancelled before COT", releaseSucceeded: true }),
    ...mutationOptions("ODA recommendation cancelled"),
  });

  const runOdaCotMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/oda/collections/run-cot", {
      valueDate: odaActionForm.valueDate,
      minimumCollectiveAmount: Number(odaActionForm.minimumCollectiveAmount),
    }),
    ...mutationOptions("ODA COT collection completed"),
  });

  const requestOdaTreasuryUpdateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/oda/collections/${odaActionForm.groupId}/treasury-updates`, {
      requestedLifecycle: odaActionForm.requestedLifecycle,
      swapPoints: Number(odaActionForm.swapPoints),
      treasuryDealId: odaActionForm.treasuryDealId || undefined,
      autoSettleResult: odaActionForm.autoSettleResult,
    }),
    onSuccess: (data: { update_id?: string }) => {
      if (data.update_id) setOdaActionForm((current) => ({ ...current, updateId: data.update_id ?? current.updateId }));
      setOperationMessage("Treasury update submitted for checker approval");
      invalidateOems();
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const approveOdaTreasuryUpdateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/oda/treasury-updates/${odaActionForm.updateId}/approve`, {
      approved: true,
      unholdSucceeded: true,
      overbookSucceeded: true,
      autoSettleResult: odaActionForm.autoSettleResult,
      syncSucceeded: true,
    }),
    ...mutationOptions("Treasury update approved and FP8007 sync queued"),
  });

  const createMldMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/mld/tranches", {
      ...mldForm,
      indicativeRate: Number(mldForm.indicativeRate),
      minimumInterestRate: Number(mldForm.minimumInterestRate),
      bonusPayoutRate: Number(mldForm.bonusPayoutRate),
      participationRate: Number(mldForm.participationRate),
      strikeRate: Number(mldForm.strikeRate),
      taxRate: Number(mldForm.taxRate),
      quotaAmount: Number(mldForm.quotaAmount),
      minInvestment: Number(mldForm.minInvestment),
      maxInvestment: Number(mldForm.maxInvestment),
      minimumCollectiveNominal: Number(mldForm.minimumCollectiveNominal),
      productScore: Number(mldForm.productScore),
    }),
    ...mutationOptions("MLD tranche opened"),
  });

  const createMldOrderMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/mld/orders", {
      trancheId: Number(mldForm.trancheId),
      customerId: mldForm.customerId || undefined,
      portfolioId: mldForm.portfolioId || undefined,
      amount: Number(mldForm.amount),
      customerRiskScore: Number(mldForm.productScore),
      cifStatus: mldForm.cifStatus,
      ninetyDayAverageBalance: Number(mldForm.ninetyDayAverageBalance),
      availableBalance: Number(mldForm.availableBalance),
      debitAccountNo: mldForm.debitAccountNo || undefined,
      holdSucceeded: true,
    }),
    ...mutationOptions("MLD order captured and NCBS hold queued"),
  });

  const runMldRecheckMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/mld/tranches/${mldForm.trancheId}/pretrade-recheck/run`, {
      tradeDate: mldForm.tradeDate,
    }),
    ...mutationOptions("MLD pre-trade recheck completed"),
  });

  const recordMldCallbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/mld/orders/${mldForm.orderId}/callback`, {
      completed: true,
      callbackResult: "CUSTOMER_CONFIRMED",
      callbackChannel: "PHONE",
      notes: "Callback completed from OEMS workbench",
    }),
    ...mutationOptions("MLD callback recorded"),
  });

  const tradeMldMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/mld/orders/${mldForm.orderId}/trade`, {
      tdAccountNo: mldForm.tdAccountNo || undefined,
      treasuryDealingId: mldForm.treasuryDealingId || undefined,
      tdCreationSucceeded: true,
      dealingIdRetrieved: Boolean(mldForm.treasuryDealingId),
    }),
    ...mutationOptions("MLD TD creation/trade processed"),
  });

  const fixingMldMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/mld/orders/${mldForm.orderId}/fixing`, {
      outcome: mldForm.fixingOutcome,
      fixingLevel: Number(mldForm.fixingLevel),
      minimumInterestRatePercent: Number(mldForm.minimumInterestRate),
      bonusPayoutRatePercent: Number(mldForm.bonusPayoutRate),
      taxRatePercent: Number(mldForm.taxRate),
    }),
    ...mutationOptions("MLD fixing outcome calculated"),
  });

  const matureMldMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/mld/orders/${mldForm.orderId}/mature`, {
      outcome: mldForm.fixingOutcome,
      tdUnholdSucceeded: true,
      creditSucceeded: true,
    }),
    ...mutationOptions("MLD maturity instruction processed"),
  });

  const retrieveWealthStaticMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/wealth/static-data/retrieve", {
      customerId: wealthForm.customerId || undefined,
      cif: wealthForm.cif || undefined,
      portfolioId: wealthForm.portfolioId || undefined,
      sourceSystems: wealthForm.sourceSystems,
      sourceStatus: JSON.parse(wealthForm.sourceStatus),
      fieldValues: { cif: wealthForm.cif, portfolioId: wealthForm.portfolioId },
    }),
    ...mutationOptions("Wealth static data retrieved"),
  });

  const createWealthProductMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/wealth/products", {
      productCode: wealthForm.productCode,
      productFamily: wealthForm.productFamily,
      quotaAmount: Number(wealthForm.quotaAmount),
      quotaRemaining: Number(wealthForm.quotaRemaining),
      offeringStart: wealthForm.offeringStart,
      offeringEnd: wealthForm.offeringEnd,
      performance1m: Number(wealthForm.performance1m),
      performance1y: Number(wealthForm.performance1y),
      performance3y: Number(wealthForm.performance3y),
      performance5y: Number(wealthForm.performance5y),
      performanceRequired: wealthForm.performanceRequired,
      transactionDocuments: ["SKU", "PFE", "TRANSACTION_FORM"],
    }),
    ...mutationOptions("Wealth product snapshot captured"),
  });

  const resolveWealthStaticMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/wealth/static-data/${wealthForm.staticDataId}/resolve`, {
      resolutionComment: wealthForm.resolutionComment,
    }),
    ...mutationOptions("Static-data conflict resolved"),
  });

  const syncSalesCertificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/wealth/sales-certifications/sync", {
      salesUserId: wealthForm.salesUserId || "SALES-USER",
      productFamily: wealthForm.productFamily,
      certificationStatus: "ACTIVE",
    }),
    ...mutationOptions("Sales certification synced"),
  });

  const createMfBondMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/mf-bond/orders", {
      productFamily: mfBondForm.productFamily,
      transactionVariant: mfBondForm.transactionVariant,
      customerId: mfBondForm.customerId || undefined,
      portfolioId: mfBondForm.portfolioId || undefined,
      productCode: mfBondForm.productCode,
      amount: Number(mfBondForm.amount),
      currency: mfBondForm.currency,
      sidStatus: mfBondForm.sidStatus,
      accountPortfolioStatus: mfBondForm.accountPortfolioStatus,
      pfeStatus: mfBondForm.pfeStatus,
      riskProfileStatus: mfBondForm.riskProfileStatus,
      staticDataStatus: mfBondForm.staticDataStatus,
      salesCertificationStatus: mfBondForm.salesCertificationStatus,
      digitalVerificationStatus: mfBondForm.digitalVerificationStatus,
      digitalVerificationExpiresAt: mfBondForm.digitalVerificationExpiresAt,
      quotaRemaining: Number(mfBondForm.quotaRemaining),
      performanceStatus: mfBondForm.performanceStatus,
      cherryPickLots: JSON.parse(mfBondForm.cherryPickLots),
      switchDetails: JSON.parse(mfBondForm.switchDetails),
    }),
    ...mutationOptions("MF/Bond order submitted"),
  });

  const lockBondPriceMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/mf-bond/orders/${mfBondForm.orderId}/bond-price-locks`, {
      bondCode: mfBondForm.productCode,
      requestedPrice: Number(mfBondForm.requestedPrice),
      lowerBound: Number(mfBondForm.lowerBound),
      upperBound: Number(mfBondForm.upperBound),
    }),
    ...mutationOptions("Bond live price locked"),
  });

  const handoffMfBondMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/mf-bond/orders/${mfBondForm.orderId}/wealth-core/handoff`, {
      handoffStatus: "SENT",
      wealthCoreOrderId: mfBondForm.wealthCoreOrderId || undefined,
    }),
    ...mutationOptions("MF/Bond handoff queued"),
  });

  const syncMfBondStatusMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/mf-bond/orders/${mfBondForm.orderId}/wealth-core/status`, {
      wealthCoreStatus: mfBondForm.wealthCoreStatus,
      wealthCoreOrderId: mfBondForm.wealthCoreOrderId || undefined,
      rejectionReason: mfBondForm.rejectionReason || undefined,
    }),
    ...mutationOptions("Wealth Core status synced"),
  });

  const createFxLiveRateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/fx-today/live-rates", {
      currencyPair: fxRateForm.currencyPair,
      bidRate: Number(fxRateForm.bidRate),
      askRate: Number(fxRateForm.askRate),
      midRate: Number(fxRateForm.midRate),
      sourceSystem: fxRateForm.sourceSystem,
      ttlSeconds: Number(fxRateForm.ttlSeconds),
    }),
    ...mutationOptions("FX live rate published"),
  });

  const createFxMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/fx-today/orders", {
      ...fxForm,
      orderId: undefined,
      customerId: fxForm.customerId || undefined,
      portfolioId: fxForm.portfolioId || undefined,
      amount: Number(fxForm.amount),
      specialRate: Number(fxForm.specialRate),
      quoteTtlSeconds: Number(fxForm.quoteTtlSeconds),
      underlyingDocumentThreshold: Number(fxForm.underlyingDocumentThreshold),
      underlyingDocumentId: fxForm.underlyingDocumentId || undefined,
    }),
    ...mutationOptions("FX Today special-rate order created"),
  });

  const refreshFxRateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/fx-today/orders/${fxForm.orderId}/rate-refresh`, {
      latestRate: Number(fxForm.latestRate),
      ttlSeconds: Number(fxForm.quoteTtlSeconds),
    }),
    ...mutationOptions("FX Today rate refreshed"),
  });

  const confirmFxMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/fx-today/orders/${fxForm.orderId}/confirm`, {
      customerConfirmed: true,
      quoteHash: fxForm.quoteHash || undefined,
      confirmedRate: Number(fxForm.latestRate || fxForm.specialRate),
      fallbackVerifierRole: fxForm.fallbackVerifierRole,
    }),
    ...mutationOptions("FX Today customer confirmation recorded"),
  });

  const treasuryFxMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/fx-today/orders/${fxForm.orderId}/treasury-snd`, {
      approved: true,
      treasuryReference: fxForm.treasuryReference || undefined,
    }),
    ...mutationOptions("Treasury SND approval recorded"),
  });

  const lhbuFxMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/fx-today/orders/${fxForm.orderId}/lhbu`, {
      purposeCode: fxForm.lhbuPurposeCode,
      confirmed: true,
      settlementStatus: fxForm.settlementStatus,
    }),
    ...mutationOptions("LHBU purpose code confirmed"),
  });

  const approveFxMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/fx-today/orders/${fxForm.orderId}/approve`, {
      ncbsReference: fxForm.ncbsReference || undefined,
      treasuryReference: fxForm.treasuryReference || undefined,
      settlementStatus: fxForm.settlementStatus,
      confirmationNoticeUrl: fxForm.confirmationNoticeUrl || undefined,
    }),
    ...mutationOptions("FX Today overbook and blotter captured"),
  });

  const eodFxMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/fx-today/eod-settlement-check", {}),
    ...mutationOptions("FX Today EOD settlement check completed"),
  });

  const createLendingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/wealth-lending/facilities", {
      ...lendingForm,
      customerId: lendingForm.customerId || undefined,
      portfolioId: lendingForm.portfolioId || undefined,
      loanSystemRef: lendingForm.loanSystemRef || undefined,
      coreBankingRef: lendingForm.coreBankingRef || undefined,
      loanAccountNo: lendingForm.loanAccountNo || undefined,
      limitAmount: Number(lendingForm.limitAmount),
      outstandingAmount: Number(lendingForm.outstandingAmount),
      ltvLimit: Number(lendingForm.ltvLimit),
      ltvWarning: Number(lendingForm.ltvWarning),
      collateralDecreasePercent: Number(lendingForm.collateralDecreasePercent),
      curePeriodDays: Number(lendingForm.curePeriodDays),
    }),
    onSuccess: (data: { facility_id?: string }) => {
      setLendingForm((current) => ({ ...current, facilityId: data.facility_id ?? current.facilityId }));
      setOperationMessage("Wealth-lending facility registered");
      invalidateOems();
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const addLendingCollateralMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/wealth-lending/facilities/${lendingForm.facilityId}/collateral`, {
      productFamily: lendingForm.collateralProductFamily,
      productCode: lendingForm.collateralProductCode,
      marketValue: Number(lendingForm.collateralMarketValue),
      haircutPercent: Number(lendingForm.collateralHaircutPercent),
      sourceSystem: lendingForm.collateralSourceSystem,
      maturityDate: lendingForm.collateralMaturityDate || undefined,
    }),
    ...mutationOptions("Collateral pledged and haircut applied"),
  });

  const retrieveLendingPricesMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/wealth-lending/facilities/${lendingForm.facilityId}/prices/retrieve`, {
      sourceSystems: lendingForm.priceSourceSystems.split(",").map((source) => source.trim()).filter(Boolean),
      priceStatus: lendingForm.priceStatus,
      prices: JSON.parse(lendingForm.pricePayload),
    }),
    ...mutationOptions("Collateral prices retrieved"),
  });

  const retrieveLendingOutstandingMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/wealth-lending/facilities/${lendingForm.facilityId}/outstanding/retrieve`, {
      sourceSystem: lendingForm.outstandingSourceSystem,
      loanAccountNo: lendingForm.loanAccountNo || undefined,
      outstandingAmount: Number(lendingForm.outstandingAmount),
      limitAmount: Number(lendingForm.limitAmount),
      retrievalStatus: "AVAILABLE",
    }),
    ...mutationOptions("Loan outstanding retrieved"),
  });

  const runLendingM2mMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/wealth-lending/facilities/${lendingForm.facilityId}/m2m`, {
      collateralDecreasePercent: Number(lendingForm.collateralDecreasePercent),
      curePeriodDays: Number(lendingForm.curePeriodDays),
    }),
    ...mutationOptions("M2M and cure requirement calculated"),
  });

  const publishLendingVisibilityMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/wealth-lending/facilities/${lendingForm.facilityId}/limit-visibility`, {
      channels: [lendingForm.visibilityChannel],
      simulatedStatus: "ACKNOWLEDGED",
    }),
    ...mutationOptions("Limit visibility published"),
  });

  const loadLendingVisibilityMutation = useMutation({
    mutationFn: () => apiRequest("GET", `/api/v1/oems/wealth-lending/facilities/${lendingForm.facilityId}/visibility?channel=${encodeURIComponent(lendingForm.visibilityChannel)}`),
    onSuccess: (data: WealthLendingVisibility) => {
      setLendingVisibility(data);
      setOperationMessage("Facility visibility loaded");
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const recordLendingCureMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/wealth-lending/facilities/${lendingForm.facilityId}/cure-actions`, {
      actionType: Number(lendingForm.repaymentAmount) > 0 ? "REPAYMENT" : "TOP_UP",
      amount: Number(lendingForm.repaymentAmount),
      collateralMarketValue: Number(lendingForm.topUpMarketValue),
      productFamily: lendingForm.collateralProductFamily,
      productCode: lendingForm.collateralProductCode,
      haircutPercent: Number(lendingForm.collateralHaircutPercent),
    }),
    ...mutationOptions("Cure action recorded"),
  });

  const sellLendingCollateralMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/wealth-lending/facilities/${lendingForm.facilityId}/sell-collateral`, {
      amount: Number(lendingForm.sellAmount),
      productCodes: lendingForm.collateralProductCode,
      instructionStatus: lendingForm.sellInstructionStatus,
      failureReason: lendingForm.sellInstructionStatus === "FAILED" ? "RBS rejected sell-collateral instruction" : undefined,
    }),
    ...mutationOptions("RBS sell-collateral instruction recorded"),
  });

  const createPortfolioHoldingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/portfolios/holdings", {
      ...portfolioHoldingForm,
      customerId: portfolioHoldingForm.customerId || undefined,
      portfolioId: portfolioHoldingForm.portfolioId || undefined,
      holdingAmount: Number(portfolioHoldingForm.holdingAmount),
      marketValue: Number(portfolioHoldingForm.marketValue),
      localMarketValue: Number(portfolioHoldingForm.localMarketValue),
      realizedGainLoss: Number(portfolioHoldingForm.realizedGainLoss),
      unrealizedGainLoss: Number(portfolioHoldingForm.unrealizedGainLoss),
      profitGain: Number(portfolioHoldingForm.profitGain),
      leftPrincipal: Number(portfolioHoldingForm.leftPrincipal),
      leftTermDays: Number(portfolioHoldingForm.leftTermDays),
    }),
    ...mutationOptions("Portfolio holding registered"),
  });

  const loadPortfolioMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({
        ...(portfolioViewForm.portfolioId ? { portfolioId: portfolioViewForm.portfolioId } : {}),
        productFamily: portfolioViewForm.productFamily,
        ...(portfolioViewForm.holdingMetric ? { holdingMetric: portfolioViewForm.holdingMetric } : {}),
        sourceStatus: portfolioViewForm.sourceStatus,
        fxRates: portfolioViewForm.fxRates,
      });
      return apiRequest("GET", `/api/v1/oems/portfolios/${portfolioViewForm.customerId}${params.toString() ? `?${params.toString()}` : ""}`);
    },
    onSuccess: (data: PortfolioView) => {
      setPortfolioView(data);
      setOperationMessage("Portfolio view loaded");
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const exportPortfolioMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/portfolios/${portfolioViewForm.customerId}/export`, {
      requestedFormat: "XLSX",
      filters: {
        portfolioId: portfolioViewForm.portfolioId || undefined,
        productFamily: portfolioViewForm.productFamily,
        holdingMetric: portfolioViewForm.holdingMetric || undefined,
      },
    }),
    ...mutationOptions("Portfolio export submitted"),
  });

  const createReportMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/reports", {
      ...reportForm,
      allowedFormats: reportForm.allowedFormats.split(",").map((format) => format.trim()).filter(Boolean),
      syncRowThreshold: Number(reportForm.syncRowThreshold),
      protectionPolicy: JSON.parse(reportForm.protectionPolicy),
      columns: reportForm.columns.split(",").map((column) => column.trim()).filter(Boolean),
    }),
    ...mutationOptions("OEMS report definition saved"),
  });

  const previewReportMutation = useMutation({
    mutationFn: async () => {
      const filters = JSON.parse(reportExportForm.filters);
      const query = new URLSearchParams(
        Object.entries(filters).reduce<Record<string, string>>((acc, [key, value]) => {
          if (value !== undefined && value !== null) acc[key] = String(value);
          return acc;
        }, {}),
      ).toString();
      return apiRequest("GET", `/api/v1/oems/reports/${reportExportForm.reportCode}${query ? `?${query}` : ""}`);
    },
    onSuccess: (data: ReportPreview) => {
      setReportPreview(data);
      setOperationMessage("Report preview generated");
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const startExportMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/reports/${reportExportForm.reportCode}/exports`, {
      requestedFormat: reportExportForm.requestedFormat,
      rowEstimate: Number(reportExportForm.rowEstimate),
      filters: {
        ...JSON.parse(reportExportForm.filters),
        bigDataAvailable: reportExportForm.bigDataAvailable,
      },
    }),
    ...mutationOptions("Report export job submitted"),
  });

  const retryExportMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/v1/oems/reports/exports/${jobId}/retry`),
    ...mutationOptions("Report export retry queued"),
  });

  const requestHistoryMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/reports/transaction-history/search", {
      customerId: historyForm.customerId || undefined,
      cif: historyForm.cif || undefined,
      productFamily: historyForm.productFamily,
      dateFrom: historyForm.dateFrom,
      dateTo: historyForm.dateTo,
      bigDataAvailable: historyForm.bigDataAvailable,
    }),
    ...mutationOptions("Transaction history request submitted"),
  });

  const retryIntegrationMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/integrations/${id}/retry`),
    ...mutationOptions("Integration retry queued"),
  });

  const createAdapterMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/integration-adapters", {
      adapterId: adapterForm.adapterId,
      targetSystem: adapterForm.targetSystem,
      adapterType: adapterForm.adapterType,
      endpointUrl: adapterForm.endpointUrl || undefined,
      authProfileRef: adapterForm.authProfileRef || undefined,
      contractVersion: adapterForm.contractVersion,
      contractSchema: JSON.parse(adapterForm.contractSchema),
      transformationMap: JSON.parse(adapterForm.transformationMap),
      adapterStatus: adapterForm.adapterStatus,
      certificationStatus: adapterForm.certificationStatus,
      mockMode: adapterForm.mockMode,
      reconciliationRequired: adapterForm.reconciliationRequired,
      requireTls: adapterForm.requireTls,
      allowedAddressPatterns: adapterForm.allowedAddressPatterns.split(",").map((item) => item.trim()).filter(Boolean),
      allowedSourceCidrs: adapterForm.allowedSourceCidrs.split(",").map((item) => item.trim()).filter(Boolean),
      payloadClassification: adapterForm.payloadClassification,
      sensitiveFieldPaths: adapterForm.sensitiveFieldPaths.split(",").map((item) => item.trim()).filter(Boolean),
      encryptedFieldPaths: adapterForm.encryptedFieldPaths.split(",").map((item) => item.trim()).filter(Boolean),
      maskLogPayloads: adapterForm.maskLogPayloads,
      encryptionRequired: adapterForm.encryptionRequired,
      encryptionProfileRef: adapterForm.encryptionProfileRef || undefined,
      transportPolicy: JSON.parse(adapterForm.transportPolicy),
      securityPolicyStatus: adapterForm.securityPolicyStatus,
      ownerTeam: adapterForm.ownerTeam || undefined,
    }),
    ...mutationOptions("Integration adapter saved"),
  });

  const updateAdapterSecurityMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/v1/oems/integration-adapters/${adapterForm.adapterId}/security`, {
      requireTls: adapterForm.requireTls,
      allowedAddressPatterns: adapterForm.allowedAddressPatterns.split(",").map((item) => item.trim()).filter(Boolean),
      allowedSourceCidrs: adapterForm.allowedSourceCidrs.split(",").map((item) => item.trim()).filter(Boolean),
      payloadClassification: adapterForm.payloadClassification,
      sensitiveFieldPaths: adapterForm.sensitiveFieldPaths.split(",").map((item) => item.trim()).filter(Boolean),
      encryptedFieldPaths: adapterForm.encryptedFieldPaths.split(",").map((item) => item.trim()).filter(Boolean),
      maskLogPayloads: adapterForm.maskLogPayloads,
      encryptionRequired: adapterForm.encryptionRequired,
      encryptionProfileRef: adapterForm.encryptionProfileRef || undefined,
      transportPolicy: JSON.parse(adapterForm.transportPolicy),
      securityPolicyStatus: adapterForm.securityPolicyStatus,
    }),
    ...mutationOptions("Adapter security policy updated"),
  });

  const executeAdapterMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/integration-adapters/${adapterForm.adapterId}/execute`, {
      messageType: adapterForm.messageType,
      entityType: adapterForm.entityType,
      entityId: adapterForm.entityId || adapterForm.adapterId,
      payload: JSON.parse(adapterForm.payload),
      sourceAddress: adapterForm.sourceAddress || undefined,
      destinationAddress: adapterForm.destinationAddress || undefined,
      simulatedStatus: adapterForm.simulatedStatus,
    }),
    ...mutationOptions("Adapter execution recorded"),
  });

  const healthAdapterMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/integration-adapters/${adapterForm.adapterId}/health`, {
      healthStatus: adapterForm.simulatedStatus === "FAILED" ? "FAILED" : "OK",
      certificationStatus: adapterForm.certificationStatus,
    }),
    ...mutationOptions("Adapter health updated"),
  });

  const createApprovalWorkflowMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/approval-workflows", {
      workflowCode: approvalForm.workflowCode,
      productFamily: approvalForm.productFamily,
      transactionType: approvalForm.transactionType,
      channel: approvalForm.channel,
      entityType: approvalForm.entityType,
      makerRoles: ["RELATIONSHIP_MANAGER", "BO_MAKER", "TRADER"],
      checkerRoles: [approvalForm.assignedRole],
      requiredApprovalCount: 1,
      slaMinutes: 240,
      escalationRoles: ["BO_HEAD"],
      payload: { configuredFromWorkbench: true },
    }),
    ...mutationOptions("Approval workflow saved"),
  });

  const enqueueApprovalMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/approval-queue", {
      workflowCode: approvalForm.workflowCode,
      orderId: approvalForm.orderId || undefined,
      entityType: approvalForm.entityType,
      entityId: approvalForm.entityId || approvalForm.orderId,
      assignedRole: approvalForm.assignedRole,
      makerUserId: approvalForm.makerUserId || undefined,
      payloadSnapshot: { source: "oems-workbench" },
    }),
    onSuccess: (data: ApprovalQueueItem) => {
      setApprovalForm((current) => ({ ...current, queueItemId: data.queue_item_id }));
      setOperationMessage("Approval queue item created");
      invalidateOems();
    },
    onError: (err: Error) => setOperationMessage(err.message),
  });

  const decideApprovalMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/approval-queue/${approvalForm.queueItemId}/decision`, {
      decision: approvalForm.decision,
      reviewerRole: approvalForm.assignedRole,
      comment: "Reviewed from OEMS workbench",
    }),
    ...mutationOptions("Approval queue decision recorded"),
  });

  const renderReportArtifactMutation = useMutation({
    mutationFn: (exportJobId?: string) => apiRequest("POST", `/api/v1/oems/reports/exports/${exportJobId ?? artifactForm.exportJobId}/render`, {
      renderPayload: JSON.parse(artifactForm.renderPayload),
    }),
    ...mutationOptions("Report artifact rendered"),
  });

  const registerRollbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/migration-rollbacks", {
      rollbackId: artifactForm.rollbackId,
      migrationName: artifactForm.migrationName,
      rollbackScriptPath: artifactForm.rollbackScriptPath,
      rollbackSql: artifactForm.rollbackSql,
      notes: "Registered from OEMS workbench",
    }),
    ...mutationOptions("Rollback script registered"),
  });

  const verifyRollbackMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/migration-rollbacks/${artifactForm.rollbackId}/verify`, {
      expectedChecksum: artifactForm.expectedChecksum || undefined,
      verificationStatus: "VERIFIED",
      notes: "Checksum verified from OEMS workbench",
    }),
    ...mutationOptions("Rollback checksum verified"),
  });

  const createNotificationTemplateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/notifications/templates", {
      eventCode: notificationTemplateForm.eventCode,
      productFamily: notificationTemplateForm.productFamily,
      recipientRole: notificationTemplateForm.recipientRole,
      deliveryChannels: notificationTemplateForm.deliveryChannels.split(",").map((channel) => channel.trim()).filter(Boolean),
      subjectTemplate: notificationTemplateForm.subjectEn,
      bodyTemplate: notificationTemplateForm.bodyEn,
      localizedSubjects: {
        "en-ID": notificationTemplateForm.subjectEn,
        en: notificationTemplateForm.subjectEn,
        "id-ID": notificationTemplateForm.subjectId,
        id: notificationTemplateForm.subjectId,
      },
      localizedBodies: {
        "en-ID": notificationTemplateForm.bodyEn,
        en: notificationTemplateForm.bodyEn,
        "id-ID": notificationTemplateForm.bodyId,
        id: notificationTemplateForm.bodyId,
      },
      critical: notificationTemplateForm.critical,
      requiresAttachment: notificationTemplateForm.requiresAttachment,
      attachmentPasswordPolicy: notificationTemplateForm.requiresAttachment
        ? JSON.parse(notificationTemplateForm.attachmentPasswordPolicy)
        : undefined,
    }),
    ...mutationOptions("Notification template saved"),
  });

  const submitNotificationTemplateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/notifications/templates/${id}/submit`),
    ...mutationOptions("Notification template submitted"),
  });

  const approveNotificationTemplateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/notifications/templates/${id}/approve`),
    ...mutationOptions("Notification template approved"),
  });

  const rejectNotificationTemplateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/notifications/templates/${id}/reject`, { reason: "Rejected from workbench" }),
    ...mutationOptions("Notification template rejected"),
  });

  const retireNotificationTemplateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/notifications/templates/${id}/retire`, { reason: "Retired from workbench" }),
    ...mutationOptions("Notification template retired"),
  });

  const dispatchNotificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/notifications/events", {
      eventCode: notificationEventForm.eventCode,
      orderId: notificationEventForm.orderId || undefined,
      recipientId: notificationEventForm.recipientId || undefined,
      recipientAddress: notificationEventForm.recipientAddress || undefined,
      channels: notificationEventForm.channels.split(",").map((channel) => channel.trim()).filter(Boolean),
      languageCode: notificationEventForm.languageCode,
      channelResults: JSON.parse(notificationEventForm.channelResults),
      payload: JSON.parse(notificationEventForm.payload),
      attachmentRequired: notificationEventForm.attachmentRequired,
      attachmentPolicy: notificationEventForm.attachmentRequired
        ? JSON.parse(notificationEventForm.attachmentPolicy)
        : undefined,
    }),
    ...mutationOptions("Notification event dispatched"),
  });

  const retryNotificationDeliveryMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/v1/oems/notifications/deliveries/${id}/retry`),
    ...mutationOptions("Notification retry queued"),
  });

  const summary = summaryQuery.data;
  const orders = ordersQuery.data?.data ?? [];
  const products = productsQuery.data ?? [];
  const parameterSets = parameterSetsQuery.data ?? [];
  const odaRecommendations = odaQuery.data ?? [];
  const mldTranches = mldQuery.data ?? [];
  const integrations = integrationsQuery.data ?? [];
  const notificationTemplates = notificationTemplatesQuery.data ?? [];
  const notificationDeliveries = notificationDeliveriesQuery.data ?? [];
  const notificationReport = notificationReportQuery.data;
  const reports = reportsQuery.data ?? [];
  const exportJobs = exportJobsQuery.data ?? [];
  const digitalVerifications = digitalVerificationsQuery.data ?? [];
  const odaReferenceRates = odaRatesQuery.data ?? [];
  const odaDailySummary = odaSummaryQuery.data ?? [];
  const odaFundInstructions = odaFundInstructionsQuery.data ?? [];
  const mldOrderDetails = mldOrderDetailsQuery.data ?? [];
  const mldFundInstructions = mldFundInstructionsQuery.data ?? [];
  const wealthStaticRows = wealthStaticQuery.data ?? [];
  const wealthProductSnapshots = wealthProductsQuery.data ?? [];
  const mfBondDetails = mfBondDetailsQuery.data ?? [];
  const bondPricingLocks = bondPricingLocksQuery.data ?? [];
  const fxLiveRates = fxLiveRatesQuery.data ?? [];
  const fxDetails = fxDetailsQuery.data ?? [];
  const fxBlotterEntries = fxBlotterQuery.data ?? [];
  const wealthLendingInstructions = wealthLendingInstructionsQuery.data ?? [];
  const integrationAdapters = integrationAdaptersQuery.data ?? [];
  const integrationAdapterExecutions = integrationAdapterExecutionsQuery.data ?? [];
  const approvalWorkflows = approvalWorkflowsQuery.data ?? [];
  const approvalQueue = approvalQueueQuery.data ?? [];
  const documentRules = documentRulesQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const checklist = checklistQuery.data;
  const riskQuestionnaires = riskQuestionnairesQuery.data ?? [];
  const riskReport = riskReportQuery.data;
  const reportArtifacts = reportArtifactsQuery.data ?? [];
  const migrationRollbacks = migrationRollbacksQuery.data ?? [];

  const loading = useMemo(
    () => summaryQuery.isLoading || ordersQuery.isLoading || productsQuery.isLoading,
    [ordersQuery.isLoading, productsQuery.isLoading, summaryQuery.isLoading],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Danamon OEMS Workbench</h1>
            <p className="text-sm text-muted-foreground">Product setup, order execution, exceptions and reports</p>
          </div>
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <Select value={familyFilter} onValueChange={(value) => setFamilyFilter(value as ProductFamily | "ALL")}>
            <SelectTrigger className="w-full md:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All product families</SelectItem>
              {productFamilies.map((family) => (
                <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => invalidateOems()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="Open orders" value={summary?.openOrders} icon={ListChecks} />
        <KpiCard label="Validation failures" value={summary?.validationFailures} icon={AlertTriangle} />
        <KpiCard label="Integrations" value={summary?.pendingIntegrations} icon={Plug} />
        <KpiCard label="LTV breaches" value={summary?.ltvBreaches} icon={Banknote} />
        <KpiCard label="Active parameters" value={summary?.activeParameters} icon={SlidersHorizontal} />
      </div>

      {operationMessage && (
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">{operationMessage}</div>
      )}

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="wealth">Wealth</TabsTrigger>
          <TabsTrigger value="oda">ODA</TabsTrigger>
          <TabsTrigger value="mld">MLD</TabsTrigger>
          <TabsTrigger value="fx">FX Today</TabsTrigger>
          <TabsTrigger value="lending">Lending</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Product Setup</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Product code">
                <Input value={productForm.productCode} onChange={(event) => setProductForm({ ...productForm, productCode: event.target.value })} />
              </Field>
              <Field label="Product name">
                <Input value={productForm.productName} onChange={(event) => setProductForm({ ...productForm, productName: event.target.value })} />
              </Field>
              <Field label="Family">
                <Select value={productForm.productFamily} onValueChange={(value) => setProductForm({ ...productForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Currency">
                <Input value={productForm.currency} onChange={(event) => setProductForm({ ...productForm, currency: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Risk score">
                <Input type="number" value={productForm.riskScore} onChange={(event) => setProductForm({ ...productForm, riskScore: event.target.value })} />
              </Field>
              <Field label="Product score">
                <Input type="number" value={productForm.productScore} onChange={(event) => setProductForm({ ...productForm, productScore: event.target.value })} />
              </Field>
              <Field label="Minimum amount">
                <Input type="number" value={productForm.minSubscriptionAmount} onChange={(event) => setProductForm({ ...productForm, minSubscriptionAmount: event.target.value })} />
              </Field>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => createProductMutation.mutate()} disabled={createProductMutation.isPending}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Save Product
                </Button>
              </div>
	            </CardContent>
	          </Card>

	          <Card>
	            <CardHeader className="pb-4">
	              <CardTitle className="text-base">Parameter Governance</CardTitle>
	            </CardHeader>
	            <CardContent className="grid gap-4 md:grid-cols-4">
	              <Field label="Product ID">
	                <Input value={parameterForm.productId} onChange={(event) => setParameterForm({ ...parameterForm, productId: event.target.value })} />
	              </Field>
	              <Field label="Type">
	                <Input value={parameterForm.parameterType} onChange={(event) => setParameterForm({ ...parameterForm, parameterType: event.target.value.toUpperCase() })} />
	              </Field>
	              <Field label="Channel">
	                <Select value={parameterForm.channel} onValueChange={(value) => setParameterForm({ ...parameterForm, channel: value as OemsChannel })}>
	                  <SelectTrigger><SelectValue /></SelectTrigger>
	                  <SelectContent>
	                    {oemsChannels.map((channel) => <SelectItem key={channel} value={channel}>{channel.replace(/_/g, " ")}</SelectItem>)}
	                  </SelectContent>
	                </Select>
	              </Field>
	              <Field label="Timezone">
	                <Input value={parameterForm.productTimezone} onChange={(event) => setParameterForm({ ...parameterForm, productTimezone: event.target.value })} />
	              </Field>
	              <Field label="Effective from">
	                <Input type="date" value={parameterForm.effectiveFrom} onChange={(event) => setParameterForm({ ...parameterForm, effectiveFrom: event.target.value })} />
	              </Field>
	              <Field label="Effective to">
	                <Input type="date" value={parameterForm.effectiveTo} onChange={(event) => setParameterForm({ ...parameterForm, effectiveTo: event.target.value })} />
	              </Field>
	              <Field label="Calendar keys">
	                <Input value={parameterForm.calendarKey} onChange={(event) => setParameterForm({ ...parameterForm, calendarKey: event.target.value.toUpperCase() })} />
	              </Field>
	              <Field label="Cutoff time">
	                <Input value={parameterForm.cutoffTime} onChange={(event) => setParameterForm({ ...parameterForm, cutoffTime: event.target.value })} />
	              </Field>
	              <Field label="Cutoff action">
	                <Select value={parameterForm.cutoffAction} onValueChange={(value) => setParameterForm({ ...parameterForm, cutoffAction: value })}>
	                  <SelectTrigger><SelectValue /></SelectTrigger>
	                  <SelectContent>
	                    <SelectItem value="REJECT_AFTER_COT">Reject after COT</SelectItem>
	                    <SelectItem value="NEXT_BUSINESS_DAY">Next business day</SelectItem>
	                    <SelectItem value="ALLOW_AFTER_COT">Allow after COT</SelectItem>
	                  </SelectContent>
	                </Select>
	              </Field>
	              <Field label="Checker repair">
	                <Select value={parameterForm.allowCheckerRepairAfterCutoff ? "true" : "false"} onValueChange={(value) => setParameterForm({ ...parameterForm, allowCheckerRepairAfterCutoff: value === "true" })}>
	                  <SelectTrigger><SelectValue /></SelectTrigger>
	                  <SelectContent>
	                    <SelectItem value="false">Blocked</SelectItem>
	                    <SelectItem value="true">Allowed</SelectItem>
	                  </SelectContent>
	                </Select>
	              </Field>
	              <div className="md:col-span-4">
	                <Field label="Parameters JSON">
	                  <Textarea value={parameterForm.parameters} onChange={(event) => setParameterForm({ ...parameterForm, parameters: event.target.value })} />
	                </Field>
	              </div>
	              <div className="md:col-span-4">
	                <Button onClick={() => createParameterSetMutation.mutate()} disabled={createParameterSetMutation.isPending}>
	                  <SlidersHorizontal className="mr-2 h-4 w-4" />
	                  Save Parameter Set
	                </Button>
	              </div>
	            </CardContent>
	          </Card>

	          <DataTable
	            emptyText={loading ? "Loading products..." : "No OEMS products found"}
	            headers={["Code", "Name", "Family", "Currency", "Status"]}
	            rows={products.map((product) => [
              product.product_code,
              product.product_name,
              product.product_family.replace(/_/g, " "),
              product.currency,
	              <StatusBadge key="status" value={product.is_active ? "ACTIVE" : "RETIRED"} />,
	            ])}
	          />

	          <DataTable
	            emptyText={parameterSetsQuery.isLoading ? "Loading parameter sets..." : "No OEMS parameter sets found"}
	            headers={["ID", "Product", "Type", "Channel", "Window", "Cutoff", "Status", "Actions"]}
	            rows={parameterSets.map((parameterSet) => [
	              <span key="id" className="font-mono text-xs">{parameterSet.id}</span>,
	              String(parameterSet.product_id),
	              parameterSet.parameter_type,
	              parameterSet.channel.replace(/_/g, " "),
	              `${formatDate(parameterSet.effective_from)} to ${formatDate(parameterSet.effective_to)}`,
	              parameterSet.cutoff_time ? `${parameterSet.cutoff_time} ${parameterSet.product_timezone}` : "-",
	              <StatusBadge key="status" value={parameterSet.parameter_status} />,
	              <div key="actions" className="flex flex-wrap gap-2">
	                <Button size="sm" variant="outline" onClick={() => submitParameterSetMutation.mutate(parameterSet.id)}>Submit</Button>
	                <Button size="sm" variant="outline" onClick={() => approveParameterSetMutation.mutate(parameterSet.id)}>Approve</Button>
	                <Button size="sm" variant="outline" onClick={() => rejectParameterSetMutation.mutate(parameterSet.id)}>Reject</Button>
	                <Button size="sm" variant="outline" onClick={() => retireParameterSetMutation.mutate(parameterSet.id)}>Retire</Button>
	              </div>,
	            ])}
	          />
	        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Order Capture</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Family">
                <Select value={orderForm.productFamily} onValueChange={(value) => setOrderForm({ ...orderForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Transaction type">
                <Input value={orderForm.transactionType} onChange={(event) => setOrderForm({ ...orderForm, transactionType: event.target.value })} />
              </Field>
              <Field label="Customer ID">
                <Input value={orderForm.customerId} onChange={(event) => setOrderForm({ ...orderForm, customerId: event.target.value })} />
              </Field>
              <Field label="Portfolio ID">
                <Input value={orderForm.portfolioId} onChange={(event) => setOrderForm({ ...orderForm, portfolioId: event.target.value })} />
              </Field>
	              <Field label="Channel">
	                <Select value={orderForm.channel} onValueChange={(value) => setOrderForm({ ...orderForm, channel: value as OemsChannel })}>
	                  <SelectTrigger><SelectValue /></SelectTrigger>
	                  <SelectContent>
	                    {oemsChannels.map((channel) => (
	                      <SelectItem key={channel} value={channel}>{channel.replace(/_/g, " ")}</SelectItem>
	                    ))}
	                  </SelectContent>
	                </Select>
	              </Field>
	              <Field label="Assisted by">
	                <Input value={orderForm.assistedByUserId} onChange={(event) => setOrderForm({ ...orderForm, assistedByUserId: event.target.value })} />
	              </Field>
	              <Field label="Branch code">
	                <Input value={orderForm.branchCode} onChange={(event) => setOrderForm({ ...orderForm, branchCode: event.target.value.toUpperCase() })} />
	              </Field>
	              <Field label="Channel session">
	                <Input value={orderForm.channelSessionId} onChange={(event) => setOrderForm({ ...orderForm, channelSessionId: event.target.value })} />
	              </Field>
	              <Field label="Channel signature">
	                <Input value={orderForm.channelSignatureHash} onChange={(event) => setOrderForm({ ...orderForm, channelSignatureHash: event.target.value })} />
	              </Field>
	              <Field label="Channel customer ref">
	                <Input value={orderForm.channelCustomerRef} onChange={(event) => setOrderForm({ ...orderForm, channelCustomerRef: event.target.value })} />
	              </Field>
	              <Field label="Currency">
	                <Input value={orderForm.currency} onChange={(event) => setOrderForm({ ...orderForm, currency: event.target.value.toUpperCase() })} />
	              </Field>
              <Field label="Amount">
                <Input type="number" value={orderForm.amount} onChange={(event) => setOrderForm({ ...orderForm, amount: event.target.value })} />
              </Field>
              <Field label="Risk / product score">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={orderForm.customerRiskScore} onChange={(event) => setOrderForm({ ...orderForm, customerRiskScore: event.target.value })} />
                  <Input type="number" value={orderForm.productScore} onChange={(event) => setOrderForm({ ...orderForm, productScore: event.target.value })} />
                </div>
              </Field>
              <div className="md:col-span-4">
                <Button onClick={() => createOrderMutation.mutate()} disabled={createOrderMutation.isPending}>
                  <Send className="mr-2 h-4 w-4" />
                  Create Draft Order
                </Button>
              </div>
            </CardContent>
          </Card>

	          <DataTable
	            emptyText={ordersQuery.isLoading ? "Loading orders..." : "No OEMS orders found"}
	            headers={["Order", "Family", "Channel", "Customer", "Amount", "Processing", "Docs", "Verification", "Status", "Actions"]}
	            rows={orders.map((order) => [
	              <span key="order" className="font-mono text-xs">{order.order_no}</span>,
	              order.product_family.replace(/_/g, " "),
	              order.channel.replace(/_/g, " "),
	              order.customer_id ?? "-",
	              formatMoney(order.amount, order.currency),
	              formatDate(order.processing_date),
	              <StatusBadge key="docs" value={order.document_status} />,
	              <StatusBadge key="verification" value={order.verification_status} />,
	              <StatusBadge key="status" value={order.order_status} />,
	              <div key="actions" className="flex flex-wrap gap-2">
	                <Button size="sm" variant="outline" onClick={() => validateOrderMutation.mutate(order.order_id)}>Validate</Button>
	                <Button size="sm" variant="outline" onClick={() => acknowledgeWarningsMutation.mutate(order.order_id)}>Ack</Button>
	                <Button size="sm" variant="outline" onClick={() => submitOrderMutation.mutate(order.order_id)}>Submit</Button>
	                <Button size="sm" variant="outline" onClick={() => cancelOrderMutation.mutate(order.order_id)}>Cancel</Button>
	              </div>,
	            ])}
	          />
	        </TabsContent>

        <TabsContent value="verification" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Digital Signature and Verification</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Order ID">
                <Input value={verificationForm.orderId} onChange={(event) => setVerificationForm({ ...verificationForm, orderId: event.target.value })} />
              </Field>
              <Field label="Verification ID">
                <Input value={verificationForm.verificationId} onChange={(event) => setVerificationForm({ ...verificationForm, verificationId: event.target.value })} />
              </Field>
              <Field label="Type">
                <Input value={verificationForm.verificationType} onChange={(event) => setVerificationForm({ ...verificationForm, verificationType: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Method">
                <Select value={verificationForm.requestMethod} onValueChange={(value) => setVerificationForm({ ...verificationForm, requestMethod: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTH_LINK">Auth link</SelectItem>
                    <SelectItem value="OTP">OTP</SelectItem>
                    <SelectItem value="MPIN">MPIN</SelectItem>
                    <SelectItem value="SOFT_TOKEN">Soft token</SelectItem>
                    <SelectItem value="DIGITAL_SIGNATURE">Digital signature</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Channel">
                <Select value={verificationForm.channel} onValueChange={(value) => setVerificationForm({ ...verificationForm, channel: value as OemsChannel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {oemsChannels.map((channel) => <SelectItem key={channel} value={channel}>{channel.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Provider">
                <Input value={verificationForm.provider} onChange={(event) => setVerificationForm({ ...verificationForm, provider: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="TTL minutes">
                <Input type="number" value={verificationForm.ttlMinutes} onChange={(event) => setVerificationForm({ ...verificationForm, ttlMinutes: event.target.value })} />
              </Field>
              <Field label="Max attempts">
                <Input type="number" value={verificationForm.maxAttempts} onChange={(event) => setVerificationForm({ ...verificationForm, maxAttempts: event.target.value })} />
              </Field>
              <Field label="Fallback">
                <Select value={verificationForm.fallbackAllowed ? "true" : "false"} onValueChange={(value) => setVerificationForm({ ...verificationForm, fallbackAllowed: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Not allowed</SelectItem>
                    <SelectItem value="true">Allowed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Digital implementation">
                <Select value={verificationForm.digitalImplemented ? "true" : "false"} onValueChange={(value) => setVerificationForm({ ...verificationForm, digitalImplemented: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Implemented</SelectItem>
                    <SelectItem value="false">Not implemented</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Provider outage">
                <Select value={verificationForm.providerOutage ? "true" : "false"} onValueChange={(value) => setVerificationForm({ ...verificationForm, providerOutage: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">No</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Documents">
                <Input value={verificationForm.boundDocumentTypes} onChange={(event) => setVerificationForm({ ...verificationForm, boundDocumentTypes: event.target.value.toUpperCase() })} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Payload JSON">
                  <Textarea value={verificationForm.payload} onChange={(event) => setVerificationForm({ ...verificationForm, payload: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Evidence JSON">
                  <Textarea value={verificationForm.evidence} onChange={(event) => setVerificationForm({ ...verificationForm, evidence: event.target.value })} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button onClick={() => issueVerificationMutation.mutate()} disabled={issueVerificationMutation.isPending || !verificationForm.orderId}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Issue Request
                </Button>
                <Button variant="outline" onClick={() => completeVerificationMutation.mutate()} disabled={completeVerificationMutation.isPending || !verificationForm.orderId || !verificationForm.verificationId}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Complete
                </Button>
                <Button variant="outline" onClick={() => failVerificationMutation.mutate()} disabled={failVerificationMutation.isPending || !verificationForm.orderId || !verificationForm.verificationId}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Fail Attempt
                </Button>
                <Button variant="outline" onClick={() => expireVerificationMutation.mutate()} disabled={expireVerificationMutation.isPending || !verificationForm.orderId || !verificationForm.verificationId}>
                  Expire
                </Button>
                <Button variant="outline" onClick={() => cancelVerificationMutation.mutate()} disabled={cancelVerificationMutation.isPending || !verificationForm.orderId || !verificationForm.verificationId}>
                  Cancel
                </Button>
                <Button variant="outline" onClick={() => fallbackVerificationMutation.mutate()} disabled={fallbackVerificationMutation.isPending || !verificationForm.orderId || !verificationForm.verificationId}>
                  BSM Fallback
                </Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={digitalVerificationsQuery.isLoading ? "Loading digital verifications..." : "No digital verification requests found"}
            headers={["Verification", "Method", "Channel", "Provider", "Attempts", "Expiry", "Payload", "Signed Doc", "Status"]}
            rows={digitalVerifications.map((verification) => [
              <button
                key="verification"
                type="button"
                className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setVerificationForm({ ...verificationForm, verificationId: verification.verification_id })}
              >
                {verification.verification_id}
              </button>,
              verification.request_method,
              verification.channel.replace(/_/g, " "),
              verification.provider ?? "-",
              `${verification.failed_attempts}/${verification.max_attempts}`,
              formatDate(verification.expires_at),
              <span key="payload" className="font-mono text-xs">{verification.payload_hash.slice(0, 12)}</span>,
              verification.signed_document_url ? "Available" : "-",
              <StatusBadge key="status" value={verification.verification_status} />,
            ])}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Checklist Rule</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Rule code"><Input value={documentRuleForm.ruleCode} onChange={(event) => setDocumentRuleForm({ ...documentRuleForm, ruleCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Family">
                <Select value={documentRuleForm.productFamily} onValueChange={(value) => setDocumentRuleForm({ ...documentRuleForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Transaction"><Input value={documentRuleForm.transactionType} onChange={(event) => setDocumentRuleForm({ ...documentRuleForm, transactionType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Channel">
                <Select value={documentRuleForm.channel} onValueChange={(value) => setDocumentRuleForm({ ...documentRuleForm, channel: value as OemsChannel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {oemsChannels.map((channel) => <SelectItem key={channel} value={channel}>{channel.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Document type"><Input value={documentRuleForm.documentType} onChange={(event) => setDocumentRuleForm({ ...documentRuleForm, documentType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Requirement">
                <Select value={documentRuleForm.requirementType} onValueChange={(value) => setDocumentRuleForm({ ...documentRuleForm, requirementType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REQUIRED">Required</SelectItem>
                    <SelectItem value="OPTIONAL">Optional</SelectItem>
                    <SelectItem value="CONDITIONAL">Conditional</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Blocking stage">
                <Select value={documentRuleForm.blockingStage} onValueChange={(value) => setDocumentRuleForm({ ...documentRuleForm, blockingStage: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUBMISSION">Submission</SelectItem>
                    <SelectItem value="EXECUTION">Execution</SelectItem>
                    <SelectItem value="NONE">None</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Template"><Input value={documentRuleForm.templateCode} onChange={(event) => setDocumentRuleForm({ ...documentRuleForm, templateCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Version"><Input type="number" value={documentRuleForm.templateVersion} onChange={(event) => setDocumentRuleForm({ ...documentRuleForm, templateVersion: event.target.value })} /></Field>
              <Field label="DMS">
                <Select value={documentRuleForm.dmsRequired ? "true" : "false"} onValueChange={(value) => setDocumentRuleForm({ ...documentRuleForm, dmsRequired: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="true">Required</SelectItem><SelectItem value="false">Not required</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="NCBS">
                <Select value={documentRuleForm.ncbsRequired ? "true" : "false"} onValueChange={(value) => setDocumentRuleForm({ ...documentRuleForm, ncbsRequired: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="true">Required</SelectItem><SelectItem value="false">Not required</SelectItem></SelectContent>
                </Select>
              </Field>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => createDocumentRuleMutation.mutate()} disabled={createDocumentRuleMutation.isPending}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Save Rule
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Document Registration</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Order ID"><Input value={documentForm.orderId} onChange={(event) => setDocumentForm({ ...documentForm, orderId: event.target.value })} /></Field>
              <Field label="Document ID"><Input value={documentForm.documentId} onChange={(event) => setDocumentForm({ ...documentForm, documentId: event.target.value })} /></Field>
              <Field label="Type"><Input value={documentForm.documentType} onChange={(event) => setDocumentForm({ ...documentForm, documentType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Status">
                <Select value={documentForm.documentStatus} onValueChange={(value) => setDocumentForm({ ...documentForm, documentStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPLOADED">Uploaded</SelectItem>
                    <SelectItem value="SIGNED">Signed</SelectItem>
                    <SelectItem value="VERIFIED">Verified</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="File name"><Input value={documentForm.fileName} onChange={(event) => setDocumentForm({ ...documentForm, fileName: event.target.value })} /></Field>
              <Field label="File URL"><Input value={documentForm.fileUrl} onChange={(event) => setDocumentForm({ ...documentForm, fileUrl: event.target.value })} /></Field>
              <Field label="Expected hash"><Input value={documentForm.expectedFileHash} onChange={(event) => setDocumentForm({ ...documentForm, expectedFileHash: event.target.value })} /></Field>
              <Field label="File hash"><Input value={documentForm.fileHash} onChange={(event) => setDocumentForm({ ...documentForm, fileHash: event.target.value })} /></Field>
              <Field label="Template"><Input value={documentForm.templateCode} onChange={(event) => setDocumentForm({ ...documentForm, templateCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Version"><Input type="number" value={documentForm.templateVersion} onChange={(event) => setDocumentForm({ ...documentForm, templateVersion: event.target.value })} /></Field>
              <Field label="Expires"><Input type="date" value={documentForm.expiresAt} onChange={(event) => setDocumentForm({ ...documentForm, expiresAt: event.target.value })} /></Field>
              <div className="md:col-span-4">
                <Field label="Evidence JSON"><Textarea value={documentForm.evidence} onChange={(event) => setDocumentForm({ ...documentForm, evidence: event.target.value })} /></Field>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button variant="outline" onClick={() => generateChecklistMutation.mutate()} disabled={generateChecklistMutation.isPending || !documentForm.orderId}>
                  <ListChecks className="mr-2 h-4 w-4" />
                  Generate Checklist
                </Button>
                <Button onClick={() => registerDocumentMutation.mutate()} disabled={registerDocumentMutation.isPending || !documentForm.orderId}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Register Document
                </Button>
                <Button variant="outline" onClick={() => generateEformMutation.mutate()} disabled={generateEformMutation.isPending || !documentForm.orderId}>
                  Generate E-form
                </Button>
                <Button variant="outline" onClick={() => signDocumentMutation.mutate()} disabled={signDocumentMutation.isPending || !documentForm.documentId}>
                  Sign
                </Button>
                <Button variant="outline" onClick={() => registerDmsMutation.mutate()} disabled={registerDmsMutation.isPending || !documentForm.documentId}>
                  DMS Register
                </Button>
                <Button variant="outline" onClick={() => registerNcbsMutation.mutate()} disabled={registerNcbsMutation.isPending || !documentForm.documentId}>
                  NCBS Fail
                </Button>
                <Button variant="outline" onClick={() => retryDocumentMutation.mutate()} disabled={retryDocumentMutation.isPending || !documentForm.documentId}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
              {checklist && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-4">
                  <div className="font-medium">
                    {checklist.readyForSubmission ? "Submission ready" : `${checklist.submissionBlockers.length} submission blockers`}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {checklist.readyForExecution ? "Execution ready" : `${checklist.executionBlockers.length} execution blockers`}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <DataTable
            emptyText={documentRulesQuery.isLoading ? "Loading document rules..." : "No document checklist rules found"}
            headers={["Rule", "Family", "Transaction", "Document", "Requirement", "Stage", "Template", "DMS", "NCBS"]}
            rows={documentRules.map((rule) => [
              <span key="rule" className="font-mono text-xs">{rule.rule_code}</span>,
              rule.product_family?.replace(/_/g, " ") ?? "All",
              rule.transaction_type ?? "All",
              rule.document_type,
              rule.requirement_type,
              rule.blocking_stage,
              rule.template_code ? `${rule.template_code} v${rule.template_version}` : "-",
              rule.dms_required ? "Yes" : "No",
              rule.ncbs_required ? "Yes" : "No",
            ])}
          />

          <DataTable
            emptyText={documentsQuery.isLoading ? "Loading documents..." : "No documents for selected order"}
            headers={["Document", "Type", "Requirement", "Stage", "Hash", "DMS", "NCBS", "Retry", "Status"]}
            rows={documents.map((document) => [
              <button
                key="doc"
                type="button"
                className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setDocumentForm({ ...documentForm, documentId: document.document_id })}
              >
                {document.document_id}
              </button>,
              document.document_type,
              document.requirement_type,
              document.blocking_stage,
              document.hash_verified ? "Verified" : document.quarantine_reason ? "Quarantined" : "-",
              document.dms_status ?? "-",
              document.ncbs_status ?? "-",
              formatDate(document.next_retry_at),
              <StatusBadge key="status" value={document.document_status} />,
            ])}
          />
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <KpiCard label="Active profiles" value={riskReport?.summary.activeProfiles} icon={ShieldCheck} />
            <KpiCard label="Expired profiles" value={riskReport?.summary.expiredProfiles} icon={AlertTriangle} />
            <KpiCard label="Expiring profiles" value={riskReport?.summary.expiringProfiles} icon={History} />
            <KpiCard label="Conflicts" value={riskReport?.summary.conflictProfiles} icon={Plug} />
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Risk Questionnaire Version</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Questionnaire ID"><Input value={riskQuestionnaireForm.questionnaireId} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, questionnaireId: event.target.value })} /></Field>
              <Field label="Code"><Input value={riskQuestionnaireForm.questionnaireCode} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, questionnaireCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Version"><Input type="number" value={riskQuestionnaireForm.versionNo} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, versionNo: event.target.value })} /></Field>
              <Field label="Name"><Input value={riskQuestionnaireForm.questionnaireName} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, questionnaireName: event.target.value })} /></Field>
              <Field label="Mandatory codes"><Input value={riskQuestionnaireForm.mandatoryQuestionCodes} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, mandatoryQuestionCodes: event.target.value.toUpperCase() })} /></Field>
              <Field label="Valid months"><Input type="number" value={riskQuestionnaireForm.validPeriodMonths} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, validPeriodMonths: event.target.value })} /></Field>
              <Field label="Effective from"><Input type="date" value={riskQuestionnaireForm.effectiveFrom} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, effectiveFrom: event.target.value })} /></Field>
              <div className="md:col-span-2"><Field label="Questions JSON"><Textarea value={riskQuestionnaireForm.questions} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, questions: event.target.value })} /></Field></div>
              <div className="md:col-span-2"><Field label="Score bands JSON"><Textarea value={riskQuestionnaireForm.scoreBands} onChange={(event) => setRiskQuestionnaireForm({ ...riskQuestionnaireForm, scoreBands: event.target.value })} /></Field></div>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button onClick={() => createRiskQuestionnaireMutation.mutate()} disabled={createRiskQuestionnaireMutation.isPending}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Save Questionnaire
                </Button>
                <Button variant="outline" onClick={() => submitRiskQuestionnaireMutation.mutate()} disabled={submitRiskQuestionnaireMutation.isPending || !riskQuestionnaireForm.questionnaireId}>
                  Submit
                </Button>
                <Button variant="outline" onClick={() => approveRiskQuestionnaireMutation.mutate()} disabled={approveRiskQuestionnaireMutation.isPending || !riskQuestionnaireForm.questionnaireId}>
                  Approve
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Assessment and Suitability</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Customer ID"><Input value={riskAssessmentForm.customerId} onChange={(event) => setRiskAssessmentForm({ ...riskAssessmentForm, customerId: event.target.value })} /></Field>
              <Field label="Assessment ID"><Input value={riskAssessmentForm.assessmentId} onChange={(event) => setRiskAssessmentForm({ ...riskAssessmentForm, assessmentId: event.target.value })} /></Field>
              <Field label="Questionnaire ID"><Input value={riskAssessmentForm.questionnaireId} onChange={(event) => setRiskAssessmentForm({ ...riskAssessmentForm, questionnaireId: event.target.value })} /></Field>
              <Field label="External profile">
                <Select value={riskAssessmentForm.externalRiskProfile} onValueChange={(value) => setRiskAssessmentForm({ ...riskAssessmentForm, externalRiskProfile: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["CONSERVATIVE", "MODERATE", "BALANCED", "GROWTH", "AGGRESSIVE"].map((profile) => <SelectItem key={profile} value={profile}>{profile.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Mapping code"><Input value={riskMappingForm.mappingCode} onChange={(event) => setRiskMappingForm({ ...riskMappingForm, mappingCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Mapping family">
                <Select value={riskMappingForm.productFamily} onValueChange={(value) => setRiskMappingForm({ ...riskMappingForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Mapping transaction"><Input value={riskMappingForm.transactionType} onChange={(event) => setRiskMappingForm({ ...riskMappingForm, transactionType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Product risk">
                <Select value={riskMappingForm.productRiskProfile} onValueChange={(value) => setRiskMappingForm({ ...riskMappingForm, productRiskProfile: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["CONSERVATIVE", "MODERATE", "BALANCED", "GROWTH", "AGGRESSIVE"].map((profile) => <SelectItem key={profile} value={profile}>{profile.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Order ID"><Input value={riskAssessmentForm.orderId} onChange={(event) => setRiskAssessmentForm({ ...riskAssessmentForm, orderId: event.target.value })} /></Field>
              <div className="md:col-span-4"><Field label="Answers JSON"><Textarea value={riskAssessmentForm.answers} onChange={(event) => setRiskAssessmentForm({ ...riskAssessmentForm, answers: event.target.value })} /></Field></div>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button onClick={() => createRiskAssessmentMutation.mutate()} disabled={createRiskAssessmentMutation.isPending || !riskAssessmentForm.customerId}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Calculate Profile
                </Button>
                <Button variant="outline" onClick={() => createRiskMappingMutation.mutate()} disabled={createRiskMappingMutation.isPending}>
                  Save Mapping
                </Button>
                <Button variant="outline" onClick={() => recordExternalRiskProfileMutation.mutate()} disabled={recordExternalRiskProfileMutation.isPending || !riskAssessmentForm.customerId}>
                  Wealth Core Check
                </Button>
                <Button variant="outline" onClick={() => syncRiskProfileMutation.mutate("RBS")} disabled={syncRiskProfileMutation.isPending || !riskAssessmentForm.assessmentId}>
                  Sync RBS
                </Button>
                <Button variant="outline" onClick={() => syncRiskProfileMutation.mutate("AVANTRADE")} disabled={syncRiskProfileMutation.isPending || !riskAssessmentForm.assessmentId}>
                  Sync Avantrade
                </Button>
                <Button variant="outline" onClick={() => validateOrderRiskMutation.mutate()} disabled={validateOrderRiskMutation.isPending || !riskAssessmentForm.orderId}>
                  Validate Order
                </Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={riskQuestionnairesQuery.isLoading ? "Loading risk questionnaires..." : "No risk questionnaires found"}
            headers={["Code", "Version", "Name", "Effective", "Status"]}
            rows={riskQuestionnaires.map((questionnaire) => [
              <button
                key="questionnaire"
                type="button"
                className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  setRiskQuestionnaireForm({ ...riskQuestionnaireForm, questionnaireId: String(questionnaire.id) });
                  setRiskAssessmentForm({ ...riskAssessmentForm, questionnaireId: String(questionnaire.id) });
                }}
              >
                {questionnaire.questionnaire_code}
              </button>,
              String(questionnaire.version_no),
              questionnaire.questionnaire_name,
              `${formatDate(questionnaire.effective_from)} to ${formatDate(questionnaire.effective_to)}`,
              <StatusBadge key="status" value={questionnaire.questionnaire_status} />,
            ])}
          />

          <DataTable
            emptyText="No risk conflicts or expiring profiles"
            headers={["Assessment", "Customer", "Risk", "Strict", "Expiry", "RBS", "Avantrade", "Status"]}
            rows={[...(riskReport?.conflicts ?? []), ...(riskReport?.expiring ?? [])].map((assessment) => [
              <button
                key="assessment"
                type="button"
                className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setRiskAssessmentForm({ ...riskAssessmentForm, assessmentId: assessment.assessment_id, customerId: assessment.customer_id })}
              >
                {assessment.assessment_id}
              </button>,
              assessment.customer_id,
              <StatusBadge key="risk" value={assessment.risk_profile} />,
              <StatusBadge key="strict" value={assessment.strict_risk_profile ?? assessment.risk_profile} />,
              formatDate(assessment.effective_to),
              assessment.rbs_sync_status ?? "-",
              assessment.avantrade_sync_status ?? "-",
              <StatusBadge key="status" value={assessment.conflict_status} />,
            ])}
          />
        </TabsContent>

        <TabsContent value="wealth" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Wealth Static Data and Product Setup</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Customer ID"><Input value={wealthForm.customerId} onChange={(event) => setWealthForm({ ...wealthForm, customerId: event.target.value })} /></Field>
              <Field label="CIF"><Input value={wealthForm.cif} onChange={(event) => setWealthForm({ ...wealthForm, cif: event.target.value })} /></Field>
              <Field label="Portfolio ID"><Input value={wealthForm.portfolioId} onChange={(event) => setWealthForm({ ...wealthForm, portfolioId: event.target.value })} /></Field>
              <Field label="Sources"><Input value={wealthForm.sourceSystems} onChange={(event) => setWealthForm({ ...wealthForm, sourceSystems: event.target.value.toUpperCase() })} /></Field>
              <div className="md:col-span-2"><Field label="Source status JSON"><Textarea value={wealthForm.sourceStatus} onChange={(event) => setWealthForm({ ...wealthForm, sourceStatus: event.target.value })} /></Field></div>
              <Field label="Static data ID"><Input value={wealthForm.staticDataId} onChange={(event) => setWealthForm({ ...wealthForm, staticDataId: event.target.value })} /></Field>
              <Field label="Resolution"><Input value={wealthForm.resolutionComment} onChange={(event) => setWealthForm({ ...wealthForm, resolutionComment: event.target.value })} /></Field>
              <Field label="Product code"><Input value={wealthForm.productCode} onChange={(event) => setWealthForm({ ...wealthForm, productCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Family">
                <Select value={wealthForm.productFamily} onValueChange={(value) => setWealthForm({ ...wealthForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
                    <SelectItem value="BOND">Bond</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quota remaining"><Input type="number" value={wealthForm.quotaRemaining} onChange={(event) => setWealthForm({ ...wealthForm, quotaRemaining: event.target.value })} /></Field>
              <Field label="Offering end"><Input type="date" value={wealthForm.offeringEnd} onChange={(event) => setWealthForm({ ...wealthForm, offeringEnd: event.target.value })} /></Field>
              <Field label="1M / 1Y performance">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={wealthForm.performance1m} onChange={(event) => setWealthForm({ ...wealthForm, performance1m: event.target.value })} />
                  <Input type="number" value={wealthForm.performance1y} onChange={(event) => setWealthForm({ ...wealthForm, performance1y: event.target.value })} />
                </div>
              </Field>
              <Field label="3Y / 5Y performance">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={wealthForm.performance3y} onChange={(event) => setWealthForm({ ...wealthForm, performance3y: event.target.value })} />
                  <Input type="number" value={wealthForm.performance5y} onChange={(event) => setWealthForm({ ...wealthForm, performance5y: event.target.value })} />
                </div>
              </Field>
              <Field label="Sales user"><Input value={wealthForm.salesUserId} onChange={(event) => setWealthForm({ ...wealthForm, salesUserId: event.target.value })} /></Field>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button onClick={() => retrieveWealthStaticMutation.mutate()} disabled={retrieveWealthStaticMutation.isPending}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retrieve Static Data
                </Button>
                <Button variant="outline" onClick={() => createWealthProductMutation.mutate()} disabled={createWealthProductMutation.isPending}>
                  Save Product Snapshot
                </Button>
                <Button variant="outline" onClick={() => resolveWealthStaticMutation.mutate()} disabled={resolveWealthStaticMutation.isPending || !wealthForm.staticDataId}>
                  Resolve Conflict
                </Button>
                <Button variant="outline" onClick={() => syncSalesCertificationMutation.mutate()} disabled={syncSalesCertificationMutation.isPending}>
                  Sync Sales Cert
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">MF/Bond Order Lifecycle</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Order ID"><Input value={mfBondForm.orderId} onChange={(event) => setMfBondForm({ ...mfBondForm, orderId: event.target.value })} /></Field>
              <Field label="Family">
                <Select value={mfBondForm.productFamily} onValueChange={(value) => setMfBondForm({ ...mfBondForm, productFamily: value as "MUTUAL_FUND" | "BOND" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
                    <SelectItem value="BOND">Bond</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Variant"><Input value={mfBondForm.transactionVariant} onChange={(event) => setMfBondForm({ ...mfBondForm, transactionVariant: event.target.value.toUpperCase() })} /></Field>
              <Field label="Product code"><Input value={mfBondForm.productCode} onChange={(event) => setMfBondForm({ ...mfBondForm, productCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Customer ID"><Input value={mfBondForm.customerId} onChange={(event) => setMfBondForm({ ...mfBondForm, customerId: event.target.value })} /></Field>
              <Field label="Portfolio ID"><Input value={mfBondForm.portfolioId} onChange={(event) => setMfBondForm({ ...mfBondForm, portfolioId: event.target.value })} /></Field>
              <Field label="Amount"><Input type="number" value={mfBondForm.amount} onChange={(event) => setMfBondForm({ ...mfBondForm, amount: event.target.value })} /></Field>
              <Field label="Currency"><Input value={mfBondForm.currency} onChange={(event) => setMfBondForm({ ...mfBondForm, currency: event.target.value.toUpperCase() })} /></Field>
              <Field label="SID / portfolio">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={mfBondForm.sidStatus} onChange={(event) => setMfBondForm({ ...mfBondForm, sidStatus: event.target.value.toUpperCase() })} />
                  <Input value={mfBondForm.accountPortfolioStatus} onChange={(event) => setMfBondForm({ ...mfBondForm, accountPortfolioStatus: event.target.value.toUpperCase() })} />
                </div>
              </Field>
              <Field label="PFE / risk">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={mfBondForm.pfeStatus} onChange={(event) => setMfBondForm({ ...mfBondForm, pfeStatus: event.target.value.toUpperCase() })} />
                  <Input value={mfBondForm.riskProfileStatus} onChange={(event) => setMfBondForm({ ...mfBondForm, riskProfileStatus: event.target.value.toUpperCase() })} />
                </div>
              </Field>
              <Field label="Static / cert">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={mfBondForm.staticDataStatus} onChange={(event) => setMfBondForm({ ...mfBondForm, staticDataStatus: event.target.value.toUpperCase() })} />
                  <Input value={mfBondForm.salesCertificationStatus} onChange={(event) => setMfBondForm({ ...mfBondForm, salesCertificationStatus: event.target.value.toUpperCase() })} />
                </div>
              </Field>
              <Field label="Digital expiry"><Input type="datetime-local" value={mfBondForm.digitalVerificationExpiresAt} onChange={(event) => setMfBondForm({ ...mfBondForm, digitalVerificationExpiresAt: event.target.value })} /></Field>
              <div className="md:col-span-2"><Field label="Cherry-pick lots JSON"><Textarea value={mfBondForm.cherryPickLots} onChange={(event) => setMfBondForm({ ...mfBondForm, cherryPickLots: event.target.value })} /></Field></div>
              <div className="md:col-span-2"><Field label="Switch details JSON"><Textarea value={mfBondForm.switchDetails} onChange={(event) => setMfBondForm({ ...mfBondForm, switchDetails: event.target.value })} /></Field></div>
              <Field label="Bond price"><Input type="number" value={mfBondForm.requestedPrice} onChange={(event) => setMfBondForm({ ...mfBondForm, requestedPrice: event.target.value })} /></Field>
              <Field label="Price bounds">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={mfBondForm.lowerBound} onChange={(event) => setMfBondForm({ ...mfBondForm, lowerBound: event.target.value })} />
                  <Input type="number" value={mfBondForm.upperBound} onChange={(event) => setMfBondForm({ ...mfBondForm, upperBound: event.target.value })} />
                </div>
              </Field>
              <Field label="Wealth Core ID"><Input value={mfBondForm.wealthCoreOrderId} onChange={(event) => setMfBondForm({ ...mfBondForm, wealthCoreOrderId: event.target.value })} /></Field>
              <Field label="Core status"><Input value={mfBondForm.wealthCoreStatus} onChange={(event) => setMfBondForm({ ...mfBondForm, wealthCoreStatus: event.target.value.toUpperCase() })} /></Field>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button onClick={() => createMfBondMutation.mutate()} disabled={createMfBondMutation.isPending}>
                  <Send className="mr-2 h-4 w-4" />
                  Create MF/Bond Order
                </Button>
                <Button variant="outline" onClick={() => lockBondPriceMutation.mutate()} disabled={lockBondPriceMutation.isPending || !mfBondForm.orderId}>
                  Lock Bond Price
                </Button>
                <Button variant="outline" onClick={() => handoffMfBondMutation.mutate()} disabled={handoffMfBondMutation.isPending || !mfBondForm.orderId}>
                  Handoff
                </Button>
                <Button variant="outline" onClick={() => syncMfBondStatusMutation.mutate()} disabled={syncMfBondStatusMutation.isPending || !mfBondForm.orderId}>
                  Sync Status
                </Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={wealthStaticQuery.isLoading ? "Loading wealth static data..." : "No static data records"}
            headers={["Static ID", "Customer", "Source", "Retrieval", "Conflict", "Failure", "Retrieved"]}
            rows={wealthStaticRows.map((row) => [
              <button key="static" type="button" className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => setWealthForm({ ...wealthForm, staticDataId: row.static_data_id })}>{row.static_data_id}</button>,
              row.customer_id ?? row.cif ?? "-",
              row.source_system,
              <StatusBadge key="retrieval" value={row.retrieval_status} />,
              <StatusBadge key="conflict" value={row.conflict_status} />,
              row.failure_reason ?? "-",
              formatDate(row.last_retrieved_at),
            ])}
          />

          <DataTable
            emptyText={wealthProductsQuery.isLoading ? "Loading product snapshots..." : "No product snapshots"}
            headers={["Snapshot", "Product", "Family", "Quota", "Offering", "Setup", "Performance"]}
            rows={wealthProductSnapshots.map((snapshot) => [
              <span key="snapshot" className="font-mono text-xs">{snapshot.snapshot_id}</span>,
              snapshot.product_code,
              snapshot.product_family.replace(/_/g, " "),
              formatMoney(snapshot.quota_remaining),
              `${formatDate(snapshot.offering_start)} to ${formatDate(snapshot.offering_end)}`,
              <StatusBadge key="setup" value={snapshot.setup_status} />,
              <StatusBadge key="performance" value={snapshot.performance_status} />,
            ])}
          />

          <DataTable
            emptyText={mfBondDetailsQuery.isLoading ? "Loading MF/Bond order details..." : "No MF/Bond order details"}
            headers={["Order", "Family", "Variant", "SID", "PFE", "Risk", "Static", "Cert", "Digital", "Performance", "Wealth Core", "Reason"]}
            rows={mfBondDetails.map((detail) => [
              <button key="order" type="button" className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => setMfBondForm({ ...mfBondForm, orderId: detail.order_id })}>{detail.order_id}</button>,
              detail.product_family.replace(/_/g, " "),
              detail.transaction_variant.replace(/_/g, " "),
              <StatusBadge key="sid" value={detail.sid_status} />,
              <StatusBadge key="pfe" value={detail.pfe_status} />,
              <StatusBadge key="risk" value={detail.risk_profile_status} />,
              <StatusBadge key="static" value={detail.static_data_status} />,
              <StatusBadge key="cert" value={detail.sales_certification_status} />,
              <StatusBadge key="digital" value={detail.digital_verification_status} />,
              <StatusBadge key="performance" value={detail.performance_claim_status} />,
              <StatusBadge key="core" value={detail.wealth_core_status} />,
              detail.wealth_core_rejection_reason ?? "-",
            ])}
          />

          <DataTable
            emptyText={bondPricingLocksQuery.isLoading ? "Loading pricing locks..." : "No bond pricing locks"}
            headers={["Lock", "Order", "Bond", "Requested", "Locked", "Expires", "Route", "Status"]}
            rows={bondPricingLocks.map((lock) => [
              <span key="lock" className="font-mono text-xs">{lock.lock_id}</span>,
              lock.order_id,
              lock.bond_code,
              lock.requested_price,
              lock.locked_price,
              formatDate(lock.locked_until),
              <StatusBadge key="route" value={lock.approval_route} />,
              <StatusBadge key="status" value={lock.lock_status} />,
            ])}
          />
        </TabsContent>

        <TabsContent value="oda" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Treasury Reference Rate</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Currency pair"><Input value={odaRateForm.currencyPair} onChange={(event) => setOdaRateForm({ ...odaRateForm, currencyPair: event.target.value.toUpperCase() })} /></Field>
              <Field label="Mode">
                <Select value={odaRateForm.retrievalMode} onValueChange={(value) => setOdaRateForm({ ...odaRateForm, retrievalMode: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="AD_HOC">Ad hoc</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Mid rate"><Input type="number" value={odaRateForm.midRate} onChange={(event) => setOdaRateForm({ ...odaRateForm, midRate: event.target.value })} /></Field>
              <Field label="Rate date"><Input type="date" value={odaRateForm.rateDate} onChange={(event) => setOdaRateForm({ ...odaRateForm, rateDate: event.target.value })} /></Field>
              <Field label="Bid"><Input type="number" value={odaRateForm.bidRate} onChange={(event) => setOdaRateForm({ ...odaRateForm, bidRate: event.target.value })} /></Field>
              <Field label="Ask"><Input type="number" value={odaRateForm.askRate} onChange={(event) => setOdaRateForm({ ...odaRateForm, askRate: event.target.value })} /></Field>
              <Field label="Spread"><Input type="number" value={odaRateForm.spreadRate} onChange={(event) => setOdaRateForm({ ...odaRateForm, spreadRate: event.target.value })} /></Field>
              <Field label="Status">
                <Select value={odaRateForm.rateStatus} onValueChange={(value) => setOdaRateForm({ ...odaRateForm, rateStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AVAILABLE">Available</SelectItem>
                    <SelectItem value="UNAVAILABLE">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-4">
                <Button onClick={() => createOdaRateMutation.mutate()} disabled={createOdaRateMutation.isPending}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Capture Rate
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">ODA Pre-Order Registration</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Customer ID"><Input value={odaForm.customerId} onChange={(event) => setOdaForm({ ...odaForm, customerId: event.target.value })} /></Field>
              <Field label="Customer type">
                <Select value={odaForm.customerType} onValueChange={(value) => setOdaForm({ ...odaForm, customerType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                    <SelectItem value="CORPORATE">Corporate</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Portfolio ID"><Input value={odaForm.portfolioId} onChange={(event) => setOdaForm({ ...odaForm, portfolioId: event.target.value })} /></Field>
              <Field label="Channel">
                <Select value={odaForm.channel} onValueChange={(value) => setOdaForm({ ...odaForm, channel: value as OemsChannel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {oemsChannels.map((channel) => <SelectItem key={channel} value={channel}>{channel.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Direction">
                <Select value={odaForm.direction} onValueChange={(value) => setOdaForm({ ...odaForm, direction: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">Buy</SelectItem>
                    <SelectItem value="SELL">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Currency pair"><Input value={odaForm.currencyPair} onChange={(event) => setOdaForm({ ...odaForm, currencyPair: event.target.value.toUpperCase() })} /></Field>
              <Field label="ODA type">
                <Select value={odaForm.odaType} onValueChange={(value) => setOdaForm({ ...odaForm, odaType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">Single</SelectItem>
                    <SelectItem value="IF_DONE">If Done</SelectItem>
                    <SelectItem value="OCO">OCO</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Effective type">
                <Select value={odaForm.effectiveType} onValueChange={(value) => setOdaForm({ ...odaForm, effectiveType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INTRADAY">Intraday</SelectItem>
                    <SelectItem value="OVERNIGHT">Overnight</SelectItem>
                    <SelectItem value="GOOD_TILL_DATE">Good till date</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nominal amount"><Input type="number" value={odaForm.nominalAmount} onChange={(event) => setOdaForm({ ...odaForm, nominalAmount: event.target.value })} /></Field>
              <Field label="Hit rate"><Input type="number" value={odaForm.ratePercent} onChange={(event) => setOdaForm({ ...odaForm, ratePercent: event.target.value })} /></Field>
              <Field label="Reference rate"><Input type="number" value={odaForm.referenceRate} onChange={(event) => setOdaForm({ ...odaForm, referenceRate: event.target.value })} /></Field>
              <Field label="Tenor days"><Input type="number" value={odaForm.tenorDays} onChange={(event) => setOdaForm({ ...odaForm, tenorDays: event.target.value })} /></Field>
              <Field label="Tax %"><Input type="number" value={odaForm.taxRatePercent} onChange={(event) => setOdaForm({ ...odaForm, taxRatePercent: event.target.value })} /></Field>
              <Field label="Minimum placement"><Input type="number" value={odaForm.minimumPlacementAmount} onChange={(event) => setOdaForm({ ...odaForm, minimumPlacementAmount: event.target.value })} /></Field>
              <Field label="Minimum collective"><Input type="number" value={odaForm.minimumCollectiveAmount} onChange={(event) => setOdaForm({ ...odaForm, minimumCollectiveAmount: event.target.value })} /></Field>
              <Field label="Available balance"><Input type="number" value={odaForm.availableBalance} onChange={(event) => setOdaForm({ ...odaForm, availableBalance: event.target.value })} /></Field>
              <Field label="Debit account"><Input value={odaForm.debitAccountNo} onChange={(event) => setOdaForm({ ...odaForm, debitAccountNo: event.target.value })} /></Field>
              <Field label="Credit account"><Input value={odaForm.creditAccountNo} onChange={(event) => setOdaForm({ ...odaForm, creditAccountNo: event.target.value })} /></Field>
              <Field label="Assisted by"><Input value={odaForm.assistedByUserId} onChange={(event) => setOdaForm({ ...odaForm, assistedByUserId: event.target.value })} /></Field>
              <Field label="Branch"><Input value={odaForm.branchCode} onChange={(event) => setOdaForm({ ...odaForm, branchCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Expiry"><Input type="datetime-local" value={odaForm.expiryAt} onChange={(event) => setOdaForm({ ...odaForm, expiryAt: event.target.value })} /></Field>
              <Field label="Cutoff"><Input type="datetime-local" value={odaForm.cutoffAt} onChange={(event) => setOdaForm({ ...odaForm, cutoffAt: event.target.value })} /></Field>
              <Field label="CIF / SKU / PFE">
                <Input value={`${odaForm.cifStatus}/${odaForm.skuStatus}/${odaForm.pfeStatus}`} readOnly />
              </Field>
              <Field label="OCO / If Done legs JSON">
                <Textarea className="min-h-24" value={odaForm.legs} onChange={(event) => setOdaForm({ ...odaForm, legs: event.target.value })} />
              </Field>
              <div className="md:col-span-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => precheckOdaMutation.mutate()} disabled={precheckOdaMutation.isPending}>
                    <ListChecks className="mr-2 h-4 w-4" />
                    Pre-Check
                  </Button>
                  <Button onClick={() => createOdaMutation.mutate()} disabled={createOdaMutation.isPending}>
                  <Landmark className="mr-2 h-4 w-4" />
                  Register ODA
                  </Button>
                </div>
              </div>
              {odaPrecheckResult ? (
                <pre className="md:col-span-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(odaPrecheckResult, null, 2)}</pre>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">ODA Lifecycle Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Recommendation ID"><Input value={odaActionForm.recommendationId} onChange={(event) => setOdaActionForm({ ...odaActionForm, recommendationId: event.target.value })} /></Field>
              <Field label="Group ID"><Input value={odaActionForm.groupId} onChange={(event) => setOdaActionForm({ ...odaActionForm, groupId: event.target.value })} /></Field>
              <Field label="Value date"><Input type="date" value={odaActionForm.valueDate} onChange={(event) => setOdaActionForm({ ...odaActionForm, valueDate: event.target.value })} /></Field>
              <Field label="Treasury status">
                <Select value={odaActionForm.requestedLifecycle} onValueChange={(value) => setOdaActionForm({ ...odaActionForm, requestedLifecycle: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXECUTED">Executed</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                    <SelectItem value="OBSERVATION">Observation</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Swap points"><Input type="number" value={odaActionForm.swapPoints} onChange={(event) => setOdaActionForm({ ...odaActionForm, swapPoints: event.target.value })} /></Field>
              <Field label="Treasury deal ID"><Input value={odaActionForm.treasuryDealId} onChange={(event) => setOdaActionForm({ ...odaActionForm, treasuryDealId: event.target.value })} /></Field>
              <Field label="Auto-settle result">
                <Select value={odaActionForm.autoSettleResult} onValueChange={(value) => setOdaActionForm({ ...odaActionForm, autoSettleResult: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO_SETTLED">Auto settled</SelectItem>
                    <SelectItem value="MANUAL_REQUIRED">Manual required</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Treasury update ID"><Input value={odaActionForm.updateId} onChange={(event) => setOdaActionForm({ ...odaActionForm, updateId: event.target.value })} /></Field>
              <div className="md:col-span-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => authorizeOdaMutation.mutate()} disabled={!odaActionForm.recommendationId || authorizeOdaMutation.isPending}>BSM Authorize + Hold</Button>
                <Button variant="outline" onClick={() => holdOdaMutation.mutate()} disabled={!odaActionForm.recommendationId || holdOdaMutation.isPending}>NCBS Hold</Button>
                <Button variant="outline" onClick={() => releaseOdaMutation.mutate()} disabled={!odaActionForm.recommendationId || releaseOdaMutation.isPending}>NCBS Release</Button>
                <Button variant="outline" onClick={() => cancelOdaMutation.mutate()} disabled={!odaActionForm.recommendationId || cancelOdaMutation.isPending}>Cancel Before COT</Button>
                <Button onClick={() => runOdaCotMutation.mutate()} disabled={runOdaCotMutation.isPending}>Run COT</Button>
                <Button variant="outline" onClick={() => requestOdaTreasuryUpdateMutation.mutate()} disabled={!odaActionForm.groupId || requestOdaTreasuryUpdateMutation.isPending}>Treasury Maker</Button>
                <Button onClick={() => approveOdaTreasuryUpdateMutation.mutate()} disabled={!odaActionForm.updateId || approveOdaTreasuryUpdateMutation.isPending}>Checker Approve</Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={odaQuery.isLoading ? "Loading ODA recommendations..." : "No ODA recommendations found"}
            headers={["ID", "Recommendation", "Customer", "Type", "Pair", "Direction", "Nominal", "Rate", "Min collective", "Auth", "Hold", "FP8007", "Lifecycle"]}
            rows={odaRecommendations.map((item) => [
              item.id,
              <span key="rec" className="font-mono text-xs">{item.recommendation_no}</span>,
              item.customer_id ?? "-",
              item.oda_type,
              item.currency_pair,
              item.direction,
              formatMoney(item.nominal_amount, item.currency),
              `${Number(item.rate).toFixed(4)}%`,
              formatMoney(item.minimum_collective_amount, item.currency),
              <StatusBadge key="auth" value={item.authorization_status} />,
              <StatusBadge key="hold" value={item.ncbs_hold_status} />,
              <StatusBadge key="fp" value={item.fp8007_status} />,
              <StatusBadge key="status" value={item.lifecycle} />,
            ])}
          />

          <DataTable
            emptyText={odaRatesQuery.isLoading ? "Loading Treasury rates..." : "No Treasury reference rates found"}
            headers={["Rate ID", "Pair", "Mode", "Mid", "Date", "Source", "Status"]}
            rows={odaReferenceRates.map((rate) => [
              <span key="rate" className="font-mono text-xs">{rate.rate_id}</span>,
              rate.currency_pair,
              rate.retrieval_mode,
              rate.mid_rate ?? "-",
              formatDate(rate.rate_date),
              rate.source_system,
              <StatusBadge key="status" value={rate.rate_status} />,
            ])}
          />

          <DataTable
            emptyText={odaSummaryQuery.isLoading ? "Loading ODA daily summary..." : "No ODA summary rows found"}
            headers={["Date", "Pair", "Direction", "Rate", "Orders", "Total", "Cost before swap", "Minimum", "Qualifies"]}
            rows={odaDailySummary.map((summary) => [
              formatDate(summary.summaryDate),
              summary.currencyPair,
              summary.direction,
              summary.rate,
              summary.orderCount,
              formatMoney(summary.totalNominal),
              formatMoney(summary.orderCostBeforeSwap),
              formatMoney(summary.minimumCollectiveAmount),
              <StatusBadge key="qualifies" value={summary.qualifiesMinimumCollective ? "QUALIFIED" : "BELOW_MINIMUM"} />,
            ])}
          />

          <DataTable
            emptyText={odaFundInstructionsQuery.isLoading ? "Loading ODA fund instructions..." : "No ODA fund instructions found"}
            headers={["Instruction", "Recommendation", "Type", "Amount", "Status", "Failure", "Next retry"]}
            rows={odaFundInstructions.map((instruction) => [
              <span key="instruction" className="font-mono text-xs">{instruction.instruction_id}</span>,
              instruction.recommendation_id,
              instruction.instruction_type,
              formatMoney(instruction.amount, instruction.currency),
              <StatusBadge key="status" value={instruction.instruction_status} />,
              instruction.failure_reason ?? "-",
              formatDate(instruction.next_retry_at),
            ])}
          />
        </TabsContent>

        <TabsContent value="mld" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">MLD Tranche Setup</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Tranche code"><Input value={mldForm.trancheCode} onChange={(event) => setMldForm({ ...mldForm, trancheCode: event.target.value })} /></Field>
              <Field label="Tranche name"><Input value={mldForm.trancheName} onChange={(event) => setMldForm({ ...mldForm, trancheName: event.target.value })} /></Field>
              <Field label="Currency"><Input value={mldForm.currency} onChange={(event) => setMldForm({ ...mldForm, currency: event.target.value.toUpperCase() })} /></Field>
              <Field label="Option type"><Input value={mldForm.optionType} onChange={(event) => setMldForm({ ...mldForm, optionType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Underlying"><Input value={mldForm.underlyingReference} onChange={(event) => setMldForm({ ...mldForm, underlyingReference: event.target.value.toUpperCase() })} /></Field>
              <Field label="Indicative rate"><Input type="number" value={mldForm.indicativeRate} onChange={(event) => setMldForm({ ...mldForm, indicativeRate: event.target.value })} /></Field>
              <Field label="Minimum interest %"><Input type="number" value={mldForm.minimumInterestRate} onChange={(event) => setMldForm({ ...mldForm, minimumInterestRate: event.target.value })} /></Field>
              <Field label="Bonus payout %"><Input type="number" value={mldForm.bonusPayoutRate} onChange={(event) => setMldForm({ ...mldForm, bonusPayoutRate: event.target.value })} /></Field>
              <Field label="Quota"><Input type="number" value={mldForm.quotaAmount} onChange={(event) => setMldForm({ ...mldForm, quotaAmount: event.target.value })} /></Field>
              <Field label="Min investment"><Input type="number" value={mldForm.minInvestment} onChange={(event) => setMldForm({ ...mldForm, minInvestment: event.target.value })} /></Field>
              <Field label="90D collective"><Input type="number" value={mldForm.minimumCollectiveNominal} onChange={(event) => setMldForm({ ...mldForm, minimumCollectiveNominal: event.target.value })} /></Field>
              <Field label="Offering start"><Input type="date" value={mldForm.offeringStart} onChange={(event) => setMldForm({ ...mldForm, offeringStart: event.target.value })} /></Field>
              <Field label="Offering end"><Input type="date" value={mldForm.offeringEnd} onChange={(event) => setMldForm({ ...mldForm, offeringEnd: event.target.value })} /></Field>
              <Field label="Trade date"><Input type="date" value={mldForm.tradeDate} onChange={(event) => setMldForm({ ...mldForm, tradeDate: event.target.value })} /></Field>
              <Field label="Value date"><Input type="date" value={mldForm.valueDate} onChange={(event) => setMldForm({ ...mldForm, valueDate: event.target.value })} /></Field>
              <Field label="Fixing date"><Input type="date" value={mldForm.fixingDate} onChange={(event) => setMldForm({ ...mldForm, fixingDate: event.target.value })} /></Field>
              <Field label="Maturity date"><Input type="date" value={mldForm.maturityDate} onChange={(event) => setMldForm({ ...mldForm, maturityDate: event.target.value })} /></Field>
              <div className="md:col-span-4">
                <Button onClick={() => createMldMutation.mutate()} disabled={createMldMutation.isPending}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Open Tranche
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">MLD Order, Trade and Maturity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Tranche ID"><Input value={mldForm.trancheId} onChange={(event) => setMldForm({ ...mldForm, trancheId: event.target.value })} /></Field>
              <Field label="Order ID"><Input value={mldForm.orderId} onChange={(event) => setMldForm({ ...mldForm, orderId: event.target.value })} /></Field>
              <Field label="Customer ID"><Input value={mldForm.customerId} onChange={(event) => setMldForm({ ...mldForm, customerId: event.target.value })} /></Field>
              <Field label="Amount"><Input type="number" value={mldForm.amount} onChange={(event) => setMldForm({ ...mldForm, amount: event.target.value })} /></Field>
              <Field label="90-day average"><Input type="number" value={mldForm.ninetyDayAverageBalance} onChange={(event) => setMldForm({ ...mldForm, ninetyDayAverageBalance: event.target.value })} /></Field>
              <Field label="Available balance"><Input type="number" value={mldForm.availableBalance} onChange={(event) => setMldForm({ ...mldForm, availableBalance: event.target.value })} /></Field>
              <Field label="Debit account"><Input value={mldForm.debitAccountNo} onChange={(event) => setMldForm({ ...mldForm, debitAccountNo: event.target.value })} /></Field>
              <Field label="TD account"><Input value={mldForm.tdAccountNo} onChange={(event) => setMldForm({ ...mldForm, tdAccountNo: event.target.value })} /></Field>
              <Field label="Treasury dealing ID"><Input value={mldForm.treasuryDealingId} onChange={(event) => setMldForm({ ...mldForm, treasuryDealingId: event.target.value })} /></Field>
              <Field label="Fixing outcome">
                <Select value={mldForm.fixingOutcome} onValueChange={(value) => setMldForm({ ...mldForm, fixingOutcome: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MAX_RETURN">Max return</SelectItem>
                    <SelectItem value="MIN_RETURN">Min return</SelectItem>
                    <SelectItem value="TERMINATED">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fixing level"><Input type="number" value={mldForm.fixingLevel} onChange={(event) => setMldForm({ ...mldForm, fixingLevel: event.target.value })} /></Field>
              <div className="md:col-span-4 flex flex-wrap gap-2">
                <Button onClick={() => createMldOrderMutation.mutate()} disabled={!mldForm.trancheId || createMldOrderMutation.isPending}>Create Order + Hold</Button>
                <Button variant="outline" onClick={() => runMldRecheckMutation.mutate()} disabled={!mldForm.trancheId || runMldRecheckMutation.isPending}>Pre-Trade Recheck</Button>
                <Button variant="outline" onClick={() => recordMldCallbackMutation.mutate()} disabled={!mldForm.orderId || recordMldCallbackMutation.isPending}>Record Callback</Button>
                <Button variant="outline" onClick={() => tradeMldMutation.mutate()} disabled={!mldForm.orderId || tradeMldMutation.isPending}>Create TD</Button>
                <Button variant="outline" onClick={() => fixingMldMutation.mutate()} disabled={!mldForm.orderId || fixingMldMutation.isPending}>Fixing Outcome</Button>
                <Button onClick={() => matureMldMutation.mutate()} disabled={!mldForm.orderId || matureMldMutation.isPending}>Maturity Credit</Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={mldQuery.isLoading ? "Loading MLD tranches..." : "No MLD tranches found"}
            headers={["ID", "Tranche", "Name", "Currency", "Offering", "Trade/Value", "Fixing/Maturity", "Quota", "Booked", "Blotter", "Dealing ID", "Lifecycle"]}
            rows={mldTranches.map((tranche) => [
              tranche.id,
              <span key="tranche" className="font-mono text-xs">{tranche.tranche_code}</span>,
              tranche.tranche_name,
              tranche.currency,
              `${formatDate(tranche.offering_start)} to ${formatDate(tranche.offering_end)}`,
              `${formatDate(tranche.trade_date)} / ${formatDate(tranche.value_date)}`,
              `${formatDate(tranche.fixing_date)} / ${formatDate(tranche.maturity_date)}`,
              formatMoney(tranche.quota_amount, tranche.currency),
              formatMoney(tranche.booked_amount, tranche.currency),
              <StatusBadge key="blotter" value={tranche.final_master_blotter_status} />,
              tranche.treasury_dealing_id ?? "-",
              <StatusBadge key="status" value={tranche.lifecycle} />,
            ])}
          />

          <DataTable
            emptyText={mldOrderDetailsQuery.isLoading ? "Loading MLD order details..." : "No MLD order details found"}
            headers={["Order", "Tranche", "Customer", "CIF", "Hold", "TD", "Callback", "Eligible", "Recheck", "Fixing", "Net payout", "Trade", "Maturity"]}
            rows={mldOrderDetails.map((detail) => [
              <span key="order" className="font-mono text-xs">{detail.order_id}</span>,
              detail.tranche_id,
              detail.customer_id ?? "-",
              <StatusBadge key="cif" value={detail.cif_status} />,
              <StatusBadge key="hold" value={detail.hold_instruction_status} />,
              detail.td_account_no ?? detail.td_creation_status ?? "-",
              <StatusBadge key="callback" value={detail.callback_status} />,
              detail.final_master_blotter_eligible ? "Yes" : "No",
              <StatusBadge key="recheck" value={detail.pretrade_recheck_status} />,
              <StatusBadge key="fixing" value={detail.fixing_outcome} />,
              formatMoney(detail.net_payout_amount),
              <StatusBadge key="trade" value={detail.trade_status} />,
              <StatusBadge key="maturity" value={detail.maturity_status} />,
            ])}
          />

          <DataTable
            emptyText={mldFundInstructionsQuery.isLoading ? "Loading MLD fund instructions..." : "No MLD fund instructions found"}
            headers={["Instruction", "Order", "Type", "Amount", "Status", "Failure", "Next retry"]}
            rows={mldFundInstructions.map((instruction) => [
              <span key="instruction" className="font-mono text-xs">{instruction.instruction_id}</span>,
              <span key="order" className="font-mono text-xs">{instruction.order_id}</span>,
              instruction.instruction_type,
              formatMoney(instruction.amount, instruction.currency),
              <StatusBadge key="status" value={instruction.instruction_status} />,
              instruction.failure_reason ?? "-",
              formatDate(instruction.next_retry_at),
            ])}
          />
        </TabsContent>

        <TabsContent value="fx" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">FX Today Live Rate and Order Capture</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Live pair"><Input value={fxRateForm.currencyPair} onChange={(event) => setFxRateForm({ ...fxRateForm, currencyPair: event.target.value.toUpperCase() })} /></Field>
              <Field label="Bid / ask">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={fxRateForm.bidRate} onChange={(event) => setFxRateForm({ ...fxRateForm, bidRate: event.target.value })} />
                  <Input type="number" value={fxRateForm.askRate} onChange={(event) => setFxRateForm({ ...fxRateForm, askRate: event.target.value })} />
                </div>
              </Field>
              <Field label="Mid rate"><Input type="number" value={fxRateForm.midRate} onChange={(event) => setFxRateForm({ ...fxRateForm, midRate: event.target.value })} /></Field>
              <Field label="Rate TTL"><Input type="number" value={fxRateForm.ttlSeconds} onChange={(event) => setFxRateForm({ ...fxRateForm, ttlSeconds: event.target.value })} /></Field>
              <div className="md:col-span-4">
                <Button variant="outline" onClick={() => createFxLiveRateMutation.mutate()} disabled={createFxLiveRateMutation.isPending}>
                  Publish Live Rate
                </Button>
              </div>
              <Field label="Order ID"><Input value={fxForm.orderId} onChange={(event) => setFxForm({ ...fxForm, orderId: event.target.value })} /></Field>
              <Field label="Customer ID"><Input value={fxForm.customerId} onChange={(event) => setFxForm({ ...fxForm, customerId: event.target.value })} /></Field>
              <Field label="Portfolio ID"><Input value={fxForm.portfolioId} onChange={(event) => setFxForm({ ...fxForm, portfolioId: event.target.value })} /></Field>
              <Field label="Currency pair"><Input value={fxForm.currencyPair} onChange={(event) => setFxForm({ ...fxForm, currencyPair: event.target.value.toUpperCase() })} /></Field>
              <Field label="Dealt / counter">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={fxForm.dealtCurrency} onChange={(event) => setFxForm({ ...fxForm, dealtCurrency: event.target.value.toUpperCase() })} />
                  <Input value={fxForm.counterCurrency} onChange={(event) => setFxForm({ ...fxForm, counterCurrency: event.target.value.toUpperCase() })} />
                </div>
              </Field>
              <Field label="Debit currency"><Input value={fxForm.debitCurrency} onChange={(event) => setFxForm({ ...fxForm, debitCurrency: event.target.value.toUpperCase() })} /></Field>
              <Field label="Amount"><Input type="number" value={fxForm.amount} onChange={(event) => setFxForm({ ...fxForm, amount: event.target.value })} /></Field>
              <Field label="Special rate"><Input type="number" value={fxForm.specialRate} onChange={(event) => setFxForm({ ...fxForm, specialRate: event.target.value })} /></Field>
              <Field label="Quote TTL seconds"><Input type="number" value={fxForm.quoteTtlSeconds} onChange={(event) => setFxForm({ ...fxForm, quoteTtlSeconds: event.target.value })} /></Field>
              <Field label="Document threshold"><Input type="number" value={fxForm.underlyingDocumentThreshold} onChange={(event) => setFxForm({ ...fxForm, underlyingDocumentThreshold: event.target.value })} /></Field>
              <Field label="Underlying doc ID"><Input value={fxForm.underlyingDocumentId} onChange={(event) => setFxForm({ ...fxForm, underlyingDocumentId: event.target.value })} /></Field>
              <Field label="CIF / account">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={fxForm.customerDetailStatus} onChange={(event) => setFxForm({ ...fxForm, customerDetailStatus: event.target.value.toUpperCase() })} />
                  <Input value={fxForm.accountStatus} onChange={(event) => setFxForm({ ...fxForm, accountStatus: event.target.value.toUpperCase() })} />
                </div>
              </Field>
              <Field label="SKU / PFE">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={fxForm.skuStatus} onChange={(event) => setFxForm({ ...fxForm, skuStatus: event.target.value.toUpperCase() })} />
                  <Input value={fxForm.pfeStatus} onChange={(event) => setFxForm({ ...fxForm, pfeStatus: event.target.value.toUpperCase() })} />
                </div>
              </Field>
              <Field label="Latest rate"><Input type="number" value={fxForm.latestRate} onChange={(event) => setFxForm({ ...fxForm, latestRate: event.target.value })} /></Field>
              <Field label="Quote hash"><Input value={fxForm.quoteHash} onChange={(event) => setFxForm({ ...fxForm, quoteHash: event.target.value })} /></Field>
              <Field label="LHBU code"><Input value={fxForm.lhbuPurposeCode} onChange={(event) => setFxForm({ ...fxForm, lhbuPurposeCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Settlement">
                <Select value={fxForm.settlementStatus} onValueChange={(value) => setFxForm({ ...fxForm, settlementStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="READY_FOR_SETTLEMENT">Ready</SelectItem>
                    <SelectItem value="SETTLED">Settled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="NCBS ref"><Input value={fxForm.ncbsReference} onChange={(event) => setFxForm({ ...fxForm, ncbsReference: event.target.value })} /></Field>
              <Field label="Treasury ref"><Input value={fxForm.treasuryReference} onChange={(event) => setFxForm({ ...fxForm, treasuryReference: event.target.value })} /></Field>
              <Field label="Confirmation URL"><Input value={fxForm.confirmationNoticeUrl} onChange={(event) => setFxForm({ ...fxForm, confirmationNoticeUrl: event.target.value })} /></Field>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button onClick={() => createFxMutation.mutate()} disabled={createFxMutation.isPending}>
                  <Send className="mr-2 h-4 w-4" />
                  Create FX Order
                </Button>
                <Button variant="outline" onClick={() => refreshFxRateMutation.mutate()} disabled={refreshFxRateMutation.isPending || !fxForm.orderId}>
                  Refresh Rate
                </Button>
                <Button variant="outline" onClick={() => confirmFxMutation.mutate()} disabled={confirmFxMutation.isPending || !fxForm.orderId}>
                  Confirm
                </Button>
                <Button variant="outline" onClick={() => treasuryFxMutation.mutate()} disabled={treasuryFxMutation.isPending || !fxForm.orderId}>
                  Treasury SND
                </Button>
                <Button variant="outline" onClick={() => lhbuFxMutation.mutate()} disabled={lhbuFxMutation.isPending || !fxForm.orderId}>
                  LHBU
                </Button>
                <Button variant="outline" onClick={() => approveFxMutation.mutate()} disabled={approveFxMutation.isPending || !fxForm.orderId}>
                  Overbook
                </Button>
                <Button variant="outline" onClick={() => eodFxMutation.mutate()} disabled={eodFxMutation.isPending}>
                  EOD Check
                </Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={fxLiveRatesQuery.isLoading ? "Loading FX live rates..." : "No FX live rates"}
            headers={["Rate ID", "Pair", "Bid", "Ask", "Mid", "Source", "Expires", "Status"]}
            rows={fxLiveRates.map((rate) => [
              <span key="rate" className="font-mono text-xs">{rate.rate_id}</span>,
              rate.currency_pair,
              rate.bid_rate ?? "-",
              rate.ask_rate ?? "-",
              rate.mid_rate,
              rate.source_system,
              formatDate(rate.expires_at),
              <StatusBadge key="status" value={rate.rate_status} />,
            ])}
          />

          <DataTable
            emptyText={fxDetailsQuery.isLoading ? "Loading FX Today details..." : "No FX Today detail rows"}
            headers={["Order", "Pair", "Amount", "Quote", "Latest", "CIF", "Acct", "SKU", "PFE", "Auth", "Treasury", "LHBU", "Settle", "Overbook", "Confirm", "EOD"]}
            rows={fxDetails.map((detail) => [
              <button key="order" type="button" className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => setFxForm({ ...fxForm, orderId: detail.order_id })}>{detail.order_id}</button>,
              detail.currency_pair,
              formatMoney(detail.amount),
              detail.quote_rate,
              detail.latest_rate ?? "-",
              <StatusBadge key="cif" value={detail.customer_detail_status} />,
              <StatusBadge key="account" value={detail.account_status} />,
              <StatusBadge key="sku" value={detail.sku_status} />,
              <StatusBadge key="pfe" value={detail.pfe_status} />,
              <StatusBadge key="auth" value={detail.digital_auth_status} />,
              <StatusBadge key="treasury" value={detail.treasury_snd_approval_status} />,
              <StatusBadge key="lhbu" value={detail.lhbu_confirmation_status} />,
              <StatusBadge key="settle" value={detail.settlement_status} />,
              <StatusBadge key="overbook" value={detail.overbook_status} />,
              <StatusBadge key="confirm" value={detail.confirmation_status} />,
              <StatusBadge key="eod" value={detail.eod_alert_status} />,
            ])}
          />

          <DataTable
            emptyText={fxBlotterQuery.isLoading ? "Loading FX blotter..." : "No FX blotter rows"}
            headers={["Blotter", "Order", "Pair", "Amount", "Rate", "NCBS", "Treasury", "Blotter", "Settlement"]}
            rows={fxBlotterEntries.map((entry) => [
              <span key="blotter" className="font-mono text-xs">{entry.blotter_id}</span>,
              entry.order_id,
              entry.currency_pair,
              formatMoney(entry.amount),
              entry.booked_rate,
              entry.ncbs_reference ?? "-",
              entry.treasury_reference ?? "-",
              <StatusBadge key="blotter-status" value={entry.blotter_status} />,
              <StatusBadge key="settlement" value={entry.settlement_status} />,
            ])}
          />
        </TabsContent>

        <TabsContent value="lending" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Wealth Lending Facility</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Facility ID"><Input value={lendingForm.facilityId} onChange={(event) => setLendingForm({ ...lendingForm, facilityId: event.target.value })} /></Field>
              <Field label="Customer ID"><Input value={lendingForm.customerId} onChange={(event) => setLendingForm({ ...lendingForm, customerId: event.target.value })} /></Field>
              <Field label="Portfolio ID"><Input value={lendingForm.portfolioId} onChange={(event) => setLendingForm({ ...lendingForm, portfolioId: event.target.value })} /></Field>
              <Field label="Loan account"><Input value={lendingForm.loanAccountNo} onChange={(event) => setLendingForm({ ...lendingForm, loanAccountNo: event.target.value })} /></Field>
              <Field label="Loan system ref"><Input value={lendingForm.loanSystemRef} onChange={(event) => setLendingForm({ ...lendingForm, loanSystemRef: event.target.value })} /></Field>
              <Field label="Core banking ref"><Input value={lendingForm.coreBankingRef} onChange={(event) => setLendingForm({ ...lendingForm, coreBankingRef: event.target.value })} /></Field>
              <Field label="Currency"><Input value={lendingForm.currency} onChange={(event) => setLendingForm({ ...lendingForm, currency: event.target.value.toUpperCase() })} /></Field>
              <Field label="Limit amount"><Input type="number" value={lendingForm.limitAmount} onChange={(event) => setLendingForm({ ...lendingForm, limitAmount: event.target.value })} /></Field>
              <Field label="Outstanding"><Input type="number" value={lendingForm.outstandingAmount} onChange={(event) => setLendingForm({ ...lendingForm, outstandingAmount: event.target.value })} /></Field>
              <Field label="Warning LTV"><Input type="number" step="0.01" value={lendingForm.ltvWarning} onChange={(event) => setLendingForm({ ...lendingForm, ltvWarning: event.target.value })} /></Field>
              <Field label="Limit LTV"><Input type="number" step="0.01" value={lendingForm.ltvLimit} onChange={(event) => setLendingForm({ ...lendingForm, ltvLimit: event.target.value })} /></Field>
              <Field label="Collateral decrease %"><Input type="number" step="0.01" value={lendingForm.collateralDecreasePercent} onChange={(event) => setLendingForm({ ...lendingForm, collateralDecreasePercent: event.target.value })} /></Field>
              <Field label="Cure days"><Input type="number" value={lendingForm.curePeriodDays} onChange={(event) => setLendingForm({ ...lendingForm, curePeriodDays: event.target.value })} /></Field>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => createLendingMutation.mutate()} disabled={createLendingMutation.isPending}>
                  <Banknote className="mr-2 h-4 w-4" />
                  Register Facility
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Collateral, Source Retrieval, Cure, and RBS Instructions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Collateral family">
                <Select value={lendingForm.collateralProductFamily} onValueChange={(value) => setLendingForm({ ...lendingForm, collateralProductFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Product code"><Input value={lendingForm.collateralProductCode} onChange={(event) => setLendingForm({ ...lendingForm, collateralProductCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Collateral value"><Input type="number" value={lendingForm.collateralMarketValue} onChange={(event) => setLendingForm({ ...lendingForm, collateralMarketValue: event.target.value })} /></Field>
              <Field label="Haircut %"><Input type="number" step="0.01" value={lendingForm.collateralHaircutPercent} onChange={(event) => setLendingForm({ ...lendingForm, collateralHaircutPercent: event.target.value })} /></Field>
              <Field label="Collateral source"><Input value={lendingForm.collateralSourceSystem} onChange={(event) => setLendingForm({ ...lendingForm, collateralSourceSystem: event.target.value.toUpperCase() })} /></Field>
              <Field label="Maturity date"><Input type="date" value={lendingForm.collateralMaturityDate} onChange={(event) => setLendingForm({ ...lendingForm, collateralMaturityDate: event.target.value })} /></Field>
              <Field label="Price sources"><Input value={lendingForm.priceSourceSystems} onChange={(event) => setLendingForm({ ...lendingForm, priceSourceSystems: event.target.value.toUpperCase() })} /></Field>
              <Field label="Price status">
                <Select value={lendingForm.priceStatus} onValueChange={(value) => setLendingForm({ ...lendingForm, priceStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AVAILABLE">Available</SelectItem>
                    <SelectItem value="STALE">Stale</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2"><Field label="Price payload JSON"><Textarea value={lendingForm.pricePayload} onChange={(event) => setLendingForm({ ...lendingForm, pricePayload: event.target.value })} /></Field></div>
              <Field label="Outstanding source"><Input value={lendingForm.outstandingSourceSystem} onChange={(event) => setLendingForm({ ...lendingForm, outstandingSourceSystem: event.target.value.toUpperCase() })} /></Field>
              <Field label="Visibility channel">
                <Select value={lendingForm.visibilityChannel} onValueChange={(value) => setLendingForm({ ...lendingForm, visibilityChannel: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DBANK_PRO">D-Bank PRO</SelectItem>
                    <SelectItem value="CRM_MICROSITE">CRM microsite</SelectItem>
                    <SelectItem value="OEMS">OEMS</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Repayment amount"><Input type="number" value={lendingForm.repaymentAmount} onChange={(event) => setLendingForm({ ...lendingForm, repaymentAmount: event.target.value })} /></Field>
              <Field label="Top-up value"><Input type="number" value={lendingForm.topUpMarketValue} onChange={(event) => setLendingForm({ ...lendingForm, topUpMarketValue: event.target.value })} /></Field>
              <Field label="Sell amount"><Input type="number" value={lendingForm.sellAmount} onChange={(event) => setLendingForm({ ...lendingForm, sellAmount: event.target.value })} /></Field>
              <Field label="RBS status">
                <Select value={lendingForm.sellInstructionStatus} onValueChange={(value) => setLendingForm({ ...lendingForm, sellInstructionStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUEUED">Queued</SelectItem>
                    <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button variant="outline" onClick={() => addLendingCollateralMutation.mutate()} disabled={addLendingCollateralMutation.isPending || !lendingForm.facilityId}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Add Collateral
                </Button>
                <Button variant="outline" onClick={() => retrieveLendingPricesMutation.mutate()} disabled={retrieveLendingPricesMutation.isPending || !lendingForm.facilityId}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retrieve Prices
                </Button>
                <Button variant="outline" onClick={() => retrieveLendingOutstandingMutation.mutate()} disabled={retrieveLendingOutstandingMutation.isPending || !lendingForm.facilityId}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retrieve Outstanding
                </Button>
                <Button onClick={() => runLendingM2mMutation.mutate()} disabled={runLendingM2mMutation.isPending || !lendingForm.facilityId}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Run M2M
                </Button>
                <Button variant="outline" onClick={() => publishLendingVisibilityMutation.mutate()} disabled={publishLendingVisibilityMutation.isPending || !lendingForm.facilityId}>
                  <Send className="mr-2 h-4 w-4" />
                  Publish Visibility
                </Button>
                <Button variant="outline" onClick={() => loadLendingVisibilityMutation.mutate()} disabled={loadLendingVisibilityMutation.isPending || !lendingForm.facilityId}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Load D-Bank View
                </Button>
                <Button variant="outline" onClick={() => recordLendingCureMutation.mutate()} disabled={recordLendingCureMutation.isPending || !lendingForm.facilityId}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Record Cure
                </Button>
                <Button variant="outline" onClick={() => sellLendingCollateralMutation.mutate()} disabled={sellLendingCollateralMutation.isPending || !lendingForm.facilityId}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Sell Collateral
                </Button>
              </div>
              {lendingVisibility && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-4">
                  <div className="font-medium">
                    {formatMoney(lendingVisibility.limitAmount, lendingVisibility.currency)} limit; {formatMoney(lendingVisibility.outstandingAmount, lendingVisibility.currency)} outstanding
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    LTV {lendingVisibility.currentLtv.toFixed(4)}; cure {lendingVisibility.cureStatus}; repay {formatMoney(lendingVisibility.repaymentRequired, lendingVisibility.currency)}; top up {formatMoney(lendingVisibility.topUpRequired, lendingVisibility.currency)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <DataTable
            emptyText={wealthLendingInstructionsQuery.isLoading ? "Loading wealth-lending instructions..." : "No wealth-lending instructions recorded"}
            headers={["Instruction", "Facility", "Type", "Target", "Amount", "Status", "Failure"]}
            rows={wealthLendingInstructions.map((instruction) => [
              <span key="instruction" className="font-mono text-xs">{instruction.instruction_id}</span>,
              <span key="facility" className="font-mono text-xs">{instruction.facility_id}</span>,
              instruction.instruction_type.replace(/_/g, " "),
              instruction.target_system,
              instruction.amount ? formatMoney(instruction.amount, instruction.currency) : "-",
              <StatusBadge key="status" value={instruction.instruction_status} />,
              instruction.failure_reason ?? "-",
            ])}
          />
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Portfolio Holding Source</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Customer ID"><Input value={portfolioHoldingForm.customerId} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, customerId: event.target.value })} /></Field>
              <Field label="Portfolio ID"><Input value={portfolioHoldingForm.portfolioId} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, portfolioId: event.target.value })} /></Field>
              <Field label="Family">
                <Select value={portfolioHoldingForm.productFamily} onValueChange={(value) => setPortfolioHoldingForm({ ...portfolioHoldingForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Source"><Input value={portfolioHoldingForm.sourceSystem} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, sourceSystem: event.target.value.toUpperCase() })} /></Field>
              <Field label="Product code"><Input value={portfolioHoldingForm.productCode} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, productCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Product name"><Input value={portfolioHoldingForm.productName} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, productName: event.target.value })} /></Field>
              <Field label="Currency"><Input value={portfolioHoldingForm.currency} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, currency: event.target.value.toUpperCase() })} /></Field>
              <Field label="Holding amount"><Input type="number" value={portfolioHoldingForm.holdingAmount} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, holdingAmount: event.target.value })} /></Field>
              <Field label="Market value"><Input type="number" value={portfolioHoldingForm.marketValue} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, marketValue: event.target.value })} /></Field>
              <Field label="Local value"><Input type="number" value={portfolioHoldingForm.localMarketValue} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, localMarketValue: event.target.value })} /></Field>
              <Field label="Realized G/L"><Input type="number" value={portfolioHoldingForm.realizedGainLoss} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, realizedGainLoss: event.target.value })} /></Field>
              <Field label="Unrealized G/L"><Input type="number" value={portfolioHoldingForm.unrealizedGainLoss} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, unrealizedGainLoss: event.target.value })} /></Field>
              <Field label="Profit gain"><Input type="number" value={portfolioHoldingForm.profitGain} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, profitGain: event.target.value })} /></Field>
              <Field label="Left principal"><Input type="number" value={portfolioHoldingForm.leftPrincipal} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, leftPrincipal: event.target.value })} /></Field>
              <Field label="Left term days"><Input type="number" value={portfolioHoldingForm.leftTermDays} onChange={(event) => setPortfolioHoldingForm({ ...portfolioHoldingForm, leftTermDays: event.target.value })} /></Field>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => createPortfolioHoldingMutation.mutate()} disabled={createPortfolioHoldingMutation.isPending}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Save Holding
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Combined Portfolio View</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Customer ID"><Input value={portfolioViewForm.customerId} onChange={(event) => setPortfolioViewForm({ ...portfolioViewForm, customerId: event.target.value })} /></Field>
              <Field label="Portfolio ID"><Input value={portfolioViewForm.portfolioId} onChange={(event) => setPortfolioViewForm({ ...portfolioViewForm, portfolioId: event.target.value })} /></Field>
              <Field label="Family">
                <Select value={portfolioViewForm.productFamily} onValueChange={(value) => setPortfolioViewForm({ ...portfolioViewForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Holding metric">
                <Select value={portfolioViewForm.holdingMetric || "ALL"} onValueChange={(value) => setPortfolioViewForm({ ...portfolioViewForm, holdingMetric: value === "ALL" ? "" : value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All holdings</SelectItem>
                    <SelectItem value="LEFT_PRINCIPAL">Left principal</SelectItem>
                    <SelectItem value="PROFIT_GAIN">Profit gain</SelectItem>
                    <SelectItem value="LEFT_TERM">Left term</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Source status JSON">
                  <Textarea value={portfolioViewForm.sourceStatus} onChange={(event) => setPortfolioViewForm({ ...portfolioViewForm, sourceStatus: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="FX rates JSON">
                  <Textarea value={portfolioViewForm.fxRates} onChange={(event) => setPortfolioViewForm({ ...portfolioViewForm, fxRates: event.target.value })} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button variant="outline" onClick={() => loadPortfolioMutation.mutate()} disabled={loadPortfolioMutation.isPending || !portfolioViewForm.customerId}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Load Portfolio
                </Button>
                <Button onClick={() => exportPortfolioMutation.mutate()} disabled={exportPortfolioMutation.isPending || !portfolioViewForm.customerId}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Portfolio
                </Button>
              </div>
              {portfolioView && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-4">
                  <div className="font-medium">
                    {formatMoney(portfolioView.totals.localMarketValue, portfolioView.localCurrency)} total portfolio value
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {portfolioView.isPartial ? `Partial sources: ${portfolioView.sourceStatus.unavailableSources.join(", ")}` : "All configured sources available"}; FX source {portfolioView.valuationPolicy.fxRateSource}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <DataTable
            emptyText={portfolioView ? "No portfolio holdings found" : "Load a portfolio to view holdings"}
            headers={["Product", "Source", "Original", "Local", "Realized G/L", "Unrealized G/L", "Left principal", "Left term", "Status"]}
            rows={(portfolioView?.holdings ?? []).map((holding) => [
              <span key="product" className="font-mono text-xs">{holding.productCode}</span>,
              holding.sourceSystem,
              formatMoney(holding.originalMarketValue, holding.currency),
              holding.localMarketValue === undefined ? "-" : formatMoney(holding.localMarketValue, holding.localCurrency),
              formatMoney(holding.realizedGainLoss, holding.localCurrency),
              formatMoney(holding.unrealizedGainLoss, holding.localCurrency),
              formatMoney(holding.leftPrincipal, holding.localCurrency),
              holding.leftTermDays ? `${holding.leftTermDays} days` : "-",
              <StatusBadge key="status" value={holding.stale ? "STALE" : holding.sourceStatus} />,
            ])}
          />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Adapter Control Plane</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Adapter ID"><Input value={adapterForm.adapterId} onChange={(event) => setAdapterForm({ ...adapterForm, adapterId: event.target.value.toUpperCase() })} /></Field>
              <Field label="Target system"><Input value={adapterForm.targetSystem} onChange={(event) => setAdapterForm({ ...adapterForm, targetSystem: event.target.value.toUpperCase() })} /></Field>
              <Field label="Type"><Input value={adapterForm.adapterType} onChange={(event) => setAdapterForm({ ...adapterForm, adapterType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Contract version"><Input value={adapterForm.contractVersion} onChange={(event) => setAdapterForm({ ...adapterForm, contractVersion: event.target.value })} /></Field>
              <Field label="Endpoint"><Input value={adapterForm.endpointUrl} onChange={(event) => setAdapterForm({ ...adapterForm, endpointUrl: event.target.value })} /></Field>
              <Field label="Auth profile"><Input value={adapterForm.authProfileRef} onChange={(event) => setAdapterForm({ ...adapterForm, authProfileRef: event.target.value })} /></Field>
              <Field label="Adapter status">
                <Select value={adapterForm.adapterStatus} onValueChange={(value) => setAdapterForm({ ...adapterForm, adapterStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Certification">
                <Select value={adapterForm.certificationStatus} onValueChange={(value) => setAdapterForm({ ...adapterForm, certificationStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNCERTIFIED">Uncertified</SelectItem>
                    <SelectItem value="CERTIFICATION_PENDING">Certification pending</SelectItem>
                    <SelectItem value="CERTIFIED">Certified</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Mock mode">
                <Select value={adapterForm.mockMode ? "true" : "false"} onValueChange={(value) => setAdapterForm({ ...adapterForm, mockMode: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reconciliation">
                <Select value={adapterForm.reconciliationRequired ? "true" : "false"} onValueChange={(value) => setAdapterForm({ ...adapterForm, reconciliationRequired: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Required</SelectItem>
                    <SelectItem value="false">Not required</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Owner team"><Input value={adapterForm.ownerTeam} onChange={(event) => setAdapterForm({ ...adapterForm, ownerTeam: event.target.value })} /></Field>
              <Field label="TLS required">
                <Select value={adapterForm.requireTls ? "true" : "false"} onValueChange={(value) => setAdapterForm({ ...adapterForm, requireTls: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Required</SelectItem>
                    <SelectItem value="false">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Mask payloads">
                <Select value={adapterForm.maskLogPayloads ? "true" : "false"} onValueChange={(value) => setAdapterForm({ ...adapterForm, maskLogPayloads: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Encrypt payloads">
                <Select value={adapterForm.encryptionRequired ? "true" : "false"} onValueChange={(value) => setAdapterForm({ ...adapterForm, encryptionRequired: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Required</SelectItem>
                    <SelectItem value="false">Not required</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Payload class"><Input value={adapterForm.payloadClassification} onChange={(event) => setAdapterForm({ ...adapterForm, payloadClassification: event.target.value.toUpperCase() })} /></Field>
              <Field label="Security status">
                <Select value={adapterForm.securityPolicyStatus} onValueChange={(value) => setAdapterForm({ ...adapterForm, securityPolicyStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Encryption profile"><Input value={adapterForm.encryptionProfileRef} onChange={(event) => setAdapterForm({ ...adapterForm, encryptionProfileRef: event.target.value })} /></Field>
              <Field label="Simulated result">
                <Select value={adapterForm.simulatedStatus} onValueChange={(value) => setAdapterForm({ ...adapterForm, simulatedStatus: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                    <SelectItem value="QUEUED">Queued</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2"><Field label="Contract schema JSON"><Textarea value={adapterForm.contractSchema} onChange={(event) => setAdapterForm({ ...adapterForm, contractSchema: event.target.value })} /></Field></div>
              <div className="md:col-span-2"><Field label="Transformation map JSON"><Textarea value={adapterForm.transformationMap} onChange={(event) => setAdapterForm({ ...adapterForm, transformationMap: event.target.value })} /></Field></div>
              <div className="md:col-span-2"><Field label="Allowed destinations"><Textarea value={adapterForm.allowedAddressPatterns} onChange={(event) => setAdapterForm({ ...adapterForm, allowedAddressPatterns: event.target.value })} /></Field></div>
              <div className="md:col-span-2"><Field label="Allowed source CIDRs"><Textarea value={adapterForm.allowedSourceCidrs} onChange={(event) => setAdapterForm({ ...adapterForm, allowedSourceCidrs: event.target.value })} /></Field></div>
              <div className="md:col-span-2"><Field label="Sensitive fields"><Textarea value={adapterForm.sensitiveFieldPaths} onChange={(event) => setAdapterForm({ ...adapterForm, sensitiveFieldPaths: event.target.value })} /></Field></div>
              <div className="md:col-span-2"><Field label="Transport policy JSON"><Textarea value={adapterForm.transportPolicy} onChange={(event) => setAdapterForm({ ...adapterForm, transportPolicy: event.target.value })} /></Field></div>
              <Field label="Message type"><Input value={adapterForm.messageType} onChange={(event) => setAdapterForm({ ...adapterForm, messageType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Entity type"><Input value={adapterForm.entityType} onChange={(event) => setAdapterForm({ ...adapterForm, entityType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Entity ID"><Input value={adapterForm.entityId} onChange={(event) => setAdapterForm({ ...adapterForm, entityId: event.target.value })} /></Field>
              <Field label="Source address"><Input value={adapterForm.sourceAddress} onChange={(event) => setAdapterForm({ ...adapterForm, sourceAddress: event.target.value })} /></Field>
              <Field label="Destination"><Input value={adapterForm.destinationAddress} onChange={(event) => setAdapterForm({ ...adapterForm, destinationAddress: event.target.value })} /></Field>
              <div className="md:col-span-1"><Field label="Payload JSON"><Textarea value={adapterForm.payload} onChange={(event) => setAdapterForm({ ...adapterForm, payload: event.target.value })} /></Field></div>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button onClick={() => createAdapterMutation.mutate()} disabled={createAdapterMutation.isPending}>
                  <Plug className="mr-2 h-4 w-4" />
                  Save Adapter
                </Button>
                <Button variant="outline" onClick={() => updateAdapterSecurityMutation.mutate()} disabled={updateAdapterSecurityMutation.isPending || !adapterForm.adapterId}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Update Security
                </Button>
                <Button variant="outline" onClick={() => executeAdapterMutation.mutate()} disabled={executeAdapterMutation.isPending || !adapterForm.adapterId}>
                  <Send className="mr-2 h-4 w-4" />
                  Execute Contract
                </Button>
                <Button variant="outline" onClick={() => healthAdapterMutation.mutate()} disabled={healthAdapterMutation.isPending || !adapterForm.adapterId}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Health Check
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Maker-Checker Approval Queue</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Workflow code"><Input value={approvalForm.workflowCode} onChange={(event) => setApprovalForm({ ...approvalForm, workflowCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Family">
                <Select value={approvalForm.productFamily} onValueChange={(value) => setApprovalForm({ ...approvalForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Transaction"><Input value={approvalForm.transactionType} onChange={(event) => setApprovalForm({ ...approvalForm, transactionType: event.target.value.toUpperCase() })} /></Field>
              <Field label="Channel">
                <Select value={approvalForm.channel} onValueChange={(value) => setApprovalForm({ ...approvalForm, channel: value as OemsChannel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{oemsChannels.map((channel) => <SelectItem key={channel} value={channel}>{channel.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Entity type"><Input value={approvalForm.entityType} onChange={(event) => setApprovalForm({ ...approvalForm, entityType: event.target.value })} /></Field>
              <Field label="Entity ID"><Input value={approvalForm.entityId} onChange={(event) => setApprovalForm({ ...approvalForm, entityId: event.target.value })} /></Field>
              <Field label="Order ID"><Input value={approvalForm.orderId} onChange={(event) => setApprovalForm({ ...approvalForm, orderId: event.target.value })} /></Field>
              <Field label="Assigned role"><Input value={approvalForm.assignedRole} onChange={(event) => setApprovalForm({ ...approvalForm, assignedRole: event.target.value.toUpperCase() })} /></Field>
              <Field label="Maker user"><Input value={approvalForm.makerUserId} onChange={(event) => setApprovalForm({ ...approvalForm, makerUserId: event.target.value })} /></Field>
              <Field label="Queue item"><Input value={approvalForm.queueItemId} onChange={(event) => setApprovalForm({ ...approvalForm, queueItemId: event.target.value.toUpperCase() })} /></Field>
              <Field label="Decision">
                <Select value={approvalForm.decision} onValueChange={(value) => setApprovalForm({ ...approvalForm, decision: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">Approve</SelectItem>
                    <SelectItem value="REJECTED">Reject</SelectItem>
                    <SelectItem value="RETURNED">Return</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button variant="outline" onClick={() => createApprovalWorkflowMutation.mutate()} disabled={createApprovalWorkflowMutation.isPending}>
                  Save Workflow
                </Button>
                <Button onClick={() => enqueueApprovalMutation.mutate()} disabled={enqueueApprovalMutation.isPending || (!approvalForm.entityId && !approvalForm.orderId)}>
                  Enqueue Approval
                </Button>
                <Button variant="outline" onClick={() => decideApprovalMutation.mutate()} disabled={decideApprovalMutation.isPending || !approvalForm.queueItemId}>
                  Record Decision
                </Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={integrationAdaptersQuery.isLoading ? "Loading integration adapters..." : "No integration adapters configured"}
            headers={["Adapter", "Target", "Type", "Contract", "TLS", "Mask", "Encrypt", "Security", "Certification", "Status"]}
            rows={integrationAdapters.map((adapter) => [
              <button
                key="adapter"
                type="button"
                className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setAdapterForm({
                  ...adapterForm,
                  adapterId: adapter.adapter_id,
                  targetSystem: adapter.target_system,
                  requireTls: adapter.require_tls,
                  maskLogPayloads: adapter.mask_log_payloads,
                  encryptionRequired: adapter.encryption_required,
                  encryptionProfileRef: adapter.encryption_profile_ref ?? adapterForm.encryptionProfileRef,
                  payloadClassification: adapter.payload_classification,
                  allowedAddressPatterns: adapter.allowed_address_patterns?.join(",") ?? adapterForm.allowedAddressPatterns,
                  allowedSourceCidrs: adapter.allowed_source_cidrs?.join(",") ?? adapterForm.allowedSourceCidrs,
                  securityPolicyStatus: adapter.security_policy_status,
                })}
              >{adapter.adapter_id}</button>,
              adapter.target_system,
              adapter.adapter_type,
              adapter.contract_version,
              adapter.require_tls ? "Required" : "Optional",
              adapter.mask_log_payloads ? "Enabled" : "Off",
              adapter.encryption_required ? "Required" : "-",
              <StatusBadge key="security" value={adapter.security_policy_status} />,
              <StatusBadge key="cert" value={adapter.certification_status} />,
              <StatusBadge key="status" value={adapter.adapter_status} />,
            ])}
          />

          <DataTable
            emptyText={integrationAdapterExecutionsQuery.isLoading ? "Loading adapter executions..." : "No adapter executions recorded"}
            headers={["Execution", "Adapter", "Target", "Message", "Encrypted", "Source", "Destination", "Status", "Error"]}
            rows={integrationAdapterExecutions.map((execution) => [
              <span key="execution" className="font-mono text-xs">{execution.execution_id}</span>,
              execution.adapter_id,
              execution.target_system,
              execution.message_type,
              execution.payload_encrypted ? "Yes" : "No",
              execution.source_address ?? "-",
              execution.destination_address ?? "-",
              <StatusBadge key="status" value={execution.execution_status} />,
              execution.error_message ?? "-",
            ])}
          />

          <DataTable
            emptyText={approvalWorkflowsQuery.isLoading ? "Loading approval workflows..." : "No approval workflows configured"}
            headers={["Workflow", "Family", "Transaction", "Channel", "Entity", "Checker roles", "SLA", "Status"]}
            rows={approvalWorkflows.map((workflow) => [
              <button key="workflow" type="button" className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => setApprovalForm({ ...approvalForm, workflowCode: workflow.workflow_code, assignedRole: workflow.checker_roles?.[0] ?? approvalForm.assignedRole })}>{workflow.workflow_code}</button>,
              workflow.product_family?.replace(/_/g, " ") ?? "All",
              workflow.transaction_type ?? "-",
              workflow.channel?.replace(/_/g, " ") ?? "-",
              workflow.entity_type,
              Array.isArray(workflow.checker_roles) ? workflow.checker_roles.join(", ") : "-",
              `${workflow.sla_minutes}m`,
              <StatusBadge key="status" value={workflow.workflow_status} />,
            ])}
          />

          <DataTable
            emptyText={approvalQueueQuery.isLoading ? "Loading approval queue..." : "No approval queue items"}
            headers={["Queue", "Entity", "Order", "Role", "Maker", "Due", "Decision by", "Status"]}
            rows={approvalQueue.map((item) => [
              <button key="queue" type="button" className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => setApprovalForm({ ...approvalForm, queueItemId: item.queue_item_id, entityId: item.entity_id, orderId: item.order_id ?? approvalForm.orderId, assignedRole: item.assigned_role })}>{item.queue_item_id}</button>,
              `${item.entity_type}:${item.entity_id}`,
              item.order_id ?? "-",
              item.assigned_role,
              item.maker_user_id,
              formatDate(item.due_at),
              item.decision_by ?? "-",
              <StatusBadge key="status" value={item.approval_status} />,
            ])}
          />

          <DataTable
            emptyText={integrationsQuery.isLoading ? "Loading integration messages..." : "No pending integration messages"}
            headers={["Target", "Message", "Entity", "Status", "Retries", "Created", "Action"]}
            rows={integrations.map((message) => [
              message.target_system,
              message.message_type,
              `${message.entity_type}:${message.entity_id}`,
              <StatusBadge key="status" value={message.integration_status} />,
              String(message.retry_count),
              formatDate(message.created_at),
              <Button key="retry" size="sm" variant="outline" onClick={() => retryIntegrationMutation.mutate(message.id)}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>,
            ])}
          />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <KpiCard label="Notification groups" value={notificationReport?.summary.totalGroups} icon={Bell} />
            <KpiCard label="Failed groups" value={notificationReport?.summary.failedGroups} icon={MailWarning} />
            <KpiCard label="Partial groups" value={notificationReport?.summary.partiallyDeliveredGroups} icon={AlertTriangle} />
            <KpiCard label="Retryable groups" value={notificationReport?.summary.retryableGroups} icon={RefreshCcw} />
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Template Governance</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Event code">
                <Input value={notificationTemplateForm.eventCode} onChange={(event) => setNotificationTemplateForm({ ...notificationTemplateForm, eventCode: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Family">
                <Select value={notificationTemplateForm.productFamily} onValueChange={(value) => setNotificationTemplateForm({ ...notificationTemplateForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Recipient role">
                <Input value={notificationTemplateForm.recipientRole} onChange={(event) => setNotificationTemplateForm({ ...notificationTemplateForm, recipientRole: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Channels">
                <Input value={notificationTemplateForm.deliveryChannels} onChange={(event) => setNotificationTemplateForm({ ...notificationTemplateForm, deliveryChannels: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Critical">
                <Select value={notificationTemplateForm.critical ? "true" : "false"} onValueChange={(value) => setNotificationTemplateForm({ ...notificationTemplateForm, critical: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Protected PDF">
                <Select value={notificationTemplateForm.requiresAttachment ? "true" : "false"} onValueChange={(value) => setNotificationTemplateForm({ ...notificationTemplateForm, requiresAttachment: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Not required</SelectItem>
                    <SelectItem value="true">Required</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Attachment policy JSON">
                  <Input value={notificationTemplateForm.attachmentPasswordPolicy} onChange={(event) => setNotificationTemplateForm({ ...notificationTemplateForm, attachmentPasswordPolicy: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Subject EN">
                  <Input value={notificationTemplateForm.subjectEn} onChange={(event) => setNotificationTemplateForm({ ...notificationTemplateForm, subjectEn: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Subject ID">
                  <Input value={notificationTemplateForm.subjectId} onChange={(event) => setNotificationTemplateForm({ ...notificationTemplateForm, subjectId: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Body EN">
                  <Textarea value={notificationTemplateForm.bodyEn} onChange={(event) => setNotificationTemplateForm({ ...notificationTemplateForm, bodyEn: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Body ID">
                  <Textarea value={notificationTemplateForm.bodyId} onChange={(event) => setNotificationTemplateForm({ ...notificationTemplateForm, bodyId: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-4">
                <Button onClick={() => createNotificationTemplateMutation.mutate()} disabled={createNotificationTemplateMutation.isPending}>
                  <Bell className="mr-2 h-4 w-4" />
                  Save Template
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Event Dispatch</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Event code">
                <Input value={notificationEventForm.eventCode} onChange={(event) => setNotificationEventForm({ ...notificationEventForm, eventCode: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Order ID">
                <Input value={notificationEventForm.orderId} onChange={(event) => setNotificationEventForm({ ...notificationEventForm, orderId: event.target.value })} />
              </Field>
              <Field label="Recipient ID">
                <Input value={notificationEventForm.recipientId} onChange={(event) => setNotificationEventForm({ ...notificationEventForm, recipientId: event.target.value })} />
              </Field>
              <Field label="Recipient address">
                <Input value={notificationEventForm.recipientAddress} onChange={(event) => setNotificationEventForm({ ...notificationEventForm, recipientAddress: event.target.value })} />
              </Field>
              <Field label="Channels">
                <Input value={notificationEventForm.channels} onChange={(event) => setNotificationEventForm({ ...notificationEventForm, channels: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Language">
                <Input value={notificationEventForm.languageCode} onChange={(event) => setNotificationEventForm({ ...notificationEventForm, languageCode: event.target.value })} />
              </Field>
              <Field label="Protected PDF">
                <Select value={notificationEventForm.attachmentRequired ? "true" : "false"} onValueChange={(value) => setNotificationEventForm({ ...notificationEventForm, attachmentRequired: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Not required</SelectItem>
                    <SelectItem value="true">Required</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => dispatchNotificationMutation.mutate()} disabled={dispatchNotificationMutation.isPending}>
                  <Send className="mr-2 h-4 w-4" />
                  Dispatch
                </Button>
              </div>
              <div className="md:col-span-2">
                <Field label="Payload JSON">
                  <Textarea value={notificationEventForm.payload} onChange={(event) => setNotificationEventForm({ ...notificationEventForm, payload: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Channel results JSON">
                  <Textarea value={notificationEventForm.channelResults} onChange={(event) => setNotificationEventForm({ ...notificationEventForm, channelResults: event.target.value })} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={notificationTemplatesQuery.isLoading ? "Loading notification templates..." : "No notification templates found"}
            headers={["Event", "Family", "Channels", "Role", "Critical", "Protected PDF", "Status", "Actions"]}
            rows={notificationTemplates.map((template) => [
              <span key="event" className="font-mono text-xs">{template.event_code}</span>,
              template.product_family?.replace(/_/g, " ") ?? "All",
              Array.isArray(template.delivery_channels) ? template.delivery_channels.join(", ") : "-",
              template.recipient_role,
              template.critical ? "Yes" : "No",
              template.requires_attachment ? "Required" : "-",
              <StatusBadge key="status" value={template.template_status} />,
              <div key="actions" className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => submitNotificationTemplateMutation.mutate(template.id)}>Submit</Button>
                <Button size="sm" variant="outline" onClick={() => approveNotificationTemplateMutation.mutate(template.id)}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => rejectNotificationTemplateMutation.mutate(template.id)}>Reject</Button>
                <Button size="sm" variant="outline" onClick={() => retireNotificationTemplateMutation.mutate(template.id)}>Retire</Button>
              </div>,
            ])}
          />

          <DataTable
            emptyText={notificationDeliveriesQuery.isLoading ? "Loading delivery exceptions..." : "No notification delivery exceptions"}
            headers={["Event", "Group", "Channel", "Recipient", "Attempts", "Status", "Failure", "Action"]}
            rows={notificationDeliveries.map((delivery) => [
              delivery.event_code,
              <span key="group" className="font-mono text-xs">{delivery.delivery_group_id ?? `DEL-${delivery.id}`}</span>,
              delivery.channel,
              delivery.recipient_id ?? "-",
              `${delivery.attempt_count}/${delivery.max_attempts}`,
              <StatusBadge key="status" value={delivery.delivery_status} />,
              delivery.failure_reason ?? delivery.exception_reason ?? "-",
              <Button key="retry" size="sm" variant="outline" onClick={() => retryNotificationDeliveryMutation.mutate(delivery.id)} disabled={delivery.attempt_count >= delivery.max_attempts}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>,
            ])}
          />

          <DataTable
            emptyText={notificationReportQuery.isLoading ? "Loading notification report..." : "No notification exceptions in report"}
            headers={["Group", "Event", "Channels", "Failed channels", "Reasons", "Status", "Retryable"]}
            rows={(notificationReport?.rows ?? []).map((row) => [
              <span key="group" className="font-mono text-xs">{row.deliveryGroupId}</span>,
              row.eventCode,
              row.channels.join(", "),
              row.failedChannels.join(", ") || "-",
              row.failureReasons.join("; ") || "-",
              <StatusBadge key="status" value={row.groupStatus} />,
              row.retryable ? "Yes" : "No",
            ])}
          />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Report Definition</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Report code"><Input value={reportForm.reportCode} onChange={(event) => setReportForm({ ...reportForm, reportCode: event.target.value })} /></Field>
              <Field label="Report name"><Input value={reportForm.reportName} onChange={(event) => setReportForm({ ...reportForm, reportName: event.target.value })} /></Field>
              <Field label="Category"><Input value={reportForm.reportCategory} onChange={(event) => setReportForm({ ...reportForm, reportCategory: event.target.value.toUpperCase() })} /></Field>
              <Field label="Family">
                <Select value={reportForm.productFamily} onValueChange={(value) => setReportForm({ ...reportForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Allowed formats"><Input value={reportForm.allowedFormats} onChange={(event) => setReportForm({ ...reportForm, allowedFormats: event.target.value.toUpperCase() })} /></Field>
              <Field label="Sync threshold"><Input type="number" value={reportForm.syncRowThreshold} onChange={(event) => setReportForm({ ...reportForm, syncRowThreshold: event.target.value })} /></Field>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => createReportMutation.mutate()} disabled={createReportMutation.isPending}>
                  <FileBarChart className="mr-2 h-4 w-4" />
                  Save Report
                </Button>
              </div>
              <div className="md:col-span-2">
                <Field label="Protection policy JSON">
                  <Textarea value={reportForm.protectionPolicy} onChange={(event) => setReportForm({ ...reportForm, protectionPolicy: event.target.value })} />
                </Field>
              </div>
              <div className="md:col-span-4">
                <Field label="Columns">
                  <Textarea value={reportForm.columns} onChange={(event) => setReportForm({ ...reportForm, columns: event.target.value })} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Preview and Export</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Report code"><Input value={reportExportForm.reportCode} onChange={(event) => setReportExportForm({ ...reportExportForm, reportCode: event.target.value.toUpperCase() })} /></Field>
              <Field label="Format"><Input value={reportExportForm.requestedFormat} onChange={(event) => setReportExportForm({ ...reportExportForm, requestedFormat: event.target.value.toUpperCase() })} /></Field>
              <Field label="Row estimate"><Input type="number" value={reportExportForm.rowEstimate} onChange={(event) => setReportExportForm({ ...reportExportForm, rowEstimate: event.target.value })} /></Field>
              <Field label="Big Data">
                <Select value={reportExportForm.bigDataAvailable ? "true" : "false"} onValueChange={(value) => setReportExportForm({ ...reportExportForm, bigDataAvailable: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Available</SelectItem>
                    <SelectItem value="false">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-4">
                <Field label="Filters JSON">
                  <Textarea value={reportExportForm.filters} onChange={(event) => setReportExportForm({ ...reportExportForm, filters: event.target.value })} />
                </Field>
              </div>
              <div className="flex gap-2 md:col-span-4">
                <Button variant="outline" onClick={() => previewReportMutation.mutate()} disabled={previewReportMutation.isPending}>
                  <FileBarChart className="mr-2 h-4 w-4" />
                  Preview
                </Button>
                <Button onClick={() => startExportMutation.mutate()} disabled={startExportMutation.isPending}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
              {reportPreview && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-4">
                  <div className="font-medium">{reportPreview.reportName}</div>
                  <div className="mt-1 text-muted-foreground">
                    {reportPreview.sourcePlan.ageBucket} via {reportPreview.sourcePlan.sources.join(", ")}; {reportPreview.rows.length} preview rows
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Transaction History</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Customer ID"><Input value={historyForm.customerId} onChange={(event) => setHistoryForm({ ...historyForm, customerId: event.target.value })} /></Field>
              <Field label="CIF"><Input value={historyForm.cif} onChange={(event) => setHistoryForm({ ...historyForm, cif: event.target.value })} /></Field>
              <Field label="Family">
                <Select value={historyForm.productFamily} onValueChange={(value) => setHistoryForm({ ...historyForm, productFamily: value as ProductFamily })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Big Data">
                <Select value={historyForm.bigDataAvailable ? "true" : "false"} onValueChange={(value) => setHistoryForm({ ...historyForm, bigDataAvailable: value === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Available</SelectItem>
                    <SelectItem value="false">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date from"><Input type="date" value={historyForm.dateFrom} onChange={(event) => setHistoryForm({ ...historyForm, dateFrom: event.target.value })} /></Field>
              <Field label="Date to"><Input type="date" value={historyForm.dateTo} onChange={(event) => setHistoryForm({ ...historyForm, dateTo: event.target.value })} /></Field>
              <div className="flex items-end md:col-span-2">
                <Button className="w-full" onClick={() => requestHistoryMutation.mutate()} disabled={requestHistoryMutation.isPending}>
                  <History className="mr-2 h-4 w-4" />
                  Request History
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Rendered Artifacts and Rollback Registry</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Field label="Export job ID"><Input value={artifactForm.exportJobId} onChange={(event) => setArtifactForm({ ...artifactForm, exportJobId: event.target.value })} /></Field>
              <div className="md:col-span-3">
                <Field label="Render payload JSON"><Input value={artifactForm.renderPayload} onChange={(event) => setArtifactForm({ ...artifactForm, renderPayload: event.target.value })} /></Field>
              </div>
              <Field label="Rollback ID"><Input value={artifactForm.rollbackId} onChange={(event) => setArtifactForm({ ...artifactForm, rollbackId: event.target.value.toUpperCase() })} /></Field>
              <Field label="Migration name"><Input value={artifactForm.migrationName} onChange={(event) => setArtifactForm({ ...artifactForm, migrationName: event.target.value })} /></Field>
              <Field label="Script path"><Input value={artifactForm.rollbackScriptPath} onChange={(event) => setArtifactForm({ ...artifactForm, rollbackScriptPath: event.target.value })} /></Field>
              <Field label="Expected checksum"><Input value={artifactForm.expectedChecksum} onChange={(event) => setArtifactForm({ ...artifactForm, expectedChecksum: event.target.value })} /></Field>
              <div className="md:col-span-4">
                <Field label="Rollback SQL"><Textarea value={artifactForm.rollbackSql} onChange={(event) => setArtifactForm({ ...artifactForm, rollbackSql: event.target.value })} /></Field>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <Button onClick={() => renderReportArtifactMutation.mutate(undefined)} disabled={renderReportArtifactMutation.isPending || !artifactForm.exportJobId}>
                  <FileBarChart className="mr-2 h-4 w-4" />
                  Render Artifact
                </Button>
                <Button variant="outline" onClick={() => registerRollbackMutation.mutate()} disabled={registerRollbackMutation.isPending}>
                  Register Rollback
                </Button>
                <Button variant="outline" onClick={() => verifyRollbackMutation.mutate()} disabled={verifyRollbackMutation.isPending || !artifactForm.rollbackId}>
                  Verify Rollback
                </Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            emptyText={reportsQuery.isLoading ? "Loading reports..." : "No OEMS report definitions found"}
            headers={["Code", "Name", "Category", "Family", "Formats", "Threshold", "Status"]}
            rows={reports.map((report) => [
              <span key="code" className="font-mono text-xs">{report.report_code}</span>,
              report.report_name,
              report.report_category,
              report.product_family?.replace(/_/g, " ") ?? "All",
              Array.isArray(report.allowed_formats) ? report.allowed_formats.join(", ") : "-",
              String(report.sync_row_threshold),
              <StatusBadge key="status" value={report.is_active ? "ACTIVE" : "RETIRED"} />,
            ])}
          />

          <DataTable
            emptyText={exportJobsQuery.isLoading ? "Loading export jobs..." : "No OEMS export jobs found"}
            headers={["Job", "Format", "Rows", "Mode", "Protected", "Status", "Error", "Action"]}
            rows={exportJobs.map((job) => [
              <button key="job" type="button" className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => setArtifactForm({ ...artifactForm, exportJobId: job.export_job_id })}>{job.export_job_id}</button>,
              job.requested_format,
              job.row_count === null ? "-" : String(job.row_count),
              job.execution_mode,
              job.protected_file ? "Yes" : "No",
              <StatusBadge key="status" value={job.export_status} />,
              job.error_code ?? job.error_message ?? "-",
              <div key="actions" className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => retryExportMutation.mutate(job.export_job_id)} disabled={!["FAILED", "QUEUED"].includes(job.export_status)}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setArtifactForm((current) => ({ ...current, exportJobId: job.export_job_id }));
                  renderReportArtifactMutation.mutate(job.export_job_id);
                }} disabled={job.export_status === "FAILED"}>
                  Render
                </Button>
              </div>,
            ])}
          />

          <DataTable
            emptyText={reportArtifactsQuery.isLoading ? "Loading rendered artifacts..." : "No rendered report artifacts"}
            headers={["Artifact", "Job", "Report", "Format", "Rows", "Protected", "Checksum", "Status"]}
            rows={reportArtifacts.map((artifact) => [
              <span key="artifact" className="font-mono text-xs">{artifact.artifact_id}</span>,
              artifact.export_job_id,
              artifact.report_code,
              artifact.requested_format,
              String(artifact.row_count),
              artifact.protected_file ? "Yes" : "No",
              <span key="hash" className="font-mono text-xs">{artifact.file_hash.slice(0, 12)}</span>,
              <StatusBadge key="status" value={artifact.render_status} />,
            ])}
          />

          <DataTable
            emptyText={migrationRollbacksQuery.isLoading ? "Loading rollback registry..." : "No rollback scripts registered"}
            headers={["Rollback", "Migration", "Path", "Checksum", "Verified by", "Verified at", "Status"]}
            rows={migrationRollbacks.map((rollback) => [
              <button key="rollback" type="button" className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => setArtifactForm({ ...artifactForm, rollbackId: rollback.rollback_id, migrationName: rollback.migration_name, rollbackScriptPath: rollback.rollback_script_path, expectedChecksum: rollback.checksum })}>{rollback.rollback_id}</button>,
              rollback.migration_name,
              rollback.rollback_script_path,
              <span key="checksum" className="font-mono text-xs">{rollback.checksum.slice(0, 12)}</span>,
              rollback.verified_by ?? "-",
              formatDate(rollback.verified_at),
              <StatusBadge key="status" value={rollback.verification_status} />,
            ])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  emptyText,
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyText: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={headers.length} className="py-8 text-center text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex}>{cell}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
