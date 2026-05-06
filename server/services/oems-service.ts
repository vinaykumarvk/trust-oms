import crypto from 'crypto';
import { db } from '../db';
import * as schema from '@shared/schema';
import { and, desc, eq, gte, inArray, ilike, lte, or, sql, type InferSelectModel } from 'drizzle-orm';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from './service-errors';
import {
  type AggregationCandidate,
  assertAggregationCompatible,
  bucketByAggregationRules,
  listAggregationRules,
  validateAggregationCompatibility,
} from './blotter-aggregation-policy';

export type OemsProductFamily =
  | 'ODA'
  | 'MLD'
  | 'MUTUAL_FUND'
  | 'BOND'
  | 'FX_TODAY'
  | 'WEALTH_LENDING';

export type OemsChannel =
  | 'OEMS_DIRECT'
  | 'CRM_MICROSITE'
  | 'DBANK_PRO_MICROSITE'
  | 'BRANCH'
  | 'CRM'
  | 'RM_MOBILE'
  | 'SECURE_MICROSITE'
  | 'BACK_OFFICE'
  | 'TREASURY';

type OemsOrderStatus = typeof schema.oemsOrderStatusEnum.enumValues[number];
type OemsVerificationStatus = typeof schema.oemsVerificationStatusEnum.enumValues[number];
type NotificationChannel = typeof schema.notificationChannelEnum.enumValues[number];
type NotificationDeliveryStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RETRYING' | 'PARTIALLY_DELIVERED';
type OemsReportFormat = 'XLS' | 'XLSX' | 'CSV' | 'TXT' | 'PDF' | 'DOC' | 'DOCX';
type OemsOdaLifecycle = typeof schema.oemsOdaLifecycleEnum.enumValues[number];
type OemsOrder = InferSelectModel<typeof schema.oemsOrders>;
type OemsParameterSet = InferSelectModel<typeof schema.oemsParameterSets>;
type OemsChannelSession = InferSelectModel<typeof schema.oemsChannelSessions>;
type OemsNotificationTemplate = InferSelectModel<typeof schema.oemsNotificationTemplates>;
type OemsNotificationDelivery = InferSelectModel<typeof schema.oemsNotificationDeliveries>;
type OemsReportDefinition = InferSelectModel<typeof schema.oemsReportDefinitions>;
type OemsExportJob = InferSelectModel<typeof schema.oemsExportJobs>;
type OemsReportRenderArtifact = InferSelectModel<typeof schema.oemsReportRenderArtifacts>;
type OemsIntegrationAdapter = InferSelectModel<typeof schema.oemsIntegrationAdapters>;
type OemsApprovalWorkflowDefinition = InferSelectModel<typeof schema.oemsApprovalWorkflowDefinitions>;
type OemsApprovalQueueItem = InferSelectModel<typeof schema.oemsApprovalQueueItems>;
type OemsPortfolioHolding = InferSelectModel<typeof schema.oemsPortfolioHoldings>;
type OemsDigitalVerification = InferSelectModel<typeof schema.oemsDigitalVerifications>;
type OemsDocumentRegistration = InferSelectModel<typeof schema.oemsDocumentRegistrations>;
type OemsDocumentChecklistRule = InferSelectModel<typeof schema.oemsDocumentChecklistRules>;
type OemsRiskQuestionnaireVersion = InferSelectModel<typeof schema.oemsRiskQuestionnaireVersions>;
type OemsRiskProfileAssessment = InferSelectModel<typeof schema.oemsRiskProfileAssessments>;
type OemsProductRiskMapping = InferSelectModel<typeof schema.oemsProductRiskMappings>;
type OemsOdaRecommendation = InferSelectModel<typeof schema.oemsOdaRecommendations>;
type OemsOdaBlotterGroup = InferSelectModel<typeof schema.oemsOdaBlotterGroups>;
type OemsOdaTreasuryUpdate = InferSelectModel<typeof schema.oemsOdaTreasuryUpdates>;
type OemsMldTranche = InferSelectModel<typeof schema.oemsMldTranches>;
type OemsMldOrderDetail = InferSelectModel<typeof schema.oemsMldOrderDetails>;
type OemsMfBondOrderDetail = InferSelectModel<typeof schema.oemsMfBondOrderDetails>;
type OemsFxTodayDetail = InferSelectModel<typeof schema.oemsFxTodayDetails>;
type OemsWealthLendingFacility = InferSelectModel<typeof schema.oemsWealthLendingFacilities>;
type OemsWealthLendingCollateral = InferSelectModel<typeof schema.oemsWealthLendingCollaterals>;
type OemsWealthLendingInstruction = InferSelectModel<typeof schema.oemsWealthLendingInstructions>;
type OemsCutoffAction = 'REJECT_AFTER_COT' | 'NEXT_BUSINESS_DAY' | 'ALLOW_AFTER_COT';
type OemsIntegrationStatus = typeof schema.oemsIntegrationStatusEnum.enumValues[number];

interface ValidationFinding {
  ruleCode: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  result: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  source?: string;
  blocking?: boolean;
  acknowledgementRequired?: boolean;
}

interface OemsCutoffRule {
  cutoffTime?: string | null;
  cutoffAction?: OemsCutoffAction | string | null;
  timezone?: string | null;
  calendarKeys?: string[];
  allowCheckerRepairAfterCutoff?: boolean;
}

export interface OemsCutoffEvaluation {
  allowed: boolean;
  afterCutoff: boolean;
  action: OemsCutoffAction | 'NONE';
  timezone: string;
  localDate: string;
  localTime: string;
  cutoffTime?: string;
  processingDate: string;
  calendarKeys: string[];
  reason?: string;
}

interface OemsNotificationTemplateInput {
  eventCode: string;
  templateCode?: string;
  productFamily?: OemsProductFamily;
  channel?: NotificationChannel;
  deliveryChannels?: NotificationChannel[] | string;
  recipientRole: string;
  subjectTemplate: string;
  bodyTemplate: string;
  languageDefault?: string;
  localizedSubjects?: Record<string, string>;
  localizedBodies?: Record<string, string>;
  slaMinutes?: number;
  critical?: boolean;
  requiresAttachment?: boolean;
  attachmentPasswordPolicy?: unknown;
}

interface OemsNotificationEventInput {
  eventCode: string;
  orderId?: string;
  recipientId?: string;
  recipientType?: string;
  recipientAddress?: string;
  recipientRole?: string;
  channels?: NotificationChannel[] | string;
  languageCode?: string;
  dueAt?: Date;
  payload?: unknown;
  channelResults?: unknown;
  attachmentRequired?: boolean;
  attachmentPolicy?: unknown;
}

interface OemsReportExportRequest {
  requestedFormat?: OemsReportFormat | string;
  format?: OemsReportFormat | string;
  filters?: unknown;
  rowEstimate?: number;
  sourceStatus?: unknown;
  bigDataAvailable?: boolean;
}

interface OemsDigitalVerificationRequest {
  provider?: string;
  externalRef?: string;
  verificationType?: string;
  requestMethod?: string;
  channel?: OemsChannel;
  documentId?: number;
  boundDocumentTypes?: unknown;
  otpDeliveryChannel?: string;
  ttlMinutes?: number;
  maxAttempts?: number;
  payload?: unknown;
  payloadHash?: string;
  evidence?: unknown;
  fallbackAllowed?: boolean;
  fallbackChannel?: string;
  thirdPartyStatus?: string;
  providerOutage?: boolean;
  digitalImplemented?: boolean;
}

interface OemsDigitalVerificationAttemptInput {
  verificationId?: string;
  confirmed?: boolean;
  success?: boolean;
  manualFallback?: boolean;
  fallbackReason?: string;
  authMethod?: string;
  payloadHash?: string;
  evidence?: unknown;
  providerRef?: string;
  failureReason?: string;
  signedDocumentUrl?: string;
  finalFailure?: boolean;
  thirdPartyStatus?: string;
}

interface OemsDocumentRegistrationInput {
  documentType: string;
  documentStatus?: typeof schema.oemsDocumentStatusEnum.enumValues[number];
  required?: boolean;
  requirementType?: string;
  blockingStage?: string;
  checklistRuleId?: number;
  externalDocumentId?: string;
  templateCode?: string;
  templateVersion?: number;
  fileName?: string;
  fileUrl?: string;
  fileHash?: string;
  expectedFileHash?: string;
  expiresAt?: string;
  metadata?: unknown;
  evidence?: unknown;
}

type OemsRiskProfile = typeof schema.riskProfileEnum.enumValues[number];

interface OemsRiskAnswerInput {
  questionCode: string;
  score?: number;
  answer?: unknown;
}

interface OemsOdaLegInput {
  legNo?: number;
  legType?: string;
  direction?: string;
  currencyPair?: string;
  targetRate?: number | string;
  amount?: number | string;
  linkedLegNo?: number;
  payload?: unknown;
}

interface OemsOdaPrecheckInput {
  customerId?: string;
  customerType?: string;
  currencyPair?: string;
  dealtCurrency?: string;
  counterCurrency?: string;
  direction?: string;
  odaType?: string;
  effectiveType?: string;
  expiryAt?: string;
  tenorDays?: number | string;
  nominalAmount?: number | string;
  ratePercent?: number | string;
  referenceRate?: number | string;
  referenceRateId?: number;
  referenceRateStatus?: string;
  referenceRateSource?: string;
  minimumPlacementAmount?: number | string;
  minimumCollectiveAmount?: number | string;
  availableBalance?: number | string;
  ledgerBalance?: number | string;
  cifStatus?: string;
  skuStatus?: string;
  pfeStatus?: string;
  salesCertificationStatus?: string;
  debitAccountNo?: string;
  creditAccountNo?: string;
  debitCurrency?: string;
  creditCurrency?: string;
  maxGoodTillDays?: number | string;
  cutoffAt?: string;
  requireReferenceRate?: boolean;
  legs?: OemsOdaLegInput[];
}

function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function hashOemsPayload(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toMoney(value: number | string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`Invalid numeric value: ${value}`);
  return n.toFixed(4);
}

function toRate(value: number | string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`Invalid rate value: ${value}`);
  return n.toFixed(8);
}

function asNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return source
    .map((item) => asOptionalString(item)?.toUpperCase())
    .filter((item): item is string => Boolean(item));
}

function normalizeRoleList(value: unknown, fallback: string[] = []): string[] {
  const roles = normalizeStringArray(value);
  return roles.length > 0 ? roles : fallback;
}

function normalizeIntegrationStatus(value: unknown, fallback: OemsIntegrationStatus = 'QUEUED'): OemsIntegrationStatus {
  const status = asOptionalString(value)?.toUpperCase() ?? fallback;
  if (!schema.oemsIntegrationStatusEnum.enumValues.includes(status as OemsIntegrationStatus)) {
    throw new ValidationError(`Unsupported integration status: ${String(value)}`);
  }
  return status as OemsIntegrationStatus;
}

function normalizePositiveInteger(value: number | string | null | undefined, fallback: number, max = 10): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new ValidationError(`Invalid positive integer value: ${value}`);
  }
  return parsed;
}

const notificationChannels: NotificationChannel[] = ['IN_APP', 'EMAIL', 'SMS', 'DBANK_PRO', 'PUSH', 'PAGER_DUTY'];
const criticalNotificationEvents = new Set([
  'OEMS_ORDER_SUBMITTED',
  'OEMS_ORDER_EXECUTED',
  'OEMS_ORDER_CANCELLED',
  'OEMS_ORDER_EXPIRED',
  'OEMS_ODA_TRADE_CONFIRMATION',
  'OEMS_MLD_MATURITY_CONFIRMATION',
  'OEMS_FACILITY_BREACH',
  'OEMS_WEALTH_LENDING_SELL_COLLATERAL_FAILED',
]);
const protectedPdfNotificationEvents = new Set([
  'OEMS_ODA_TRADE_CONFIRMATION',
  'OEMS_ODA_EXECUTED',
  'OEMS_MLD_MATURITY_CONFIRMATION',
  'OEMS_MLD_MATURED',
]);
const oemsReportFormats: OemsReportFormat[] = ['XLS', 'XLSX', 'CSV', 'TXT', 'PDF', 'DOC', 'DOCX'];
const reportDefaultFilters = [
  'customerId',
  'cif',
  'salesUserId',
  'branchCode',
  'channel',
  'productId',
  'productFamily',
  'status',
  'transactionType',
  'currency',
  'dateFrom',
  'dateTo',
  'dealId',
  'externalReference',
];

function normalizeNotificationChannel(value: string): NotificationChannel {
  const normalized = value.trim().toUpperCase();
  if (!notificationChannels.includes(normalized as NotificationChannel)) {
    throw new ValidationError(`Unsupported notification channel: ${value}`);
  }
  return normalized as NotificationChannel;
}

function normalizeNotificationChannels(value: unknown, fallback: NotificationChannel[] = ['IN_APP']): NotificationChannel[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const channels = new Set<NotificationChannel>();

  for (const rawValue of rawValues) {
    const channel = asOptionalString(rawValue);
    if (channel) channels.add(normalizeNotificationChannel(channel));
  }

  return channels.size > 0 ? [...channels] : fallback;
}

function normalizeLocalizedContent(primary: string, localized: unknown, defaultLocale = 'en-ID'): Record<string, string> {
  const source = asRecord(localized);
  const content: Record<string, string> = {};

  for (const [locale, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim()) {
      content[locale] = value.trim();
    }
  }

  if (primary.trim()) {
    content[defaultLocale] = content[defaultLocale] ?? primary.trim();
    content.en = content.en ?? primary.trim();
  }

  return content;
}

function hasLocaleContent(content: unknown, localePrefixes: string[]): boolean {
  const record = asRecord(content);
  return Object.entries(record).some(([locale, value]) =>
    localePrefixes.some((prefix) => locale.toLowerCase().startsWith(prefix)) &&
    typeof value === 'string' &&
    value.trim().length > 0,
  );
}

function selectLocalizedContent(content: unknown, locale: string, fallback: string): string {
  const record = asRecord(content);
  const candidates = [
    locale,
    locale.toLowerCase(),
    locale.split('-')[0],
    locale === 'id-ID' ? 'id' : 'en',
    'en-ID',
    'en',
  ];

  for (const candidate of candidates) {
    const value = record[candidate];
    if (typeof value === 'string' && value.trim()) return value;
  }

  return fallback;
}

function renderTemplateText(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = payload[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function isCriticalNotification(eventCode: string, explicit?: boolean | null): boolean {
  return explicit === true || criticalNotificationEvents.has(eventCode.trim().toUpperCase());
}

function resolveProviderResult(channel: NotificationChannel, results: unknown): {
  status: NotificationDeliveryStatus;
  provider?: string;
  providerMessageId?: string;
  failureReason?: string;
  responsePayload?: unknown;
} {
  const byChannel = asRecord(results);
  const result = asRecord(byChannel[channel]);
  const rawStatus = asOptionalString(result.status)?.toUpperCase();
  const status = rawStatus && ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED'].includes(rawStatus)
    ? rawStatus as NotificationDeliveryStatus
    : 'SENT';

  return {
    status,
    provider: asOptionalString(result.provider),
    providerMessageId: asOptionalString(result.providerMessageId ?? result.provider_message_id),
    failureReason: asOptionalString(result.failureReason ?? result.failure_reason),
    responsePayload: result.responsePayload ?? result.response_payload ?? result,
  };
}

function notificationDeliveryTimestamps(status: NotificationDeliveryStatus, now: Date) {
  return {
    sent_at: ['SENT', 'DELIVERED'].includes(status) ? now : undefined,
    delivered_at: status === 'DELIVERED' ? now : undefined,
    failed_at: status === 'FAILED' ? now : undefined,
  };
}

function resolveAttachmentFailure(eventCode: string, configured: boolean, attachmentPolicy: unknown): string | undefined {
  if (!configured || !protectedPdfNotificationEvents.has(eventCode.trim().toUpperCase())) return undefined;
  const policy = asRecord(attachmentPolicy);
  if (policy.passwordProtected === true && asOptionalString(policy.passwordPolicy ?? policy.password_policy)) {
    return undefined;
  }
  return 'PASSWORD_PROTECTED_ATTACHMENT_REQUIRED';
}

function normalizeReportFormat(value: unknown, fallback: OemsReportFormat = 'CSV'): OemsReportFormat {
  const normalized = typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : fallback;
  if (!oemsReportFormats.includes(normalized as OemsReportFormat)) {
    throw new ValidationError(`Unsupported report format: ${String(value)}`);
  }
  return normalized as OemsReportFormat;
}

function normalizeReportFormats(value: unknown, fallback: OemsReportFormat[] = ['CSV']): OemsReportFormat[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const formats = new Set<OemsReportFormat>();

  for (const rawValue of rawValues) {
    formats.add(normalizeReportFormat(rawValue));
  }

  return formats.size > 0 ? [...formats] : fallback;
}

function normalizeReportFilters(value: unknown): Record<string, unknown> {
  const filters = asRecord(value);
  const normalized: Record<string, unknown> = {};

  for (const filterKey of reportDefaultFilters) {
    const valueForKey = filters[filterKey];
    if (valueForKey !== undefined && valueForKey !== null && valueForKey !== '') {
      normalized[filterKey] = typeof valueForKey === 'string' ? valueForKey.trim() : valueForKey;
    }
  }

  for (const [key, valueForKey] of Object.entries(filters)) {
    if (normalized[key] === undefined && valueForKey !== undefined && valueForKey !== null && valueForKey !== '') {
      normalized[key] = valueForKey;
    }
  }

  return normalized;
}

function parseReportDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new ValidationError(`${label} must use YYYY-MM-DD format`);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label} is not a valid date`);
  return raw;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDate}T00:00:00.000Z`).getTime();
  return Math.ceil((to - from) / 86_400_000);
}

function resolveHistorySourcePlan(filters: Record<string, unknown>, sourceStatus: unknown = {}) {
  const dateTo = parseReportDate(filters.dateTo ?? filters.toDate, 'Date to') ?? todayIso();
  const dateFrom = parseReportDate(filters.dateFrom ?? filters.fromDate, 'Date from') ?? addDaysIso(dateTo, -30);
  if (dateFrom > dateTo) throw new ValidationError('Report date-from cannot be after date-to');

  const olderThan90Days = daysBetween(dateFrom, todayIso()) > 90 || daysBetween(dateFrom, dateTo) > 90;
  const sources = olderThan90Days ? ['CORE_BANKING', 'BIG_DATA'] : ['OEMS', 'CORE_BANKING'];
  const status = asRecord(sourceStatus);
  const bigDataStatus = asOptionalString(status.BIG_DATA ?? status.bigData);
  const bigDataAvailable = filters.bigDataAvailable !== false && bigDataStatus !== 'UNAVAILABLE';

  return {
    dateFrom,
    dateTo,
    olderThan90Days,
    ageBucket: olderThan90Days ? 'OVER_90_DAYS' : 'UNDER_90_DAYS',
    sources,
    sourceStatus: status,
    bigDataAvailable,
  };
}

function isTreasurySummaryDealReport(reportCode: string): boolean {
  const code = reportCode.trim().toUpperCase();
  return code.includes('TREASURY_SUMMARY_DEAL') || code.includes('TREASURY_SUMMARY');
}

function isMasterRecapReport(reportCode: string): boolean {
  const code = reportCode.trim().toUpperCase();
  return code.includes('MASTER_RECAP') || code.includes('RECAP_BLOTTER') || code.includes('MASTER_BLOTTER');
}

function resolveReportProtection(report: OemsReportDefinition, requestedFormat: OemsReportFormat) {
  const policy = asRecord(report.protection_policy);
  const forced = policy.required === true || isMasterRecapReport(report.report_code);
  const protectedFormat = requestedFormat === 'PDF' || ['XLS', 'XLSX'].includes(requestedFormat) || forced;

  if (!forced && !protectedFormat) {
    return { protectedFile: false, policy: undefined };
  }

  return {
    protectedFile: true,
    policy: {
      mode: requestedFormat === 'PDF' ? 'NON_EDITABLE_PDF' : ['XLS', 'XLSX'].includes(requestedFormat) ? 'PROTECTED_SPREADSHEET' : 'READ_ONLY_EXPORT',
      watermark: policy.watermark ?? 'Danamon OEMS Confidential',
      passwordPolicy: policy.passwordPolicy ?? policy.password_policy ?? (['XLS', 'XLSX'].includes(requestedFormat) ? 'ROLE_OR_JOB_PASSWORD' : undefined),
      sourcePolicy: policy,
    },
  };
}

function buildOrderReportConditions(filters: Record<string, unknown>) {
  const conditions = [eq(schema.oemsOrders.is_deleted, false)];
  const customerId = asOptionalString(filters.customerId);
  const cif = asOptionalString(filters.cif);
  const salesUserId = asOptionalString(filters.salesUserId);
  const branchCode = asOptionalString(filters.branchCode);
  const channel = asOptionalString(filters.channel);
  const productId = filters.productId === undefined ? undefined : Number(filters.productId);
  const productFamily = asOptionalString(filters.productFamily);
  const status = asOptionalString(filters.status);
  const transactionType = asOptionalString(filters.transactionType);
  const currency = asOptionalString(filters.currency);
  const dateFrom = parseReportDate(filters.dateFrom, 'Date from');
  const dateTo = parseReportDate(filters.dateTo, 'Date to');
  const externalReference = asOptionalString(filters.externalReference ?? filters.dealId);

  if (customerId) conditions.push(eq(schema.oemsOrders.customer_id, customerId));
  if (cif) conditions.push(eq(schema.oemsOrders.customer_id, cif));
  if (salesUserId) conditions.push(eq(schema.oemsOrders.assisted_by_user_id, salesUserId));
  if (branchCode) conditions.push(eq(schema.oemsOrders.branch_code, branchCode.toUpperCase()));
  if (channel) conditions.push(eq(schema.oemsOrders.channel, channel as OemsChannel));
  if (typeof productId === 'number' && Number.isFinite(productId)) {
    conditions.push(eq(schema.oemsOrders.product_id, productId));
  }
  if (productFamily) conditions.push(eq(schema.oemsOrders.product_family, productFamily as OemsProductFamily));
  if (status) conditions.push(eq(schema.oemsOrders.order_status, status as OemsOrderStatus));
  if (transactionType) conditions.push(eq(schema.oemsOrders.transaction_type, transactionType));
  if (currency) conditions.push(eq(schema.oemsOrders.currency, currency.toUpperCase()));
  if (dateFrom) conditions.push(gte(schema.oemsOrders.created_at, new Date(`${dateFrom}T00:00:00.000Z`)));
  if (dateTo) conditions.push(lte(schema.oemsOrders.created_at, new Date(`${dateTo}T23:59:59.999Z`)));
  if (externalReference) conditions.push(sql`${schema.oemsOrders.external_refs}::text ILIKE ${`%${externalReference}%`}`);

  return conditions;
}

function normalizeExportRequest(payload: unknown): OemsReportExportRequest & { filters: Record<string, unknown>; requestedFormat: OemsReportFormat } {
  const request = asRecord(payload);
  const requestFilters = request.filters !== undefined
    ? request.filters
    : payload;
  const filters = normalizeReportFilters(requestFilters);
  const requestedFormat = normalizeReportFormat(request.requestedFormat ?? request.format ?? filters.requestedFormat ?? filters.format ?? 'CSV');

  return {
    ...request,
    filters,
    requestedFormat,
    rowEstimate: request.rowEstimate === undefined ? undefined : Number(request.rowEstimate),
    sourceStatus: request.sourceStatus ?? filters.sourceStatus,
    bigDataAvailable: request.bigDataAvailable as boolean | undefined,
  };
}

function normalizeSourceStatus(value: unknown): Record<string, string> {
  const sourceStatus = asRecord(value);
  const normalized: Record<string, string> = {};

  for (const [source, status] of Object.entries(sourceStatus)) {
    const sourceKey = source.trim().toUpperCase();
    const statusValue = asOptionalString(status)?.toUpperCase();
    if (sourceKey && statusValue) normalized[sourceKey] = statusValue;
  }

  return normalized;
}

function assertPortfolioAccess(params: {
  customerId?: string;
  actorCustomerId?: string;
  actorRole?: string;
  assignedCustomerIds?: string[];
}) {
  const role = params.actorRole?.trim().toUpperCase();
  if (!role || !params.customerId) return;

  if (role === 'CUSTOMER' && params.actorCustomerId && params.actorCustomerId !== params.customerId) {
    throw new ForbiddenError('Customer users can only view their own OEMS portfolio');
  }

  if (['RELATIONSHIP_MANAGER', 'SENIOR_RM', 'TRADER', 'SENIOR_TRADER'].includes(role) && params.assignedCustomerIds?.length) {
    if (!params.assignedCustomerIds.includes(params.customerId)) {
      throw new ForbiddenError('Sales users can only view assigned or authorized OEMS customers');
    }
  }
}

function resolvePortfolioLocalValue(holding: OemsPortfolioHolding, fxRates: Record<string, unknown>, asOfDate: string) {
  const originalValue = asNumber(holding.original_market_value ?? holding.market_value);
  const currency = holding.currency ?? 'IDR';
  const localCurrency = holding.local_currency ?? 'IDR';
  const providedLocalValue = holding.local_market_value;
  const configuredRate = asNumber(holding.fx_rate);
  const rawSuppliedRate = fxRates[currency];
  const suppliedRate = asNumber(
    typeof rawSuppliedRate === 'number' || typeof rawSuppliedRate === 'string'
      ? rawSuppliedRate
      : undefined,
  );
  const fxRate = currency === localCurrency
    ? 1
    : configuredRate > 0
      ? configuredRate
      : suppliedRate > 0
        ? suppliedRate
        : 0;

  return {
    originalValue,
    localCurrency,
    localValue: providedLocalValue !== null && providedLocalValue !== undefined
      ? asNumber(providedLocalValue)
      : fxRate > 0
        ? Number((originalValue * fxRate).toFixed(4))
        : undefined,
    fxRate: fxRate > 0 ? fxRate : undefined,
    fxRateSource: holding.fx_rate_source ?? 'APPROVED_TREASURY_RATE',
    fxRateAsOf: holding.fx_rate_as_of ?? asOfDate,
  };
}

function filterPortfolioHoldingMetric(holding: OemsPortfolioHolding, metric?: string) {
  if (!metric) return true;
  const normalized = metric.trim().toUpperCase();
  if (normalized === 'LEFT_PRINCIPAL') return asNumber(holding.left_principal) > 0;
  if (normalized === 'PROFIT_GAIN') return asNumber(holding.profit_gain) > 0;
  if (normalized === 'LEFT_TERM') return asNumber(holding.left_term_days) > 0;
  return true;
}

function normalizeCalendarKeys(...values: unknown[]): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    if (Array.isArray(value)) {
      value.forEach((entry) => asOptionalString(entry)?.split(',').forEach((item) => {
        if (item.trim()) keys.add(item.trim().toUpperCase());
      }));
    } else if (typeof value === 'string') {
      value.split(',').forEach((item) => {
        if (item.trim()) keys.add(item.trim().toUpperCase());
      });
    }
  }
  return [...keys];
}

function addSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function dateInRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

function addDaysIso(date: string, days: number): string {
  const current = new Date(`${date}T00:00:00.000Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return current.toISOString().slice(0, 10);
}

function parseCutoffTime(value: string): { hour: number; minute: number; normalized: string } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  if (!match) throw new ValidationError('Cutoff time must use HH:mm format');
  return { hour: Number(match[1]), minute: Number(match[2]), normalized: `${match[1]}:${match[2]}` };
}

function getZonedParts(instant: Date, timezone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
  } catch (_err) {
    throw new ValidationError(`TIMEZONE_NOT_RESOLVED: ${timezone}`);
  }

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    time: `${lookup.hour}:${lookup.minute}:${lookup.second}`,
  };
}

function normalizeCutoffAction(value: string | null | undefined): OemsCutoffAction {
  if (!value) return 'REJECT_AFTER_COT';
  const normalized = value.trim().toUpperCase();
  if (['REJECT_AFTER_COT', 'NEXT_BUSINESS_DAY', 'ALLOW_AFTER_COT'].includes(normalized)) {
    return normalized as OemsCutoffAction;
  }
  throw new ValidationError(`Unsupported cutoff action: ${value}`);
}

function isSalesAssistedChannel(channel: OemsChannel): boolean {
  return ['BRANCH', 'CRM', 'CRM_MICROSITE', 'RM_MOBILE'].includes(channel);
}

function isCustomerSelfServiceChannel(channel: OemsChannel): boolean {
  return ['DBANK_PRO_MICROSITE', 'SECURE_MICROSITE'].includes(channel);
}

function validateChannel(value: string): asserts value is OemsChannel {
  const allowed: OemsChannel[] = [
    'OEMS_DIRECT',
    'CRM_MICROSITE',
    'DBANK_PRO_MICROSITE',
    'BRANCH',
    'CRM',
    'RM_MOBILE',
    'SECURE_MICROSITE',
    'BACK_OFFICE',
    'TREASURY',
  ];
  if (!allowed.includes(value as OemsChannel)) {
    throw new ValidationError(`Unsupported OEMS channel: ${value}`);
  }
}

export function evaluateCutoffWindow(params: OemsCutoffRule & {
  channelTimestamp?: Date;
  currentDateIsBusinessDay?: boolean;
  nextBusinessDate?: string;
  checkerRepair?: boolean;
}): OemsCutoffEvaluation {
  const timezone = params.timezone?.trim() || 'Asia/Jakarta';
  const instant = params.channelTimestamp ?? new Date();
  const zoned = getZonedParts(instant, timezone);
  const calendarKeys = params.calendarKeys ?? [];

  if (!params.cutoffTime) {
    return {
      allowed: true,
      afterCutoff: false,
      action: 'NONE',
      timezone,
      localDate: zoned.date,
      localTime: zoned.time,
      processingDate: zoned.date,
      calendarKeys,
    };
  }

  if (calendarKeys.length === 0) {
    throw new ValidationError('CALENDAR_NOT_CONFIGURED: cutoff rule requires at least one calendar key');
  }

  const cutoff = parseCutoffTime(params.cutoffTime);
  const action = normalizeCutoffAction(params.cutoffAction);
  const localMinutes = zoned.hour * 60 + zoned.minute;
  const cutoffMinutes = cutoff.hour * 60 + cutoff.minute;
  const afterCutoff = localMinutes > cutoffMinutes || (localMinutes === cutoffMinutes && zoned.second > 0);
  const nonBusinessDay = params.currentDateIsBusinessDay === false;
  const needsDeferral = afterCutoff || nonBusinessDay;
  const nextBusinessDate = params.nextBusinessDate;

  if (!needsDeferral) {
    return {
      allowed: true,
      afterCutoff: false,
      action,
      timezone,
      localDate: zoned.date,
      localTime: zoned.time,
      cutoffTime: cutoff.normalized,
      processingDate: zoned.date,
      calendarKeys,
    };
  }

  if (params.checkerRepair && params.allowCheckerRepairAfterCutoff) {
    return {
      allowed: true,
      afterCutoff,
      action,
      timezone,
      localDate: zoned.date,
      localTime: zoned.time,
      cutoffTime: cutoff.normalized,
      processingDate: nextBusinessDate ?? zoned.date,
      calendarKeys,
      reason: nonBusinessDay ? 'Checker repair allowed on non-business day' : 'Checker repair allowed after COT',
    };
  }

  if (action === 'REJECT_AFTER_COT') {
    return {
      allowed: false,
      afterCutoff,
      action,
      timezone,
      localDate: zoned.date,
      localTime: zoned.time,
      cutoffTime: cutoff.normalized,
      processingDate: zoned.date,
      calendarKeys,
      reason: nonBusinessDay ? 'Order date is not a configured business day' : 'Order timestamp is after configured COT',
    };
  }

  if (action === 'NEXT_BUSINESS_DAY') {
    if (!nextBusinessDate) throw new ValidationError('CALENDAR_NOT_CONFIGURED: next business day could not be resolved');
    return {
      allowed: true,
      afterCutoff,
      action,
      timezone,
      localDate: zoned.date,
      localTime: zoned.time,
      cutoffTime: cutoff.normalized,
      processingDate: nextBusinessDate,
      calendarKeys,
      reason: nonBusinessDay ? 'Deferred to next configured business day' : 'Submitted after COT and deferred to next business day',
    };
  }

  return {
    allowed: true,
    afterCutoff,
    action,
    timezone,
    localDate: zoned.date,
    localTime: zoned.time,
    cutoffTime: cutoff.normalized,
    processingDate: zoned.date,
    calendarKeys,
    reason: 'Cutoff action allows processing after COT',
  };
}

async function getOemsOrder(orderId: string): Promise<OemsOrder> {
  const [order] = await db.select().from(schema.oemsOrders)
    .where(eq(schema.oemsOrders.order_id, orderId))
    .limit(1);
  if (!order) throw new NotFoundError('OEMS order not found');
  return order;
}

async function getOdaRecommendation(recommendationId: number): Promise<OemsOdaRecommendation> {
  const [recommendation] = await db.select().from(schema.oemsOdaRecommendations)
    .where(and(
      eq(schema.oemsOdaRecommendations.id, recommendationId),
      eq(schema.oemsOdaRecommendations.is_deleted, false),
    ))
    .limit(1);
  if (!recommendation) throw new NotFoundError('ODA recommendation not found');
  return recommendation;
}

async function getOdaBlotterGroup(groupId: number): Promise<OemsOdaBlotterGroup> {
  const [group] = await db.select().from(schema.oemsOdaBlotterGroups)
    .where(and(
      eq(schema.oemsOdaBlotterGroups.id, groupId),
      eq(schema.oemsOdaBlotterGroups.is_deleted, false),
    ))
    .limit(1);
  if (!group) throw new NotFoundError('ODA blotter group not found');
  return group;
}

async function getOdaTreasuryUpdate(updateId: string): Promise<OemsOdaTreasuryUpdate> {
  const [update] = await db.select().from(schema.oemsOdaTreasuryUpdates)
    .where(and(
      eq(schema.oemsOdaTreasuryUpdates.update_id, updateId),
      eq(schema.oemsOdaTreasuryUpdates.is_deleted, false),
    ))
    .limit(1);
  if (!update) throw new NotFoundError('ODA Treasury update not found');
  return update;
}

const digitalVerificationMethods = ['AUTH_LINK', 'OTP', 'MPIN', 'SOFT_TOKEN', 'DIGITAL_SIGNATURE'] as const;

function normalizeDigitalVerificationMethod(value: unknown): string {
  const method = asOptionalString(value)?.toUpperCase() ?? 'AUTH_LINK';
  if (!digitalVerificationMethods.includes(method as typeof digitalVerificationMethods[number])) {
    throw new ValidationError(`Unsupported digital verification method: ${String(value)}`);
  }
  return method;
}

function buildDigitalVerificationPayload(order: OemsOrder, data: OemsDigitalVerificationRequest) {
  const suppliedPayload = asRecord(data.payload);
  return {
    orderId: order.order_id,
    orderNo: order.order_no,
    customerId: order.customer_id,
    productFamily: order.product_family,
    transactionType: order.transaction_type,
    currency: order.currency,
    amount: order.amount,
    quantity: order.quantity,
    rate: order.rate,
    tradeDate: order.trade_date,
    valueDate: order.value_date,
    maturityDate: order.maturity_date,
    channel: data.channel ?? order.channel,
    documentId: data.documentId,
    boundDocumentTypes: normalizeStringArray(data.boundDocumentTypes),
    payload: suppliedPayload,
  };
}

async function getDigitalVerificationByRef(orderId: string, verificationId?: string): Promise<OemsDigitalVerification> {
  const conditions = [
    eq(schema.oemsDigitalVerifications.order_id, orderId),
    eq(schema.oemsDigitalVerifications.is_deleted, false),
  ];
  if (verificationId?.trim()) {
    conditions.push(eq(schema.oemsDigitalVerifications.verification_id, verificationId.trim()));
  }

  const [verification] = await db.select().from(schema.oemsDigitalVerifications)
    .where(and(...conditions))
    .orderBy(desc(schema.oemsDigitalVerifications.created_at))
    .limit(1);

  if (!verification) throw new NotFoundError('OEMS digital verification request not found');
  return verification;
}

async function getOemsDocument(documentId: string): Promise<OemsDocumentRegistration> {
  const [document] = await db.select().from(schema.oemsDocumentRegistrations)
    .where(eq(schema.oemsDocumentRegistrations.document_id, documentId))
    .limit(1);
  if (!document) throw new NotFoundError('OEMS document registration not found');
  return document;
}

async function getOemsRiskQuestionnaire(id: number): Promise<OemsRiskQuestionnaireVersion> {
  const [questionnaire] = await db.select().from(schema.oemsRiskQuestionnaireVersions)
    .where(eq(schema.oemsRiskQuestionnaireVersions.id, id))
    .limit(1);
  if (!questionnaire) throw new NotFoundError('OEMS risk questionnaire version not found');
  return questionnaire;
}

async function getOemsRiskAssessment(assessmentId: string): Promise<OemsRiskProfileAssessment> {
  const [assessment] = await db.select().from(schema.oemsRiskProfileAssessments)
    .where(eq(schema.oemsRiskProfileAssessments.assessment_id, assessmentId))
    .limit(1);
  if (!assessment) throw new NotFoundError('OEMS risk profile assessment not found');
  return assessment;
}

async function findLatestActiveOemsRiskProfile(customerId: string): Promise<OemsRiskProfileAssessment | null> {
  const [assessment] = await db.select().from(schema.oemsRiskProfileAssessments)
    .where(and(
      eq(schema.oemsRiskProfileAssessments.customer_id, customerId),
      eq(schema.oemsRiskProfileAssessments.is_active, true),
      eq(schema.oemsRiskProfileAssessments.is_deleted, false),
    ))
    .orderBy(desc(schema.oemsRiskProfileAssessments.effective_to), desc(schema.oemsRiskProfileAssessments.created_at))
    .limit(1);
  return assessment?.assessment_id ? assessment : null;
}

function terminalVerificationStatus(status: OemsVerificationStatus): boolean {
  return ['CONFIRMED', 'MANUAL_VERIFIED', 'EXPIRED', 'CANCELLED', 'LOCKED', 'INVALIDATED'].includes(status);
}

function nextStatusAfterCustomerVerification(order: OemsOrder): OemsOrderStatus {
  if (order.document_status && ['REQUIRED', 'PENDING_UPLOAD', 'REJECTED', 'EXPIRED'].includes(order.document_status)) {
    return 'PENDING_DOCUMENTS';
  }
  return 'PENDING_APPROVAL';
}

const documentBlockingStatuses = new Set([
  'REQUIRED',
  'MISSING',
  'PENDING_UPLOAD',
  'GENERATED',
  'REJECTED',
  'EXPIRED',
  'QUARANTINED',
]);

function normalizeDocumentRequirement(value: unknown, fallback = 'REQUIRED'): string {
  const requirement = asOptionalString(value)?.toUpperCase() ?? fallback;
  if (!['REQUIRED', 'OPTIONAL', 'CONDITIONAL'].includes(requirement)) {
    throw new ValidationError(`Unsupported document requirement type: ${String(value)}`);
  }
  return requirement;
}

function normalizeDocumentBlockingStage(value: unknown, fallback = 'SUBMISSION'): string {
  const stage = asOptionalString(value)?.toUpperCase() ?? fallback;
  if (!['CAPTURE', 'SUBMISSION', 'EXECUTION', 'NONE'].includes(stage)) {
    throw new ValidationError(`Unsupported document blocking stage: ${String(value)}`);
  }
  return stage;
}

function checklistRuleApplies(rule: OemsDocumentChecklistRule, order: OemsOrder): boolean {
  if (rule.product_family && rule.product_family !== order.product_family) return false;
  if (rule.transaction_type && rule.transaction_type !== order.transaction_type) return false;
  if (rule.channel && rule.channel !== order.channel) return false;

  const condition = asRecord(rule.condition_json);
  const payload = asRecord(order.payload);
  for (const [key, expected] of Object.entries(condition)) {
    if (key === 'requiredWhenPayloadEquals') {
      const equals = asRecord(expected);
      for (const [payloadKey, payloadValue] of Object.entries(equals)) {
        if (payload[payloadKey] !== payloadValue) return false;
      }
    }
  }
  return true;
}

function documentBlocksStage(document: OemsDocumentRegistration, stage: 'SUBMISSION' | 'EXECUTION'): boolean {
  if (!document.required || document.requirement_type === 'OPTIONAL') return false;
  if (document.blocking_stage === 'NONE') return false;
  if (stage === 'SUBMISSION' && !['SUBMISSION', 'EXECUTION'].includes(document.blocking_stage)) return false;
  if (stage === 'EXECUTION' && document.blocking_stage !== 'EXECUTION') return false;
  if (document.expires_at && new Date(document.expires_at).getTime() <= Date.now()) return true;
  return documentBlockingStatuses.has(document.document_status);
}

function nextDocumentRetryAt(retryCount: number): Date {
  return new Date(Date.now() + Math.min(60, 5 * (retryCount + 1)) * 60 * 1000);
}

const riskProfileScores: Record<OemsRiskProfile, number> = {
  CONSERVATIVE: 1,
  MODERATE: 2,
  BALANCED: 3,
  GROWTH: 4,
  AGGRESSIVE: 5,
};

const riskProfilesByScore: Record<number, OemsRiskProfile> = {
  1: 'CONSERVATIVE',
  2: 'MODERATE',
  3: 'BALANCED',
  4: 'GROWTH',
  5: 'AGGRESSIVE',
};

function normalizeRiskProfile(value: unknown): OemsRiskProfile {
  const profile = asOptionalString(value)?.toUpperCase();
  if (profile && profile in riskProfileScores) return profile as OemsRiskProfile;
  throw new ValidationError(`Unsupported risk profile: ${String(value)}`);
}

function riskProfileFromScore(score: number): OemsRiskProfile {
  const bounded = Math.min(5, Math.max(1, Math.ceil(score)));
  return riskProfilesByScore[bounded] ?? 'CONSERVATIVE';
}

function scoreRiskProfile(totalScore: number, scoreBands: unknown): { riskProfile: OemsRiskProfile; riskScore: number } {
  const bands = Array.isArray(scoreBands) ? scoreBands : [];
  for (const rawBand of bands) {
    const band = asRecord(rawBand);
    const from = asNumber(band.from as number | string | undefined);
    const to = asNumber(band.to as number | string | undefined);
    if (totalScore >= from && totalScore <= to && band.riskProfile) {
      const riskProfile = normalizeRiskProfile(band.riskProfile);
      return { riskProfile, riskScore: riskProfileScores[riskProfile] };
    }
  }

  if (totalScore <= 20) return { riskProfile: 'CONSERVATIVE', riskScore: 1 };
  if (totalScore <= 40) return { riskProfile: 'MODERATE', riskScore: 2 };
  if (totalScore <= 60) return { riskProfile: 'BALANCED', riskScore: 3 };
  if (totalScore <= 80) return { riskProfile: 'GROWTH', riskScore: 4 };
  return { riskProfile: 'AGGRESSIVE', riskScore: 5 };
}

function monthsFrom(dateIso: string, months: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

const odaDirections = ['BUY', 'SELL'] as const;
const odaTypes = ['SINGLE', 'IF_DONE', 'OCO'] as const;
const odaEffectiveTypes = ['INTRADAY', 'OVERNIGHT', 'GOOD_TILL_DATE', 'GTD', 'TODAY'] as const;

function normalizeUpperToken(value: unknown, fallback: string): string {
  const token = asOptionalString(value)?.toUpperCase().replace(/\s+/g, '_');
  return token || fallback;
}

function normalizeOdaDirection(value: unknown): string {
  const direction = normalizeUpperToken(value, 'BUY');
  if (!odaDirections.includes(direction as typeof odaDirections[number])) {
    throw new ValidationError(`Unsupported ODA direction: ${String(value)}`);
  }
  return direction;
}

function normalizeOdaType(value: unknown): string {
  const type = normalizeUpperToken(value, 'SINGLE');
  if (!odaTypes.includes(type as typeof odaTypes[number])) {
    throw new ValidationError(`Unsupported ODA type: ${String(value)}`);
  }
  return type;
}

function normalizeOdaEffectiveType(value: unknown): string {
  const type = normalizeUpperToken(value, 'INTRADAY');
  if (!odaEffectiveTypes.includes(type as typeof odaEffectiveTypes[number])) {
    throw new ValidationError(`Unsupported ODA effective type: ${String(value)}`);
  }
  return type === 'GTD' ? 'GOOD_TILL_DATE' : type;
}

function normalizeCurrencyCode(value: unknown, label: string): string {
  const currency = asOptionalString(value)?.toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new ValidationError(`${label} must be a three-letter currency code`);
  }
  return currency;
}

function normalizeCurrencyPair(value: unknown, dealtCurrency?: unknown, counterCurrency?: unknown): {
  currencyPair: string;
  dealtCurrency: string;
  counterCurrency: string;
} {
  const rawPair = asOptionalString(value)?.toUpperCase().replace('-', '/');
  if (rawPair) {
    const parts = rawPair.split('/');
    if (parts.length !== 2 || !/^[A-Z]{3}$/.test(parts[0]) || !/^[A-Z]{3}$/.test(parts[1])) {
      throw new ValidationError('ODA currency pair must use BASE/QUOTE format');
    }
    return { currencyPair: `${parts[0]}/${parts[1]}`, dealtCurrency: parts[0], counterCurrency: parts[1] };
  }

  const dealt = normalizeCurrencyCode(dealtCurrency, 'Dealt currency');
  const counter = normalizeCurrencyCode(counterCurrency, 'Counter currency');
  return { currencyPair: `${dealt}/${counter}`, dealtCurrency: dealt, counterCurrency: counter };
}

function parseOptionalFutureDateTime(value: unknown, label: string): Date | undefined {
  const raw = asOptionalString(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label} is not a valid date/time`);
  if (date.getTime() <= Date.now()) throw new ValidationError(`${label} must be in the future`);
  return date;
}

function parseRequiredFutureDateTime(value: unknown, label: string): Date {
  const parsed = parseOptionalFutureDateTime(value, label);
  if (!parsed) throw new ValidationError(`${label} is required`);
  return parsed;
}

function odaStatusPass(value: unknown): boolean {
  return ['PASS', 'VALID', 'ACTIVE', 'AVAILABLE', 'OK', 'APPROVED', 'NOT_REQUIRED'].includes(normalizeUpperToken(value, 'PENDING'));
}

function normalizeOdaPrecheck(data: OemsOdaPrecheckInput): {
  findings: ValidationFinding[];
  hasBlocking: boolean;
  normalized: {
    customerType: string;
    direction: string;
    odaType: string;
    effectiveType: string;
    currencyPair: string;
    dealtCurrency: string;
    counterCurrency: string;
    nominalAmount: number;
    ratePercent: number;
    tenorDays: number;
    minimumPlacementAmount: number;
    minimumCollectiveAmount: number;
    availableBalance: number;
    ledgerBalance: number;
    referenceRate: number;
    maxGoodTillDays: number;
    expiryAt?: Date;
  };
} {
  const pair = normalizeCurrencyPair(data.currencyPair, data.debitCurrency ?? data.dealtCurrency, data.creditCurrency ?? data.counterCurrency);
  const direction = normalizeOdaDirection(data.direction);
  const odaType = normalizeOdaType(data.odaType);
  const effectiveType = normalizeOdaEffectiveType(data.effectiveType);
  const nominalAmount = asNumber(data.nominalAmount as number | string | undefined);
  const ratePercent = asNumber(data.ratePercent as number | string | undefined);
  const tenorDays = asNumber(data.tenorDays as number | string | undefined);
  const minimumPlacementAmount = asNumber(data.minimumPlacementAmount as number | string | undefined);
  const minimumCollectiveAmount = asNumber(data.minimumCollectiveAmount as number | string | undefined);
  const availableBalance = asNumber(data.availableBalance as number | string | undefined);
  const ledgerBalance = asNumber(data.ledgerBalance as number | string | undefined);
  const referenceRate = asNumber(data.referenceRate as number | string | undefined);
  const maxGoodTillDays = asNumber(data.maxGoodTillDays as number | string | undefined) || 90;
  const expiryAt = effectiveType === 'GOOD_TILL_DATE'
    ? parseRequiredFutureDateTime(data.expiryAt, 'Good-till expiry')
    : parseOptionalFutureDateTime(data.expiryAt, 'ODA expiry');
  const findings: ValidationFinding[] = [];

  if (!data.customerId?.trim()) {
    findings.push({
      ruleCode: 'OEMS-ODA-CIF-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      source: 'NCBS',
      message: 'ODA customer CIF is required before registration.',
    });
  }
  if (nominalAmount <= 0) {
    findings.push({
      ruleCode: 'OEMS-ODA-AMOUNT-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      message: 'ODA order amount must be greater than zero.',
    });
  }
  if (minimumPlacementAmount > 0 && nominalAmount < minimumPlacementAmount) {
    findings.push({
      ruleCode: 'OEMS-ODA-MIN-PLACEMENT-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      message: `ODA minimum placement amount is ${minimumPlacementAmount}.`,
    });
  }
  if (availableBalance > 0 && nominalAmount > availableBalance) {
    findings.push({
      ruleCode: 'OEMS-ODA-BALANCE-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      source: 'NCBS',
      message: 'ODA available balance is insufficient; ledger balance is not used for hold validation.',
    });
  }
  if (!odaStatusPass(data.cifStatus)) {
    findings.push({
      ruleCode: 'OEMS-ODA-CIF-STATUS-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      source: 'NCBS',
      message: 'ODA CIF validation must pass before submission.',
    });
  }
  if (!odaStatusPass(data.skuStatus)) {
    findings.push({
      ruleCode: 'OEMS-ODA-SKU-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      source: 'WEALTH_CORE',
      message: 'ODA SKU validation must pass before submission.',
    });
  }
  if (!odaStatusPass(data.pfeStatus)) {
    findings.push({
      ruleCode: 'OEMS-ODA-PFE-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      source: 'WEALTH_CORE',
      message: 'ODA PFE validation must pass before submission.',
    });
  }
  if (data.salesCertificationStatus && !odaStatusPass(data.salesCertificationStatus)) {
    findings.push({
      ruleCode: 'OEMS-ODA-SALES-CERT-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      source: 'WEALTH_CORE',
      message: 'ODA sales certification must be active for the selected product family.',
    });
  }
  if (data.requireReferenceRate !== false && (!odaStatusPass(data.referenceRateStatus ?? 'UNAVAILABLE') || referenceRate <= 0)) {
    findings.push({
      ruleCode: 'REFERENCE_RATE_UNAVAILABLE',
      severity: 'BLOCKING',
      result: 'FAIL',
      source: 'TREASURY',
      message: 'REFERENCE_RATE_UNAVAILABLE: Missing Treasury rate source blocks rate-dependent submission.',
    });
  }
  if (ratePercent <= 0) {
    findings.push({
      ruleCode: 'OEMS-ODA-RATE-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      message: 'ODA rate must be greater than zero.',
    });
  }
  if (tenorDays <= 0) {
    findings.push({
      ruleCode: 'OEMS-ODA-TENOR-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      message: 'ODA tenor must be captured before submission.',
    });
  }
  if (!data.debitAccountNo?.trim() || !data.creditAccountNo?.trim()) {
    findings.push({
      ruleCode: 'OEMS-ODA-ACCOUNT-001',
      severity: 'BLOCKING',
      result: 'FAIL',
      source: 'NCBS',
      message: 'ODA debit and credit accounts are required before fund hold.',
    });
  }
  if (effectiveType === 'GOOD_TILL_DATE' && expiryAt) {
    const maxExpiry = Date.now() + maxGoodTillDays * 86_400_000;
    if (expiryAt.getTime() > maxExpiry) {
      findings.push({
        ruleCode: 'OEMS-ODA-GTD-001',
        severity: 'BLOCKING',
        result: 'FAIL',
        message: 'Good-till order must have future expiry date/time before maximum allowed tenor.',
      });
    }
  }

  return {
    findings,
    hasBlocking: findings.some((finding) => finding.severity === 'BLOCKING' || finding.blocking),
    normalized: {
      customerType: normalizeUpperToken(data.customerType, 'INDIVIDUAL'),
      direction,
      odaType,
      effectiveType,
      currencyPair: pair.currencyPair,
      dealtCurrency: pair.dealtCurrency,
      counterCurrency: pair.counterCurrency,
      nominalAmount,
      ratePercent,
      tenorDays,
      minimumPlacementAmount,
      minimumCollectiveAmount,
      availableBalance,
      ledgerBalance,
      referenceRate,
      maxGoodTillDays,
      expiryAt,
    },
  };
}

function normalizeOdaLegs(data: OemsOdaPrecheckInput, normalized: ReturnType<typeof normalizeOdaPrecheck>['normalized']): OemsOdaLegInput[] {
  const legs = Array.isArray(data.legs) ? data.legs : [];
  if (normalized.odaType === 'OCO' && legs.length < 2) {
    throw new ValidationError('OCO orders must define linked legs and cancel the alternate leg when one leg executes');
  }
  if (normalized.odaType === 'IF_DONE' && legs.length < 2) {
    throw new ValidationError('If Done orders require primary and contingent legs');
  }

  if (legs.length > 0) {
    return legs.map((leg, index) => ({
      ...leg,
      legNo: leg.legNo ?? index + 1,
      legType: leg.legType ?? (index === 0 ? 'PRIMARY' : normalized.odaType === 'OCO' ? 'OCO_ALTERNATE' : 'IF_DONE'),
      direction: leg.direction ?? normalized.direction,
      currencyPair: leg.currencyPair ?? normalized.currencyPair,
      targetRate: leg.targetRate ?? normalized.ratePercent,
      amount: leg.amount ?? normalized.nominalAmount,
    }));
  }

  return [{
    legNo: 1,
    legType: 'PRIMARY',
    direction: normalized.direction,
    currencyPair: normalized.currencyPair,
    targetRate: normalized.ratePercent,
    amount: normalized.nominalAmount,
  }];
}

function calculateOdaOrderCostBeforeSwap(amount: number, ratePercent: number): number {
  if (amount <= 0 || ratePercent <= 0) return 0;
  return Number((amount * ratePercent).toFixed(4));
}

function odaInstructionStatus(success?: boolean): typeof schema.oemsIntegrationStatusEnum.enumValues[number] {
  return success === false ? 'FAILED' : 'ACKNOWLEDGED';
}

function normalizeMldOutcome(value: unknown): 'MAX_RETURN' | 'MIN_RETURN' | 'TERMINATED' {
  const outcome = normalizeUpperToken(value, 'MIN_RETURN');
  if (['MAX_RETURN', 'MIN_RETURN', 'TERMINATED'].includes(outcome)) return outcome as 'MAX_RETURN' | 'MIN_RETURN' | 'TERMINATED';
  throw new ValidationError(`Unsupported MLD fixing outcome: ${String(value)}`);
}

function calculateMldPayout(params: {
  principalAmount: number;
  minimumInterestRatePercent?: number;
  bonusPayoutRatePercent?: number;
  taxRatePercent?: number;
  outcome?: unknown;
}) {
  const principalAmount = asNumber(params.principalAmount);
  const minimumInterestRate = asNumber(params.minimumInterestRatePercent);
  const bonusPayoutRate = asNumber(params.bonusPayoutRatePercent);
  const taxRate = asNumber(params.taxRatePercent);
  const outcome = normalizeMldOutcome(params.outcome);
  if (principalAmount <= 0) throw new ValidationError('MLD principal amount must be greater than zero');
  if (minimumInterestRate < 0 || bonusPayoutRate < 0 || taxRate < 0) {
    throw new ValidationError('MLD payout rates cannot be negative');
  }

  const minimumInterestAmount = principalAmount * (minimumInterestRate / 100);
  const bonusPayoutAmount = outcome === 'MAX_RETURN' ? principalAmount * (bonusPayoutRate / 100) : 0;
  const taxableIncome = minimumInterestAmount + bonusPayoutAmount;
  const taxAmount = taxableIncome * (taxRate / 100);
  const grossPayoutAmount = principalAmount + taxableIncome;
  return {
    outcome,
    principalAmount,
    minimumInterestAmount: Number(minimumInterestAmount.toFixed(4)),
    bonusPayoutAmount: Number(bonusPayoutAmount.toFixed(4)),
    grossPayoutAmount: Number(grossPayoutAmount.toFixed(4)),
    taxAmount: Number(taxAmount.toFixed(4)),
    netPayoutAmount: Number((grossPayoutAmount - taxAmount).toFixed(4)),
    principalProtectionAppliesOnlyIfHeldUntilMaturity: outcome !== 'TERMINATED',
  };
}

const mutualFundTransactionVariants = [
  'SUBSCRIPTION',
  'FULL_REDEMPTION',
  'PARTIAL_REDEMPTION',
  'FULL_SWITCHING',
  'PARTIAL_SWITCHING',
  'DRIP',
] as const;

const bondTransactionVariants = [
  'BUY',
  'SELL',
  'SWITCHING',
  'AUCTION',
  'BUYBACK',
] as const;

function normalizeMfBondVariant(productFamily: 'MUTUAL_FUND' | 'BOND', value: unknown): string {
  const variant = normalizeUpperToken(value, productFamily === 'BOND' ? 'BUY' : 'SUBSCRIPTION');
  const normalized = variant === 'REDEMPTION_FULL'
    ? 'FULL_REDEMPTION'
    : variant === 'REDEMPTION_PARTIAL'
      ? 'PARTIAL_REDEMPTION'
      : variant === 'SWITCH_FULL'
        ? 'FULL_SWITCHING'
        : variant === 'SWITCH_PARTIAL'
          ? 'PARTIAL_SWITCHING'
          : variant;
  const allowed = productFamily === 'BOND' ? bondTransactionVariants : mutualFundTransactionVariants;
  if (!(allowed as readonly string[]).includes(normalized)) {
    throw new ValidationError(`Unsupported ${productFamily} transaction variant: ${String(value)}`);
  }
  return normalized;
}

function isStatusReady(value: unknown): boolean {
  return ['PASS', 'VALID', 'ACTIVE', 'AVAILABLE', 'OK', 'APPROVED', 'CAPTURED', 'OPENED', 'CURRENT', 'SYNCED', 'READY', 'NOT_REQUIRED'].includes(
    normalizeUpperToken(value, 'PENDING'),
  );
}

function statusFromBoolean(value: boolean | undefined, passValue = 'PASS', pendingValue = 'PENDING'): string {
  if (value === true) return passValue;
  if (value === false) return 'FAILED';
  return pendingValue;
}

function buildFxQuoteHash(data: {
  currencyPair: string;
  dealtCurrency: string;
  counterCurrency: string;
  amount: number | string;
  rate: number | string;
  expiresAt?: Date | string;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      currencyPair: data.currencyPair,
      dealtCurrency: data.dealtCurrency,
      counterCurrency: data.counterCurrency,
      amount: String(data.amount),
      rate: String(data.rate),
      expiresAt: data.expiresAt instanceof Date ? data.expiresAt.toISOString() : data.expiresAt,
    }))
    .digest('hex');
}

function normalizeSourceSystems(value: unknown, fallback: string[]): string[] {
  const sources = normalizeStringArray(value);
  return sources.length > 0 ? sources : fallback;
}

function resolveSourceRetrievalStatus(source: string, sourceStatus: unknown): string {
  const statuses = asRecord(sourceStatus);
  return normalizeUpperToken(statuses[source] ?? statuses[source.toLowerCase()] ?? statuses.default, 'AVAILABLE');
}

const defaultSensitivePayloadFields = [
  'accountNo',
  'account_no',
  'debitAccountNo',
  'debit_account_no',
  'creditAccountNo',
  'credit_account_no',
  'loanAccountNo',
  'loan_account_no',
  'customerId',
  'customer_id',
  'cif',
  'idNumber',
  'id_number',
  'email',
  'phone',
  'mobile',
  'address',
  'amount',
  'nominalAmount',
  'nominal_amount',
  'outstandingAmount',
  'outstanding_amount',
  'limitAmount',
  'limit_amount',
  'marketValue',
  'market_value',
];

function normalizePayloadPaths(value: unknown): string[] {
  return [...new Set([
    ...defaultSensitivePayloadFields,
    ...normalizeStringArray(value),
  ].map((item) => item.trim()).filter(Boolean))];
}

function hashMaskedValue(value: unknown): string {
  return hashOemsPayload(value).slice(0, 12);
}

function isSensitivePayloadPath(key: string, path: string, sensitivePaths: string[]): boolean {
  const normalizedKey = key.toLowerCase();
  const normalizedPath = path.toLowerCase();
  return sensitivePaths.some((entry) => {
    const normalizedEntry = entry.toLowerCase();
    return normalizedEntry === normalizedKey
      || normalizedEntry === normalizedPath
      || normalizedPath.endsWith(`.${normalizedEntry}`)
      || (normalizedEntry.endsWith('.*') && normalizedPath.startsWith(normalizedEntry.slice(0, -1)));
  });
}

function maskScalar(value: unknown) {
  if (value === null || value === undefined || value === '') return value;
  return {
    masked: true,
    hash: hashMaskedValue(value),
  };
}

function maskIntegrationPayload(value: unknown, sensitivePathsInput?: unknown, path = ''): unknown {
  const sensitivePaths = normalizePayloadPaths(sensitivePathsInput);
  if (Array.isArray(value)) {
    return value.map((item, index) => maskIntegrationPayload(item, sensitivePaths, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (isSensitivePayloadPath(key, nextPath, sensitivePaths)) {
        return [key, maskScalar(item)];
      }
      return [key, maskIntegrationPayload(item, sensitivePaths, nextPath)];
    }));
  }
  return value;
}

function encryptionKeyForProfile(profileRef?: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(process.env.OEMS_PAYLOAD_ENCRYPTION_KEY || `local-oems-dev-key:${profileRef ?? 'default'}`)
    .digest();
}

function buildEncryptedPayloadEnvelope(value: unknown, profileRef: string, classification: string, maskedPreview: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKeyForProfile(profileRef), iv);
  const plaintext = stableStringify(value);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: true,
    algorithm: 'AES-256-GCM',
    keyRef: profileRef,
    classification,
    payloadHash: hashOemsPayload(value),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    maskedPreview,
  };
}

function securePayloadForAdapter(adapter: OemsIntegrationAdapter, value: unknown) {
  const maskedPayload = adapter.mask_log_payloads === false
    ? value
    : maskIntegrationPayload(value, adapter.sensitive_field_paths);
  const profileRef = adapter.encryption_profile_ref
    ?? adapter.auth_profile_ref
    ?? `vault://oems/${adapter.target_system.toLowerCase()}`;
  if (adapter.encryption_required) {
    return {
      storedPayload: buildEncryptedPayloadEnvelope(value, profileRef, adapter.payload_classification, maskedPayload),
      maskedPayload,
      encrypted: true,
      profileRef,
    };
  }
  return {
    storedPayload: maskedPayload,
    maskedPayload,
    encrypted: false,
    profileRef: undefined,
  };
}

function urlHostOrPath(value: string): string {
  if (value.startsWith('/')) return value;
  try {
    const parsed = new URL(value);
    return parsed.host || parsed.pathname;
  } catch (_err) {
    return value;
  }
}

function matchesAddressPattern(address: string, pattern: string): boolean {
  if (!pattern || pattern === '*') return true;
  const normalizedAddress = urlHostOrPath(address).toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  if (normalizedPattern.endsWith('*')) return normalizedAddress.startsWith(normalizedPattern.slice(0, -1));
  if (normalizedPattern.startsWith('*.')) return normalizedAddress.endsWith(normalizedPattern.slice(1));
  return normalizedAddress === normalizedPattern || address.toLowerCase() === normalizedPattern;
}

function ipv4ToInt(address: string): number | undefined {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return ((parts[0] * 256 ** 3) + (parts[1] * 256 ** 2) + (parts[2] * 256) + parts[3]) >>> 0;
}

function matchesCidr(address: string, cidr: string): boolean {
  if (cidr === '*' || cidr === '0.0.0.0/0') return true;
  if (!cidr.includes('/')) return address === cidr;
  const [range, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  const addressInt = ipv4ToInt(address);
  const rangeInt = ipv4ToInt(range);
  if (addressInt === undefined || rangeInt === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (addressInt & mask) === (rangeInt & mask);
}

function assertAdapterSecurityPolicy(adapter: OemsIntegrationAdapter, data: {
  sourceAddress?: string;
  destinationAddress?: string;
}) {
  const destination = asOptionalString(data.destinationAddress) ?? asOptionalString(adapter.endpoint_url) ?? 'internal';
  const requireTls = adapter.require_tls !== false;
  if (requireTls && /^http:\/\//i.test(destination)) {
    throw new ValidationError('ADAPTER_TRANSPORT_POLICY_BLOCKED: TLS is required for external OEMS adapters');
  }
  const allowedDestinations = normalizeStringArray(adapter.allowed_address_patterns);
  if (allowedDestinations.length > 0 && destination !== 'internal' && !allowedDestinations.some((pattern) => matchesAddressPattern(destination, pattern))) {
    throw new ValidationError(`ADAPTER_ADDRESS_FILTER_BLOCKED: destination ${destination} is not allow-listed for ${adapter.adapter_id}`);
  }
  const sourceAddress = asOptionalString(data.sourceAddress);
  const allowedSources = normalizeStringArray(adapter.allowed_source_cidrs);
  if (sourceAddress && allowedSources.length > 0 && !allowedSources.some((cidr) => matchesCidr(sourceAddress, cidr))) {
    throw new ValidationError(`ADAPTER_SOURCE_FILTER_BLOCKED: source ${sourceAddress} is not allow-listed for ${adapter.adapter_id}`);
  }
  return {
    transport: requireTls ? 'TLS_REQUIRED' : 'TLS_OPTIONAL',
    addressFiltering: allowedDestinations.length > 0 ? 'ENFORCED' : 'NOT_CONFIGURED',
    sourceFiltering: allowedSources.length > 0 ? 'ENFORCED' : 'NOT_CONFIGURED',
    destination,
    sourceAddress,
    payloadMasking: adapter.mask_log_payloads === false ? 'DISABLED' : 'ENFORCED',
    payloadEncryption: adapter.encryption_required ? 'ENFORCED' : 'NOT_REQUIRED',
    classification: adapter.payload_classification,
  };
}

async function getParameterSet(id: number): Promise<OemsParameterSet> {
  const [parameterSet] = await db.select().from(schema.oemsParameterSets)
    .where(eq(schema.oemsParameterSets.id, id))
    .limit(1);
  if (!parameterSet) throw new NotFoundError('OEMS parameter set not found');
  return parameterSet;
}

async function getNotificationTemplate(id: number): Promise<OemsNotificationTemplate> {
  const [template] = await db.select().from(schema.oemsNotificationTemplates)
    .where(eq(schema.oemsNotificationTemplates.id, id))
    .limit(1);
  if (!template) throw new NotFoundError('OEMS notification template not found');
  return template;
}

async function findActiveNotificationTemplate(eventCode: string, recipientRole?: string): Promise<OemsNotificationTemplate | null> {
  const conditions = [
    eq(schema.oemsNotificationTemplates.event_code, eventCode.trim().toUpperCase()),
    eq(schema.oemsNotificationTemplates.template_status, 'ACTIVE'),
    eq(schema.oemsNotificationTemplates.is_active, true),
    eq(schema.oemsNotificationTemplates.is_deleted, false),
  ];
  if (recipientRole?.trim()) {
    conditions.push(eq(schema.oemsNotificationTemplates.recipient_role, recipientRole.trim().toUpperCase()));
  }

  const [template] = await db.select().from(schema.oemsNotificationTemplates)
    .where(and(...conditions))
    .orderBy(desc(schema.oemsNotificationTemplates.version_no))
    .limit(1);
  return template ?? null;
}

async function getNotificationDelivery(id: number): Promise<OemsNotificationDelivery> {
  const [delivery] = await db.select().from(schema.oemsNotificationDeliveries)
    .where(eq(schema.oemsNotificationDeliveries.id, id))
    .limit(1);
  if (!delivery) throw new NotFoundError('OEMS notification delivery not found');
  return delivery;
}

async function getReportDefinition(reportCode: string): Promise<OemsReportDefinition> {
  const [report] = await db.select().from(schema.oemsReportDefinitions)
    .where(eq(schema.oemsReportDefinitions.report_code, reportCode.trim().toUpperCase()))
    .limit(1);
  if (!report) throw new NotFoundError('OEMS report definition not found');
  return report;
}

async function getExportJob(jobId: string): Promise<OemsExportJob> {
  const numericId = Number(jobId);
  const [job] = await db.select().from(schema.oemsExportJobs)
    .where(Number.isInteger(numericId)
      ? eq(schema.oemsExportJobs.id, numericId)
      : eq(schema.oemsExportJobs.export_job_id, jobId))
    .limit(1);
  if (!job) throw new NotFoundError('OEMS export job not found');
  return job;
}

async function getReportDefinitionById(reportId: number): Promise<OemsReportDefinition> {
  const [report] = await db.select().from(schema.oemsReportDefinitions)
    .where(eq(schema.oemsReportDefinitions.id, reportId))
    .limit(1);
  if (!report) throw new NotFoundError('OEMS report definition not found');
  return report;
}

async function getIntegrationAdapter(adapterIdOrTarget: string): Promise<OemsIntegrationAdapter> {
  const lookup = adapterIdOrTarget.trim().toUpperCase();
  if (!lookup) throw new ValidationError('Integration adapter ID or target system is required');

  let [adapter] = await db.select().from(schema.oemsIntegrationAdapters)
    .where(and(
      eq(schema.oemsIntegrationAdapters.adapter_id, lookup),
      eq(schema.oemsIntegrationAdapters.is_deleted, false),
    ))
    .limit(1);

  if (!adapter) {
    [adapter] = await db.select().from(schema.oemsIntegrationAdapters)
      .where(and(
        eq(schema.oemsIntegrationAdapters.target_system, lookup),
        eq(schema.oemsIntegrationAdapters.is_deleted, false),
      ))
      .orderBy(desc(schema.oemsIntegrationAdapters.created_at))
      .limit(1);
  }

  if (!adapter) throw new NotFoundError('OEMS integration adapter not found');
  return adapter;
}

async function getApprovalWorkflowByCode(workflowCode: string): Promise<OemsApprovalWorkflowDefinition> {
  const [workflow] = await db.select().from(schema.oemsApprovalWorkflowDefinitions)
    .where(and(
      eq(schema.oemsApprovalWorkflowDefinitions.workflow_code, workflowCode.trim().toUpperCase()),
      eq(schema.oemsApprovalWorkflowDefinitions.is_deleted, false),
    ))
    .limit(1);
  if (!workflow) throw new NotFoundError('OEMS approval workflow not found');
  return workflow;
}

async function getApprovalQueueItem(queueItemId: string): Promise<OemsApprovalQueueItem> {
  const [item] = await db.select().from(schema.oemsApprovalQueueItems)
    .where(and(
      eq(schema.oemsApprovalQueueItems.queue_item_id, queueItemId.trim().toUpperCase()),
      eq(schema.oemsApprovalQueueItems.is_deleted, false),
    ))
    .limit(1);
  if (!item) throw new NotFoundError('OEMS approval queue item not found');
  return item;
}

async function getReportRenderArtifact(artifactId: string): Promise<OemsReportRenderArtifact> {
  const [artifact] = await db.select().from(schema.oemsReportRenderArtifacts)
    .where(and(
      eq(schema.oemsReportRenderArtifacts.artifact_id, artifactId.trim().toUpperCase()),
      eq(schema.oemsReportRenderArtifacts.is_deleted, false),
    ))
    .limit(1);
  if (!artifact) throw new NotFoundError('OEMS report render artifact not found');
  return artifact;
}

function buildReportArtifactPayload(job: OemsExportJob, report: OemsReportDefinition, renderPayload: unknown = {}) {
  const sourceManifest = {
    reportCode: report.report_code,
    exportJobId: job.export_job_id,
    reportId: report.id,
    requestedBy: job.requested_by,
    sourceSystems: job.source_systems ?? [],
    filters: job.filters ?? {},
    executionMode: job.execution_mode,
    generatedFrom: 'oems_export_jobs',
  };
  const fileUrl = `/exports/oems/rendered/${job.export_job_id}-${report.report_code}.${job.requested_format.toLowerCase()}`;
  const hashInput = { sourceManifest, renderPayload, rowCount: job.row_count ?? 0, format: job.requested_format };

  return {
    artifactId: makeId('ART'),
    fileUrl,
    fileHash: hashOemsPayload(hashInput),
    sourceManifest,
    protectionEvidence: {
      protectedFile: job.protected_file,
      policy: job.protection_policy ?? {},
      renderer: 'OEMS_RENDERER',
      controls: job.protected_file ? ['WATERMARK', 'READ_ONLY', 'ROLE_OR_JOB_PASSWORD'] : ['CHECKSUM'],
    },
  };
}

async function getChannelSession(sessionId: string): Promise<OemsChannelSession> {
  const [session] = await db.select().from(schema.oemsChannelSessions)
    .where(eq(schema.oemsChannelSessions.session_id, sessionId))
    .limit(1);
  if (!session) throw new ValidationError('INVALID_CHANNEL_CONTEXT: microsite session not found');
  return session;
}

async function getMldTranche(id: number): Promise<OemsMldTranche> {
  const [tranche] = await db.select().from(schema.oemsMldTranches)
    .where(eq(schema.oemsMldTranches.id, id))
    .limit(1);
  if (!tranche) throw new NotFoundError('MLD tranche not found');
  return tranche;
}

async function getMldOrderDetail(orderId: string): Promise<OemsMldOrderDetail> {
  const [detail] = await db.select().from(schema.oemsMldOrderDetails)
    .where(and(
      eq(schema.oemsMldOrderDetails.order_id, orderId),
      eq(schema.oemsMldOrderDetails.is_deleted, false),
    ))
    .limit(1);
  if (!detail) throw new NotFoundError('MLD order detail not found');
  return detail;
}

async function getMfBondOrderDetail(orderId: string): Promise<OemsMfBondOrderDetail> {
  const [detail] = await db.select().from(schema.oemsMfBondOrderDetails)
    .where(and(
      eq(schema.oemsMfBondOrderDetails.order_id, orderId),
      eq(schema.oemsMfBondOrderDetails.is_deleted, false),
    ))
    .limit(1);
  if (!detail) throw new NotFoundError('MF/Bond order detail not found');
  return detail;
}

async function getFxTodayDetail(orderId: string): Promise<OemsFxTodayDetail> {
  const [detail] = await db.select().from(schema.oemsFxTodayDetails)
    .where(and(
      eq(schema.oemsFxTodayDetails.order_id, orderId),
      eq(schema.oemsFxTodayDetails.is_deleted, false),
    ))
    .limit(1);
  if (!detail) throw new NotFoundError('FX Today detail not found');
  return detail;
}

async function getFacility(facilityId: string): Promise<OemsWealthLendingFacility> {
  const [facility] = await db.select().from(schema.oemsWealthLendingFacilities)
    .where(eq(schema.oemsWealthLendingFacilities.facility_id, facilityId))
    .limit(1);
  if (!facility) throw new NotFoundError('Wealth-lending facility not found');
  return facility;
}

function resolveCutoffRule(parameterSet?: OemsParameterSet | null): OemsCutoffRule {
  if (!parameterSet) return {};

  const parameters = asRecord(parameterSet.parameters);
  const cutoff = asRecord(parameters.cutoff);
  return {
    cutoffTime: parameterSet.cutoff_time ?? asOptionalString(cutoff.cutoffTime) ?? asOptionalString(cutoff.time),
    cutoffAction: parameterSet.cutoff_action ?? asOptionalString(cutoff.cutoffAction) ?? asOptionalString(cutoff.action),
    timezone: parameterSet.product_timezone ?? asOptionalString(cutoff.timezone),
    calendarKeys: normalizeCalendarKeys(parameterSet.calendar_key, cutoff.calendarKey, cutoff.calendarKeys),
    allowCheckerRepairAfterCutoff: parameterSet.allow_checker_repair_after_cutoff
      || cutoff.allowCheckerRepairAfterCutoff === true,
  };
}

async function getActiveParameterSetForOrder(order: OemsOrder): Promise<OemsParameterSet | undefined> {
  if (order.parameter_set_id) return getParameterSet(order.parameter_set_id);
  if (!order.product_id) return undefined;

  const today = todayIso();
  const [parameterSet] = await db.select().from(schema.oemsParameterSets)
    .where(and(
      eq(schema.oemsParameterSets.product_id, order.product_id),
      eq(schema.oemsParameterSets.channel, order.channel),
      eq(schema.oemsParameterSets.parameter_status, 'ACTIVE'),
      eq(schema.oemsParameterSets.is_deleted, false),
      lte(schema.oemsParameterSets.effective_from, today),
      sql`(${schema.oemsParameterSets.effective_to} IS NULL OR ${schema.oemsParameterSets.effective_to} >= ${today})`,
    ))
    .orderBy(desc(schema.oemsParameterSets.version_no))
    .limit(1);

  return parameterSet;
}

async function getStrictCalendarEntries(calendarKeys: string[], date: string) {
  const entries = await db.select().from(schema.marketCalendar)
    .where(and(
      inArray(schema.marketCalendar.calendar_key, calendarKeys),
      eq(schema.marketCalendar.date, date),
      eq(schema.marketCalendar.is_deleted, false),
    ));
  const found = new Set(entries.map((entry: { calendar_key: string }) => entry.calendar_key));
  const missing = calendarKeys.filter((key) => !found.has(key));
  if (missing.length > 0) {
    throw new ValidationError(`CALENDAR_NOT_CONFIGURED: missing ${missing.join(', ')} for ${date}`);
  }
  return entries;
}

async function nextJointBusinessDate(calendarKeys: string[], fromDate: string): Promise<string> {
  for (let offset = 1; offset <= 370; offset += 1) {
    const candidate = addDaysIso(fromDate, offset);
    const entries = await getStrictCalendarEntries(calendarKeys, candidate);
    if (entries.every((entry: { is_business_day: boolean }) => entry.is_business_day)) return candidate;
  }
  throw new ValidationError(`CALENDAR_NOT_CONFIGURED: no joint business day found after ${fromDate}`);
}

async function evaluateOrderCutoff(
  order: OemsOrder,
  options: {
    channelTimestamp?: Date;
    checkerRepair?: boolean;
  } = {},
): Promise<OemsCutoffEvaluation> {
  const parameterSet = await getActiveParameterSetForOrder(order);
  const rule = resolveCutoffRule(parameterSet);

  if (!rule.cutoffTime) {
    return evaluateCutoffWindow({
      timezone: rule.timezone,
      calendarKeys: rule.calendarKeys,
      channelTimestamp: options.channelTimestamp,
    });
  }

  if (!rule.calendarKeys?.length) {
    throw new ValidationError('CALENDAR_NOT_CONFIGURED: cutoff-enabled parameter set must define calendar keys');
  }

  const timezone = rule.timezone?.trim() || 'Asia/Jakarta';
  const zoned = getZonedParts(options.channelTimestamp ?? new Date(), timezone);
  const currentEntries = await getStrictCalendarEntries(rule.calendarKeys, zoned.date);
  const currentDateIsBusinessDay = currentEntries.every((entry: { is_business_day: boolean }) => entry.is_business_day);
  const cutoff = parseCutoffTime(rule.cutoffTime);
  const action = normalizeCutoffAction(rule.cutoffAction);
  const localMinutes = zoned.hour * 60 + zoned.minute;
  const cutoffMinutes = cutoff.hour * 60 + cutoff.minute;
  const afterCutoff = localMinutes > cutoffMinutes || (localMinutes === cutoffMinutes && zoned.second > 0);
  const needsNextBusinessDate = action === 'NEXT_BUSINESS_DAY' && (afterCutoff || !currentDateIsBusinessDay);
  const checkerRepairNeedsNext = options.checkerRepair && rule.allowCheckerRepairAfterCutoff && !currentDateIsBusinessDay;
  const nextBusinessDate = needsNextBusinessDate || checkerRepairNeedsNext
    ? await nextJointBusinessDate(rule.calendarKeys, zoned.date)
    : undefined;

  return evaluateCutoffWindow({
    ...rule,
    channelTimestamp: options.channelTimestamp,
    currentDateIsBusinessDay,
    nextBusinessDate,
    checkerRepair: options.checkerRepair,
  });
}

async function logOemsConfigurationException(orderId: string, err: unknown, userId: string) {
  const message = err instanceof Error ? err.message : String(err);
  if (!message.includes('CALENDAR_NOT_CONFIGURED') && !message.includes('TIMEZONE_NOT_RESOLVED')) return;
	await db.insert(schema.oemsIntegrationMessages).values({
	  target_system: 'OEMS_CONFIG',
	  message_type: 'COT_EVALUATION_EXCEPTION',
	  entity_type: 'oems_order',
	  entity_id: orderId,
	  integration_status: 'FAILED',
	  payload: maskIntegrationPayload({ orderId }),
	  last_error: message,
	  created_by: userId,
	});
}

async function logOemsSecurityEvent(data: {
  sessionId: string;
  reason: string;
  userId: string;
  context?: unknown;
}) {
  await db.insert(schema.oemsIntegrationMessages).values({
    target_system: 'OEMS_SECURITY',
    message_type: 'INVALID_CHANNEL_CONTEXT',
	  entity_type: 'oems_channel_session',
	  entity_id: data.sessionId,
	  integration_status: 'FAILED',
	  payload: maskIntegrationPayload(data.context),
	  last_error: data.reason,
	  created_by: data.userId,
	});
}

async function recordOrderStatusTransition(data: {
  orderId: string;
  fromStatus?: OemsOrderStatus | null;
  toStatus: OemsOrderStatus;
  eventCode: string;
  reason?: string;
  metadata?: unknown;
  userId: string;
}) {
  return db.insert(schema.oemsOrderStatusTransitions).values({
    order_id: data.orderId,
    from_status: data.fromStatus,
    to_status: data.toStatus,
    event_code: data.eventCode,
    reason: data.reason,
    metadata: data.metadata,
    changed_by: data.userId,
    created_by: data.userId,
  }).returning();
}

async function updateOrderWithTransition(
  order: OemsOrder,
  nextStatus: OemsOrderStatus,
  values: Partial<typeof schema.oemsOrders.$inferInsert>,
  eventCode: string,
  userId: string,
  reason?: string,
  metadata?: unknown,
): Promise<OemsOrder> {
  const [updated] = await db.update(schema.oemsOrders).set({
    ...values,
    order_status: nextStatus,
    updated_by: userId,
    updated_at: new Date(),
  }).where(eq(schema.oemsOrders.order_id, order.order_id)).returning();

  if (order.order_status !== nextStatus) {
    await recordOrderStatusTransition({
      orderId: order.order_id,
      fromStatus: order.order_status,
      toStatus: nextStatus,
      eventCode,
      reason,
      metadata,
      userId,
    });
  }

  return updated;
}

function acknowledgedWarningCodes(payload: unknown): Set<string> {
  const data = asRecord(payload);
  const values = Array.isArray(data.acknowledgedWarnings) ? data.acknowledgedWarnings : [];
  return new Set(values.map((value) => String(value)));
}

function assertDigitalVerificationReady(order: OemsOrder) {
  if (!isCustomerSelfServiceChannel(order.channel)) return;
  if (!['CONFIRMED', 'MANUAL_VERIFIED'].includes(order.verification_status ?? 'PENDING')) {
    throw new ConflictError('Customer self-service order requires completed digital verification before downstream execution');
  }
}

async function persistValidationFindings(orderId: string, findings: ValidationFinding[], userId?: string) {
  const rows = findings.map((finding) => ({
    order_id: orderId,
    rule_code: finding.ruleCode,
    severity: finding.severity,
    result: finding.result,
    message: finding.message,
    source: finding.source ?? 'OEMS',
    blocking: finding.blocking ?? finding.severity === 'BLOCKING',
    created_by: userId,
  }));

  return db.insert(schema.oemsOrderValidationResults).values(rows).returning();
}

function validateProductFamily(value: string): asserts value is OemsProductFamily {
  const allowed: OemsProductFamily[] = ['ODA', 'MLD', 'MUTUAL_FUND', 'BOND', 'FX_TODAY', 'WEALTH_LENDING'];
  if (!allowed.includes(value as OemsProductFamily)) {
    throw new ValidationError(`Unsupported OEMS product family: ${value}`);
  }
}

function normalizeNotificationTemplateInput(data: OemsNotificationTemplateInput) {
  if (!data.eventCode?.trim()) throw new ValidationError('Notification event code is required');
  if (!data.recipientRole?.trim()) throw new ValidationError('Notification recipient role is required');
  if (!data.subjectTemplate?.trim()) throw new ValidationError('Notification subject template is required');
  if (!data.bodyTemplate?.trim()) throw new ValidationError('Notification body template is required');
  if (data.productFamily) validateProductFamily(data.productFamily);

  const eventCode = data.eventCode.trim().toUpperCase();
  const channel = data.channel ? normalizeNotificationChannel(data.channel) : 'IN_APP';
  const deliveryChannels = normalizeNotificationChannels(data.deliveryChannels, [channel]);
  const languageDefault = data.languageDefault?.trim() || 'en-ID';
  const localizedSubjects = normalizeLocalizedContent(data.subjectTemplate, data.localizedSubjects, languageDefault);
  const localizedBodies = normalizeLocalizedContent(data.bodyTemplate, data.localizedBodies, languageDefault);

  return {
    eventCode,
    templateCode: data.templateCode?.trim().toUpperCase() ?? `${eventCode}-${data.recipientRole.trim().toUpperCase()}`,
    channel,
    deliveryChannels,
    languageDefault,
    localizedSubjects,
    localizedBodies,
    critical: isCriticalNotification(eventCode, data.critical),
  };
}

function assertNotificationTemplateApprovable(template: OemsNotificationTemplate) {
  const channels = normalizeNotificationChannels(template.delivery_channels, [template.channel]);
  if (channels.length === 0) throw new ValidationError('Notification template requires at least one delivery channel');
  if (!hasLocaleContent(template.localized_subjects, ['en']) || !hasLocaleContent(template.localized_bodies, ['en'])) {
    throw new ValidationError('Notification template requires EN subject and body content before activation');
  }
  if (!hasLocaleContent(template.localized_subjects, ['id']) || !hasLocaleContent(template.localized_bodies, ['id'])) {
    throw new ValidationError('Notification template requires ID subject and body content before activation');
  }
}

async function recordNotificationAttempt(data: {
  deliveryId: number;
  attemptNo: number;
  channel: NotificationChannel;
  provider?: string;
  status: NotificationDeliveryStatus;
  providerMessageId?: string;
  failureReason?: string;
  responsePayload?: unknown;
}, userId: string) {
  const [attempt] = await db.insert(schema.oemsNotificationDeliveryAttempts).values({
    delivery_id: data.deliveryId,
    attempt_no: data.attemptNo,
    channel: data.channel,
    provider: data.provider ?? 'INTERNAL',
    attempt_status: data.status,
    provider_message_id: data.providerMessageId,
    failure_reason: data.failureReason,
    response_payload: data.responsePayload,
    created_by: userId,
  }).returning();
  return attempt;
}

async function logNotificationException(delivery: OemsNotificationDelivery, reason: string, userId: string) {
  await db.insert(schema.oemsIntegrationMessages).values({
    target_system: 'NOTIFICATION_GATEWAY',
    message_type: 'NOTIFICATION_EXCEPTION',
    entity_type: 'OEMS_NOTIFICATION_DELIVERY',
    entity_id: String(delivery.id),
    integration_status: 'FAILED',
    payload: {
      eventCode: delivery.event_code,
      orderId: delivery.order_id,
      channel: delivery.channel,
      deliveryGroupId: delivery.delivery_group_id,
      nonBlockingBusinessTransaction: true,
    },
    response_payload: {
      failureReason: reason,
    },
    retry_count: delivery.attempt_count,
    last_error: reason,
    created_by: userId,
  }).returning();
}

async function dispatchNotificationEventInternal(data: OemsNotificationEventInput, userId: string) {
  if (!data.eventCode?.trim()) throw new ValidationError('Notification event code is required');

  const eventCode = data.eventCode.trim().toUpperCase();
  const template = await findActiveNotificationTemplate(eventCode, data.recipientRole);
  const languageCode = data.languageCode?.trim() || template?.language_default || 'en-ID';
  const fallbackChannel = template?.channel ? [template.channel] : ['IN_APP' as NotificationChannel];
  const channels = normalizeNotificationChannels(data.channels ?? template?.delivery_channels, fallbackChannel);
  const deliveryGroupId = makeId('NTF-GRP');
  const basePayload = asRecord(data.payload);
  const critical = isCriticalNotification(eventCode, template?.critical);
  const requiresAttachment = data.attachmentRequired === true || template?.requires_attachment === true;
  const attachmentPolicy = data.attachmentPolicy ?? template?.attachment_password_policy;
  const attachmentFailure = resolveAttachmentFailure(eventCode, requiresAttachment, attachmentPolicy);
  const subjectTemplate = template
    ? selectLocalizedContent(template.localized_subjects, languageCode, template.subject_template)
    : eventCode.replace(/_/g, ' ');
  const bodyTemplate = template
    ? selectLocalizedContent(template.localized_bodies, languageCode, template.body_template)
    : eventCode.replace(/_/g, ' ');
  const renderedPayload = {
    ...basePayload,
    subject: renderTemplateText(subjectTemplate, basePayload),
    body: renderTemplateText(bodyTemplate, basePayload),
    languageCode,
    criticalNotification: critical,
    userPreferenceBypassed: critical,
    nonBlockingBusinessTransaction: true,
  };

  const deliveries: OemsNotificationDelivery[] = [];
  for (const channel of channels) {
    const providerResult = resolveProviderResult(channel, data.channelResults);
    const status = attachmentFailure ? 'FAILED' : providerResult.status;
    const failureReason = attachmentFailure ?? providerResult.failureReason;
    const now = new Date();
    const timestamps = notificationDeliveryTimestamps(status, now);

    const [delivery] = await db.insert(schema.oemsNotificationDeliveries).values({
      template_id: template?.id,
      event_code: eventCode,
      order_id: data.orderId,
      recipient_id: data.recipientId,
      recipient_type: data.recipientType ?? (['EMAIL', 'SMS', 'DBANK_PRO'].includes(channel) ? 'CUSTOMER' : 'INTERNAL'),
      recipient_address: data.recipientAddress,
      channel,
      language_code: languageCode,
      delivery_group_id: deliveryGroupId,
      delivery_status: status,
      due_at: data.dueAt,
      sent_at: timestamps.sent_at,
      delivered_at: timestamps.delivered_at,
      failed_at: timestamps.failed_at,
      attempt_count: 1,
      max_attempts: 3,
      last_attempt_at: now,
      failure_reason: failureReason,
      provider_message_id: providerResult.providerMessageId,
      exception_reason: status === 'FAILED' ? failureReason ?? 'NOTIFICATION_DELIVERY_FAILED' : undefined,
      is_critical: critical,
      business_transaction_blocking: false,
      attachment_policy: attachmentPolicy,
      operations_visible: status === 'FAILED' || failureReason !== undefined,
      payload: renderedPayload,
      created_by: userId,
    }).returning();

    await recordNotificationAttempt({
      deliveryId: delivery.id,
      attemptNo: 1,
      channel,
      provider: providerResult.provider,
      status,
      providerMessageId: providerResult.providerMessageId,
      failureReason,
      responsePayload: providerResult.responsePayload,
    }, userId);

    if (status === 'FAILED') {
      await logNotificationException(delivery, failureReason ?? 'NOTIFICATION_DELIVERY_FAILED', userId);
    }

    deliveries.push(delivery);
  }

  const deliveredCount = deliveries.filter((delivery) => delivery.delivery_status === 'DELIVERED' || delivery.delivery_status === 'SENT').length;
  const failedCount = deliveries.filter((delivery) => delivery.delivery_status === 'FAILED').length;
  const overallStatus: NotificationDeliveryStatus = failedCount > 0 && deliveredCount > 0
    ? 'PARTIALLY_DELIVERED'
    : failedCount > 0
      ? 'FAILED'
      : 'SENT';

  return {
    eventCode,
    deliveryGroupId,
    overallStatus,
    deliveredCount,
    failedCount,
    deliveries,
  };
}

// ─── Pure Allocation Functions ─────────────────────────────────────────────────

function appendDeaggLog(existing: unknown, entry: Record<string, unknown>): unknown[] {
  const log = Array.isArray(existing) ? [...existing] : [];
  log.push(entry);
  return log;
}

type AllocationRec = { id: number; nominal_amount: string | number };

export function computeProportionateAllocation(
  recs: AllocationRec[],
  executedAmount: number,
  totalNominal: number,
): { recommendationId: number; filledAmount: number; nominal: number }[] {
  const result: { recommendationId: number; filledAmount: number; nominal: number }[] = [];
  let allocated = 0;

  for (let i = 0; i < recs.length; i++) {
    const nominal = Number(recs[i].nominal_amount);
    if (i === recs.length - 1) {
      // Last order absorbs remainder to avoid rounding drift
      const filledAmount = Math.round((executedAmount - allocated) * 10000) / 10000;
      result.push({ recommendationId: recs[i].id, filledAmount: Math.max(0, filledAmount), nominal });
    } else {
      const proportion = totalNominal > 0 ? nominal / totalNominal : 0;
      const filledAmount = Math.floor(proportion * executedAmount * 10000) / 10000;
      result.push({ recommendationId: recs[i].id, filledAmount, nominal });
      allocated += filledAmount;
    }
  }
  return result;
}

export function computeFifoAllocation(
  recs: AllocationRec[],
  executedAmount: number,
): { recommendationId: number; filledAmount: number; nominal: number }[] {
  const result: { recommendationId: number; filledAmount: number; nominal: number }[] = [];
  let remaining = executedAmount;

  for (const rec of recs) {
    const nominal = Number(rec.nominal_amount);
    if (remaining <= 0) {
      result.push({ recommendationId: rec.id, filledAmount: 0, nominal });
    } else if (remaining >= nominal) {
      result.push({ recommendationId: rec.id, filledAmount: nominal, nominal });
      remaining -= nominal;
    } else {
      result.push({ recommendationId: rec.id, filledAmount: Math.round(remaining * 10000) / 10000, nominal });
      remaining = 0;
    }
  }
  return result;
}

export function computeManualAllocation(
  recs: AllocationRec[],
  executedAmount: number,
  manualAllocations: { recommendationId: number; filledAmount: number }[],
): { recommendationId: number; filledAmount: number; nominal: number }[] {
  const recMap = new Map(recs.map(r => [r.id, Number(r.nominal_amount)]));
  let totalAllocated = 0;

  for (const ma of manualAllocations) {
    if (ma.filledAmount < 0) {
      throw new ValidationError(`Negative allocation for recommendation ${ma.recommendationId}`);
    }
    const nominal = recMap.get(ma.recommendationId);
    if (nominal === undefined) {
      throw new ValidationError(`Recommendation ${ma.recommendationId} not found in group`);
    }
    if (ma.filledAmount > nominal) {
      throw new ValidationError(`Allocation ${ma.filledAmount} exceeds nominal ${nominal} for recommendation ${ma.recommendationId}`);
    }
    totalAllocated += ma.filledAmount;
  }

  if (totalAllocated > executedAmount) {
    throw new ValidationError(`Total manual allocations ${totalAllocated} exceed executed amount ${executedAmount}`);
  }

  const specifiedIds = new Set(manualAllocations.map(a => a.recommendationId));
  const result: { recommendationId: number; filledAmount: number; nominal: number }[] = [];

  for (const rec of recs) {
    const nominal = Number(rec.nominal_amount);
    const manual = manualAllocations.find(a => a.recommendationId === rec.id);
    if (manual) {
      result.push({ recommendationId: rec.id, filledAmount: manual.filledAmount, nominal });
    } else {
      result.push({ recommendationId: rec.id, filledAmount: 0, nominal });
    }
  }
  return result;
}

export const oemsService = {
  calculateOdaNominal(params: {
    nominalAmount: number;
    ratePercent: number;
    tenorDays: number;
    taxRatePercent?: number;
  }) {
    const nominalAmount = asNumber(params.nominalAmount);
    const ratePercent = asNumber(params.ratePercent);
    const tenorDays = asNumber(params.tenorDays);
    const taxRatePercent = asNumber(params.taxRatePercent);

    if (nominalAmount <= 0) throw new ValidationError('Nominal amount must be greater than zero');
    if (ratePercent < 0) throw new ValidationError('Rate cannot be negative');
    if (tenorDays <= 0) throw new ValidationError('Tenor must be greater than zero');

    const grossInterest = nominalAmount * (ratePercent / 100) * (tenorDays / 365);
    const taxAmount = grossInterest * (taxRatePercent / 100);
    const netInterest = grossInterest - taxAmount;
    return {
      nominalAmount,
      grossInterest: Number(grossInterest.toFixed(4)),
      taxAmount: Number(taxAmount.toFixed(4)),
      netInterest: Number(netInterest.toFixed(4)),
      maturityAmount: Number((nominalAmount + netInterest).toFixed(4)),
    };
  },

  calculateEligibleCollateralValue(params: { marketValue: number; haircutPercent: number }) {
    const marketValue = asNumber(params.marketValue);
    const haircutPercent = asNumber(params.haircutPercent);
    if (marketValue < 0) throw new ValidationError('Market value cannot be negative');
    if (haircutPercent < 0 || haircutPercent > 100) {
      throw new ValidationError('Haircut percent must be between 0 and 100');
    }
    return Number((marketValue * (1 - haircutPercent / 100)).toFixed(4));
  },

  calculateLtv(params: { outstandingAmount: number; eligibleCollateralValue: number }) {
    const outstandingAmount = asNumber(params.outstandingAmount);
    const eligibleCollateralValue = asNumber(params.eligibleCollateralValue);
    if (outstandingAmount < 0) throw new ValidationError('Outstanding amount cannot be negative');
    if (eligibleCollateralValue <= 0) {
      return outstandingAmount > 0 ? Number.POSITIVE_INFINITY : 0;
    }
    return Number((outstandingAmount / eligibleCollateralValue).toFixed(6));
  },

  calculateWealthLendingCureRequirement(params: {
    outstandingAmount: number;
    eligibleCollateralValue: number;
    ltvLimit: number;
    ltvWarning: number;
    curePeriodDays?: number;
  }) {
    const outstandingAmount = asNumber(params.outstandingAmount);
    const eligibleCollateralValue = asNumber(params.eligibleCollateralValue);
    const ltvLimit = asNumber(params.ltvLimit);
    const ltvWarning = asNumber(params.ltvWarning);
    if (ltvLimit <= 0) throw new ValidationError('LTV limit must be greater than zero');
    if (ltvWarning <= 0 || ltvWarning >= ltvLimit) {
      throw new ValidationError('LTV warning threshold must be greater than zero and below the LTV limit');
    }

    const currentLtv = this.calculateLtv({ outstandingAmount, eligibleCollateralValue });
    const breachLevel = currentLtv >= ltvLimit ? 'BREACH' : currentLtv >= ltvWarning ? 'WARNING' : 'NONE';
    const targetLtv = ltvWarning;
    const overdraftLimitAmount = Number((eligibleCollateralValue * ltvLimit).toFixed(4));
    const repaymentRequired = breachLevel === 'NONE'
      ? 0
      : Number(Math.max(0, outstandingAmount - (eligibleCollateralValue * targetLtv)).toFixed(4));
    const topUpRequired = breachLevel === 'NONE'
      ? 0
      : Number(Math.max(0, (outstandingAmount / targetLtv) - eligibleCollateralValue).toFixed(4));

    return {
      outstandingAmount,
      eligibleCollateralValue,
      currentLtv,
      ltvLimit,
      ltvWarning,
      targetLtv,
      overdraftLimitAmount,
      repaymentRequired,
      topUpRequired,
      breachLevel,
      cureStatus: breachLevel === 'NONE' ? 'NOT_REQUIRED' : 'OPEN',
      curePeriodDays: normalizePositiveInteger(params.curePeriodDays, 5, 90),
    };
  },

  async createProduct(data: {
    productCode: string;
    productName: string;
    productFamily: OemsProductFamily;
    currency?: string;
    riskScore?: number;
    productScore?: number;
    minSubscriptionAmount?: number;
    maxSubscriptionAmount?: number;
    tenorDays?: number;
    sourceSystem?: string;
    parameters?: unknown;
  }, userId: string) {
    validateProductFamily(data.productFamily);
    if (!data.productCode?.trim()) throw new ValidationError('Product code is required');
    if (!data.productName?.trim()) throw new ValidationError('Product name is required');

    const [product] = await db.insert(schema.oemsProducts).values({
      product_code: data.productCode.trim().toUpperCase(),
      product_name: data.productName.trim(),
      product_family: data.productFamily,
      currency: data.currency ?? 'IDR',
      risk_score: data.riskScore,
      product_score: data.productScore,
      min_subscription_amount: toMoney(data.minSubscriptionAmount),
      max_subscription_amount: toMoney(data.maxSubscriptionAmount),
      tenor_days: data.tenorDays,
      source_system: data.sourceSystem,
      parameter_json: data.parameters,
      created_by: userId,
    }).returning();
    return product;
  },

	  async listProducts(params: { productFamily?: OemsProductFamily; activeOnly?: boolean } = {}) {
	    const conditions = [eq(schema.oemsProducts.is_deleted, false)];
	    if (params.productFamily) conditions.push(eq(schema.oemsProducts.product_family, params.productFamily));
	    if (params.activeOnly) conditions.push(eq(schema.oemsProducts.is_active, true));

    return db.select().from(schema.oemsProducts)
	      .where(and(...conditions))
	      .orderBy(schema.oemsProducts.product_code);
	  },

	  async listParameterSets(params: {
	    productId?: number;
	    status?: typeof schema.oemsParameterStatusEnum.enumValues[number];
	    channel?: OemsChannel;
	  } = {}) {
	    const conditions = [eq(schema.oemsParameterSets.is_deleted, false)];
	    if (params.productId) conditions.push(eq(schema.oemsParameterSets.product_id, params.productId));
	    if (params.status) conditions.push(eq(schema.oemsParameterSets.parameter_status, params.status));
	    if (params.channel) conditions.push(eq(schema.oemsParameterSets.channel, params.channel));

	    return db.select().from(schema.oemsParameterSets)
	      .where(and(...conditions))
	      .orderBy(desc(schema.oemsParameterSets.created_at));
	  },

	  async createParameterSet(data: {
	    productId: number;
	    effectiveFrom: string;
	    effectiveTo?: string;
	    parameters: unknown;
	    versionNo?: number;
	    parameterType?: string;
	    channel?: OemsChannel;
	    productTimezone?: string;
	    calendarKey?: string;
	    cutoffTime?: string;
	    cutoffAction?: OemsCutoffAction;
	    allowCheckerRepairAfterCutoff?: boolean;
	  }, userId: string) {
	    if (!data.productId) throw new ValidationError('Product ID is required');
	    if (!data.effectiveFrom) throw new ValidationError('Effective-from date is required');
	    if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
	      throw new ValidationError('Effective-to date cannot be before effective-from date');
	    }
	    if (!data.parameters || typeof data.parameters !== 'object') {
	      throw new ValidationError('Parameter payload is required');
	    }
	    const channel = data.channel ?? 'OEMS_DIRECT';
	    validateChannel(channel);
	    if (data.cutoffTime) parseCutoffTime(data.cutoffTime);
	    if (data.cutoffAction) normalizeCutoffAction(data.cutoffAction);
	    if (data.productTimezone) getZonedParts(new Date(), data.productTimezone);

	    const [parameterSet] = await db.insert(schema.oemsParameterSets).values({
	      product_id: data.productId,
	      version_no: data.versionNo ?? 1,
	      parameter_type: data.parameterType?.trim().toUpperCase() ?? 'GENERAL',
	      channel,
	      effective_from: data.effectiveFrom,
	      effective_to: data.effectiveTo,
	      product_timezone: data.productTimezone ?? 'Asia/Jakarta',
	      calendar_key: data.calendarKey?.trim().toUpperCase(),
	      cutoff_time: data.cutoffTime,
	      cutoff_action: data.cutoffAction,
	      allow_checker_repair_after_cutoff: data.allowCheckerRepairAfterCutoff ?? false,
	      parameters: data.parameters,
	      parameter_status: 'DRAFT',
	      created_by: userId,
	    }).returning();
    return parameterSet;
  },

  async submitParameterSet(parameterSetId: number, userId: string) {
    const parameterSet = await getParameterSet(parameterSetId);
    if (!['DRAFT', 'REJECTED'].includes(parameterSet.parameter_status)) {
      throw new ConflictError(`Cannot submit parameter set in status ${parameterSet.parameter_status}`);
    }

    const [updated] = await db.update(schema.oemsParameterSets).set({
      parameter_status: 'PENDING_APPROVAL',
      submitted_by: userId,
      submitted_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsParameterSets.id, parameterSetId)).returning();
    return updated;
  },

	  async approveParameterSet(parameterSetId: number, userId: string) {
	    const parameterSet = await getParameterSet(parameterSetId);
	    if (parameterSet.parameter_status !== 'PENDING_APPROVAL') {
	      throw new ConflictError(`Cannot approve parameter set in status ${parameterSet.parameter_status}`);
	    }
	    if (parameterSet.submitted_by === userId || parameterSet.created_by === userId) {
	      throw new ConflictError('Maker cannot approve their own OEMS parameter changes');
	    }

	    const overlapEnd = parameterSet.effective_to ?? '9999-12-31';
	    const overlapping = await db.select({ id: schema.oemsParameterSets.id }).from(schema.oemsParameterSets)
	      .where(and(
	        eq(schema.oemsParameterSets.product_id, parameterSet.product_id),
	        eq(schema.oemsParameterSets.parameter_type, parameterSet.parameter_type),
	        eq(schema.oemsParameterSets.channel, parameterSet.channel),
	        eq(schema.oemsParameterSets.parameter_status, 'ACTIVE'),
	        eq(schema.oemsParameterSets.is_deleted, false),
	        sql`${schema.oemsParameterSets.id} <> ${parameterSetId}`,
	        sql`${schema.oemsParameterSets.effective_from} <= ${overlapEnd}`,
	        sql`COALESCE(${schema.oemsParameterSets.effective_to}, '9999-12-31') >= ${parameterSet.effective_from}`,
	      ))
	      .limit(1);
	    if (overlapping.length > 0) {
	      throw new ConflictError('Active parameter versions cannot overlap for the same product, type, and channel');
	    }

	    const [updated] = await db.update(schema.oemsParameterSets).set({
	      parameter_status: 'ACTIVE',
	      approved_by: userId,
      approved_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
	    }).where(eq(schema.oemsParameterSets.id, parameterSetId)).returning();
	    return updated;
	  },

	  async updateParameterSet(parameterSetId: number, data: Partial<{
	    effectiveFrom: string;
	    effectiveTo: string | null;
	    parameters: unknown;
	    parameterType: string;
	    channel: OemsChannel;
	    productTimezone: string;
	    calendarKey: string | null;
	    cutoffTime: string | null;
	    cutoffAction: OemsCutoffAction | null;
	    allowCheckerRepairAfterCutoff: boolean;
	  }>, userId: string) {
	    const parameterSet = await getParameterSet(parameterSetId);
	    if (!['DRAFT', 'REJECTED'].includes(parameterSet.parameter_status)) {
	      throw new ConflictError(`Cannot edit parameter set in status ${parameterSet.parameter_status}`);
	    }
	    if (data.channel) validateChannel(data.channel);
	    if (data.cutoffTime) parseCutoffTime(data.cutoffTime);
	    if (data.cutoffAction) normalizeCutoffAction(data.cutoffAction);
	    if (data.productTimezone) getZonedParts(new Date(), data.productTimezone);

	    const effectiveFrom = data.effectiveFrom ?? parameterSet.effective_from;
	    const effectiveTo = data.effectiveTo === undefined ? parameterSet.effective_to : data.effectiveTo;
	    if (effectiveTo && effectiveTo < effectiveFrom) {
	      throw new ValidationError('Effective-to date cannot be before effective-from date');
	    }

	    const [updated] = await db.update(schema.oemsParameterSets).set({
	      effective_from: data.effectiveFrom,
	      effective_to: data.effectiveTo,
	      parameters: data.parameters,
	      parameter_type: data.parameterType?.trim().toUpperCase(),
	      channel: data.channel,
	      product_timezone: data.productTimezone,
	      calendar_key: data.calendarKey === null ? null : data.calendarKey?.trim().toUpperCase(),
	      cutoff_time: data.cutoffTime,
	      cutoff_action: data.cutoffAction,
	      allow_checker_repair_after_cutoff: data.allowCheckerRepairAfterCutoff,
	      parameter_status: 'DRAFT',
	      rejected_reason: null,
	      review_comments: null,
	      updated_by: userId,
	      updated_at: new Date(),
	    }).where(eq(schema.oemsParameterSets.id, parameterSetId)).returning();
	    return updated;
	  },

	  async rejectParameterSet(parameterSetId: number, reason: string, userId: string) {
	    const parameterSet = await getParameterSet(parameterSetId);
	    if (parameterSet.parameter_status !== 'PENDING_APPROVAL') {
	      throw new ConflictError(`Cannot reject parameter set in status ${parameterSet.parameter_status}`);
	    }
	    if (!reason?.trim()) throw new ValidationError('Reject reason is required');

	    const [updated] = await db.update(schema.oemsParameterSets).set({
	      parameter_status: 'REJECTED',
	      rejected_reason: reason.trim(),
	      review_comments: reason.trim(),
	      approved_by: userId,
	      approved_at: new Date(),
	      updated_by: userId,
	      updated_at: new Date(),
	    }).where(eq(schema.oemsParameterSets.id, parameterSetId)).returning();
	    return updated;
	  },

	  async retireParameterSet(parameterSetId: number, reason: string | undefined, userId: string) {
	    const parameterSet = await getParameterSet(parameterSetId);
	    if (parameterSet.parameter_status !== 'ACTIVE') {
	      throw new ConflictError(`Cannot retire parameter set in status ${parameterSet.parameter_status}`);
	    }

	    const [updated] = await db.update(schema.oemsParameterSets).set({
	      parameter_status: 'RETIRED',
	      review_comments: reason?.trim(),
	      updated_by: userId,
	      updated_at: new Date(),
	    }).where(eq(schema.oemsParameterSets.id, parameterSetId)).returning();
	    return updated;
	  },

	  async createChannelSession(data: {
	    channel: OemsChannel;
	    originSystem?: string;
	    customerId?: string;
	    assistedByUserId?: string;
	    branchCode?: string;
	    relationshipContext?: unknown;
	    locale?: string;
	    deviceId?: string;
	    channelCorrelationId: string;
	    channelCustomerRef?: string;
	    redirectUrl?: string;
	    signatureHash: string;
	    ttlMinutes?: number;
	  }, userId: string) {
	    validateChannel(data.channel);
	    if (!['CRM_MICROSITE', 'DBANK_PRO_MICROSITE', 'SECURE_MICROSITE'].includes(data.channel)) {
	      throw new ValidationError('Channel sessions are only valid for secure microsite channels');
	    }
	    if (!data.channelCorrelationId?.trim()) throw new ValidationError('Channel correlation ID is required');
	    if (!data.signatureHash?.trim()) throw new ValidationError('Channel signature hash is required');
	    if (isCustomerSelfServiceChannel(data.channel) && !data.customerId?.trim()) {
	      throw new ValidationError('Customer self-service microsite session requires customer_id');
	    }
	    if (data.channel === 'CRM_MICROSITE' && (!data.assistedByUserId?.trim() || !data.branchCode?.trim())) {
	      throw new ValidationError('CRM microsite session requires assisted user and branch context');
	    }

	    const sessionId = makeId('OEMS-CHS');
	    const immutableContext = {
	      channel: data.channel,
	      originSystem: data.originSystem ?? data.channel,
	      customerId: data.customerId,
	      assistedByUserId: data.assistedByUserId,
	      branchCode: data.branchCode,
	      relationshipContext: data.relationshipContext,
	      locale: data.locale ?? 'en-ID',
	      deviceId: data.deviceId,
	      channelCorrelationId: data.channelCorrelationId,
	      channelCustomerRef: data.channelCustomerRef,
	    };

	    const [session] = await db.insert(schema.oemsChannelSessions).values({
	      session_id: sessionId,
	      channel: data.channel,
	      origin_system: data.originSystem ?? data.channel,
	      customer_id: data.customerId,
	      assisted_by_user_id: data.assistedByUserId,
	      branch_code: data.branchCode,
	      relationship_context: data.relationshipContext,
	      locale: data.locale ?? 'en-ID',
	      device_id: data.deviceId,
	      channel_correlation_id: data.channelCorrelationId,
	      channel_customer_ref: data.channelCustomerRef,
	      redirect_url: data.redirectUrl,
	      signature_hash: data.signatureHash,
	      expires_at: new Date(Date.now() + (data.ttlMinutes ?? 15) * 60 * 1000),
	      immutable_context: immutableContext,
	      created_by: userId,
	      correlation_id: data.channelCorrelationId,
	    }).returning();

	    return session;
	  },

	  async validateChannelSession(sessionId: string, data: {
	    signatureHash: string;
	    channel?: OemsChannel;
	    customerId?: string;
	    assistedByUserId?: string;
	    branchCode?: string;
	  }, userId: string) {
	    const session = await getChannelSession(sessionId);
	    const context = {
	      requestedChannel: data.channel,
	      requestedCustomerId: data.customerId,
	      requestedAssistedByUserId: data.assistedByUserId,
	      requestedBranchCode: data.branchCode,
	    };

	    if (session.session_status !== 'ACTIVE' || new Date(session.expires_at).getTime() <= Date.now()) {
	      await db.update(schema.oemsChannelSessions).set({
	        session_status: 'EXPIRED',
	        updated_by: userId,
	        updated_at: new Date(),
	      }).where(eq(schema.oemsChannelSessions.session_id, sessionId));
	      throw new ValidationError(`MICROSITE_SESSION_EXPIRED: ${session.redirect_url ?? session.origin_system}`);
	    }

	    if (!data.signatureHash || data.signatureHash !== session.signature_hash) {
	      await db.update(schema.oemsChannelSessions).set({
	        session_status: 'INVALID',
	        updated_by: userId,
	        updated_at: new Date(),
	      }).where(eq(schema.oemsChannelSessions.session_id, sessionId));
	      await logOemsSecurityEvent({
	        sessionId,
	        reason: 'INVALID_CHANNEL_CONTEXT: signature mismatch',
	        userId,
	        context,
	      });
	      throw new ValidationError('INVALID_CHANNEL_CONTEXT');
	    }

	    if (data.channel && data.channel !== session.channel) {
	      await logOemsSecurityEvent({ sessionId, reason: 'INVALID_CHANNEL_CONTEXT: channel altered', userId, context });
	      throw new ValidationError('INVALID_CHANNEL_CONTEXT');
	    }
	    if (data.customerId && session.customer_id && data.customerId !== session.customer_id) {
	      await logOemsSecurityEvent({ sessionId, reason: 'INVALID_CHANNEL_CONTEXT: customer altered', userId, context });
	      throw new ValidationError('INVALID_CHANNEL_CONTEXT');
	    }
	    if (data.assistedByUserId && session.assisted_by_user_id && data.assistedByUserId !== session.assisted_by_user_id) {
	      await logOemsSecurityEvent({ sessionId, reason: 'INVALID_CHANNEL_CONTEXT: assisted user altered', userId, context });
	      throw new ValidationError('INVALID_CHANNEL_CONTEXT');
	    }
	    if (data.branchCode && session.branch_code && data.branchCode !== session.branch_code) {
	      await logOemsSecurityEvent({ sessionId, reason: 'INVALID_CHANNEL_CONTEXT: branch altered', userId, context });
	      throw new ValidationError('INVALID_CHANNEL_CONTEXT');
	    }
	    if (session.channel === 'CRM_MICROSITE' && data.customerId && !session.customer_id) {
	      const relationship = asRecord(session.relationship_context);
	      const authorizedCustomers = normalizeCalendarKeys(
	        relationship.authorizedCustomerIds,
	        relationship.customerIds,
	        relationship.customerId,
	        relationship.assignedCustomerId,
	      );
	      if (authorizedCustomers.length === 0 || !authorizedCustomers.includes(data.customerId.toUpperCase())) {
	        await logOemsSecurityEvent({ sessionId, reason: 'INVALID_CHANNEL_CONTEXT: unauthorized CRM customer context', userId, context });
	        throw new ValidationError('INVALID_CHANNEL_CONTEXT');
	      }
	    }

	    await db.update(schema.oemsChannelSessions).set({
	      last_validated_at: new Date(),
	      updated_by: userId,
	      updated_at: new Date(),
	    }).where(eq(schema.oemsChannelSessions.session_id, sessionId));

	    return session;
	  },

	  async createOrder(data: {
    productFamily: OemsProductFamily;
    transactionType: string;
    customerId?: string;
    portfolioId?: string;
    productId?: number;
	    parameterSetId?: number;
	    sourceOrderId?: string;
	    channel?: OemsChannel;
	    assistedByUserId?: string;
	    branchCode?: string;
	    channelSessionId?: string;
	    channelSignatureHash?: string;
	    channelCustomerRef?: string;
	    currency?: string;
	    amount?: number;
	    quantity?: number;
    tenorDays?: number;
    rate?: number;
    tradeDate?: string;
    valueDate?: string;
    maturityDate?: string;
    riskProfile?: 'CONSERVATIVE' | 'MODERATE' | 'BALANCED' | 'GROWTH' | 'AGGRESSIVE';
    customerRiskScore?: number;
    productScore?: number;
    documentStatus?: 'REQUIRED' | 'PENDING_UPLOAD' | 'UPLOADED' | 'VERIFIED' | 'WAIVED' | 'REJECTED' | 'EXPIRED';
    verificationStatus?: 'NOT_REQUIRED' | 'PENDING' | 'SENT' | 'CONFIRMED' | 'FAILED' | 'MANUAL_VERIFIED' | 'EXPIRED';
    approvalTier?: string;
    assignedRole?: string;
	    customerConfirmationDeadline?: Date;
	    specialRateExpiresAt?: Date;
	    processingDate?: string;
	    externalRefs?: unknown;
	    validationSummary?: unknown;
	    payload?: unknown;
	    createdByRole?: string;
	  }, userId: string) {
	    validateProductFamily(data.productFamily);
	    let channel = data.channel ?? 'OEMS_DIRECT';
	    let customerId = data.customerId;
	    let assistedByUserId = data.assistedByUserId;
	    let branchCode = data.branchCode;
	    let channelCustomerRef = data.channelCustomerRef;
	    if (data.channelSessionId) {
	      const session = await this.validateChannelSession(data.channelSessionId, {
	        signatureHash: data.channelSignatureHash ?? '',
	        channel: data.channel,
	        customerId: data.customerId,
	        assistedByUserId: data.assistedByUserId,
	        branchCode: data.branchCode,
	      }, userId);
	      channel = session.channel;
	      customerId = session.customer_id ?? data.customerId;
	      assistedByUserId = session.assisted_by_user_id ?? data.assistedByUserId;
	      branchCode = session.branch_code ?? data.branchCode;
	      channelCustomerRef = session.channel_customer_ref ?? data.channelCustomerRef;
	    }
	    validateChannel(channel);
	    if (!data.transactionType?.trim()) throw new ValidationError('Transaction type is required');
	    if (data.amount !== undefined && asNumber(data.amount) <= 0) {
	      throw new ValidationError('Order amount must be greater than zero');
	    }
	    if (isSalesAssistedChannel(channel) && (!assistedByUserId?.trim() || !branchCode?.trim())) {
	      throw new ValidationError('Sales-assisted OEMS orders require assisted_by_user_id and branch_code');
	    }

	    const orderId = makeId('OEMS-ORD');
	    const verificationStatus = data.verificationStatus
	      ?? (isCustomerSelfServiceChannel(channel) ? 'PENDING' : 'NOT_REQUIRED');
	    const [order] = await db.insert(schema.oemsOrders).values({
	      order_id: orderId,
	      order_no: makeId('OEMS-TRN'),
      product_family: data.productFamily,
      product_id: data.productId,
      parameter_set_id: data.parameterSetId,
	      source_order_id: data.sourceOrderId,
	      customer_id: customerId,
	      portfolio_id: data.portfolioId,
	      channel,
	      assisted_by_user_id: assistedByUserId,
	      branch_code: branchCode,
	      channel_session_id: data.channelSessionId,
	      channel_customer_ref: channelCustomerRef,
	      transaction_type: data.transactionType,
	      currency: data.currency ?? 'IDR',
      amount: toMoney(data.amount),
      quantity: toMoney(data.quantity),
      tenor_days: data.tenorDays,
      rate: toRate(data.rate),
      trade_date: data.tradeDate,
      value_date: data.valueDate,
      maturity_date: data.maturityDate,
      risk_profile: data.riskProfile,
      customer_risk_score: data.customerRiskScore,
	      product_score: data.productScore,
	      document_status: data.documentStatus ?? 'REQUIRED',
	      verification_status: verificationStatus,
	      approval_tier: data.approvalTier,
	      assigned_role: data.assignedRole,
	      customer_confirmation_deadline: data.customerConfirmationDeadline,
	      special_rate_expires_at: data.specialRateExpiresAt,
	      processing_date: data.processingDate,
	      external_refs: data.externalRefs,
	      validation_summary: data.validationSummary,
	      created_by_role: data.createdByRole,
	      payload: data.payload,
	      created_by: userId,
	    }).returning();

	    await recordOrderStatusTransition({
	      orderId,
	      fromStatus: null,
	      toStatus: 'DRAFT',
	      eventCode: 'OEMS_ORDER_CREATED',
	      metadata: { productFamily: data.productFamily, channel },
	      userId,
	    });

	    return order;
	  },

  async listOrders(params: {
    productFamily?: OemsProductFamily;
    status?: string;
    customerId?: string;
    portfolioId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 100);
    const offset = (page - 1) * pageSize;
    const conditions = [eq(schema.oemsOrders.is_deleted, false)];
    if (params.productFamily) conditions.push(eq(schema.oemsOrders.product_family, params.productFamily));
    if (params.status) conditions.push(eq(schema.oemsOrders.order_status, params.status as typeof schema.oemsOrderStatusEnum.enumValues[number]));
    if (params.customerId) conditions.push(eq(schema.oemsOrders.customer_id, params.customerId));
    if (params.portfolioId) conditions.push(eq(schema.oemsOrders.portfolio_id, params.portfolioId));
    if (params.search) {
      conditions.push(sql`(${schema.oemsOrders.order_id} ILIKE ${`%${params.search}%`} OR ${schema.oemsOrders.order_no} ILIKE ${`%${params.search}%`})`);
    }

    const where = and(...conditions);
    const data = await db.select().from(schema.oemsOrders)
      .where(where)
      .orderBy(desc(schema.oemsOrders.created_at))
      .limit(pageSize)
      .offset(offset);
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(schema.oemsOrders).where(where);
    return { data, total: Number(countResult[0]?.count ?? 0), page, pageSize };
  },

	  async getOrder(orderId: string) {
	    return getOemsOrder(orderId);
	  },

	  async listOrderStatusTransitions(orderId: string) {
	    await getOemsOrder(orderId);
	    return db.select().from(schema.oemsOrderStatusTransitions)
	      .where(and(
	        eq(schema.oemsOrderStatusTransitions.order_id, orderId),
	        eq(schema.oemsOrderStatusTransitions.is_deleted, false),
	      ))
	      .orderBy(schema.oemsOrderStatusTransitions.changed_at);
	  },

	  async evaluateOrderCutoff(orderId: string, data: {
	    channelTimestamp?: string;
	    checkerRepair?: boolean;
	  } = {}) {
	    const order = await getOemsOrder(orderId);
	    try {
	      return await evaluateOrderCutoff(order, {
	        channelTimestamp: data.channelTimestamp ? new Date(data.channelTimestamp) : undefined,
	        checkerRepair: data.checkerRepair,
	      });
	    } catch (err) {
	      await logOemsConfigurationException(orderId, err, 'system');
	      throw err;
	    }
	  },

	  async acknowledgeValidationWarnings(orderId: string, ruleCodes: string[], userId: string) {
	    const order = await getOemsOrder(orderId);
	    if (!Array.isArray(ruleCodes) || ruleCodes.length === 0) {
	      throw new ValidationError('At least one validation warning code must be acknowledged');
	    }
	    const payload = asRecord(order.payload);
	    const acknowledged = new Set([
	      ...acknowledgedWarningCodes(payload),
	      ...ruleCodes.map((ruleCode) => String(ruleCode).trim()).filter(Boolean),
	    ]);
	    const [updated] = await db.update(schema.oemsOrders).set({
	      payload: {
	        ...payload,
	        acknowledgedWarnings: [...acknowledged],
	        warningsAcknowledgedAt: new Date().toISOString(),
	        warningsAcknowledgedBy: userId,
	      },
	      updated_by: userId,
	      updated_at: new Date(),
	    }).where(eq(schema.oemsOrders.order_id, orderId)).returning();
	    return updated;
	  },

	  // ── Charge Calculation Engine ───────────────────────────────────────────

	  async calculateOrderCharges(orderId: string, userId: string) {
	    const order = await getOemsOrder(orderId);
	    const amount = asNumber(order.amount);
	    const family = order.product_family;
	    const currency = order.currency ?? 'IDR';

	    // Load product pricing config if available
	    let pricing: Record<string, number | string | null> = {};
	    if (order.product_id) {
	      const [product] = await db.select().from(schema.oemsProducts).where(eq(schema.oemsProducts.id, order.product_id)).limit(1);
	      if (product?.parameter_json && typeof product.parameter_json === 'object') {
	        pricing = (((product.parameter_json as Record<string, unknown>).pricing ?? {}) as Record<string, number | string | null>);
	      }
	    }

	    type ChargeItem = {
	      charge_type: string; charge_label: string;
	      rate_type: 'PERCENTAGE' | 'FLAT' | 'PER_UNIT' | 'INFORMATIONAL';
	      rate_value: number | null; base_amount: number | null;
	      charge_amount: number; is_deducted: boolean;
	    };
	    const charges: ChargeItem[] = [];
	    let totalCharges = 0;
	    let totalTax = 0;

	    if (family === 'ODA') {
	      const rate = asNumber(order.rate);
	      const cost = calculateOdaOrderCostBeforeSwap(amount, rate);
	      charges.push({
	        charge_type: 'SWAP_COST', charge_label: 'Swap Cost (indicative)',
	        rate_type: 'INFORMATIONAL', rate_value: rate, base_amount: amount,
	        charge_amount: cost, is_deducted: false,
	      });
	    } else if (family === 'MLD') {
	      charges.push({
	        charge_type: 'MLD_INFO', charge_label: 'No upfront charges — tax deducted at maturity',
	        rate_type: 'INFORMATIONAL', rate_value: null, base_amount: amount,
	        charge_amount: 0, is_deducted: false,
	      });
	    } else if (family === 'MUTUAL_FUND') {
	      const txType = (order.transaction_type ?? '').toUpperCase();
	      if (txType.includes('SUBSCRIPTION')) {
	        const feRate = asNumber(pricing.front_end_load_pct) || 1.5;
	        const fee = Number((amount * feRate / 100).toFixed(4));
	        charges.push({
	          charge_type: 'FRONT_END_LOAD', charge_label: 'Front-End Load',
	          rate_type: 'PERCENTAGE', rate_value: feRate, base_amount: amount,
	          charge_amount: fee, is_deducted: true,
	        });
	        totalCharges += fee;
	      } else if (txType.includes('REDEMPTION')) {
	        const beRate = asNumber(pricing.back_end_load_pct) || 0.5;
	        const fee = Number((amount * beRate / 100).toFixed(4));
	        charges.push({
	          charge_type: 'BACK_END_LOAD', charge_label: 'Back-End Load',
	          rate_type: 'PERCENTAGE', rate_value: beRate, base_amount: amount,
	          charge_amount: fee, is_deducted: true,
	        });
	        totalCharges += fee;
	      } else if (txType.includes('SWITCHING')) {
	        const swRate = asNumber(pricing.switching_fee_pct) || 0.25;
	        const fee = Number((amount * swRate / 100).toFixed(4));
	        charges.push({
	          charge_type: 'SWITCHING_FEE', charge_label: 'Switching Fee',
	          rate_type: 'PERCENTAGE', rate_value: swRate, base_amount: amount,
	          charge_amount: fee, is_deducted: true,
	        });
	        totalCharges += fee;
	      }
	    } else if (family === 'BOND') {
	      // Brokerage commission
	      const commRate = asNumber(pricing.brokerage_commission_pct) || 0.25;
	      const commission = Number((amount * commRate / 100).toFixed(4));
	      charges.push({
	        charge_type: 'BROKERAGE_COMMISSION', charge_label: 'Brokerage Commission',
	        rate_type: 'PERCENTAGE', rate_value: commRate, base_amount: amount,
	        charge_amount: commission, is_deducted: true,
	      });
	      totalCharges += commission;

	      // Documentary Stamp Tax (PHP 1.50 per PHP 200)
	      const dst = Number((Math.ceil(amount / 200) * 1.5).toFixed(4));
	      charges.push({
	        charge_type: 'DST', charge_label: 'Documentary Stamp Tax',
	        rate_type: 'PER_UNIT', rate_value: 1.5, base_amount: amount,
	        charge_amount: dst, is_deducted: true,
	      });
	      totalTax += dst;
	    } else if (family === 'FX_TODAY') {
	      charges.push({
	        charge_type: 'FX_SPREAD', charge_label: 'Spread built into rate — no separate charge',
	        rate_type: 'INFORMATIONAL', rate_value: null, base_amount: amount,
	        charge_amount: 0, is_deducted: false,
	      });
	    } else if (family === 'WEALTH_LENDING') {
	      const facilityRate = asNumber(pricing.facility_fee_pct) || 0.5;
	      const facilityFee = Number((amount * facilityRate / 100).toFixed(4));
	      charges.push({
	        charge_type: 'FACILITY_FEE', charge_label: 'Facility Fee',
	        rate_type: 'PERCENTAGE', rate_value: facilityRate, base_amount: amount,
	        charge_amount: facilityFee, is_deducted: true,
	      });
	      totalCharges += facilityFee;

	      const processingFee = asNumber(pricing.processing_fee) || 5000;
	      charges.push({
	        charge_type: 'PROCESSING_FEE', charge_label: 'Processing Fee',
	        rate_type: 'FLAT', rate_value: processingFee, base_amount: null,
	        charge_amount: processingFee, is_deducted: true,
	      });
	      totalCharges += processingFee;
	    }

	    // Settlement date: T+0 (ODA/FX), T+1 (MLD), T+2 (MF), T+3 (Bond)
	    const settDays: Record<string, number> = { ODA: 0, FX_TODAY: 0, MLD: 1, MUTUAL_FUND: 2, BOND: 3, WEALTH_LENDING: 1 };
	    const baseDate = order.trade_date ? new Date(order.trade_date) : new Date();
	    const settDate = new Date(baseDate);
	    settDate.setDate(settDate.getDate() + (settDays[family] ?? 2));
	    const indicativeSettlementDate = settDate.toISOString().slice(0, 10);

	    const grossAmount = amount;
	    const netAmount = grossAmount - totalCharges;
	    const settlementAmount = netAmount - totalTax;

	    // Persist charges (replace previous)
	    await db.delete(schema.oemsOrderCharges).where(eq(schema.oemsOrderCharges.order_id, orderId));
	    if (charges.length > 0) {
	      await db.insert(schema.oemsOrderCharges).values(
	        charges.map((c) => ({
	          order_id: orderId,
	          charge_type: c.charge_type,
	          charge_label: c.charge_label,
	          rate_type: c.rate_type,
	          rate_value: c.rate_value != null ? String(c.rate_value) : undefined,
	          base_amount: c.base_amount != null ? String(c.base_amount) : undefined,
	          charge_amount: String(c.charge_amount),
	          currency,
	          is_deducted: c.is_deducted,
	          created_by: userId,
	        })),
	      );
	    }

	    // Update order summary columns
	    await db.update(schema.oemsOrders).set({
	      gross_amount: String(grossAmount),
	      total_charges: String(totalCharges),
	      total_tax: String(totalTax),
	      net_amount: String(netAmount),
	      settlement_amount: String(settlementAmount),
	      indicative_settlement_date: indicativeSettlementDate,
	      updated_by: userId,
	      updated_at: new Date(),
	    }).where(eq(schema.oemsOrders.order_id, orderId));

	    return {
	      orderId,
	      grossAmount,
	      totalCharges,
	      totalTax,
	      netAmount,
	      settlementAmount,
	      indicativeSettlementDate,
	      currency,
	      charges,
	    };
	  },

	  async getOrderCharges(orderId: string) {
	    await getOemsOrder(orderId); // verify order exists
	    const rows = await db.select().from(schema.oemsOrderCharges)
	      .where(eq(schema.oemsOrderCharges.order_id, orderId))
	      .orderBy(schema.oemsOrderCharges.id);
	    return rows;
	  },

	  async validateOrder(orderId: string, userId?: string) {
	    const order = await getOemsOrder(orderId);
	    const findings: ValidationFinding[] = [];
	    const amount = asNumber(order.amount);
	    const productScore = asNumber(order.product_score);
	    const customerRiskScore = asNumber(order.customer_risk_score);
	    const payload = asRecord(order.payload);

	    if (amount <= 0) {
	      findings.push({
        ruleCode: 'OEMS-AMOUNT-001',
        severity: 'BLOCKING',
        result: 'FAIL',
	        message: 'Order amount must be greater than zero.',
	      });
	    }

	    if (isSalesAssistedChannel(order.channel) && (!order.assisted_by_user_id || !order.branch_code)) {
	      findings.push({
	        ruleCode: 'OEMS-CHANNEL-SALES-001',
	        severity: 'BLOCKING',
	        result: 'FAIL',
	        source: 'OEMS_CHANNEL',
	        message: 'Sales-assisted orders require assisted_by_user_id and branch_code.',
	      });
	    }

	    if (isCustomerSelfServiceChannel(order.channel)
	      && !['CONFIRMED', 'MANUAL_VERIFIED'].includes(order.verification_status ?? 'PENDING')) {
	      findings.push({
	        ruleCode: 'OEMS-CHANNEL-VERIFY-001',
	        severity: 'WARNING',
	        result: 'WARN',
	        source: 'DIGITAL_VERIFICATION',
	        message: 'Customer self-service order requires digital verification before downstream execution.',
	        blocking: false,
	        acknowledgementRequired: false,
	      });
	    }

    if (productScore > 0 && customerRiskScore > 0 && productScore > customerRiskScore) {
      findings.push({
        ruleCode: 'OEMS-SUITABILITY-001',
        severity: 'BLOCKING',
        result: 'FAIL',
        message: 'Product score exceeds the customer risk score.',
      });
    }

    if (order.customer_id && ['MLD', 'MUTUAL_FUND', 'BOND', 'WEALTH_LENDING'].includes(order.product_family)) {
      const riskProfileValidation = await this.validateRiskProfileForOrder(orderId);
      findings.push(...riskProfileValidation.findings);
    }

    if (order.document_status && ['REQUIRED', 'PENDING_UPLOAD', 'REJECTED', 'EXPIRED'].includes(order.document_status)) {
      findings.push({
        ruleCode: 'OEMS-DOC-001',
        severity: 'WARNING',
        result: 'WARN',
	        message: 'Required order documents are not fully verified.',
	        blocking: false,
	        acknowledgementRequired: true,
	      });
	    }

	    const externalValidation = asRecord(payload.externalValidation);
	    const pendingExternal = [
	      ...normalizeCalendarKeys(externalValidation.pendingChecks),
	      ...normalizeCalendarKeys(externalValidation.unavailableSources),
	    ];
	    if (pendingExternal.length > 0) {
	      findings.push({
	        ruleCode: 'OEMS-EXT-VALIDATION-PENDING',
	        severity: 'WARNING',
	        result: 'WARN',
	        source: 'EXTERNAL_VALIDATION',
	        message: `External validation is unavailable or pending for: ${pendingExternal.join(', ')}.`,
	        blocking: false,
	        acknowledgementRequired: false,
	      });
	    }

	    // ── Universal product-level checks ──────────────────────────────────
    if (order.product_id) {
      const [product] = await db.select().from(schema.oemsProducts).where(eq(schema.oemsProducts.id, order.product_id)).limit(1);
      if (product) {
        const minSub = asNumber(product.min_subscription_amount);
        if (minSub > 0 && amount > 0 && amount < minSub) {
          findings.push({ ruleCode: 'OEMS-AMT-002', severity: 'BLOCKING', result: 'FAIL', source: 'PRODUCT_LIMITS', message: `Amount is below minimum subscription of ${minSub}.` });
        }
        const maxSub = asNumber(product.max_subscription_amount);
        if (maxSub > 0 && amount > maxSub) {
          findings.push({ ruleCode: 'OEMS-AMT-003', severity: 'BLOCKING', result: 'FAIL', source: 'PRODUCT_LIMITS', message: `Amount exceeds maximum subscription of ${maxSub}.` });
        }
      }
    }

    // Portfolio active check
    if (order.portfolio_id) {
      const [portfolio] = await db.select().from(schema.portfolios).where(eq(schema.portfolios.portfolio_id, order.portfolio_id)).limit(1);
      if (portfolio && (portfolio as any).status && !['ACTIVE', 'OPEN'].includes(String((portfolio as any).status).toUpperCase())) {
        findings.push({ ruleCode: 'OEMS-ACCT-001', severity: 'BLOCKING', result: 'FAIL', source: 'ACCOUNT', message: 'Portfolio is not active.' });
      }
    }

    // Duplicate order check (same customer+product+amount in last 5 min)
    if (order.customer_id && order.product_id && amount > 0) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const dupes = await db.select({ order_id: schema.oemsOrders.order_id }).from(schema.oemsOrders).where(
        and(
          eq(schema.oemsOrders.customer_id, order.customer_id),
          eq(schema.oemsOrders.product_id, order.product_id),
          eq(schema.oemsOrders.amount, String(amount)),
          gte(schema.oemsOrders.created_at, fiveMinAgo),
          sql`${schema.oemsOrders.order_id} != ${orderId}`,
        ),
      ).limit(1);
      if (dupes.length > 0) {
        findings.push({ ruleCode: 'OEMS-DUP-001', severity: 'WARNING', result: 'WARN', source: 'DUPLICATE_CHECK', message: 'Possible duplicate — same customer, product, and amount within last 5 minutes.', acknowledgementRequired: true });
      }
    }

    // ── ODA-specific ───────────────────────────────────────────────────
    if (order.product_family === 'ODA') {
      if (!order.tenor_days || order.tenor_days <= 0) {
        findings.push({ ruleCode: 'OEMS-ODA-TNR-001', severity: 'BLOCKING', result: 'FAIL', message: 'ODA tenor must be captured before submission.' });
      }
      if (asNumber(order.rate) <= 0) {
        findings.push({ ruleCode: 'OEMS-ODA-RATE-001', severity: 'BLOCKING', result: 'FAIL', message: 'ODA rate must be greater than zero.' });
      }
      // COT check
      if (order.product_id) {
        const [prod] = await db.select({ cutoff_intraday: schema.oemsProducts.cutoff_intraday, cutoff_timezone: schema.oemsProducts.cutoff_timezone }).from(schema.oemsProducts).where(eq(schema.oemsProducts.id, order.product_id)).limit(1);
        if (prod?.cutoff_intraday) {
          const now = new Date();
          const [hh, mm] = prod.cutoff_intraday.split(':').map(Number);
          const cutoff = new Date(now); cutoff.setHours(hh, mm, 0, 0);
          if (now > cutoff) {
            findings.push({ ruleCode: 'OEMS-ODA-COT-001', severity: 'WARNING', result: 'WARN', source: 'CUTOFF', message: `Order placed after intraday cutoff (${prod.cutoff_intraday}).`, acknowledgementRequired: true });
          }
        }
      }
    }

    // ── MLD-specific ───────────────────────────────────────────────────
    if (order.product_family === 'MLD') {
      const payload = asRecord(order.payload);
      const trancheId = payload.trancheId ?? payload.tranche_id;
      if (trancheId) {
        const [tranche] = await db.select().from(schema.oemsMldTranches).where(eq(schema.oemsMldTranches.id, Number(trancheId))).limit(1);
        if (tranche) {
          if (tranche.lifecycle !== 'OFFERING') {
            findings.push({ ruleCode: 'OEMS-MLD-OFR-001', severity: 'BLOCKING', result: 'FAIL', source: 'MLD_TRANCHE', message: 'MLD tranche is not in offering period.' });
          }
          const minInvestment = asNumber(tranche.min_investment);
          if (minInvestment > 0 && amount < minInvestment) {
            findings.push({ ruleCode: 'OEMS-MLD-MIN-001', severity: 'BLOCKING', result: 'FAIL', source: 'MLD_TRANCHE', message: `Amount is below tranche minimum investment of ${minInvestment}.` });
          }
        }
      }
    }

    // ── MF-specific ────────────────────────────────────────────────────
    if (order.product_family === 'MUTUAL_FUND') {
      const txType = (order.transaction_type ?? '').toUpperCase();
      if (txType.includes('REDEMPTION') && order.portfolio_id && order.product_id) {
        const [prod] = await db.select({ product_code: schema.oemsProducts.product_code }).from(schema.oemsProducts).where(eq(schema.oemsProducts.id, order.product_id)).limit(1);
        if (prod) {
          const holdings = await db.select({ holding_amount: schema.oemsPortfolioHoldings.holding_amount }).from(schema.oemsPortfolioHoldings).where(
            and(eq(schema.oemsPortfolioHoldings.portfolio_id, order.portfolio_id), eq(schema.oemsPortfolioHoldings.product_code, prod.product_code)),
          ).limit(1);
          const heldAmount = holdings.length > 0 ? asNumber(holdings[0].holding_amount) : 0;
          const qty = asNumber(order.quantity);
          if (qty > 0 && heldAmount > 0 && qty > heldAmount) {
            findings.push({ ruleCode: 'OEMS-MF-HOLD-001', severity: 'BLOCKING', result: 'FAIL', source: 'HOLDINGS', message: `Insufficient holdings for redemption (held: ${heldAmount}, requested: ${qty}).` });
          }
        }
      }
    }

    // ── Bond-specific ──────────────────────────────────────────────────
    if (order.product_family === 'BOND') {
      const rate = asNumber(order.rate);
      if (rate > 0 && (rate < 0.01 || rate > 200)) {
        findings.push({ ruleCode: 'OEMS-BOND-PRC-001', severity: 'WARNING', result: 'WARN', source: 'PRICING', message: `Bond rate/price (${rate}) may be outside acceptable range.`, acknowledgementRequired: true });
      }
    }

    // ── FX Today-specific ──────────────────────────────────────────────
    if (order.product_family === 'FX_TODAY') {
      if (order.special_rate_expires_at && new Date(order.special_rate_expires_at).getTime() < Date.now()) {
        findings.push({ ruleCode: 'OEMS-FX-RATE-001', severity: 'BLOCKING', result: 'FAIL', message: 'Special-rate quote has expired.' });
      }
      if (!['CONFIRMED', 'MANUAL_VERIFIED', 'NOT_REQUIRED'].includes(order.verification_status ?? 'PENDING')) {
        findings.push({ ruleCode: 'OEMS-FX-VERIFY-001', severity: 'BLOCKING', result: 'FAIL', message: 'FX Today customer confirmation or manual verification is pending.' });
      }
      // USD 100k underlying doc requirement
      if (amount > 100000) {
        const docsOk = order.document_status && ['UPLOADED', 'SIGNED', 'VERIFIED'].includes(order.document_status);
        if (!docsOk) {
          findings.push({ ruleCode: 'OEMS-FX-DOC-001', severity: 'WARNING', result: 'WARN', source: 'FX_DOC', message: 'Underlying document required for FX amount > USD 100k equivalent.', acknowledgementRequired: true });
        }
      }
    }

    // ── Wealth Lending-specific ────────────────────────────────────────
    if (order.product_family === 'WEALTH_LENDING') {
      const payload = asRecord(order.payload);
      const facilityId = payload.facilityId ?? payload.facility_id;
      if (facilityId) {
        const [facility] = await db.select({ facility_status: schema.oemsWealthLendingFacilities.facility_status }).from(schema.oemsWealthLendingFacilities).where(eq(schema.oemsWealthLendingFacilities.facility_id, String(facilityId))).limit(1);
        if (facility && facility.facility_status !== 'ACTIVE') {
          findings.push({ ruleCode: 'OEMS-WL-FAC-001', severity: 'BLOCKING', result: 'FAIL', source: 'FACILITY', message: `Lending facility is ${facility.facility_status}, not ACTIVE.` });
        }
      }
    }

    if (findings.length === 0) {
      findings.push({
        ruleCode: 'OEMS-GENERAL-PASS',
        severity: 'INFO',
        result: 'PASS',
        message: 'Order passed configured OEMS validations.',
        blocking: false,
      });
    }

	    const persisted = await persistValidationFindings(orderId, findings, userId);
	    const hasBlocking = findings.some((finding) => finding.severity === 'BLOCKING' || finding.blocking);
	    const hasExternalPending = findings.some((finding) => finding.ruleCode === 'OEMS-EXT-VALIDATION-PENDING');
	    const nextStatus: OemsOrderStatus = hasBlocking
	      ? 'VALIDATION_FAILED'
	      : hasExternalPending
	        ? 'VALIDATION_PENDING_EXTERNAL'
	        : order.order_status === 'VALIDATION_PENDING_EXTERNAL'
	          ? 'DRAFT'
	          : order.order_status;
	    const validationSummary = {
	      evaluatedAt: new Date().toISOString(),
	      hasBlocking,
	      hasExternalPending,
	      warningCount: findings.filter((finding) => finding.result === 'WARN').length,
	      failCount: findings.filter((finding) => finding.result === 'FAIL').length,
	      pendingExternalChecks: pendingExternal,
	    };

	    await updateOrderWithTransition(
	      order,
	      nextStatus,
	      {
	        suitability_result: hasBlocking ? 'FAIL' : findings.some((finding) => finding.result === 'WARN') ? 'WARN' : 'PASS',
	        validation_summary: validationSummary,
	      },
	      hasExternalPending ? 'OEMS_EXTERNAL_VALIDATION_PENDING' : hasBlocking ? 'OEMS_VALIDATION_FAILED' : 'OEMS_VALIDATED',
	      userId ?? 'system',
	      undefined,
	      validationSummary,
	    );

	    return {
	      orderId,
	      hasBlocking,
	      hasExternalPending,
	      warningCodesRequiringAcknowledgement: findings
	        .filter((finding) => finding.result === 'WARN' && finding.acknowledgementRequired !== false)
	        .map((finding) => finding.ruleCode),
	      findings: persisted,
	    };
	  },

	  async submitOrder(orderId: string, userId: string) {
	    const order = await getOemsOrder(orderId);
	    if (!['DRAFT', 'VALIDATION_FAILED', 'VALIDATION_PENDING_EXTERNAL', 'PENDING_DOCUMENTS', 'PENDING_CUSTOMER_CONFIRMATION', 'PENDING_CUSTOMER_VERIFICATION'].includes(order.order_status)) {
	      throw new ConflictError(`Cannot submit OEMS order in status ${order.order_status}`);
	    }

	    const validation = await this.validateOrder(orderId, userId);
	    if (validation.hasBlocking) {
	      throw new ValidationError('OEMS order has blocking validation findings');
	    }
	    if (validation.hasExternalPending) {
	      throw new ConflictError('OEMS order is waiting for external validation before submission');
	    }

	    const acknowledged = acknowledgedWarningCodes(order.payload);
	    const unacknowledgedWarnings = validation.warningCodesRequiringAcknowledgement
	      .filter((ruleCode) => !acknowledged.has(ruleCode));
	    if (unacknowledgedWarnings.length > 0) {
	      throw new ValidationError(`OEMS order has warning findings requiring acknowledgement: ${unacknowledgedWarnings.join(', ')}`);
	    }

	    await this.generateDocumentChecklist(orderId, userId);
	    await this.assertDocumentChecklistReady(orderId, 'SUBMISSION');

	    let cutoffEvaluation: OemsCutoffEvaluation;
	    try {
	      cutoffEvaluation = await evaluateOrderCutoff(order);
	    } catch (err) {
	      await logOemsConfigurationException(orderId, err, userId);
	      throw err;
	    }
	    if (!cutoffEvaluation.allowed) {
	      throw new ConflictError(cutoffEvaluation.reason ?? 'OEMS order cannot be submitted after configured COT');
	    }

	    let nextStatus: typeof schema.oemsOrderStatusEnum.enumValues[number] = 'PENDING_APPROVAL';
	    if (order.document_status && ['REQUIRED', 'PENDING_UPLOAD', 'REJECTED', 'EXPIRED'].includes(order.document_status)) {
      nextStatus = 'PENDING_DOCUMENTS';
    } else if (order.verification_status && !['CONFIRMED', 'MANUAL_VERIFIED', 'NOT_REQUIRED'].includes(order.verification_status)) {
      nextStatus = 'PENDING_CUSTOMER_VERIFICATION';
    }

	    const updated = await updateOrderWithTransition(
	      order,
	      nextStatus,
	      {
	        submitted_at: new Date(),
	        processing_date: cutoffEvaluation.processingDate,
	        cot_evaluation: cutoffEvaluation,
	      },
	      'OEMS_ORDER_SUBMITTED',
	      userId,
	      undefined,
	      cutoffEvaluation,
	    );

    await this.queueNotification({
      eventCode: `OEMS_${updated.product_family}_${nextStatus}`,
      orderId,
      recipientId: updated.assigned_role ?? 'BO_CHECKER',
      payload: { orderId, status: nextStatus },
    }, userId);

    return updated;
  },

  async amendOrder(orderId: string, data: Partial<{
    amount: number;
    quantity: number;
    tenorDays: number;
    rate: number;
    tradeDate: string;
    valueDate: string;
    maturityDate: string;
    payload: unknown;
	    documentStatus: typeof schema.oemsDocumentStatusEnum.enumValues[number];
	    verificationStatus: typeof schema.oemsVerificationStatusEnum.enumValues[number];
	    checkerRepair: boolean;
	  }>, userId: string) {
	    const order = await getOemsOrder(orderId);
	    const editable = ['DRAFT', 'VALIDATION_FAILED', 'PENDING_DOCUMENTS', 'PENDING_CUSTOMER_CONFIRMATION', 'PENDING_CUSTOMER_VERIFICATION', 'PENDING_APPROVAL'];
	    if (!editable.includes(order.order_status)) {
	      throw new ConflictError(`Cannot amend OEMS order in status ${order.order_status}`);
	    }
	    let cutoffEvaluation: OemsCutoffEvaluation;
	    try {
	      cutoffEvaluation = await evaluateOrderCutoff(order, { checkerRepair: data.checkerRepair });
	    } catch (err) {
	      await logOemsConfigurationException(orderId, err, userId);
	      throw err;
	    }
	    if (!cutoffEvaluation.allowed) {
	      throw new ConflictError(cutoffEvaluation.reason ?? 'OEMS order cannot be amended after configured COT');
	    }
	    const payloadSensitiveChange = [
	      data.amount,
	      data.quantity,
	      data.tenorDays,
	      data.rate,
	      data.tradeDate,
	      data.valueDate,
	      data.maturityDate,
	      data.payload,
	    ].some((value) => value !== undefined);

	    const [updated] = await db.update(schema.oemsOrders).set({
	      amount: toMoney(data.amount),
      quantity: toMoney(data.quantity),
      tenor_days: data.tenorDays,
      rate: toRate(data.rate),
      trade_date: data.tradeDate,
      value_date: data.valueDate,
      maturity_date: data.maturityDate,
      payload: data.payload,
	      document_status: data.documentStatus,
	      verification_status: data.verificationStatus,
	      processing_date: cutoffEvaluation.processingDate,
	      cot_evaluation: cutoffEvaluation,
	      updated_by: userId,
	      updated_at: new Date(),
	    }).where(eq(schema.oemsOrders.order_id, orderId)).returning();
	    if (payloadSensitiveChange && ['PENDING', 'SENT', 'CONFIRMED', 'MANUAL_VERIFIED'].includes(order.verification_status ?? 'NOT_REQUIRED')) {
	      await this.invalidateDigitalVerification(
	        orderId,
	        'A verified payload cannot be modified without invalidating the verification and requiring re-verification',
	        userId,
	      );
	      return getOemsOrder(orderId);
	    }
    return updated;
  },

	  async cancelOrder(orderId: string, reason: string, userId: string, options: { checkerRepair?: boolean } = {}) {
	    const order = await getOemsOrder(orderId);
	    if (['EXECUTED', 'BOOKED', 'SETTLED', 'MATURED'].includes(order.order_status)) {
	      throw new ConflictError(`Cannot cancel OEMS order in status ${order.order_status}`);
	    }
	    let cutoffEvaluation: OemsCutoffEvaluation;
	    try {
	      cutoffEvaluation = await evaluateOrderCutoff(order, { checkerRepair: options.checkerRepair });
	    } catch (err) {
	      await logOemsConfigurationException(orderId, err, userId);
	      throw err;
	    }
	    if (!cutoffEvaluation.allowed) {
	      throw new ConflictError(cutoffEvaluation.reason ?? 'OEMS order cannot be cancelled after configured COT');
	    }

	    const payload = {
	      ...(order.payload as Record<string, unknown> | null ?? {}),
	      cancellationReason: reason,
	      cancellationCotEvaluation: cutoffEvaluation,
	    };
	    return updateOrderWithTransition(
	      order,
	      'CANCELLED',
	      {
	        cancelled_at: new Date(),
	        payload,
	        processing_date: cutoffEvaluation.processingDate,
	        cot_evaluation: cutoffEvaluation,
	      },
	      'OEMS_ORDER_CANCELLED',
	      userId,
	      reason,
	      cutoffEvaluation,
	    );
	  },

  async createDocumentChecklistRule(data: {
    ruleCode: string;
    productFamily?: OemsProductFamily;
    transactionType?: string;
    channel?: OemsChannel;
    documentType: string;
    requirementType?: string;
    conditionJson?: unknown;
    blockingStage?: string;
    templateCode?: string;
    templateVersion?: number;
    renewalDays?: number;
    dmsRequired?: boolean;
    ncbsRequired?: boolean;
  }, userId: string) {
    if (!data.ruleCode?.trim()) throw new ValidationError('Document checklist rule code is required');
    if (!data.documentType?.trim()) throw new ValidationError('Document type is required');
    if (data.productFamily) validateProductFamily(data.productFamily);
    if (data.channel) validateChannel(data.channel);

    const [rule] = await db.insert(schema.oemsDocumentChecklistRules).values({
      rule_code: data.ruleCode.trim().toUpperCase(),
      product_family: data.productFamily,
      transaction_type: data.transactionType?.trim().toUpperCase(),
      channel: data.channel,
      document_type: data.documentType.trim().toUpperCase(),
      requirement_type: normalizeDocumentRequirement(data.requirementType),
      condition_json: data.conditionJson ?? {},
      blocking_stage: normalizeDocumentBlockingStage(data.blockingStage),
      template_code: data.templateCode?.trim().toUpperCase(),
      template_version: normalizePositiveInteger(data.templateVersion, 1, 10),
      renewal_days: data.renewalDays,
      dms_required: data.dmsRequired ?? true,
      ncbs_required: data.ncbsRequired ?? false,
      created_by: userId,
    }).returning();
    return rule;
  },

  async listDocumentChecklistRules(params: {
    productFamily?: OemsProductFamily;
    transactionType?: string;
    channel?: OemsChannel;
    activeOnly?: boolean;
  } = {}): Promise<OemsDocumentChecklistRule[]> {
    const conditions = [eq(schema.oemsDocumentChecklistRules.is_deleted, false)];
    if (params.activeOnly !== false) conditions.push(eq(schema.oemsDocumentChecklistRules.is_active, true));
    if (params.productFamily) conditions.push(eq(schema.oemsDocumentChecklistRules.product_family, params.productFamily));
    if (params.transactionType) conditions.push(eq(schema.oemsDocumentChecklistRules.transaction_type, params.transactionType.trim().toUpperCase()));
    if (params.channel) conditions.push(eq(schema.oemsDocumentChecklistRules.channel, params.channel));
    return db.select().from(schema.oemsDocumentChecklistRules)
      .where(and(...conditions))
      .orderBy(schema.oemsDocumentChecklistRules.document_type);
  },

  async listDocuments(orderId: string): Promise<OemsDocumentRegistration[]> {
    await getOemsOrder(orderId);
    return db.select().from(schema.oemsDocumentRegistrations)
      .where(and(
        eq(schema.oemsDocumentRegistrations.order_id, orderId),
        eq(schema.oemsDocumentRegistrations.is_deleted, false),
      ))
      .orderBy(schema.oemsDocumentRegistrations.document_type, desc(schema.oemsDocumentRegistrations.created_at));
  },

  async generateDocumentChecklist(orderId: string, userId: string) {
    const order = await getOemsOrder(orderId);
    const rules: OemsDocumentChecklistRule[] = await this.listDocumentChecklistRules({
      productFamily: order.product_family,
      transactionType: order.transaction_type,
      channel: order.channel,
      activeOnly: true,
    });
    const applicableRules = rules.filter((rule) => checklistRuleApplies(rule, order));
    const existing: OemsDocumentRegistration[] = await this.listDocuments(orderId);
    const existingKeys = new Set(existing.map((document) => `${document.checklist_rule_id ?? 'NONE'}:${document.document_type}`));
    const created: OemsDocumentRegistration[] = [];

    for (const rule of applicableRules) {
      const key = `${rule.id}:${rule.document_type}`;
      if (existingKeys.has(key)) continue;
      const expiresAt = rule.renewal_days
        ? new Date(Date.now() + rule.renewal_days * 24 * 60 * 60 * 1000)
        : undefined;
      const [document] = await db.insert(schema.oemsDocumentRegistrations).values({
        document_id: makeId('DOC'),
        order_id: orderId,
        customer_id: order.customer_id,
        portfolio_id: order.portfolio_id,
        product_family: order.product_family,
        checklist_rule_id: rule.id,
        document_type: rule.document_type,
        document_status: rule.requirement_type === 'OPTIONAL' ? 'PENDING_UPLOAD' : 'MISSING',
        requirement_type: rule.requirement_type,
        required: rule.requirement_type !== 'OPTIONAL',
        blocking_stage: rule.blocking_stage,
        template_code: rule.template_code,
        template_version: rule.template_version,
        expires_at: expiresAt,
        metadata: { generatedFromRule: rule.rule_code, dmsRequired: rule.dms_required, ncbsRequired: rule.ncbs_required },
        evidence: { checklistGeneratedAt: new Date().toISOString() },
        created_by: userId,
      }).returning();
      created.push(document);
    }

    const documents = [...existing, ...created];
    const blocking = documents.filter((document) => documentBlocksStage(document, 'SUBMISSION'));
    return {
      orderId,
      generatedCount: created.length,
      documents,
      blockingDocuments: blocking,
      readyForSubmission: blocking.length === 0,
    };
  },

  async getDocumentChecklist(orderId: string) {
    const order = await getOemsOrder(orderId);
    const documents: OemsDocumentRegistration[] = await this.listDocuments(orderId);
    const normalizedDocuments = documents.map((document) => {
      const expired = document.expires_at && new Date(document.expires_at).getTime() <= Date.now();
      return {
        ...document,
        document_status: expired && !['EXPIRED', 'QUARANTINED'].includes(document.document_status)
          ? 'EXPIRED'
          : document.document_status,
        renewal_required: document.renewal_required || Boolean(expired && ['SKU', 'PFE', 'RISK_PROFILE', 'REGULATORY_DOCUMENT'].includes(document.document_type)),
      };
    }) as OemsDocumentRegistration[];
    const submissionBlockers = normalizedDocuments.filter((document) => documentBlocksStage(document, 'SUBMISSION'));
    const executionBlockers = normalizedDocuments.filter((document) => documentBlocksStage(document, 'EXECUTION'));
    return {
      orderId,
      customerId: order.customer_id,
      productFamily: order.product_family,
      documents: normalizedDocuments,
      submissionBlockers,
      executionBlockers,
      readyForSubmission: submissionBlockers.length === 0,
      readyForExecution: executionBlockers.length === 0,
    };
  },

  async assertDocumentChecklistReady(orderId: string, stage: 'SUBMISSION' | 'EXECUTION') {
    const checklist = await this.getDocumentChecklist(orderId);
    const blockers = stage === 'SUBMISSION' ? checklist.submissionBlockers : checklist.executionBlockers;
    if (blockers.length > 0) {
      throw new ValidationError('Required missing or rejected documents block submission or execution based on workflow rule');
    }
    return checklist;
  },

  async registerDocument(orderId: string, data: OemsDocumentRegistrationInput, userId: string) {
    const order = await getOemsOrder(orderId);
    if (!data.documentType?.trim()) throw new ValidationError('Document type is required');

    const expectedHash = data.expectedFileHash?.trim();
    const actualHash = data.fileHash?.trim();
    const hashMismatch = Boolean(expectedHash && actualHash && expectedHash !== actualHash);
    const documentStatus = hashMismatch
      ? 'QUARANTINED'
      : data.documentStatus ?? (actualHash || data.fileUrl ? 'UPLOADED' : 'PENDING_UPLOAD');
    const now = new Date();

    const [document] = await db.insert(schema.oemsDocumentRegistrations).values({
      document_id: makeId('DOC'),
      order_id: orderId,
      customer_id: order.customer_id,
      portfolio_id: order.portfolio_id,
      product_family: order.product_family,
      checklist_rule_id: data.checklistRuleId,
      document_type: data.documentType.trim().toUpperCase(),
      document_status: documentStatus,
      requirement_type: normalizeDocumentRequirement(data.requirementType, data.required === false ? 'OPTIONAL' : 'REQUIRED'),
      required: data.required ?? true,
      blocking_stage: normalizeDocumentBlockingStage(data.blockingStage),
      template_code: data.templateCode?.trim().toUpperCase(),
      template_version: normalizePositiveInteger(data.templateVersion, 1, 20),
      external_document_id: data.externalDocumentId,
      file_name: data.fileName,
      file_url: data.fileUrl,
      expected_file_hash: expectedHash,
      file_hash: actualHash,
      hash_verified: Boolean(expectedHash && actualHash && expectedHash === actualHash),
      uploaded_at: ['UPLOADED', 'SIGNED', 'VERIFIED', 'REGISTERED_DMS', 'REGISTERED_NCBS'].includes(documentStatus) ? now : undefined,
      signed_at: documentStatus === 'SIGNED' ? now : undefined,
      signed_by: documentStatus === 'SIGNED' ? userId : undefined,
      verified_at: ['VERIFIED', 'REGISTERED_DMS', 'REGISTERED_NCBS'].includes(documentStatus) ? now : undefined,
      verified_by: ['VERIFIED', 'REGISTERED_DMS', 'REGISTERED_NCBS'].includes(documentStatus) ? userId : undefined,
      expires_at: data.expiresAt ? new Date(data.expiresAt) : undefined,
      quarantined_at: hashMismatch ? now : undefined,
      quarantine_reason: hashMismatch ? 'File hash mismatch quarantines the document and prevents use in authorization' : undefined,
      metadata: data.metadata ?? {},
      evidence: data.evidence ?? {},
      created_by: userId,
    }).returning();

    if (hashMismatch) {
      await db.update(schema.oemsOrders).set({
        document_status: 'REJECTED',
        updated_by: userId,
        updated_at: now,
      }).where(eq(schema.oemsOrders.order_id, orderId));
      await this.logIntegrationMessage({
        targetSystem: 'OEMS_DMS',
        messageType: 'DOCUMENT_HASH_MISMATCH_QUARANTINE',
        entityType: 'oems_document_registration',
        entityId: document.document_id,
        payload: { orderId, documentType: document.document_type, expectedHash, actualHash },
      }, userId);
      return document;
    }

    if (['VERIFIED', 'SIGNED', 'REGISTERED_DMS', 'REGISTERED_NCBS'].includes(documentStatus)) {
      const checklist = await this.getDocumentChecklist(orderId);
      if (checklist.submissionBlockers.length === 0) {
        if (order.order_status === 'PENDING_DOCUMENTS'
          && ['CONFIRMED', 'MANUAL_VERIFIED', 'NOT_REQUIRED'].includes(order.verification_status ?? 'NOT_REQUIRED')) {
          await updateOrderWithTransition(
            order,
            'PENDING_APPROVAL',
            { document_status: 'VERIFIED' },
            'OEMS_DOCUMENTS_VERIFIED',
            userId,
          );
        } else {
          await db.update(schema.oemsOrders).set({
            document_status: 'VERIFIED',
            updated_by: userId,
            updated_at: now,
          }).where(eq(schema.oemsOrders.order_id, orderId));
        }
      }
    }

    return document;
  },

  async generateEFormDocument(orderId: string, data: {
    documentType: string;
    templateCode: string;
    templateVersion?: number;
    metadata?: unknown;
  }, userId: string) {
    if (!data.templateCode?.trim()) throw new ValidationError('E-form template code is required');
    return this.registerDocument(orderId, {
      documentType: data.documentType,
      documentStatus: 'GENERATED',
      templateCode: data.templateCode,
      templateVersion: data.templateVersion,
      fileName: `${data.templateCode}-${orderId}.pdf`,
      fileUrl: `/documents/oems/eforms/${orderId}/${data.templateCode}.pdf`,
      metadata: data.metadata,
      evidence: { eformGeneratedAt: new Date().toISOString(), eformVersionLinkedToOrder: true },
    }, userId);
  },

  async signDocument(documentId: string, data: {
    signedBy?: string;
    fileHash?: string;
    evidence?: unknown;
  }, userId: string) {
    const document = await getOemsDocument(documentId);
    if (['REJECTED', 'QUARANTINED', 'EXPIRED'].includes(document.document_status)) {
      throw new ConflictError(`Cannot sign document in status ${document.document_status}`);
    }
    const now = new Date();
    const [updated] = await db.update(schema.oemsDocumentRegistrations).set({
      document_status: 'SIGNED',
      signed_at: now,
      signed_by: data.signedBy ?? userId,
      file_hash: data.fileHash ?? document.file_hash,
      evidence: {
        ...asRecord(document.evidence),
        ...asRecord(data.evidence),
        signedAt: now.toISOString(),
      },
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsDocumentRegistrations.document_id, documentId)).returning();
    return updated;
  },

  async registerDocumentWithDms(documentId: string, data: {
    accepted: boolean;
    dmsDocumentId?: string;
    responsePayload?: unknown;
    failureReason?: string;
    ncbsRetryPending?: boolean;
  }, userId: string) {
    const document = await getOemsDocument(documentId);
    const now = new Date();
    const status = data.accepted ? 'REGISTERED_DMS' : 'DMS_RETRY_PENDING';
    const retryCount = data.accepted ? document.dms_retry_count : (document.dms_retry_count ?? 0) + 1;
    const [updated] = await db.update(schema.oemsDocumentRegistrations).set({
      document_status: status,
      dms_document_id: data.dmsDocumentId,
      dms_status: data.accepted ? 'REGISTERED' : 'RETRY_PENDING',
      dms_registered_at: data.accepted ? now : undefined,
      dms_retry_count: retryCount,
      ncbs_status: data.ncbsRetryPending ? 'RETRY_PENDING' : document.ncbs_status,
      next_retry_at: data.accepted && !data.ncbsRetryPending ? undefined : nextDocumentRetryAt(retryCount),
      evidence: {
        ...asRecord(document.evidence),
        dmsResponse: data.responsePayload,
        dmsFailureReason: data.failureReason,
      },
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsDocumentRegistrations.document_id, documentId)).returning();

    await this.logIntegrationMessage({
      targetSystem: 'INTERNAL_DMS',
      messageType: data.accepted ? 'DOCUMENT_REGISTERED_DMS' : 'DOCUMENT_DMS_RETRY_PENDING',
      entityType: 'oems_document_registration',
      entityId: documentId,
      payload: updated,
      responsePayload: data.responsePayload,
      status: data.accepted ? 'ACKNOWLEDGED' : 'FAILED',
    }, userId);

    return updated;
  },

  async registerDocumentWithNcbs(documentId: string, data: {
    accepted: boolean;
    ncbsDocumentId?: string;
    responsePayload?: unknown;
    failureReason?: string;
  }, userId: string) {
    const document = await getOemsDocument(documentId);
    const now = new Date();
    const retryCount = data.accepted ? document.ncbs_retry_count : (document.ncbs_retry_count ?? 0) + 1;
    const failedAfterDms = !data.accepted && document.document_status === 'REGISTERED_DMS';
    const [updated] = await db.update(schema.oemsDocumentRegistrations).set({
      document_status: data.accepted ? 'REGISTERED_NCBS' : failedAfterDms ? 'REGISTERED_DMS' : 'NCBS_RETRY_PENDING',
      ncbs_document_id: data.ncbsDocumentId,
      ncbs_status: data.accepted ? 'REGISTERED' : 'RETRY_PENDING',
      ncbs_registered_at: data.accepted ? now : undefined,
      ncbs_retry_count: retryCount,
      next_retry_at: data.accepted ? undefined : nextDocumentRetryAt(retryCount),
      evidence: {
        ...asRecord(document.evidence),
        ncbsCim13Response: data.responsePayload,
        ncbsFailureReason: data.failureReason,
        registeredDmsWithNcbsRetryPending: failedAfterDms,
      },
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsDocumentRegistrations.document_id, documentId)).returning();

    await this.logIntegrationMessage({
      targetSystem: 'NCBS_CIM13',
      messageType: data.accepted ? 'DOCUMENT_REGISTERED_NCBS_CIM13' : 'DOCUMENT_NCBS_CIM13_RETRY_PENDING',
      entityType: 'oems_document_registration',
      entityId: documentId,
      payload: updated,
      responsePayload: data.responsePayload,
      status: data.accepted ? 'ACKNOWLEDGED' : 'FAILED',
    }, userId);

    return updated;
  },

  async retryDocumentRegistration(documentId: string, userId: string) {
    const document = await getOemsDocument(documentId);
    if (document.document_status === 'DMS_RETRY_PENDING' || document.dms_status === 'RETRY_PENDING') {
      return this.registerDocumentWithDms(documentId, {
        accepted: true,
        dmsDocumentId: document.dms_document_id ?? makeId('DMS-DOC'),
        responsePayload: { retry: true },
        ncbsRetryPending: document.ncbs_status === 'RETRY_PENDING',
      }, userId);
    }
    if (document.document_status === 'NCBS_RETRY_PENDING' || document.ncbs_status === 'RETRY_PENDING') {
      return this.registerDocumentWithNcbs(documentId, {
        accepted: true,
        ncbsDocumentId: document.ncbs_document_id ?? makeId('CIM13-DOC'),
        responsePayload: { retry: true },
      }, userId);
    }
    throw new ConflictError(`Document ${documentId} is not pending DMS or NCBS retry`);
  },

  async createRiskQuestionnaireVersion(data: {
    questionnaireCode: string;
    versionNo?: number;
    questionnaireName: string;
    customerCategory?: string;
    questionnaireType?: string;
    questions?: unknown;
    mandatoryQuestionCodes?: unknown;
    scoreBands?: unknown;
    validPeriodMonths?: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }, userId: string) {
    if (!data.questionnaireCode?.trim()) throw new ValidationError('Risk questionnaire code is required');
    if (!data.questionnaireName?.trim()) throw new ValidationError('Risk questionnaire name is required');
    const [questionnaire] = await db.insert(schema.oemsRiskQuestionnaireVersions).values({
      questionnaire_code: data.questionnaireCode.trim().toUpperCase(),
      version_no: normalizePositiveInteger(data.versionNo, 1, 99),
      questionnaire_name: data.questionnaireName,
      customer_category: data.customerCategory?.trim().toUpperCase() ?? 'BOTH',
      questionnaire_type: data.questionnaireType?.trim().toUpperCase() ?? 'STANDARD',
      questions_json: data.questions ?? [],
      mandatory_question_codes: normalizeStringArray(data.mandatoryQuestionCodes),
      score_bands: data.scoreBands ?? [],
      valid_period_months: normalizePositiveInteger(data.validPeriodMonths, 12, 120),
      effective_from: data.effectiveFrom,
      effective_to: data.effectiveTo,
      created_by: userId,
    }).returning();
    return questionnaire;
  },

  async listRiskQuestionnaires(params: {
    status?: typeof schema.oemsParameterStatusEnum.enumValues[number];
    activeOnly?: boolean;
  } = {}) {
    const conditions = [eq(schema.oemsRiskQuestionnaireVersions.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.oemsRiskQuestionnaireVersions.questionnaire_status, params.status));
    if (params.activeOnly) conditions.push(eq(schema.oemsRiskQuestionnaireVersions.questionnaire_status, 'ACTIVE'));
    return db.select().from(schema.oemsRiskQuestionnaireVersions)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsRiskQuestionnaireVersions.created_at));
  },

  async submitRiskQuestionnaire(questionnaireId: number, userId: string) {
    const questionnaire = await getOemsRiskQuestionnaire(questionnaireId);
    if (questionnaire.questionnaire_status !== 'DRAFT' && questionnaire.questionnaire_status !== 'REJECTED') {
      throw new ConflictError(`Cannot submit risk questionnaire in status ${questionnaire.questionnaire_status}`);
    }
    const [updated] = await db.update(schema.oemsRiskQuestionnaireVersions).set({
      questionnaire_status: 'PENDING_APPROVAL',
      submitted_by: userId,
      submitted_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsRiskQuestionnaireVersions.id, questionnaireId)).returning();
    return updated;
  },

  async approveRiskQuestionnaire(questionnaireId: number, userId: string) {
    const questionnaire = await getOemsRiskQuestionnaire(questionnaireId);
    if (questionnaire.questionnaire_status !== 'PENDING_APPROVAL') {
      throw new ConflictError(`Cannot approve risk questionnaire in status ${questionnaire.questionnaire_status}`);
    }
    if (questionnaire.submitted_by === userId || questionnaire.created_by === userId) {
      throw new ConflictError('Maker cannot approve their own OEMS risk questionnaire');
    }
    const [updated] = await db.update(schema.oemsRiskQuestionnaireVersions).set({
      questionnaire_status: 'ACTIVE',
      approved_by: userId,
      approved_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsRiskQuestionnaireVersions.id, questionnaireId)).returning();
    return updated;
  },

  async rejectRiskQuestionnaire(questionnaireId: number, reason: string, userId: string) {
    await getOemsRiskQuestionnaire(questionnaireId);
    const [updated] = await db.update(schema.oemsRiskQuestionnaireVersions).set({
      questionnaire_status: 'REJECTED',
      rejected_reason: reason,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsRiskQuestionnaireVersions.id, questionnaireId)).returning();
    return updated;
  },

  async createProductRiskMapping(data: {
    mappingCode: string;
    productId?: number;
    productCode?: string;
    productFamily: OemsProductFamily;
    transactionType?: string;
    productRiskProfile: OemsRiskProfile | string;
    productRiskScore?: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }, userId: string) {
    if (!data.mappingCode?.trim()) throw new ValidationError('Product risk mapping code is required');
    validateProductFamily(data.productFamily);
    const productRiskProfile = normalizeRiskProfile(data.productRiskProfile);
    const [mapping] = await db.insert(schema.oemsProductRiskMappings).values({
      mapping_code: data.mappingCode.trim().toUpperCase(),
      product_id: data.productId,
      product_code: data.productCode?.trim().toUpperCase(),
      product_family: data.productFamily,
      transaction_type: data.transactionType?.trim().toUpperCase(),
      product_risk_profile: productRiskProfile,
      product_risk_score: data.productRiskScore ?? riskProfileScores[productRiskProfile],
      effective_from: data.effectiveFrom,
      effective_to: data.effectiveTo,
      created_by: userId,
    }).returning();
    return mapping;
  },

  async approveProductRiskMapping(mappingId: number, userId: string) {
    const [mapping] = await db.update(schema.oemsProductRiskMappings).set({
      mapping_status: 'ACTIVE',
      approved_by: userId,
      approved_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsProductRiskMappings.id, mappingId)).returning();
    if (!mapping) throw new NotFoundError('OEMS product risk mapping not found');
    return mapping;
  },

  async createRiskProfileAssessment(data: {
    customerId: string;
    questionnaireId: number;
    answers: OemsRiskAnswerInput[];
    assessmentDate?: string;
    reassessmentReason?: string;
    sourcePayload?: unknown;
  }, userId: string) {
    if (!data.customerId?.trim()) throw new ValidationError('Customer ID is required for risk profile assessment');
    const questionnaire = await getOemsRiskQuestionnaire(data.questionnaireId);
    if (questionnaire.questionnaire_status !== 'ACTIVE') {
      throw new ConflictError('Only active risk questionnaire versions can generate customer risk profiles');
    }
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const answeredCodes = new Set(answers.map((answer) => answer.questionCode?.trim().toUpperCase()).filter(Boolean));
    const mandatoryCodes = normalizeStringArray(questionnaire.mandatory_question_codes);
    const missingMandatory = mandatoryCodes.filter((code) => !answeredCodes.has(code));
    if (answers.length === 0 || missingMandatory.length > 0) {
      throw new ValidationError('Partial questionnaire answers cannot generate active risk profile');
    }

    const totalScore = answers.reduce((sum, answer) => sum + asNumber(answer.score), 0);
    const scored = scoreRiskProfile(totalScore, questionnaire.score_bands);
    const effectiveFrom = data.assessmentDate ?? todayIso();
    const effectiveTo = monthsFrom(effectiveFrom, questionnaire.valid_period_months ?? 12);

    await db.update(schema.oemsRiskProfileAssessments).set({
      is_active: false,
      updated_by: userId,
      updated_at: new Date(),
    }).where(and(
      eq(schema.oemsRiskProfileAssessments.customer_id, data.customerId),
      eq(schema.oemsRiskProfileAssessments.is_active, true),
    ));

    const [assessment] = await db.insert(schema.oemsRiskProfileAssessments).values({
      assessment_id: makeId('RISK'),
      customer_id: data.customerId,
      questionnaire_id: questionnaire.id,
      assessment_status: 'ACTIVE',
      answers_json: answers,
      answered_question_codes: [...answeredCodes],
      total_score: totalScore.toFixed(4),
      risk_profile: scored.riskProfile,
      risk_score: scored.riskScore,
      strict_risk_profile: scored.riskProfile,
      strict_risk_score: scored.riskScore,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      partial_answers: false,
      reassessment_reason: data.reassessmentReason,
      source_payload: data.sourcePayload ?? {},
      created_by: userId,
    }).returning();
    return assessment;
  },

  async getLatestRiskProfile(customerId: string) {
    const assessment = await findLatestActiveOemsRiskProfile(customerId);
    if (!assessment) throw new NotFoundError('No active OEMS risk profile assessment found for customer');
    return assessment;
  },

  async recordExternalRiskProfile(customerId: string, data: {
    externalSource: string;
    externalRiskProfile: OemsRiskProfile | string;
    externalRiskScore?: number;
    sourcePayload?: unknown;
  }, userId: string) {
    const assessment = await this.getLatestRiskProfile(customerId);
    const externalRiskProfile = normalizeRiskProfile(data.externalRiskProfile);
    const externalRiskScore = data.externalRiskScore ?? riskProfileScores[externalRiskProfile];
    const strictRiskScore = Math.min(assessment.risk_score, externalRiskScore);
    const strictRiskProfile = riskProfilesByScore[strictRiskScore] ?? riskProfileFromScore(strictRiskScore);
    const conflict = assessment.risk_score !== externalRiskScore || assessment.risk_profile !== externalRiskProfile;

    const [updated] = await db.update(schema.oemsRiskProfileAssessments).set({
      conflict_status: conflict ? 'CONFLICT_REVIEW' : 'MATCHED',
      external_source: data.externalSource?.trim().toUpperCase() || 'WEALTH_CORE',
      external_risk_profile: externalRiskProfile,
      external_risk_score: externalRiskScore,
      strict_risk_profile: strictRiskProfile,
      strict_risk_score: strictRiskScore,
      source_payload: {
        ...asRecord(assessment.source_payload),
        externalRiskProfile: data.sourcePayload,
        stricterProfileUsedUntilResolved: conflict,
      },
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsRiskProfileAssessments.id, assessment.id)).returning();

    if (conflict) {
      await this.logIntegrationMessage({
        targetSystem: 'WEALTH_CORE',
        messageType: 'RISK_PROFILE_CONFLICT_REVIEW',
        entityType: 'oems_risk_profile_assessment',
        entityId: assessment.assessment_id,
        payload: {
          customerId,
          oemsRiskProfile: assessment.risk_profile,
          externalRiskProfile,
          strictRiskProfile,
          conflictStatus: 'CONFLICT_REVIEW',
        },
        status: 'FAILED',
        lastError: 'External Wealth Core profile conflicts with OEMS profile; stricter profile is used until resolved',
      }, userId);
    }

    return updated;
  },

  async syncRiskProfileToExternal(assessmentId: string, targetSystem: 'RBS' | 'AVANTRADE', userId: string) {
    const assessment = await getOemsRiskAssessment(assessmentId);
    const now = new Date();
    const values = targetSystem === 'RBS'
      ? { rbs_sync_status: 'SENT', last_synced_at: now, updated_by: userId, updated_at: now }
      : { avantrade_sync_status: 'SENT', last_synced_at: now, updated_by: userId, updated_at: now };
    const [updated] = await db.update(schema.oemsRiskProfileAssessments).set(values)
      .where(eq(schema.oemsRiskProfileAssessments.assessment_id, assessmentId)).returning();
    await this.logIntegrationMessage({
      targetSystem,
      messageType: 'RISK_PROFILE_SYNC',
      entityType: 'oems_risk_profile_assessment',
      entityId: assessmentId,
      payload: {
        customerId: assessment.customer_id,
        riskProfile: assessment.strict_risk_profile ?? assessment.risk_profile,
        riskScore: assessment.strict_risk_score ?? assessment.risk_score,
        effectiveTo: assessment.effective_to,
      },
    }, userId);
    return updated;
  },

  async validateRiskProfileForOrder(orderId: string, options: { persist?: boolean } = {}) {
    const order = await getOemsOrder(orderId);
    const findings: ValidationFinding[] = [];
    if (!order.customer_id) {
      return { orderId, passed: true, findings };
    }

    const assessment = await findLatestActiveOemsRiskProfile(order.customer_id);
    if (!assessment) {
      findings.push({
        ruleCode: 'OEMS-RISK-PROFILE-MISSING',
        severity: 'BLOCKING',
        result: 'FAIL',
        source: 'RISK_PROFILE',
        message: 'Expired risk profile blocks new investment orders until reassessment or approved exception.',
      });
    } else if (new Date(`${assessment.effective_to}T23:59:59.999Z`).getTime() < Date.now()) {
      findings.push({
        ruleCode: 'OEMS-RISK-PROFILE-EXPIRED',
        severity: 'BLOCKING',
        result: 'FAIL',
        source: 'RISK_PROFILE',
        message: 'Expired risk profile blocks new investment orders until reassessment or approved exception.',
      });
    } else {
      const [mapping] = await db.select().from(schema.oemsProductRiskMappings)
        .where(and(
          eq(schema.oemsProductRiskMappings.product_family, order.product_family),
          eq(schema.oemsProductRiskMappings.mapping_status, 'ACTIVE'),
          eq(schema.oemsProductRiskMappings.is_deleted, false),
        ))
        .orderBy(desc(schema.oemsProductRiskMappings.effective_from))
        .limit(1);
      const productRiskScore = mapping?.product_risk_score ?? asNumber(order.product_score);
      const customerRiskScore = assessment.strict_risk_score ?? assessment.risk_score;
      if (productRiskScore > 0 && customerRiskScore > 0 && productRiskScore > customerRiskScore) {
        findings.push({
          ruleCode: 'OEMS-RISK-PRODUCT-MAPPING',
          severity: 'BLOCKING',
          result: 'FAIL',
          source: 'RISK_PROFILE',
          message: 'Order product risk rating exceeds latest active customer risk profile.',
        });
      }
      if (assessment.conflict_status === 'CONFLICT_REVIEW') {
        findings.push({
          ruleCode: 'OEMS-RISK-PROFILE-CONFLICT',
          severity: 'WARNING',
          result: 'WARN',
          source: 'RISK_PROFILE',
          blocking: false,
          acknowledgementRequired: false,
          message: 'External Wealth Core profile conflicts with OEMS profile; stricter profile is used until resolved.',
        });
      }
    }

    if (options.persist && findings.length > 0) {
      await persistValidationFindings(orderId, findings, 'system');
    }
    return { orderId, passed: findings.every((finding) => finding.result !== 'FAIL'), findings };
  },

  async getRiskProfileReport(params: { expiringWithinDays?: number } = {}) {
    const expiringWithinDays = params.expiringWithinDays ?? 30;
    const threshold = new Date(Date.now() + expiringWithinDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const assessments: OemsRiskProfileAssessment[] = await db.select().from(schema.oemsRiskProfileAssessments)
      .where(and(
        eq(schema.oemsRiskProfileAssessments.is_deleted, false),
        eq(schema.oemsRiskProfileAssessments.is_active, true),
      ));
    const active = assessments.filter((assessment) => assessment.assessment_status === 'ACTIVE');
    const expired = active.filter((assessment) => assessment.effective_to < todayIso());
    const expiring = active.filter((assessment) => assessment.effective_to >= todayIso() && assessment.effective_to <= threshold);
    const conflicts = active.filter((assessment) => assessment.conflict_status === 'CONFLICT_REVIEW');
    return {
      summary: {
        activeProfiles: active.length,
        expiredProfiles: expired.length,
        expiringProfiles: expiring.length,
        conflictProfiles: conflicts.length,
      },
      expiring,
      expired,
      conflicts,
    };
  },

  async listDigitalVerifications(orderId: string) {
    await getOemsOrder(orderId);
    return db.select().from(schema.oemsDigitalVerifications)
      .where(and(
        eq(schema.oemsDigitalVerifications.order_id, orderId),
        eq(schema.oemsDigitalVerifications.is_deleted, false),
      ))
      .orderBy(desc(schema.oemsDigitalVerifications.created_at));
  },

  async listDigitalVerificationAttempts(orderId: string, verificationId?: string) {
    const verification = await getDigitalVerificationByRef(orderId, verificationId);
    return db.select().from(schema.oemsDigitalVerificationAttempts)
      .where(and(
        eq(schema.oemsDigitalVerificationAttempts.verification_id, verification.id),
        eq(schema.oemsDigitalVerificationAttempts.is_deleted, false),
      ))
      .orderBy(schema.oemsDigitalVerificationAttempts.attempt_no);
  },

  async createDigitalVerification(orderId: string, data: OemsDigitalVerificationRequest, userId: string) {
    const order = await getOemsOrder(orderId);
    if (['EXECUTED', 'BOOKED', 'SETTLED', 'MATURED', 'CANCELLED', 'REJECTED'].includes(order.order_status)) {
      throw new ConflictError(`Cannot issue digital verification for order in status ${order.order_status}`);
    }

    const channel = data.channel ?? order.channel;
    validateChannel(channel);
    const requestMethod = normalizeDigitalVerificationMethod(data.requestMethod);
    const maxAttempts = normalizePositiveInteger(data.maxAttempts, 3, 5);
    const ttlMinutes = normalizePositiveInteger(data.ttlMinutes, 15, 1440);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const payloadSnapshot = buildDigitalVerificationPayload(order, { ...data, channel });
    const payloadHash = data.payloadHash?.trim() || hashOemsPayload(payloadSnapshot);
    const verificationId = makeId('DVS');
    const thirdPartyOutage = data.providerOutage === true || data.thirdPartyStatus?.toUpperCase() === 'OUTAGE';
    const fallbackAllowed = data.fallbackAllowed === true || data.digitalImplemented === false;
    const authToken = crypto.randomBytes(18).toString('base64url');
    const authenticationLink = thirdPartyOutage
      ? undefined
      : `/secure/oems/verify/${verificationId}?token=${authToken}`;
    const status: OemsVerificationStatus = thirdPartyOutage ? 'PENDING' : 'SENT';
    const provider = data.provider ?? (requestMethod === 'DIGITAL_SIGNATURE' ? 'SIGNATURE_GATEWAY' : 'DANAMON_IDENTITY');

    const [verification] = await db.insert(schema.oemsDigitalVerifications).values({
      verification_id: verificationId,
      order_id: orderId,
      customer_id: order.customer_id,
      document_id: data.documentId,
      verification_type: data.verificationType?.trim().toUpperCase() ?? 'TRANSACTION_AUTHORIZATION',
      channel,
      request_method: requestMethod,
      verification_status: status,
      provider,
      external_ref: data.externalRef,
      authentication_link: authenticationLink,
      otp_delivery_channel: data.otpDeliveryChannel?.trim().toUpperCase(),
      payload_hash: payloadHash,
      payload_snapshot: payloadSnapshot,
      bound_document_types: normalizeStringArray(data.boundDocumentTypes),
      max_attempts: maxAttempts,
      sent_at: thirdPartyOutage ? undefined : new Date(),
      expires_at: expiresAt,
      fallback_allowed: fallbackAllowed,
      fallback_channel: data.fallbackChannel?.trim().toUpperCase(),
      evidence: data.evidence,
      signature_evidence: {},
      third_party_status: thirdPartyOutage ? 'OUTAGE' : data.thirdPartyStatus ?? 'REQUESTED',
      operations_alerted: thirdPartyOutage,
      created_by: userId,
    }).returning();

    await updateOrderWithTransition(
      order,
      'PENDING_CUSTOMER_VERIFICATION',
      {
        verification_status: status,
        customer_confirmation_deadline: expiresAt,
        payload: {
          ...asRecord(order.payload),
          digitalVerification: {
            verificationId,
            requestMethod,
            channel,
            payloadHash,
            expiresAt: expiresAt.toISOString(),
            fallbackAllowed,
          },
        },
      },
      thirdPartyOutage ? 'OEMS_DIGITAL_VERIFICATION_OUTAGE' : 'OEMS_DIGITAL_VERIFICATION_ISSUED',
      userId,
      thirdPartyOutage ? 'Third-party signature outage places orders in PENDING_CUSTOMER_VERIFICATION' : undefined,
      { verificationId, requestMethod, payloadHash, provider, thirdPartyStatus: thirdPartyOutage ? 'OUTAGE' : data.thirdPartyStatus },
    );

    if (thirdPartyOutage) {
      await this.logIntegrationMessage({
        targetSystem: provider,
        messageType: 'DIGITAL_SIGNATURE_OUTAGE',
        entityType: 'oems_order',
        entityId: orderId,
        payload: {
          orderId,
          verificationId,
          channel,
          operationAlertRequired: true,
          pendingStatus: 'PENDING_CUSTOMER_VERIFICATION',
        },
      }, userId);
      await this.queueNotification({
        eventCode: 'OEMS_DIGITAL_SIGNATURE_OUTAGE',
        orderId,
        recipientId: order.assigned_role ?? 'OPERATIONS',
        recipientType: 'OPERATIONS',
        channels: ['IN_APP'],
        payload: { orderId, verificationId, provider, status: 'PENDING_CUSTOMER_VERIFICATION' },
      }, userId);
    }

    return verification;
  },

  async recordDigitalVerificationAttempt(orderId: string, data: OemsDigitalVerificationAttemptInput, userId: string) {
    const order = await getOemsOrder(orderId);
    const verification = await getDigitalVerificationByRef(orderId, data.verificationId);
    if (terminalVerificationStatus(verification.verification_status)) {
      throw new ConflictError(`Digital verification request is already ${verification.verification_status}`);
    }

    const now = new Date();
    if (verification.expires_at && new Date(verification.expires_at).getTime() <= now.getTime()) {
      await this.expireDigitalVerification(orderId, verification.verification_id, userId);
      throw new ConflictError('Digital verification request has expired; issue a new request');
    }

    if (data.payloadHash?.trim() && data.payloadHash.trim() !== verification.payload_hash) {
      await this.invalidateDigitalVerification(orderId, 'A verified payload cannot be modified without invalidating the verification and requiring re-verification', userId, verification.verification_id);
      throw new ConflictError('Digital verification payload hash mismatch; re-verification is required');
    }

    const confirmed = data.confirmed ?? data.success === true;
    const attemptNo = (verification.failed_attempts ?? 0) + 1;
    const nextFailedAttempts = confirmed ? verification.failed_attempts ?? 0 : attemptNo;
    const locked = !confirmed && nextFailedAttempts >= (verification.max_attempts ?? 3);
    const finalFailure = data.finalFailure === true;
    const attemptStatus: OemsVerificationStatus = confirmed ? 'CONFIRMED' : locked ? 'LOCKED' : 'FAILED';

    await db.insert(schema.oemsDigitalVerificationAttempts).values({
      verification_id: verification.id,
      order_id: orderId,
      attempt_no: attemptNo,
      attempt_status: attemptStatus,
      auth_method: normalizeDigitalVerificationMethod(data.authMethod ?? verification.request_method),
      channel: verification.channel,
      provider: verification.provider,
      provider_ref: data.providerRef,
      payload_hash: data.payloadHash ?? verification.payload_hash,
      failure_reason: confirmed ? undefined : data.failureReason ?? (locked ? 'MAX_FAILED_ATTEMPTS_EXCEEDED' : 'VERIFICATION_FAILED'),
      attempted_by: userId,
      evidence: data.evidence ?? {},
      created_by: userId,
    }).returning();

    if (confirmed) {
      const signedDocumentUrl = data.signedDocumentUrl ?? `/api/v1/oems/orders/${orderId}/digital-verifications/${verification.verification_id}/download`;
      const signatureEvidence = {
        ...asRecord(verification.signature_evidence),
        ...asRecord(data.evidence),
        verificationId: verification.verification_id,
        orderId,
        customerId: order.customer_id,
        channel: verification.channel,
        payloadHash: verification.payload_hash,
        signedAt: now.toISOString(),
        provider: verification.provider,
      };

      const [updated] = await db.update(schema.oemsDigitalVerifications).set({
        verification_status: 'CONFIRMED',
        confirmed_at: now,
        verified_by: userId,
        last_attempt_at: now,
        evidence: data.evidence,
        signature_evidence: signatureEvidence,
        signed_document_url: signedDocumentUrl,
        download_url: signedDocumentUrl,
        third_party_status: data.thirdPartyStatus ?? 'CONFIRMED',
        updated_by: userId,
        updated_at: now,
      }).where(eq(schema.oemsDigitalVerifications.id, verification.id)).returning();

      await updateOrderWithTransition(
        order,
        nextStatusAfterCustomerVerification(order),
        {
          verification_status: 'CONFIRMED',
          payload: {
            ...asRecord(order.payload),
            digitalVerification: {
              verificationId: verification.verification_id,
              payloadHash: verification.payload_hash,
              signedDocumentUrl,
              signatureEvidence,
            },
          },
        },
        'OEMS_DIGITAL_VERIFICATION_COMPLETED',
        userId,
        undefined,
        signatureEvidence,
      );

      return updated;
    }

    const nextStatus: OemsVerificationStatus = locked ? 'LOCKED' : finalFailure ? 'FAILED' : 'SENT';
    const [updated] = await db.update(schema.oemsDigitalVerifications).set({
      verification_status: nextStatus,
      failed_attempts: nextFailedAttempts,
      last_attempt_at: now,
      locked_at: locked ? now : undefined,
      evidence: data.evidence,
      third_party_status: data.thirdPartyStatus ?? nextStatus,
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsDigitalVerifications.id, verification.id)).returning();

    await updateOrderWithTransition(
      order,
      finalFailure ? 'VALIDATION_FAILED' : 'PENDING_CUSTOMER_VERIFICATION',
      { verification_status: nextStatus },
      locked ? 'OEMS_DIGITAL_VERIFICATION_LOCKED' : finalFailure ? 'OEMS_DIGITAL_VERIFICATION_FAILED' : 'OEMS_DIGITAL_VERIFICATION_ATTEMPT_FAILED',
      userId,
      data.failureReason ?? (locked ? 'Multiple failed OTP attempts lock the verification request and require new issuance' : undefined),
      { verificationId: verification.verification_id, failedAttempts: nextFailedAttempts, maxAttempts: verification.max_attempts },
    );

    return updated;
  },

  async completeDigitalVerification(orderId: string, data: OemsDigitalVerificationAttemptInput, userId: string) {
    if (data.manualFallback) {
      return this.approveDigitalVerificationFallback(orderId, {
        verificationId: data.verificationId,
        fallbackReason: data.fallbackReason,
        evidence: data.evidence,
      }, userId);
    }
    return this.recordDigitalVerificationAttempt(orderId, {
      ...data,
      success: data.confirmed === true,
      finalFailure: data.confirmed === false,
    }, userId);
  },

  async expireDigitalVerification(orderId: string, verificationId: string | undefined, userId: string) {
    const order = await getOemsOrder(orderId);
    const verification = await getDigitalVerificationByRef(orderId, verificationId);
    const now = new Date();

    await db.insert(schema.oemsDigitalVerificationAttempts).values({
      verification_id: verification.id,
      order_id: orderId,
      attempt_no: (verification.failed_attempts ?? 0) + 1,
      attempt_status: 'EXPIRED',
      auth_method: verification.request_method,
      channel: verification.channel,
      provider: verification.provider,
      payload_hash: verification.payload_hash,
      failure_reason: 'Verification request expired after configured duration',
      attempted_by: userId,
      evidence: { expiresAt: verification.expires_at },
      created_by: userId,
    }).returning();

    const [updated] = await db.update(schema.oemsDigitalVerifications).set({
      verification_status: 'EXPIRED',
      expired_at: now,
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsDigitalVerifications.id, verification.id)).returning();

    await updateOrderWithTransition(
      order,
      'PENDING_CUSTOMER_VERIFICATION',
      { verification_status: 'EXPIRED' },
      'OEMS_DIGITAL_VERIFICATION_EXPIRED',
      userId,
      'Verification request expired after configured duration',
      { verificationId: verification.verification_id, expiresAt: verification.expires_at },
    );

    return updated;
  },

  async cancelDigitalVerification(orderId: string, verificationId: string | undefined, reason: string, userId: string) {
    const order = await getOemsOrder(orderId);
    const verification = await getDigitalVerificationByRef(orderId, verificationId);
    if (terminalVerificationStatus(verification.verification_status)) {
      throw new ConflictError(`Digital verification request is already ${verification.verification_status}`);
    }
    const now = new Date();

    await db.insert(schema.oemsDigitalVerificationAttempts).values({
      verification_id: verification.id,
      order_id: orderId,
      attempt_no: (verification.failed_attempts ?? 0) + 1,
      attempt_status: 'CANCELLED',
      auth_method: verification.request_method,
      channel: verification.channel,
      provider: verification.provider,
      payload_hash: verification.payload_hash,
      failure_reason: reason,
      attempted_by: userId,
      evidence: { reason },
      created_by: userId,
    }).returning();

    const [updated] = await db.update(schema.oemsDigitalVerifications).set({
      verification_status: 'CANCELLED',
      cancelled_at: now,
      fallback_reason: reason,
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsDigitalVerifications.id, verification.id)).returning();

    await updateOrderWithTransition(
      order,
      'PENDING_CUSTOMER_VERIFICATION',
      { verification_status: 'CANCELLED' },
      'OEMS_DIGITAL_VERIFICATION_CANCELLED',
      userId,
      reason,
      { verificationId: verification.verification_id },
    );

    return updated;
  },

  async approveDigitalVerificationFallback(orderId: string, data: {
    verificationId?: string;
    fallbackReason?: string;
    evidence?: unknown;
    digitalImplemented?: boolean;
  }, userId: string) {
    const order = await getOemsOrder(orderId);
    const verification = await getDigitalVerificationByRef(orderId, data.verificationId);
    const digitalNotImplemented = data.digitalImplemented === false
      || verification.fallback_allowed === true
      || verification.third_party_status === 'NOT_IMPLEMENTED';
    if (!digitalNotImplemented) {
      throw new ConflictError('BSM fallback approval is available only where digital verification has not been implemented for this channel/product');
    }

    const now = new Date();
    await db.insert(schema.oemsDigitalVerificationAttempts).values({
      verification_id: verification.id,
      order_id: orderId,
      attempt_no: (verification.failed_attempts ?? 0) + 1,
      attempt_status: 'MANUAL_VERIFIED',
      auth_method: 'BSM_FALLBACK',
      channel: verification.channel,
      provider: verification.provider,
      payload_hash: verification.payload_hash,
      attempted_by: userId,
      evidence: data.evidence ?? {},
      created_by: userId,
    }).returning();

    const [updated] = await db.update(schema.oemsDigitalVerifications).set({
      verification_status: 'MANUAL_VERIFIED',
      confirmed_at: now,
      fallback_reason: data.fallbackReason,
      fallback_approved_by: userId,
      fallback_approved_at: now,
      verified_by: userId,
      last_attempt_at: now,
      evidence: data.evidence,
      signature_evidence: {
        ...asRecord(data.evidence),
        verificationId: verification.verification_id,
        orderId,
        fallbackApproval: true,
        payloadHash: verification.payload_hash,
        approvedAt: now.toISOString(),
      },
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsDigitalVerifications.id, verification.id)).returning();

    await updateOrderWithTransition(
      order,
      nextStatusAfterCustomerVerification(order),
      { verification_status: 'MANUAL_VERIFIED' },
      'OEMS_DIGITAL_VERIFICATION_BSM_FALLBACK_APPROVED',
      userId,
      data.fallbackReason,
      { verificationId: verification.verification_id, fallbackOnlyWhenNotImplemented: true },
    );

    return updated;
  },

  async invalidateDigitalVerification(orderId: string, reason: string, userId: string, verificationId?: string) {
    const order = await getOemsOrder(orderId);
    const conditions = [
      eq(schema.oemsDigitalVerifications.order_id, orderId),
      eq(schema.oemsDigitalVerifications.is_deleted, false),
      inArray(schema.oemsDigitalVerifications.verification_status, ['PENDING', 'SENT', 'CONFIRMED', 'MANUAL_VERIFIED']),
    ];
    if (verificationId?.trim()) {
      conditions.push(eq(schema.oemsDigitalVerifications.verification_id, verificationId.trim()));
    }
    const now = new Date();
    const invalidated: OemsDigitalVerification[] = await db.update(schema.oemsDigitalVerifications).set({
      verification_status: 'INVALIDATED',
      invalidated_at: now,
      invalidation_reason: reason,
      updated_by: userId,
      updated_at: now,
    }).where(and(...conditions)).returning();

    if (invalidated.length > 0) {
      for (const verification of invalidated) {
        await db.insert(schema.oemsDigitalVerificationAttempts).values({
          verification_id: verification.id,
          order_id: orderId,
          attempt_no: (verification.failed_attempts ?? 0) + 1,
          attempt_status: 'INVALIDATED',
          auth_method: verification.request_method,
          channel: verification.channel,
          provider: verification.provider,
          payload_hash: verification.payload_hash,
          failure_reason: reason,
          attempted_by: userId,
          evidence: { reason },
          created_by: userId,
        }).returning();
      }

      await updateOrderWithTransition(
        order,
        'PENDING_CUSTOMER_VERIFICATION',
        { verification_status: 'PENDING' },
        'OEMS_DIGITAL_VERIFICATION_INVALIDATED',
        userId,
        reason,
        { invalidatedVerificationIds: invalidated.map((verification) => verification.verification_id) },
      );
    }

    return invalidated;
  },

  async getSignedDigitalVerificationDocument(orderId: string, verificationId: string) {
    await getOemsOrder(orderId);
    const verification = await getDigitalVerificationByRef(orderId, verificationId);
    if (!['CONFIRMED', 'MANUAL_VERIFIED'].includes(verification.verification_status)) {
      throw new ConflictError('Signed document is available only after successful digital verification');
    }
    return {
      orderId,
      verificationId: verification.verification_id,
      signedDocumentUrl: verification.signed_document_url,
      downloadUrl: verification.download_url,
      signatureEvidence: verification.signature_evidence,
      payloadHash: verification.payload_hash,
    };
  },

  calculateOdaOrderCostBeforeSwap(params: { amount: number; ratePercent: number }) {
    return calculateOdaOrderCostBeforeSwap(asNumber(params.amount), asNumber(params.ratePercent));
  },

  precheckOdaOrder(data: OemsOdaPrecheckInput) {
    const cutoffAt = data.cutoffAt ? new Date(data.cutoffAt) : undefined;
    const result = normalizeOdaPrecheck(data);
    const findings = [...result.findings];
    if (cutoffAt && cutoffAt.getTime() <= Date.now()) {
      findings.push({
        ruleCode: 'OEMS-ODA-COT-001',
        severity: 'BLOCKING',
        result: 'FAIL',
        source: 'OEMS_COT',
        message: 'Orders after parameterized COT cannot be submitted.',
      });
    }
    return {
      ...result,
      findings,
      hasBlocking: findings.some((finding) => finding.severity === 'BLOCKING' || finding.blocking),
      orderCostBeforeSwap: calculateOdaOrderCostBeforeSwap(result.normalized.nominalAmount, result.normalized.ratePercent),
    };
  },

  async createOdaReferenceRate(data: {
    currencyPair: string;
    bidRate?: number;
    askRate?: number;
    midRate?: number;
    spreadRate?: number;
    rateDate?: string;
    rateTimestamp?: string;
    retrievalMode?: string;
    sourceSystem?: string;
    rateStatus?: string;
    unavailableReason?: string;
    payload?: unknown;
  }, userId: string) {
    const pair = normalizeCurrencyPair(data.currencyPair);
    const rateStatus = normalizeUpperToken(data.rateStatus, 'AVAILABLE');
    const [rate] = await db.insert(schema.oemsOdaReferenceRates).values({
      rate_id: makeId('ODA-RATE'),
      source_system: data.sourceSystem?.trim().toUpperCase() ?? 'TREASURY',
      retrieval_mode: normalizeUpperToken(data.retrievalMode, 'DAILY'),
      currency_pair: pair.currencyPair,
      base_currency: pair.dealtCurrency,
      quote_currency: pair.counterCurrency,
      bid_rate: toRate(data.bidRate),
      ask_rate: toRate(data.askRate),
      mid_rate: toRate(data.midRate),
      spread_rate: toRate(data.spreadRate),
      rate_date: data.rateDate ?? todayIso(),
      rate_timestamp: data.rateTimestamp ? new Date(data.rateTimestamp) : new Date(),
      rate_status: rateStatus,
      unavailable_reason: data.unavailableReason,
      payload: data.payload ?? {},
      created_by: userId,
    }).returning();

    await this.logIntegrationMessage({
      targetSystem: 'TREASURY',
      messageType: 'ODA_REFERENCE_RATE_RETRIEVAL',
      entityType: 'oems_oda_reference_rate',
      entityId: rate.rate_id,
      payload: { currencyPair: pair.currencyPair, retrievalMode: data.retrievalMode ?? 'DAILY' },
      responsePayload: rate,
      status: rateStatus === 'AVAILABLE' ? 'ACKNOWLEDGED' : 'FAILED',
      lastError: rateStatus === 'AVAILABLE' ? undefined : data.unavailableReason ?? 'REFERENCE_RATE_UNAVAILABLE',
    }, userId);

    return rate;
  },

  async listOdaReferenceRates(params: { currencyPair?: string; rateDate?: string; status?: string } = {}) {
    const conditions = [eq(schema.oemsOdaReferenceRates.is_deleted, false)];
    if (params.currencyPair) conditions.push(eq(schema.oemsOdaReferenceRates.currency_pair, params.currencyPair.toUpperCase()));
    if (params.rateDate) conditions.push(eq(schema.oemsOdaReferenceRates.rate_date, params.rateDate));
    if (params.status) conditions.push(eq(schema.oemsOdaReferenceRates.rate_status, params.status.toUpperCase()));
    return db.select().from(schema.oemsOdaReferenceRates)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsOdaReferenceRates.rate_timestamp))
      .limit(100);
  },

  async createOdaRecommendation(data: OemsOdaPrecheckInput & {
    portfolioId?: string;
    productId?: number;
    taxRatePercent?: number;
    effectiveDate: string;
    cutoffAt: string;
    channel?: OemsChannel;
    assistedByUserId?: string;
    branchCode?: string;
    acceptedRecommendationId?: number;
    documentStatus?: 'REQUIRED' | 'PENDING_UPLOAD' | 'UPLOADED' | 'VERIFIED' | 'WAIVED' | 'REJECTED' | 'EXPIRED';
    digitalVerificationUnavailable?: boolean;
    holdFundsImmediately?: boolean;
    externalRefs?: unknown;
    payload?: unknown;
    documents?: unknown;
  }, userId: string) {
    const precheck = this.precheckOdaOrder(data);
    if (precheck.hasBlocking) {
      const codes = precheck.findings.filter((finding) => finding.result === 'FAIL').map((finding) => finding.ruleCode).join(', ');
      throw new ValidationError(codes || 'ODA pre-order validation failed');
    }

    const normalized = precheck.normalized;
    const cutoffAt = parseRequiredFutureDateTime(data.cutoffAt, 'ODA cutoff');
    const legs = normalizeOdaLegs(data, normalized);
    const salesFallbackRequired = Boolean(data.digitalVerificationUnavailable && data.channel && isSalesAssistedChannel(data.channel));
    const calculation = this.calculateOdaNominal({
      nominalAmount: normalized.nominalAmount,
      ratePercent: normalized.ratePercent,
      tenorDays: normalized.tenorDays,
      taxRatePercent: data.taxRatePercent,
    });

    const order = await this.createOrder({
      productFamily: 'ODA',
      transactionType: `ODA_${normalized.odaType}`,
      customerId: data.customerId,
      portfolioId: data.portfolioId,
      productId: data.productId,
      channel: data.channel,
      assistedByUserId: data.assistedByUserId,
      branchCode: data.branchCode,
      currency: normalized.dealtCurrency,
      amount: normalized.nominalAmount,
      tenorDays: normalized.tenorDays,
      rate: normalized.ratePercent,
      valueDate: data.effectiveDate,
      maturityDate: data.effectiveDate,
      documentStatus: data.documentStatus ?? 'REQUIRED',
      verificationStatus: salesFallbackRequired ? 'PENDING' : undefined,
      approvalTier: salesFallbackRequired ? 'BSM' : undefined,
      assignedRole: salesFallbackRequired ? 'BSM' : undefined,
      externalRefs: data.externalRefs,
      payload: {
        ...asRecord(data.payload),
        odaType: normalized.odaType,
        effectiveType: normalized.effectiveType,
        cutoffAt: cutoffAt.toISOString(),
        expiryAt: normalized.expiryAt?.toISOString(),
        referenceRateId: data.referenceRateId,
        acceptedRecommendationId: data.acceptedRecommendationId,
        calculation,
        precheck,
        BSMFallbackRequiredWhenDigitalUnavailable: salesFallbackRequired,
      },
    }, userId);

    const lifecycle: OemsOdaLifecycle = salesFallbackRequired ? 'AUTHORIZATION_PENDING' : 'PRE_ORDER';
    const [recommendation] = await db.insert(schema.oemsOdaRecommendations).values({
      order_id: order.order_id,
      accepted_recommendation_id: data.acceptedRecommendationId,
      reference_rate_id: data.referenceRateId,
      recommendation_no: makeId('ODA-REC'),
      customer_id: data.customerId,
      customer_type: normalized.customerType,
      channel: data.channel ?? 'OEMS_DIRECT',
      direction: normalized.direction,
      currency_pair: normalized.currencyPair,
      dealt_currency: normalized.dealtCurrency,
      counter_currency: normalized.counterCurrency,
      currency: normalized.dealtCurrency,
      oda_type: normalized.odaType,
      tenor_days: normalized.tenorDays,
      nominal_amount: toMoney(normalized.nominalAmount) ?? '0.0000',
      rate: toRate(normalized.ratePercent) ?? '0.00000000',
      reference_rate: toRate(normalized.referenceRate),
      reference_rate_source: data.referenceRateSource,
      order_cost_before_swap: toMoney(precheck.orderCostBeforeSwap),
      tax_rate: toRate(data.taxRatePercent ?? 0),
      expected_interest: toMoney(calculation.netInterest),
      effective_type: normalized.effectiveType,
      effective_date: data.effectiveDate,
      expiry_at: normalized.expiryAt,
      cutoff_at: cutoffAt,
      debit_account_no: data.debitAccountNo,
      credit_account_no: data.creditAccountNo,
      debit_currency: data.debitCurrency ?? normalized.dealtCurrency,
      credit_currency: data.creditCurrency ?? normalized.counterCurrency,
      minimum_placement_amount: toMoney(normalized.minimumPlacementAmount),
      minimum_collective_amount: toMoney(normalized.minimumCollectiveAmount),
      available_balance: toMoney(normalized.availableBalance),
      ledger_balance: toMoney(normalized.ledgerBalance),
      cif_status: normalizeUpperToken(data.cifStatus, 'PASS'),
      sku_status: normalizeUpperToken(data.skuStatus, 'PASS'),
      pfe_status: normalizeUpperToken(data.pfeStatus, 'PASS'),
      sales_certification_status: data.salesCertificationStatus?.toUpperCase(),
      authorization_status: salesFallbackRequired ? 'BSM_PENDING' : 'PENDING',
      precheck_result: precheck,
      documents: Array.isArray(data.documents) ? data.documents : [],
      payload: { source: 'OEMS_ODA_PRE_ORDER', legs, rawPayload: asRecord(data.payload) },
      lifecycle,
      created_by: userId,
    }).returning();

    await db.insert(schema.oemsOdaOrderLegs).values(legs.map((leg) => ({
      recommendation_id: recommendation.id,
      leg_no: leg.legNo ?? 1,
      leg_type: normalizeUpperToken(leg.legType, 'PRIMARY'),
      direction: normalizeOdaDirection(leg.direction),
      currency_pair: normalizeCurrencyPair(leg.currencyPair ?? normalized.currencyPair).currencyPair,
      target_rate: toRate(leg.targetRate ?? normalized.ratePercent) ?? '0.00000000',
      amount: toMoney(leg.amount ?? normalized.nominalAmount) ?? '0.0000',
      leg_status: 'ACTIVE',
      payload: leg.payload ?? {},
      created_by: userId,
    }))).returning();

    await persistValidationFindings(order.order_id, precheck.findings.length > 0 ? precheck.findings : [{
      ruleCode: 'OEMS-ODA-PRECHECK-PASS',
      severity: 'INFO',
      result: 'PASS',
      source: 'OEMS_ODA',
      message: 'ODA pre-order checks passed.',
    }], userId);

    if (salesFallbackRequired) {
      await updateOrderWithTransition(
        order,
        'PENDING_APPROVAL',
        { verification_status: 'PENDING', approval_tier: 'BSM', assigned_role: 'BSM' },
        'OEMS_ODA_BSM_AUTHORIZATION_REQUIRED',
        userId,
        'Sales-originated ODA routes to BSM authorization when digital verification is unavailable',
        { recommendationId: recommendation.id },
      );
      await this.dispatchNotificationEvent({
        eventCode: 'OEMS_ODA_BSM_AUTHORIZATION_REQUIRED',
        orderId: order.order_id,
        recipientRole: 'BSM',
        channels: ['IN_APP'],
        payload: { recommendationId: recommendation.id, currencyPair: normalized.currencyPair, amount: normalized.nominalAmount },
      }, userId);
    }

    const holdInstruction = data.holdFundsImmediately
      ? await this.holdOdaFunds(recommendation.id, { holdSucceeded: true }, userId)
      : undefined;

    return { order, recommendation, legs, calculation, precheck, holdInstruction };
  },

  async registerOdaOrder(data: OemsOdaPrecheckInput & Record<string, unknown>, userId: string) {
    return this.createOdaRecommendation(data as any, userId);
  },

  async authorizeOdaOrder(recommendationId: number, data: {
    authorizationStatus?: string;
    digitalVerificationUnavailable?: boolean;
    fallbackReason?: string;
    holdFunds?: boolean;
    holdSucceeded?: boolean;
    responsePayload?: unknown;
    failureReason?: string;
  } = {}, userId: string) {
    const recommendation = await getOdaRecommendation(recommendationId);
    const lifecycle: OemsOdaLifecycle = data.holdFunds === false ? 'AUTHORIZED' : 'HOLD_PENDING';
    const [updated] = await db.update(schema.oemsOdaRecommendations).set({
      lifecycle,
      authorization_status: normalizeUpperToken(data.authorizationStatus, data.digitalVerificationUnavailable ? 'BSM_APPROVED' : 'AUTHORIZED'),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsOdaRecommendations.id, recommendationId)).returning();

    if (recommendation.order_id) {
      const order = await getOemsOrder(recommendation.order_id);
      await updateOrderWithTransition(
        order,
        'APPROVED',
        { verification_status: data.digitalVerificationUnavailable ? 'MANUAL_VERIFIED' : order.verification_status },
        'OEMS_ODA_AUTHORIZED',
        userId,
        data.fallbackReason,
        { BSMFallbackForUnavailableDigitalVerification: Boolean(data.digitalVerificationUnavailable) },
      );
    }

    const holdInstruction = data.holdFunds === false
      ? undefined
      : await this.holdOdaFunds(recommendationId, {
        holdSucceeded: data.holdSucceeded,
        responsePayload: data.responsePayload,
        failureReason: data.failureReason,
      }, userId);

    return { recommendation: updated, holdInstruction };
  },

  async holdOdaFunds(recommendationId: number, data: {
    idempotencyKey?: string;
    holdSucceeded?: boolean;
    responsePayload?: unknown;
    failureReason?: string;
  } = {}, userId: string) {
    const recommendation = await getOdaRecommendation(recommendationId);
    const status = odaInstructionStatus(data.holdSucceeded);
    const now = new Date();
    const [instruction] = await db.insert(schema.oemsOdaFundInstructions).values({
      instruction_id: makeId('ODA-HOLD'),
      recommendation_id: recommendation.id,
      order_id: recommendation.order_id,
      group_id: recommendation.placement_group_id,
      instruction_type: 'HOLD',
      target_system: 'NCBS',
      idempotency_key: data.idempotencyKey ?? `ODA-HOLD-${recommendation.id}`,
      account_no: recommendation.debit_account_no,
      amount: recommendation.nominal_amount,
      currency: recommendation.currency,
      instruction_status: status,
      sent_at: now,
      acknowledged_at: status === 'ACKNOWLEDGED' ? now : undefined,
      failed_at: status === 'FAILED' ? now : undefined,
      next_retry_at: status === 'FAILED' ? addSeconds(300) : undefined,
      failure_reason: status === 'FAILED' ? data.failureReason ?? 'NCBS_HOLD_FAILED' : undefined,
      request_payload: { recommendationId, accountNo: recommendation.debit_account_no, amount: recommendation.nominal_amount },
      response_payload: data.responsePayload ?? {},
      created_by: userId,
    }).returning();

    await db.update(schema.oemsOdaRecommendations).set({
      lifecycle: status === 'ACKNOWLEDGED' ? 'HELD' : 'HOLD_FAILED',
      ncbs_hold_status: status,
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsOdaRecommendations.id, recommendationId));

    await this.logIntegrationMessage({
      targetSystem: 'NCBS',
      messageType: 'ODA_FUND_HOLD',
      entityType: 'oems_oda_recommendation',
      entityId: String(recommendationId),
      payload: instruction.request_payload,
      responsePayload: instruction.response_payload,
      status,
      lastError: instruction.failure_reason ?? undefined,
      nextRetryAt: instruction.next_retry_at ?? undefined,
    }, userId);

    if (status === 'FAILED') {
      await this.dispatchNotificationEvent({
        eventCode: 'OEMS_ODA_HOLD_FAILED',
        orderId: recommendation.order_id ?? undefined,
        recipientRole: 'OPERATIONS',
        channels: ['IN_APP'],
        payload: { recommendationId, failureReason: instruction.failure_reason },
      }, userId);
    }

    return instruction;
  },

  async releaseOdaFunds(recommendationId: number, data: {
    instructionType?: 'UNHOLD' | 'OVERBOOK';
    idempotencyKey?: string;
    releaseSucceeded?: boolean;
    autoSettleResult?: string;
    responsePayload?: unknown;
    failureReason?: string;
  } = {}, userId: string) {
    const recommendation = await getOdaRecommendation(recommendationId);
    const instructionType = data.instructionType ?? 'UNHOLD';
    const status = odaInstructionStatus(data.releaseSucceeded);
    const now = new Date();
    const [instruction] = await db.insert(schema.oemsOdaFundInstructions).values({
      instruction_id: makeId(`ODA-${instructionType}`),
      recommendation_id: recommendation.id,
      order_id: recommendation.order_id,
      group_id: recommendation.placement_group_id,
      instruction_type: instructionType,
      target_system: 'NCBS',
      idempotency_key: data.idempotencyKey ?? `ODA-${instructionType}-${recommendation.id}-${Date.now()}`,
      account_no: instructionType === 'OVERBOOK' ? recommendation.credit_account_no : recommendation.debit_account_no,
      amount: recommendation.nominal_amount,
      currency: recommendation.currency,
      instruction_status: status,
      sent_at: now,
      acknowledged_at: status === 'ACKNOWLEDGED' ? now : undefined,
      failed_at: status === 'FAILED' ? now : undefined,
      next_retry_at: status === 'FAILED' ? addSeconds(300) : undefined,
      auto_settle_result: data.autoSettleResult,
      failure_reason: status === 'FAILED' ? data.failureReason ?? `${instructionType}_FAILED` : undefined,
      request_payload: { recommendationId, instructionType, amount: recommendation.nominal_amount },
      response_payload: data.responsePayload ?? {},
      created_by: userId,
    }).returning();

    const lifecycle: OemsOdaLifecycle = instructionType === 'OVERBOOK'
      ? status === 'ACKNOWLEDGED' ? 'OVERBOOKED' : 'EXCEPTION'
      : status === 'ACKNOWLEDGED' ? 'UNHELD' : 'EXCEPTION';
    await db.update(schema.oemsOdaRecommendations).set({
      lifecycle,
      ncbs_unhold_status: instructionType === 'UNHOLD' ? status : recommendation.ncbs_unhold_status,
      ncbs_overbook_status: instructionType === 'OVERBOOK' ? status : recommendation.ncbs_overbook_status,
      auto_settle_result: data.autoSettleResult,
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsOdaRecommendations.id, recommendationId));

    await this.logIntegrationMessage({
      targetSystem: 'NCBS',
      messageType: `ODA_FUND_${instructionType}`,
      entityType: 'oems_oda_recommendation',
      entityId: String(recommendationId),
      payload: instruction.request_payload,
      responsePayload: instruction.response_payload,
      status,
      lastError: instruction.failure_reason ?? undefined,
      nextRetryAt: instruction.next_retry_at ?? undefined,
    }, userId);

    if (status === 'FAILED') {
      await this.dispatchNotificationEvent({
        eventCode: 'OEMS_ODA_FUND_RELEASE_FAILED',
        orderId: recommendation.order_id ?? undefined,
        recipientRole: 'OPERATIONS',
        channels: ['IN_APP'],
        payload: { recommendationId, instructionType, failureReason: instruction.failure_reason },
      }, userId);
    }

    return instruction;
  },

  async collectOdaRecommendations(data: {
    recommendationIds: number[];
    currency?: string;
    currencyPair?: string;
    direction?: string;
    tenorDays?: number;
    valueDate: string;
    summaryDate?: string;
    totalNominal?: number;
    averageRate?: number;
    minimumCollectiveAmount?: number;
    skipAggregationCheck?: boolean;
  }, userId: string) {
    if (!data.recommendationIds?.length) throw new ValidationError('At least one ODA recommendation is required');
    const selected = await db.select().from(schema.oemsOdaRecommendations)
      .where(inArray(schema.oemsOdaRecommendations.id, data.recommendationIds));

    // Enforce blotter aggregation rules — orders that cannot be grouped together must be rejected
    if (!data.skipAggregationCheck && selected.length > 1) {
      const candidates: AggregationCandidate[] = (selected as OemsOdaRecommendation[]).map((row) => ({
        id: row.id,
        direction: row.direction,
        currency_pair: row.currency_pair,
        effective_type: row.effective_type,
        oda_type: row.oda_type,
        tenor_days: row.tenor_days,
        value_date: row.effective_date,
        customer_type: row.customer_type,
        rate: row.rate,
        channel: row.channel,
        product_id: (row as any).product_id ?? null,
        nominal_amount: row.nominal_amount,
        minimum_collective_amount: row.minimum_collective_amount,
        order_cost_before_swap: row.order_cost_before_swap,
      }));
      assertAggregationCompatible(candidates);
    }
    const totalNominal = data.totalNominal ?? selected.reduce(
      (sum: number, item: OemsOdaRecommendation) => sum + asNumber(item.nominal_amount),
      0,
    );
    const averageRate = data.averageRate ?? (
      selected.length > 0
        ? selected.reduce((sum: number, item: OemsOdaRecommendation) => sum + asNumber(item.rate), 0) / selected.length
        : 0
    );
    const minimumCollectiveAmount = data.minimumCollectiveAmount
      ?? Math.max(...selected.map((item: OemsOdaRecommendation) => asNumber(item.minimum_collective_amount)), 0);
    const qualifies = minimumCollectiveAmount <= 0 || totalNominal >= minimumCollectiveAmount;
    if (!qualifies) {
      throw new ConflictError('ODA group does not meet minimum collective order and must be cancelled/unheld outside Summary Blotter');
    }

    const first = selected[0] as OemsOdaRecommendation | undefined;
    const [group] = await db.insert(schema.oemsOdaBlotterGroups).values({
      group_no: makeId('ODA-BLOTTER'),
      summary_date: data.summaryDate ?? todayIso(),
      direction: normalizeOdaDirection(data.direction ?? first?.direction ?? 'BUY'),
      currency_pair: normalizeCurrencyPair(data.currencyPair ?? first?.currency_pair ?? `${data.currency ?? first?.currency ?? 'USD'}/IDR`).currencyPair,
      currency: data.currency ?? first?.currency ?? 'IDR',
      tenor_days: data.tenorDays ?? first?.tenor_days ?? 1,
      value_date: data.valueDate,
      total_nominal: toMoney(totalNominal) ?? '0.0000',
      average_rate: toRate(averageRate),
      order_cost_before_swap: toMoney(selected.reduce((sum: number, item: OemsOdaRecommendation) => sum + asNumber(item.order_cost_before_swap), 0)),
      minimum_collective_amount: toMoney(minimumCollectiveAmount),
      qualifies_minimum_collective: qualifies,
      lifecycle: 'SUMMARY_PENDING',
      placement_summary: { recommendationIds: data.recommendationIds, groupingRule: 'blotter_aggregation_policy_v1', rulesApplied: listAggregationRules().map(r => r.code) },
      created_by: userId,
    }).returning();

    await db.update(schema.oemsOdaRecommendations).set({
      placement_group_id: group.id,
      lifecycle: 'COLLECTED',
      updated_by: userId,
      updated_at: new Date(),
    }).where(inArray(schema.oemsOdaRecommendations.id, data.recommendationIds));

    return { group, selectedCount: data.recommendationIds.length };
  },

  async getOdaDailySummary(params: { summaryDate?: string; minimumCollectiveAmount?: number; persist?: boolean } = {}, userId = 'system') {
    const summaryDate = params.summaryDate ?? todayIso();
    const rows = await db.select().from(schema.oemsOdaRecommendations)
      .where(and(
        eq(schema.oemsOdaRecommendations.is_deleted, false),
        lte(schema.oemsOdaRecommendations.cutoff_at, new Date(`${summaryDate}T23:59:59.999Z`)),
        inArray(schema.oemsOdaRecommendations.lifecycle, ['HELD', 'AUTHORIZED', 'COLLECTED', 'SUMMARY_PENDING']),
      ));
    // Apply blotter aggregation rules to bucket orders into compatible groups
    const candidates: AggregationCandidate[] = (rows as OemsOdaRecommendation[]).map((row) => ({
      id: row.id,
      direction: row.direction,
      currency_pair: row.currency_pair,
      effective_type: row.effective_type,
      oda_type: row.oda_type,
      tenor_days: row.tenor_days,
      value_date: row.effective_date,
      customer_type: row.customer_type,
      rate: row.rate,
      channel: row.channel,
      product_id: (row as any).product_id ?? null,
      nominal_amount: row.nominal_amount,
      minimum_collective_amount: row.minimum_collective_amount,
      order_cost_before_swap: row.order_cost_before_swap,
    }));

    const aggregationResult = bucketByAggregationRules(candidates, {
      minimumCollectiveAmount: params.minimumCollectiveAmount,
    });

    const summaries = aggregationResult.buckets.map((bucket) => ({
      summaryDate,
      direction: bucket.direction,
      currencyPair: bucket.currencyPair,
      effectiveType: bucket.effectiveType,
      odaType: bucket.odaType,
      tenorDays: bucket.tenorDays,
      valueDate: bucket.valueDate,
      customerType: bucket.customerType,
      rate: bucket.rate,
      totalNominal: bucket.totalNominal,
      orderCostBeforeSwap: bucket.orderCostBeforeSwap,
      orderCount: bucket.orderCount,
      minimumCollectiveAmount: bucket.minimumCollectiveAmount,
      recommendationIds: bucket.recommendationIds,
      aggregationKey: bucket.key,
      rulesApplied: aggregationResult.rulesApplied,
      qualifiesMinimumCollective: bucket.minimumCollectiveAmount <= 0 || bucket.totalNominal >= bucket.minimumCollectiveAmount,
    }));

    if (params.persist && summaries.length > 0) {
      await db.insert(schema.oemsOdaDailySummaries).values(summaries.map((summary) => ({
        summary_id: makeId('ODA-SUM'),
        summary_date: summary.summaryDate,
        direction: summary.direction,
        currency_pair: summary.currencyPair,
        rate: toRate(summary.rate) ?? '0.00000000',
        order_cost_before_swap: toMoney(summary.orderCostBeforeSwap),
        total_nominal: toMoney(summary.totalNominal) ?? '0.0000',
        order_count: summary.orderCount,
        minimum_collective_amount: toMoney(summary.minimumCollectiveAmount),
        qualifies_minimum_collective: summary.qualifiesMinimumCollective,
        summary_status: summary.qualifiesMinimumCollective ? 'QUALIFIED' : 'BELOW_MINIMUM',
        snapshot: summary,
        created_by: userId,
      }))).returning();
    }

    return summaries;
  },

  async runOdaCotCollection(data: { cutoffAt?: string; valueDate: string; minimumCollectiveAmount?: number } = { valueDate: todayIso() }, userId = 'system') {
    const summaries = await this.getOdaDailySummary({ summaryDate: data.valueDate, minimumCollectiveAmount: data.minimumCollectiveAmount, persist: true }, userId);
    const groups = [];
    const cancelled = [];
    for (const summary of summaries) {
      if (summary.qualifiesMinimumCollective) {
        groups.push(await this.collectOdaRecommendations({
          recommendationIds: summary.recommendationIds,
          currencyPair: summary.currencyPair,
          direction: summary.direction,
          valueDate: data.valueDate,
          summaryDate: data.valueDate,
          totalNominal: summary.totalNominal,
          averageRate: summary.rate,
          minimumCollectiveAmount: summary.minimumCollectiveAmount,
        }, userId));
      } else {
        await db.update(schema.oemsOdaRecommendations).set({
          lifecycle: 'CANCELLED',
          cancellation_reason: 'Below minimum collective order at COT',
          updated_by: userId,
          updated_at: new Date(),
        }).where(inArray(schema.oemsOdaRecommendations.id, summary.recommendationIds));
        for (const recommendationId of summary.recommendationIds) {
          await this.releaseOdaFunds(recommendationId, { releaseSucceeded: true }, userId);
        }
        cancelled.push(summary);
        await this.dispatchNotificationEvent({
          eventCode: 'OEMS_ODA_CANCELLED_MINIMUM_COLLECTIVE',
          recipientRole: 'SALES',
          channels: ['IN_APP', 'EMAIL'],
          attachmentPolicy: { passwordProtected: true, passwordPolicy: 'CUSTOMER_DOB_OR_CIF' },
          payload: summary,
        }, userId);
      }
    }

    return { groups, cancelled };
  },

  async approveOdaBlotterGroup(groupId: number, userId: string) {
    const group = await getOdaBlotterGroup(groupId);
    if (!['SUMMARY_PENDING', 'COLLECTED'].includes(group.lifecycle)) {
      throw new ConflictError(`Cannot approve ODA blotter in status ${group.lifecycle}`);
    }

    const [updated] = await db.update(schema.oemsOdaBlotterGroups).set({
      lifecycle: 'SUMMARY_APPROVED',
      approved_by: userId,
      approved_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsOdaBlotterGroups.id, groupId)).returning();

    await this.logIntegrationMessage({
      targetSystem: 'RBS_CA_CIB',
      messageType: 'ODA_PLACEMENT_SUMMARY_APPROVED',
      entityType: 'oems_oda_blotter_group',
      entityId: String(groupId),
      payload: updated,
    }, userId);

    return updated;
  },

  async requestOdaTreasuryUpdate(groupId: number, data: {
    requestedLifecycle: 'EXECUTED' | 'EXPIRED' | 'OBSERVATION';
    swapPoints?: number;
    treasuryDealId?: string;
    autoSettleResult?: string;
    payload?: unknown;
  }, userId: string) {
    const group = await getOdaBlotterGroup(groupId);
    if (!['SUMMARY_APPROVED', 'PLACED', 'OBSERVATION'].includes(group.lifecycle)) {
      throw new ConflictError(`Cannot request Treasury update for ODA group in status ${group.lifecycle}`);
    }

    const [update] = await db.insert(schema.oemsOdaTreasuryUpdates).values({
      update_id: makeId('ODA-TRY-UPD'),
      group_id: groupId,
      requested_lifecycle: data.requestedLifecycle,
      swap_points: toRate(data.swapPoints),
      treasury_deal_id: data.treasuryDealId,
      auto_settle_result: data.autoSettleResult,
      update_status: 'PENDING_APPROVAL',
      maker_by: userId,
      payload: data.payload ?? {},
      created_by: userId,
    }).returning();

    await db.update(schema.oemsOdaBlotterGroups).set({
      lifecycle: 'TREASURY_UPDATE_PENDING',
      treasury_status: 'PENDING_CHECKER_APPROVAL',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsOdaBlotterGroups.id, groupId));

    return update;
  },

  async approveOdaTreasuryUpdate(updateId: string, data: {
    approved?: boolean;
    rejectionReason?: string;
    unholdSucceeded?: boolean;
    overbookSucceeded?: boolean;
    autoSettleResult?: string;
    syncSucceeded?: boolean;
  } = {}, userId: string) {
    const update = await getOdaTreasuryUpdate(updateId);
    if (update.update_status !== 'PENDING_APPROVAL') {
      throw new ConflictError(`Cannot approve ODA Treasury update in status ${update.update_status}`);
    }
    if (update.maker_by === userId) {
      throw new ConflictError('Treasury checker cannot approve their own ODA execution update');
    }

    if (data.approved === false) {
      const [rejected] = await db.update(schema.oemsOdaTreasuryUpdates).set({
        update_status: 'REJECTED',
        checker_by: userId,
        checker_at: new Date(),
        rejection_reason: data.rejectionReason,
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsOdaTreasuryUpdates.update_id, updateId)).returning();
      await db.update(schema.oemsOdaBlotterGroups).set({
        lifecycle: 'TREASURY_UPDATE_REJECTED',
        treasury_status: 'REJECTED',
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsOdaBlotterGroups.id, update.group_id));
      return { update: rejected, affectedRecommendations: 0 };
    }

    const childRecommendations = await db.select().from(schema.oemsOdaRecommendations)
      .where(and(
        eq(schema.oemsOdaRecommendations.placement_group_id, update.group_id),
        eq(schema.oemsOdaRecommendations.is_deleted, false),
      ));
    const requested = update.requested_lifecycle;
    const finalLifecycle: OemsOdaLifecycle = requested === 'EXECUTED'
      ? (normalizeUpperToken(data.autoSettleResult ?? update.auto_settle_result, 'AUTO_SETTLED') === 'MANUAL_REQUIRED' ? 'MANUAL_OVERBOOK_REQUIRED' : 'EXECUTED')
      : requested;

    const [approved] = await db.update(schema.oemsOdaTreasuryUpdates).set({
      update_status: 'APPROVED',
      checker_by: userId,
      checker_at: new Date(),
      auto_settle_result: data.autoSettleResult ?? update.auto_settle_result,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsOdaTreasuryUpdates.update_id, updateId)).returning();

    await db.update(schema.oemsOdaBlotterGroups).set({
      lifecycle: finalLifecycle,
      treasury_status: 'APPROVED',
      fp8007_status: requested === 'OBSERVATION' ? undefined : 'SYNC_PENDING',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsOdaBlotterGroups.id, update.group_id));

    for (const recommendation of childRecommendations as OemsOdaRecommendation[]) {
      if (requested === 'EXECUTED') {
        await this.releaseOdaFunds(recommendation.id, {
          instructionType: 'UNHOLD',
          releaseSucceeded: data.unholdSucceeded,
          autoSettleResult: data.autoSettleResult ?? update.auto_settle_result ?? undefined,
        }, userId);
        await this.releaseOdaFunds(recommendation.id, {
          instructionType: 'OVERBOOK',
          releaseSucceeded: data.overbookSucceeded,
          autoSettleResult: data.autoSettleResult ?? update.auto_settle_result ?? undefined,
        }, userId);
        if (normalizeUpperToken(data.autoSettleResult ?? update.auto_settle_result, 'AUTO_SETTLED') === 'MANUAL_REQUIRED') {
          await this.dispatchNotificationEvent({
            eventCode: 'OEMS_ODA_MANUAL_OVERBOOK_REQUIRED',
            orderId: recommendation.order_id ?? undefined,
            recipientRole: 'BSM',
            channels: ['IN_APP'],
            payload: { recommendationId: recommendation.id, groupId: update.group_id, treasuryDealId: update.treasury_deal_id },
          }, userId);
        }
      } else if (requested === 'EXPIRED') {
        await this.releaseOdaFunds(recommendation.id, { instructionType: 'UNHOLD', releaseSucceeded: data.unholdSucceeded }, userId);
        await this.dispatchNotificationEvent({
          eventCode: 'OEMS_ODA_EXPIRED',
          orderId: recommendation.order_id ?? undefined,
          recipientRole: 'CUSTOMER',
          channels: ['IN_APP', 'EMAIL'],
          payload: { recommendationId: recommendation.id, groupId: update.group_id },
        }, userId);
      }

      await db.update(schema.oemsOdaRecommendations).set({
        lifecycle: finalLifecycle,
        treasury_status: 'APPROVED',
        fp8007_status: requested === 'OBSERVATION' ? recommendation.fp8007_status : 'SYNC_PENDING',
        auto_settle_result: data.autoSettleResult ?? update.auto_settle_result,
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsOdaRecommendations.id, recommendation.id));

      if (recommendation.order_id && requested !== 'OBSERVATION') {
        const order = await getOemsOrder(recommendation.order_id);
        await updateOrderWithTransition(
          order,
          requested === 'EXECUTED' ? 'EXECUTED' : 'EXPIRED',
          {},
          `OEMS_ODA_${requested}`,
          userId,
          undefined,
          { treasuryUpdateId: updateId, fp8007Status: 'SYNC_PENDING' },
        );
      }
      if (requested !== 'OBSERVATION') {
        await this.syncOdaToFp8007({ groupId: update.group_id, recommendationId: recommendation.id, fp8007Status: requested, syncSucceeded: data.syncSucceeded }, userId);
      }
    }

    return { update: approved, affectedRecommendations: childRecommendations.length };
  },

  async syncOdaToFp8007(data: {
    groupId?: number;
    recommendationId?: number;
    fp8007Status: string;
    syncSucceeded?: boolean;
    externalRef?: string;
    responsePayload?: unknown;
    failureReason?: string;
  }, userId: string) {
    const status = odaInstructionStatus(data.syncSucceeded);
    const [syncRecord] = await db.insert(schema.oemsOdaFp8007Syncs).values({
      sync_id: makeId('ODA-FP8007'),
      group_id: data.groupId,
      recommendation_id: data.recommendationId,
      fp8007_status: normalizeUpperToken(data.fp8007Status, 'SYNC_PENDING'),
      sync_status: status,
      external_ref: data.externalRef,
      synced_at: status === 'ACKNOWLEDGED' ? new Date() : undefined,
      failure_reason: status === 'FAILED' ? data.failureReason ?? 'FP8007_SYNC_FAILED' : undefined,
      request_payload: data,
      response_payload: data.responsePayload ?? {},
      created_by: userId,
    }).returning();

    if (data.groupId) {
      await db.update(schema.oemsOdaBlotterGroups).set({
        fp8007_status: status === 'ACKNOWLEDGED' ? 'SYNCED' : 'SYNC_FAILED',
        last_fp8007_sync_at: status === 'ACKNOWLEDGED' ? new Date() : undefined,
        lifecycle: status === 'ACKNOWLEDGED' ? 'FP8007_SYNCED' : 'FP8007_SYNC_PENDING',
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsOdaBlotterGroups.id, data.groupId));
    }
    if (data.recommendationId) {
      await db.update(schema.oemsOdaRecommendations).set({
        fp8007_status: status === 'ACKNOWLEDGED' ? 'SYNCED' : 'SYNC_FAILED',
        lifecycle: status === 'ACKNOWLEDGED' ? 'FP8007_SYNCED' : 'FP8007_SYNC_PENDING',
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsOdaRecommendations.id, data.recommendationId));
    }

    await this.logIntegrationMessage({
      targetSystem: 'FP8007',
      messageType: 'ODA_FP8007_SYNC',
      entityType: data.groupId ? 'oems_oda_blotter_group' : 'oems_oda_recommendation',
      entityId: String(data.groupId ?? data.recommendationId),
      payload: data,
      responsePayload: syncRecord.response_payload,
      status,
      lastError: syncRecord.failure_reason ?? undefined,
    }, userId);

    return syncRecord;
  },

  async cancelOdaRecommendation(recommendationId: number, data: { reason?: string; checkerRejected?: boolean; releaseSucceeded?: boolean } = {}, userId: string) {
    const recommendation = await getOdaRecommendation(recommendationId);
    if (!data.checkerRejected && new Date(recommendation.cutoff_at).getTime() <= Date.now()) {
      throw new ConflictError('ODA amendment and cancellation are allowed only before COT unless checker rejects');
    }
    const [updated] = await db.update(schema.oemsOdaRecommendations).set({
      lifecycle: 'CANCELLED',
      cancellation_reason: data.reason ?? 'Cancelled before COT',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsOdaRecommendations.id, recommendationId)).returning();

    const release = ['HELD', 'COLLECTED', 'SUMMARY_PENDING'].includes(recommendation.lifecycle)
      ? await this.releaseOdaFunds(recommendationId, { releaseSucceeded: data.releaseSucceeded }, userId)
      : undefined;

    if (recommendation.order_id) {
      const order = await getOemsOrder(recommendation.order_id);
      await updateOrderWithTransition(order, 'CANCELLED', { cancelled_at: new Date() }, 'OEMS_ODA_CANCELLED', userId, data.reason);
    }

    return { recommendation: updated, release };
  },

  async executeOdaRecommendation(recommendationId: number, lifecycle: 'EXECUTED' | 'BOOKED' | 'EXPIRED' | 'REJECTED' | 'OBSERVATION', userId: string) {
    const recommendation = await getOdaRecommendation(recommendationId);

    if (lifecycle === 'EXECUTED') {
      await this.releaseOdaFunds(recommendationId, { instructionType: 'UNHOLD', releaseSucceeded: true }, userId);
      await this.releaseOdaFunds(recommendationId, { instructionType: 'OVERBOOK', releaseSucceeded: true, autoSettleResult: 'AUTO_SETTLED' }, userId);
      await this.syncOdaToFp8007({ recommendationId, groupId: recommendation.placement_group_id ?? undefined, fp8007Status: 'EXECUTED', syncSucceeded: true }, userId);
    } else if (lifecycle === 'EXPIRED' || lifecycle === 'REJECTED') {
      await this.releaseOdaFunds(recommendationId, { instructionType: 'UNHOLD', releaseSucceeded: true }, userId);
    }

    const [updated] = await db.update(schema.oemsOdaRecommendations).set({
      lifecycle,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsOdaRecommendations.id, recommendationId)).returning();

    if (recommendation.order_id) {
      const order = await getOemsOrder(recommendation.order_id);
      assertDigitalVerificationReady(order);
      await this.assertDocumentChecklistReady(order.order_id, 'EXECUTION');
      await updateOrderWithTransition(
        order,
        lifecycle === 'EXECUTED' ? 'EXECUTED' : lifecycle === 'OBSERVATION' ? 'OBSERVATION' : lifecycle,
        {},
        `OEMS_ODA_${lifecycle}`,
        userId,
      );
    }

    return updated;
  },

  async listOdaFundInstructions(params: { instructionType?: string; status?: string; recommendationId?: number } = {}) {
    const conditions = [eq(schema.oemsOdaFundInstructions.is_deleted, false)];
    if (params.instructionType) conditions.push(eq(schema.oemsOdaFundInstructions.instruction_type, params.instructionType.toUpperCase()));
    if (params.status) conditions.push(eq(schema.oemsOdaFundInstructions.instruction_status, params.status as typeof schema.oemsIntegrationStatusEnum.enumValues[number]));
    if (params.recommendationId) conditions.push(eq(schema.oemsOdaFundInstructions.recommendation_id, params.recommendationId));
    return db.select().from(schema.oemsOdaFundInstructions)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsOdaFundInstructions.created_at))
      .limit(100);
  },

  async getOdaFundReleaseReport(params: { status?: string; dateFrom?: string; dateTo?: string } = {}) {
    const conditions = [
      eq(schema.oemsOdaFundInstructions.is_deleted, false),
      inArray(schema.oemsOdaFundInstructions.instruction_type, ['UNHOLD', 'OVERBOOK']),
    ];
    if (params.status) conditions.push(eq(schema.oemsOdaFundInstructions.instruction_status, params.status as typeof schema.oemsIntegrationStatusEnum.enumValues[number]));
    if (params.dateFrom) conditions.push(gte(schema.oemsOdaFundInstructions.created_at, new Date(`${params.dateFrom}T00:00:00.000Z`)));
    if (params.dateTo) conditions.push(lte(schema.oemsOdaFundInstructions.created_at, new Date(`${params.dateTo}T23:59:59.999Z`)));
    const rows = await db.select().from(schema.oemsOdaFundInstructions)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsOdaFundInstructions.created_at))
      .limit(500);
    return {
      reportCode: 'ODA_FUND_RELEASE',
      rows,
      failedCount: (rows as InferSelectModel<typeof schema.oemsOdaFundInstructions>[]).filter((row) => row.instruction_status === 'FAILED').length,
      retryQueue: (rows as InferSelectModel<typeof schema.oemsOdaFundInstructions>[]).filter((row) => row.next_retry_at),
    };
  },

  async createMldTranche(data: {
    trancheCode: string;
    trancheName: string;
    productId?: number;
    currency?: string;
    optionType?: string;
    underlyingReference?: string;
    indicativeRate?: number;
    minimumInterestRate?: number;
    bonusPayoutRate?: number;
    participationRate?: number;
    strikeRate?: number;
    taxRate?: number;
    offeringStart: string;
    offeringEnd: string;
    tradeDate: string;
    valueDate: string;
    fixingDate: string;
    maturityDate: string;
    quotaAmount: number;
    minInvestment?: number;
    maxInvestment?: number;
    minimumCollectiveNominal?: number;
    productScore?: number;
    indicativeTermSheetUrl?: string;
    finalTermSheetUrl?: string;
    treasuryCounterparty?: string;
    payoffFormula?: unknown;
  }, userId: string) {
    if (!dateInRange(data.tradeDate, data.offeringStart, data.maturityDate)) {
      throw new ValidationError('MLD trade date must fall between offering start and maturity');
    }
    if (data.tradeDate !== data.valueDate) throw new ValidationError('MLD trade date equals value date');
    if (data.fixingDate !== data.maturityDate) throw new ValidationError('MLD fixing date equals maturity date');
    if (data.offeringEnd < data.offeringStart) throw new ValidationError('Offering end cannot be before offering start');
    if (data.quotaAmount <= 0) throw new ValidationError('Quota amount must be greater than zero');

    const [tranche] = await db.insert(schema.oemsMldTranches).values({
      tranche_code: data.trancheCode.trim().toUpperCase(),
      tranche_name: data.trancheName,
      product_id: data.productId,
      currency: data.currency ?? 'IDR',
      option_type: data.optionType?.trim().toUpperCase(),
      underlying_reference: data.underlyingReference,
      indicative_rate: toRate(data.indicativeRate),
      minimum_interest_rate: toRate(data.minimumInterestRate),
      bonus_payout_rate: toRate(data.bonusPayoutRate),
      participation_rate: toRate(data.participationRate),
      strike_rate: toRate(data.strikeRate),
      tax_rate: toRate(data.taxRate ?? 0),
      offering_start: data.offeringStart,
      offering_end: data.offeringEnd,
      trade_date: data.tradeDate,
      value_date: data.valueDate,
      fixing_date: data.fixingDate,
      maturity_date: data.maturityDate,
      quota_amount: toMoney(data.quotaAmount) ?? '0.0000',
      min_investment: toMoney(data.minInvestment),
      max_investment: toMoney(data.maxInvestment),
      minimum_collective_nominal: toMoney(data.minimumCollectiveNominal),
      product_score: data.productScore,
      lifecycle: 'OFFERING',
      indicative_term_sheet_url: data.indicativeTermSheetUrl,
      final_term_sheet_url: data.finalTermSheetUrl,
      treasury_counterparty: data.treasuryCounterparty,
      payoff_formula: data.payoffFormula,
      created_by: userId,
    }).returning();
    return tranche;
  },

  calculateMldMaturityPayout(params: {
    principalAmount: number;
    minimumInterestRatePercent?: number;
    bonusPayoutRatePercent?: number;
    taxRatePercent?: number;
    outcome?: unknown;
  }) {
    return calculateMldPayout(params);
  },

  async pretradeRecheckMldTranche(trancheId: number, amount: number, tradeDate = todayIso(), data: {
    ninetyDayAverageBalance?: number;
    availableBalance?: number;
    cifStatus?: string;
    holdStatus?: string;
  } = {}) {
    const tranche = await getMldTranche(trancheId);
    const findings: ValidationFinding[] = [];
    const bookedAmount = asNumber(tranche.booked_amount);
    const quotaAmount = asNumber(tranche.quota_amount);
    const minInvestment = asNumber(tranche.min_investment);
    const maxInvestment = asNumber(tranche.max_investment);

    if (!['OFFERING', 'CALLBACK_PENDING', 'CALLBACK_COMPLETED'].includes(tranche.lifecycle)) {
      findings.push({ ruleCode: 'OEMS-MLD-STATUS-001', severity: 'BLOCKING', result: 'FAIL', message: `Tranche is not open for booking: ${tranche.lifecycle}` });
    }
    if (!dateInRange(tradeDate, tranche.offering_start, tranche.offering_end)) {
      findings.push({ ruleCode: 'OEMS-MLD-OFFERING-001', severity: 'BLOCKING', result: 'FAIL', message: 'Trade date is outside the offering period.' });
    }
    if (minInvestment > 0 && amount < minInvestment) {
      findings.push({ ruleCode: 'OEMS-MLD-MIN-001', severity: 'BLOCKING', result: 'FAIL', message: 'Investment amount is below minimum investment.' });
    }
    if (maxInvestment > 0 && amount > maxInvestment) {
      findings.push({ ruleCode: 'OEMS-MLD-MAX-001', severity: 'BLOCKING', result: 'FAIL', message: 'Investment amount exceeds maximum investment.' });
    }
    if (bookedAmount + amount > quotaAmount) {
      findings.push({ ruleCode: 'OEMS-MLD-QUOTA-001', severity: 'BLOCKING', result: 'FAIL', message: 'Investment amount exceeds remaining tranche quota.' });
    }
    if (data.cifStatus && !odaStatusPass(data.cifStatus)) {
      findings.push({ ruleCode: 'OEMS-MLD-CIF-001', severity: 'BLOCKING', result: 'FAIL', source: 'NCBS', message: 'MLD CIF validation retrieves customer details from NCBS and must pass before order entry.' });
    }
    if (asNumber(data.ninetyDayAverageBalance) > 0 && amount > asNumber(data.ninetyDayAverageBalance)) {
      findings.push({ ruleCode: 'OEMS-MLD-90D-AVG-001', severity: 'BLOCKING', result: 'FAIL', source: 'NCBS', message: 'MLD amount cannot exceed same-currency 90-day average balance.' });
    }
    if (asNumber(data.availableBalance) > 0 && amount > asNumber(data.availableBalance)) {
      findings.push({ ruleCode: 'OEMS-MLD-BALANCE-001', severity: 'BLOCKING', result: 'FAIL', source: 'NCBS', message: 'MLD available balance is insufficient for NCBS hold.' });
    }
    if (data.holdStatus && data.holdStatus === 'FAILED') {
      findings.push({ ruleCode: 'OEMS-MLD-HOLD-001', severity: 'BLOCKING', result: 'FAIL', source: 'NCBS', message: 'If NCBS hold fails, MLD order cannot reach final master blotter.' });
    }

    return {
      trancheId,
      passed: findings.length === 0,
      remainingQuota: Number((quotaAmount - bookedAmount).toFixed(4)),
      findings,
    };
  },

  async createMldOrder(data: {
    trancheId: number;
    customerId?: string;
    portfolioId?: string;
	    amount: number;
	    customerRiskScore?: number;
	    channel?: OemsChannel;
	    assistedByUserId?: string;
	    branchCode?: string;
    cifStatus?: string;
    customerDetailSnapshot?: unknown;
    ninetyDayAverageBalance?: number;
    availableBalance?: number;
    holdSucceeded?: boolean;
    debitAccountNo?: string;
    mandatoryDocuments?: unknown;
    termSheetUrl?: string;
    productHighlightSheetUrl?: string;
    participationFormUrl?: string;
	  }, userId: string) {
    const tranche = await getMldTranche(data.trancheId);
    const recheck = await this.pretradeRecheckMldTranche(data.trancheId, data.amount, todayIso(), {
      ninetyDayAverageBalance: data.ninetyDayAverageBalance,
      availableBalance: data.availableBalance,
      cifStatus: data.cifStatus ?? 'PASS',
    });
    if (!recheck.passed) throw new ValidationError(recheck.findings.map((f) => f.message).join(' '));

    const order = await this.createOrder({
      productFamily: 'MLD',
      transactionType: 'MLD_SUBSCRIPTION',
      customerId: data.customerId,
      portfolioId: data.portfolioId,
	      productId: tranche.product_id ?? undefined,
	      channel: data.channel,
	      assistedByUserId: data.assistedByUserId,
	      branchCode: data.branchCode,
	      currency: tranche.currency,
      amount: data.amount,
      tradeDate: tranche.trade_date,
      valueDate: tranche.value_date,
      maturityDate: tranche.maturity_date,
      customerRiskScore: data.customerRiskScore,
      productScore: tranche.product_score ?? undefined,
      documentStatus: 'REQUIRED',
      verificationStatus: 'PENDING',
      payload: {
        mldTrancheId: data.trancheId,
        mandatoryDocuments: data.mandatoryDocuments ?? ['SKU', 'PFE', 'TERM_SHEET', 'PRODUCT_HIGHLIGHT_SHEET', 'RISK_PROFILE_QUESTIONNAIRE', 'PARTICIPATION_FORM'],
        principalProtectionAppliesOnlyIfHeldUntilMaturity: true,
      },
    }, userId);

    await db.insert(schema.oemsMldOrderDetails).values({
      order_id: order.order_id,
      tranche_id: data.trancheId,
      customer_id: data.customerId,
      cif_status: normalizeUpperToken(data.cifStatus, 'PASS'),
      customer_detail_snapshot: data.customerDetailSnapshot ?? {},
      ninety_day_average_balance: toMoney(data.ninetyDayAverageBalance),
      available_balance: toMoney(data.availableBalance),
      balance_currency: tranche.currency,
      mandatory_documents: data.mandatoryDocuments ?? ['SKU', 'PFE', 'TERM_SHEET', 'PRODUCT_HIGHLIGHT_SHEET', 'RISK_PROFILE_QUESTIONNAIRE', 'PARTICIPATION_FORM'],
      term_sheet_url: data.termSheetUrl ?? tranche.indicative_term_sheet_url,
      product_highlight_sheet_url: data.productHighlightSheetUrl,
      participation_form_url: data.participationFormUrl,
      callback_status: 'PENDING',
      final_master_blotter_eligible: data.holdSucceeded !== false,
      pretrade_recheck_status: 'PASS',
      principal_protected: true,
      trade_status: data.holdSucceeded === false ? 'HOLD_FAILED' : 'HELD',
      payload: { recheck },
      created_by: userId,
    }).returning();

    await this.issueMldFundInstruction(order.order_id, {
      trancheId: data.trancheId,
      instructionType: 'HOLD',
      amount: data.amount,
      currency: tranche.currency,
      accountNo: data.debitAccountNo,
      succeeded: data.holdSucceeded,
      failureReason: data.holdSucceeded === false ? 'NCBS_HOLD_FAILED' : undefined,
    }, userId);

    await db.update(schema.oemsMldTranches).set({
      booked_amount: sql`${schema.oemsMldTranches.booked_amount} + ${toMoney(data.amount) ?? '0.0000'}`,
      lifecycle: data.holdSucceeded === false ? 'HOLD_FAILED' : 'HELD',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMldTranches.id, data.trancheId));

    return { order, recheck };
  },

  async issueMldFundInstruction(orderId: string, data: {
    trancheId?: number;
    instructionType: 'HOLD' | 'UNHOLD' | 'CREATE_TD' | 'MATURITY_CREDIT';
    amount?: number;
    currency?: string;
    accountNo?: string;
    idempotencyKey?: string;
    tdAccountNo?: string;
    succeeded?: boolean;
    responsePayload?: unknown;
    failureReason?: string;
  }, userId: string) {
    const order = await getOemsOrder(orderId);
    if (order.product_family !== 'MLD') throw new ValidationError('Order is not an MLD order');
    const detail = await getMldOrderDetail(orderId).catch(() => undefined);
    const trancheId = data.trancheId ?? detail?.tranche_id;
    if (!trancheId) throw new ValidationError('MLD tranche is required for NCBS instruction');
    const status = odaInstructionStatus(data.succeeded);
    const now = new Date();
    const [instruction] = await db.insert(schema.oemsMldFundInstructions).values({
      instruction_id: makeId(`MLD-${data.instructionType}`),
      order_id: orderId,
      tranche_id: trancheId,
      instruction_type: data.instructionType,
      target_system: 'NCBS',
      idempotency_key: data.idempotencyKey ?? `MLD-${data.instructionType}-${orderId}`,
      account_no: data.accountNo,
      amount: toMoney(data.amount ?? asNumber(order.amount)) ?? '0.0000',
      currency: data.currency ?? order.currency,
      instruction_status: status,
      td_account_no: data.tdAccountNo,
      sent_at: now,
      acknowledged_at: status === 'ACKNOWLEDGED' ? now : undefined,
      failed_at: status === 'FAILED' ? now : undefined,
      next_retry_at: status === 'FAILED' ? addSeconds(300) : undefined,
      failure_reason: status === 'FAILED' ? data.failureReason ?? `${data.instructionType}_FAILED` : undefined,
      request_payload: { orderId, trancheId, instructionType: data.instructionType },
      response_payload: data.responsePayload ?? {},
      created_by: userId,
    }).returning();

    const detailValues: Partial<typeof schema.oemsMldOrderDetails.$inferInsert> = {
      updated_by: userId,
      updated_at: now,
    };
    if (data.instructionType === 'HOLD') detailValues.hold_instruction_status = status;
    if (data.instructionType === 'CREATE_TD') {
      detailValues.td_creation_status = status;
      detailValues.td_account_no = data.tdAccountNo;
      detailValues.trade_status = status === 'FAILED' ? 'TD_CREATE_FAILED' : 'TD_CREATED';
    }
    if (data.instructionType === 'MATURITY_CREDIT') {
      detailValues.maturity_credit_status = status;
      detailValues.maturity_status = status === 'FAILED' ? 'MATURITY_CREDIT_FAILED' : 'MATURED';
    }
    if (detail) {
      await db.update(schema.oemsMldOrderDetails).set(detailValues)
        .where(eq(schema.oemsMldOrderDetails.order_id, orderId));
    }

    await this.logIntegrationMessage({
      targetSystem: 'NCBS',
      messageType: `MLD_${data.instructionType}`,
      entityType: 'oems_order',
      entityId: orderId,
      payload: instruction.request_payload,
      responsePayload: instruction.response_payload,
      status,
      lastError: instruction.failure_reason ?? undefined,
      nextRetryAt: instruction.next_retry_at ?? undefined,
    }, userId);

    return instruction;
  },

  async runMldPreTradeRecheck(trancheId: number, data: { tradeDate?: string; sourcePayload?: unknown } = {}, userId: string) {
    const tranche = await getMldTranche(trancheId);
    const details = await db.select().from(schema.oemsMldOrderDetails)
      .where(and(eq(schema.oemsMldOrderDetails.tranche_id, trancheId), eq(schema.oemsMldOrderDetails.is_deleted, false)));
    const rows = [];
    for (const detail of details as OemsMldOrderDetail[]) {
      const order = await getOemsOrder(detail.order_id);
      const amount = asNumber(order.amount);
      const insufficientAverage = asNumber(detail.ninety_day_average_balance) > 0 && amount > asNumber(detail.ninety_day_average_balance);
      const holdFailed = detail.hold_instruction_status === 'FAILED';
      const status = insufficientAverage || holdFailed ? 'OPERATIONS_REVIEW' : 'PASS';
      const reason = insufficientAverage
        ? '90-day average balance became insufficient before trade date'
        : holdFailed
          ? 'NCBS hold failed; excluded from final master blotter'
          : undefined;
      const [recheck] = await db.insert(schema.oemsMldPretradeRechecks).values({
        recheck_id: makeId('MLD-RECHECK'),
        tranche_id: trancheId,
        order_id: detail.order_id,
        recheck_date: data.tradeDate ?? tranche.trade_date,
        ninety_day_average_balance: detail.ninety_day_average_balance,
        order_amount: order.amount,
        available_balance: detail.available_balance,
        recheck_status: status,
        excluded_from_final_blotter: status !== 'PASS',
        review_reason: reason,
        source_payload: data.sourcePayload ?? {},
        created_by: userId,
      }).returning();
      await db.update(schema.oemsMldOrderDetails).set({
        pretrade_recheck_status: status,
        final_master_blotter_eligible: status === 'PASS',
        operations_review_reason: reason,
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsMldOrderDetails.order_id, detail.order_id));
      rows.push(recheck);
    }
    await db.update(schema.oemsMldTranches).set({
      lifecycle: rows.some((row) => row.recheck_status !== 'PASS') ? 'PRETRADE_RECHECK_FAILED' : 'FINAL_MASTER_BLOTTER',
      final_master_blotter_status: rows.some((row) => row.recheck_status !== 'PASS') ? 'EXCEPTIONS' : 'READY',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMldTranches.id, trancheId));
    return { trancheId, checkedCount: rows.length, rows };
  },

	  async recordMldCallback(orderId: string, data: { completed: boolean; notes?: string; callbackResult?: string; callbackChannel?: string; evidence?: unknown }, userId: string) {
	    const order = await getOemsOrder(orderId);
	    if (order.product_family !== 'MLD') throw new ValidationError('Order is not an MLD order');
    const detail = await getMldOrderDetail(orderId).catch(() => undefined);
    await db.insert(schema.oemsMldCallbacks).values({
      callback_id: makeId('MLD-CALLBACK'),
      order_id: orderId,
      tranche_id: detail?.tranche_id,
      callback_status: data.completed ? 'COMPLETED' : 'PENDING',
      callback_result: data.callbackResult,
      callback_channel: data.callbackChannel,
      callback_by: userId,
      notes: data.notes,
      evidence: data.evidence ?? {},
      created_by: userId,
    }).returning();
    if (detail) {
      await db.update(schema.oemsMldOrderDetails).set({
        callback_status: data.completed ? 'COMPLETED' : 'PENDING',
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsMldOrderDetails.order_id, orderId));
    }
	    const payload = { ...(order.payload as Record<string, unknown> | null ?? {}), callback: data };
	    return updateOrderWithTransition(
	      order,
	      data.completed ? 'PENDING_APPROVAL' : 'PENDING_CUSTOMER_CONFIRMATION',
	      {
	      verification_status: data.completed ? 'CONFIRMED' : 'PENDING',
	      payload,
	      },
	      data.completed ? 'OEMS_MLD_CALLBACK_COMPLETED' : 'OEMS_MLD_CALLBACK_PENDING',
	      userId,
	      data.notes,
	      data,
	    );
	  },

  async tradeMldOrder(orderId: string, data: {
    tdAccountNo?: string;
    treasuryDealingId?: string;
    tdCreationSucceeded?: boolean;
    dealingIdRetrieved?: boolean;
    responsePayload?: unknown;
  } = {}, userId: string) {
	    const order = await getOemsOrder(orderId);
	    if (order.product_family !== 'MLD') throw new ValidationError('Order is not an MLD order');
    const detail = await getMldOrderDetail(orderId);
    if (detail.callback_status !== 'COMPLETED') throw new ConflictError('MLD callback must be completed before TD creation instruction');
	    assertDigitalVerificationReady(order);
	    await this.assertDocumentChecklistReady(orderId, 'EXECUTION');
	    if (!['PENDING_APPROVAL', 'APPROVED'].includes(order.order_status)) {
      throw new ConflictError(`Cannot trade MLD order in status ${order.order_status}`);
    }
    const tdInstruction = await this.issueMldFundInstruction(orderId, {
      trancheId: detail.tranche_id,
      instructionType: 'CREATE_TD',
      amount: asNumber(order.amount),
      currency: order.currency,
      tdAccountNo: data.tdAccountNo,
      succeeded: data.tdCreationSucceeded,
      responsePayload: data.responsePayload,
      failureReason: data.tdCreationSucceeded === false ? 'NCBS_TD_CREATION_FAILED' : undefined,
    }, userId);
    const pendingDealingId = data.tdCreationSucceeded !== false && (!data.treasuryDealingId || data.dealingIdRetrieved === false);
    await db.update(schema.oemsMldOrderDetails).set({
      td_account_no: data.tdAccountNo,
      treasury_dealing_id: data.treasuryDealingId,
      trade_status: data.tdCreationSucceeded === false ? 'TD_CREATE_FAILED' : pendingDealingId ? 'TRADED_PENDING_DEALING_ID' : 'TRADED',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMldOrderDetails.order_id, orderId));
    await db.update(schema.oemsMldTranches).set({
      lifecycle: pendingDealingId ? 'TRADED_PENDING_DEALING_ID' : data.tdCreationSucceeded === false ? 'EXCEPTION' : 'TRADED',
      treasury_dealing_id: data.treasuryDealingId,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMldTranches.id, detail.tranche_id));
    if (pendingDealingId) {
      await this.logIntegrationMessage({
        targetSystem: 'TREASURY',
        messageType: 'MLD_DEALING_ID_RETRIEVAL',
        entityType: 'oems_order',
        entityId: orderId,
        status: 'FAILED',
        payload: { tdAccountNo: data.tdAccountNo },
        lastError: 'TRADED_PENDING_DEALING_ID: NCBS TD creation succeeded but dealing ID retrieval failed',
        nextRetryAt: addSeconds(300),
      }, userId);
    }
	    return updateOrderWithTransition(order, data.tdCreationSucceeded === false ? 'VALIDATION_FAILED' : 'EXECUTED', {
      external_refs: { ...asRecord(order.external_refs), tdAccountNo: data.tdAccountNo, treasuryDealingId: data.treasuryDealingId },
    }, 'OEMS_MLD_TRADED', userId, undefined, { tdInstructionId: tdInstruction.instruction_id, pendingDealingId });
	  },

  async recordMldFixingOutcome(orderId: string, data: {
    outcome: 'MAX_RETURN' | 'MIN_RETURN' | 'TERMINATED';
    fixingLevel?: number;
    minimumInterestRatePercent?: number;
    bonusPayoutRatePercent?: number;
    taxRatePercent?: number;
  }, userId: string) {
    const order = await getOemsOrder(orderId);
    if (order.product_family !== 'MLD') throw new ValidationError('Order is not an MLD order');
    const detail = await getMldOrderDetail(orderId);
    const tranche = await getMldTranche(detail.tranche_id);
    const payout = calculateMldPayout({
      principalAmount: asNumber(order.amount),
      minimumInterestRatePercent: data.minimumInterestRatePercent ?? asNumber(tranche.minimum_interest_rate),
      bonusPayoutRatePercent: data.bonusPayoutRatePercent ?? asNumber(tranche.bonus_payout_rate),
      taxRatePercent: data.taxRatePercent ?? asNumber(tranche.tax_rate),
      outcome: data.outcome,
    });
    const [fixing] = await db.insert(schema.oemsMldFixingOutcomes).values({
      fixing_id: makeId('MLD-FIX'),
      order_id: orderId,
      tranche_id: detail.tranche_id,
      fixing_date: tranche.fixing_date,
      fixing_level: toRate(data.fixingLevel),
      outcome: payout.outcome,
      principal_amount: toMoney(payout.principalAmount) ?? '0.0000',
      minimum_interest_amount: toMoney(payout.minimumInterestAmount) ?? '0.0000',
      bonus_payout_amount: toMoney(payout.bonusPayoutAmount) ?? '0.0000',
      gross_payout_amount: toMoney(payout.grossPayoutAmount) ?? '0.0000',
      tax_amount: toMoney(payout.taxAmount) ?? '0.0000',
      net_payout_amount: toMoney(payout.netPayoutAmount) ?? '0.0000',
      tax_rule_payload: { taxRatePercent: data.taxRatePercent ?? asNumber(tranche.tax_rate), BR_017_1: 'Maturity payout deducts tax according to active tax rules' },
      created_by: userId,
    }).returning();
    await db.update(schema.oemsMldOrderDetails).set({
      fixing_outcome: payout.outcome,
      gross_payout_amount: toMoney(payout.grossPayoutAmount),
      tax_amount: toMoney(payout.taxAmount),
      net_payout_amount: toMoney(payout.netPayoutAmount),
      maturity_status: 'MATURITY_PENDING',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMldOrderDetails.order_id, orderId));
	    return { fixing, payout };
	  },

  async matureMldOrder(orderId: string, data: {
    outcome?: 'MAX_RETURN' | 'MIN_RETURN' | 'TERMINATED';
    creditSucceeded?: boolean;
    tdUnholdSucceeded?: boolean;
    responsePayload?: unknown;
  } = {}, userId: string) {
    const order = await getOemsOrder(orderId);
    if (order.product_family !== 'MLD') throw new ValidationError('Order is not an MLD order');
    const detail = await getMldOrderDetail(orderId);
    const payout = detail.net_payout_amount
      ? {
        outcome: detail.fixing_outcome ?? 'MIN_RETURN',
        netPayoutAmount: asNumber(detail.net_payout_amount),
      }
      : calculateMldPayout({
        principalAmount: asNumber(order.amount),
        outcome: data.outcome ?? 'MIN_RETURN',
      });
    await this.issueMldFundInstruction(orderId, {
      trancheId: detail.tranche_id,
      instructionType: 'UNHOLD',
      amount: asNumber(order.amount),
      currency: order.currency,
      succeeded: data.tdUnholdSucceeded,
    }, userId);
    const credit = await this.issueMldFundInstruction(orderId, {
      trancheId: detail.tranche_id,
      instructionType: 'MATURITY_CREDIT',
      amount: 'netPayoutAmount' in payout ? payout.netPayoutAmount : asNumber(order.amount),
      currency: order.currency,
      succeeded: data.creditSucceeded,
      responsePayload: data.responsePayload,
      failureReason: data.creditSucceeded === false ? 'MLD_MATURITY_CREDIT_FAILED' : undefined,
    }, userId);
    if (data.creditSucceeded === false) {
      await this.dispatchNotificationEvent({
        eventCode: 'OEMS_MLD_MATURITY_CREDIT_FAILED',
        orderId,
        recipientRole: 'OPERATIONS',
        channels: ['IN_APP', 'PAGER_DUTY'],
        payload: { orderId, trancheId: detail.tranche_id, reason: 'Failed maturity credit instruction creates a critical operations exception and notification' },
      }, userId);
    }
	    return updateOrderWithTransition(
      order,
      data.creditSucceeded === false ? 'VALIDATION_FAILED' : 'MATURED',
      {},
      data.creditSucceeded === false ? 'OEMS_MLD_MATURITY_CREDIT_FAILED' : 'OEMS_MLD_MATURED',
      userId,
      credit.failure_reason ?? undefined,
      { payout, creditInstructionId: credit.instruction_id },
    );
	  },

  async matureMldTranche(trancheId: number, userId: string) {
    const [openCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.oemsMldOrderDetails)
      .where(and(
        eq(schema.oemsMldOrderDetails.tranche_id, trancheId),
        eq(schema.oemsMldOrderDetails.is_deleted, false),
        sql`COALESCE(${schema.oemsMldOrderDetails.maturity_status}, '') NOT IN ('MATURED', 'EXCEPTION', 'TERMINATED')`,
      ));
    if (Number(openCount?.count ?? 0) > 0) {
      throw new ConflictError('A tranche cannot move to MATURED until all child orders have a final outcome or exception');
    }
    const [updated] = await db.update(schema.oemsMldTranches).set({
      lifecycle: 'MATURED',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMldTranches.id, trancheId)).returning();
    return updated;
  },

  async listMldOrderDetails(params: { trancheId?: number; tradeStatus?: string } = {}) {
    const conditions = [eq(schema.oemsMldOrderDetails.is_deleted, false)];
    if (params.trancheId) conditions.push(eq(schema.oemsMldOrderDetails.tranche_id, params.trancheId));
    if (params.tradeStatus) conditions.push(eq(schema.oemsMldOrderDetails.trade_status, params.tradeStatus));
    return db.select().from(schema.oemsMldOrderDetails)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMldOrderDetails.created_at))
      .limit(100);
  },

  async listMldFundInstructions(params: { instructionType?: string; status?: string; orderId?: string } = {}) {
    const conditions = [eq(schema.oemsMldFundInstructions.is_deleted, false)];
    if (params.instructionType) conditions.push(eq(schema.oemsMldFundInstructions.instruction_type, params.instructionType.toUpperCase()));
    if (params.status) conditions.push(eq(schema.oemsMldFundInstructions.instruction_status, params.status as typeof schema.oemsIntegrationStatusEnum.enumValues[number]));
    if (params.orderId) conditions.push(eq(schema.oemsMldFundInstructions.order_id, params.orderId));
    return db.select().from(schema.oemsMldFundInstructions)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMldFundInstructions.created_at))
      .limit(100);
  },

  async retrieveWealthCustomerStaticData(data: {
    customerId?: string;
    cif?: string;
    portfolioId?: string;
    sourceSystems?: string[] | string;
    targetSystem?: string;
    sourceStatus?: unknown;
    fieldValues?: unknown;
    sourceOfTruth?: unknown;
    failOnUnavailable?: boolean;
  }, userId: string) {
    const sources = normalizeSourceSystems(data.sourceSystems, ['NCBS', 'RBS', 'AVANTRADE']);
    const rows = [];
    const failedSources: string[] = [];
    for (const source of sources) {
      const retrievalStatus = resolveSourceRetrievalStatus(source, data.sourceStatus);
      const failed = ['UNAVAILABLE', 'FAILED', 'TIMEOUT'].includes(retrievalStatus);
      if (failed) failedSources.push(source);
      const [row] = await db.insert(schema.oemsWealthCustomerStaticData).values({
        static_data_id: makeId('WEALTH-STATIC'),
        customer_id: data.customerId,
        cif: data.cif,
        portfolio_id: data.portfolioId,
        source_system: source,
        target_system: data.targetSystem ?? 'WEALTH_CORE',
        retrieval_status: retrievalStatus,
        field_values: data.fieldValues ?? {},
        source_of_truth: data.sourceOfTruth ?? {},
        conflict_status: 'NONE',
        last_retrieved_at: new Date(),
        failure_reason: failed ? 'Failed customer data retrieval blocks order entry and logs affected source' : undefined,
        payload: { sourceStatus: data.sourceStatus },
        created_by: userId,
      }).returning();
      rows.push(row);
      await this.logIntegrationMessage({
        targetSystem: source,
        messageType: 'WEALTH_CUSTOMER_STATIC_DATA_RETRIEVAL',
        entityType: 'oems_wealth_customer_static_data',
        entityId: row.static_data_id,
        payload: { customerId: data.customerId, cif: data.cif, portfolioId: data.portfolioId },
        responsePayload: row,
        status: failed ? 'FAILED' : 'ACKNOWLEDGED',
        lastError: failed ? 'Failed customer data retrieval blocks order entry and logs affected source' : undefined,
        nextRetryAt: failed ? addSeconds(300) : undefined,
      }, userId);
    }
    if (data.failOnUnavailable && failedSources.length > 0) {
      throw new ConflictError(`Failed customer data retrieval blocks order entry and logs affected source: ${failedSources.join(', ')}`);
    }
    return { rows, failedSources, blocked: failedSources.length > 0 };
  },

  async maintainWealthStaticData(data: {
    customerId?: string;
    cif?: string;
    portfolioId?: string;
    sourceSystem: string;
    targetSystem?: string;
    fieldValues?: unknown;
    sourceOfTruth?: unknown;
    conflictFields?: unknown;
    resolutionComment?: string;
  }, userId: string) {
    const conflictFields = Array.isArray(data.conflictFields) ? data.conflictFields : normalizeStringArray(data.conflictFields);
    const [row] = await db.insert(schema.oemsWealthCustomerStaticData).values({
      static_data_id: makeId('WEALTH-STATIC'),
      customer_id: data.customerId,
      cif: data.cif,
      portfolio_id: data.portfolioId,
      source_system: data.sourceSystem.trim().toUpperCase(),
      target_system: data.targetSystem ?? 'WEALTH_CORE',
      retrieval_status: 'AVAILABLE',
      field_values: data.fieldValues ?? {},
      source_of_truth: data.sourceOfTruth ?? {},
      conflict_status: conflictFields.length > 0 ? 'OPEN' : 'NONE',
      conflict_fields: conflictFields,
      resolution_comment: data.resolutionComment,
      last_retrieved_at: new Date(),
      payload: { BR_019_1: 'Static data is maintained with source-of-truth per field and manual conflict resolution.' },
      created_by: userId,
    }).returning();
    return row;
  },

  async resolveWealthStaticDataConflict(staticDataId: string, data: { resolutionComment: string; fieldValues?: unknown }, userId: string) {
    if (!data.resolutionComment?.trim()) throw new ValidationError('Static-data conflict resolution comment is required');
    const [updated] = await db.update(schema.oemsWealthCustomerStaticData).set({
      field_values: data.fieldValues,
      conflict_status: 'RESOLVED',
      resolution_comment: data.resolutionComment.trim(),
      resolved_by: userId,
      resolved_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsWealthCustomerStaticData.static_data_id, staticDataId)).returning();
    return updated;
  },

  async listWealthCustomerStaticData(params: { customerId?: string; cif?: string; conflictStatus?: string } = {}) {
    const conditions = [eq(schema.oemsWealthCustomerStaticData.is_deleted, false)];
    if (params.customerId) conditions.push(eq(schema.oemsWealthCustomerStaticData.customer_id, params.customerId));
    if (params.cif) conditions.push(eq(schema.oemsWealthCustomerStaticData.cif, params.cif));
    if (params.conflictStatus) conditions.push(eq(schema.oemsWealthCustomerStaticData.conflict_status, params.conflictStatus.toUpperCase()));
    return db.select().from(schema.oemsWealthCustomerStaticData)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsWealthCustomerStaticData.created_at))
      .limit(100);
  },

  async createWealthProductSnapshot(data: {
    productCode: string;
    productFamily: 'MUTUAL_FUND' | 'BOND';
    sourceSystem?: string;
    productStatus?: string;
    setupStatus?: string;
    quotaAmount?: number;
    quotaRemaining?: number;
    offeringStart?: string;
    offeringEnd?: string;
    performance1m?: number;
    performance1y?: number;
    performance3y?: number;
    performance5y?: number;
    performanceRequired?: boolean;
    skuDocumentId?: string;
    pfeDocumentId?: string;
    transactionDocuments?: unknown;
    setupPayload?: unknown;
  }, userId: string) {
    if (!data.productCode?.trim()) throw new ValidationError('Product code is required for Wealth Core product snapshot');
    if (data.offeringStart && data.offeringEnd && data.offeringEnd < data.offeringStart) {
      throw new ValidationError('Product offering end cannot be before offering start');
    }
    const performanceMissing = [data.performance1m, data.performance1y, data.performance3y, data.performance5y]
      .every((value) => value === undefined || value === null);
    const [snapshot] = await db.insert(schema.oemsWealthProductSnapshots).values({
      snapshot_id: makeId('WEALTH-PROD'),
      product_code: data.productCode.trim().toUpperCase(),
      product_family: data.productFamily,
      source_system: data.sourceSystem?.trim().toUpperCase() ?? 'WEALTH_CORE',
      product_status: normalizeUpperToken(data.productStatus, 'ACTIVE'),
      setup_status: normalizeUpperToken(data.setupStatus, 'READY'),
      quota_amount: toMoney(data.quotaAmount),
      quota_remaining: toMoney(data.quotaRemaining ?? data.quotaAmount),
      offering_start: data.offeringStart,
      offering_end: data.offeringEnd,
      performance_1m: toRate(data.performance1m),
      performance_1y: toRate(data.performance1y),
      performance_3y: toRate(data.performance3y),
      performance_5y: toRate(data.performance5y),
      performance_required: data.performanceRequired ?? false,
      performance_status: performanceMissing ? 'MISSING' : 'AVAILABLE',
      sku_document_id: data.skuDocumentId,
      pfe_document_id: data.pfeDocumentId,
      transaction_documents: data.transactionDocuments ?? [],
      setup_payload: data.setupPayload ?? {},
      performance_payload: { missingPerformancePolicy: 'Missing performance data disables performance claims but does not block unless Wealth Core setup requires performance evidence' },
      created_by: userId,
    }).returning();
    return snapshot;
  },

  async validateWealthCoreProductSetup(data: {
    productCode?: string;
    amount?: number;
    quotaRemaining?: number;
    offeringStart?: string;
    offeringEnd?: string;
    performanceRequired?: boolean;
    performanceStatus?: string;
    tradeDate?: string;
  }) {
    const tradeDate = data.tradeDate ?? todayIso();
    const findings: ValidationFinding[] = [];
    if (data.quotaRemaining !== undefined && asNumber(data.amount) > asNumber(data.quotaRemaining)) {
      findings.push({ ruleCode: 'OEMS-WEALTH-QUOTA-001', severity: 'BLOCKING', result: 'FAIL', source: 'WEALTH_CORE', message: 'Wealth Core setup quota is insufficient for the requested order.' });
    }
    if (data.offeringStart && tradeDate < data.offeringStart) {
      findings.push({ ruleCode: 'OEMS-WEALTH-OFFERING-001', severity: 'BLOCKING', result: 'FAIL', source: 'WEALTH_CORE', message: 'Order date is before Wealth Core offering period.' });
    }
    if (data.offeringEnd && tradeDate > data.offeringEnd) {
      findings.push({ ruleCode: 'OEMS-WEALTH-OFFERING-002', severity: 'BLOCKING', result: 'FAIL', source: 'WEALTH_CORE', message: 'Order date is after Wealth Core offering period.' });
    }
    if (normalizeUpperToken(data.performanceStatus, 'AVAILABLE') === 'MISSING') {
      findings.push({
        ruleCode: 'OEMS-WEALTH-PERFORMANCE-001',
        severity: data.performanceRequired ? 'BLOCKING' : 'WARNING',
        result: data.performanceRequired ? 'FAIL' : 'WARN',
        source: 'WEALTH_CORE',
        message: 'Missing performance data disables performance claims but does not block unless Wealth Core setup requires performance evidence.',
      });
    }
    return {
      productCode: data.productCode,
      passed: !findings.some((finding) => finding.severity === 'BLOCKING'),
      performanceClaimsAllowed: !findings.some((finding) => finding.ruleCode === 'OEMS-WEALTH-PERFORMANCE-001'),
      findings,
    };
  },

  async getWealthProductPerformance(productCode: string) {
    const [snapshot] = await db.select().from(schema.oemsWealthProductSnapshots)
      .where(and(
        eq(schema.oemsWealthProductSnapshots.product_code, productCode.trim().toUpperCase()),
        eq(schema.oemsWealthProductSnapshots.is_deleted, false),
      ))
      .orderBy(desc(schema.oemsWealthProductSnapshots.created_at))
      .limit(1);
    if (!snapshot) throw new NotFoundError('Wealth product snapshot not found');
    const performance = {
      oneMonth: asNumber(snapshot.performance_1m),
      oneYear: asNumber(snapshot.performance_1y),
      threeYear: asNumber(snapshot.performance_3y),
      fiveYear: asNumber(snapshot.performance_5y),
    };
    return {
      productCode: snapshot.product_code,
      productFamily: snapshot.product_family,
      performance,
      performanceClaimsAllowed: snapshot.performance_status !== 'MISSING',
      blocking: snapshot.performance_required && snapshot.performance_status === 'MISSING',
      policy: 'Missing performance data disables performance claims but does not block unless Wealth Core setup requires performance evidence',
    };
  },

  async listWealthProductSnapshots(params: { productFamily?: OemsProductFamily; productCode?: string } = {}) {
    const conditions = [eq(schema.oemsWealthProductSnapshots.is_deleted, false)];
    if (params.productFamily) conditions.push(eq(schema.oemsWealthProductSnapshots.product_family, params.productFamily));
    if (params.productCode) conditions.push(eq(schema.oemsWealthProductSnapshots.product_code, params.productCode.trim().toUpperCase()));
    return db.select().from(schema.oemsWealthProductSnapshots)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsWealthProductSnapshots.created_at))
      .limit(100);
  },

  async registerSidAccount(data: {
    customerId?: string;
    cif?: string;
    portfolioId?: string;
    sid?: string;
    accountNo?: string;
    status?: string;
  }, userId: string) {
    const status = normalizeUpperToken(data.status, 'OPENED');
    const row = await this.maintainWealthStaticData({
      customerId: data.customerId,
      cif: data.cif,
      portfolioId: data.portfolioId,
      sourceSystem: 'WEALTH_CORE',
      fieldValues: { sid: data.sid, accountNo: data.accountNo, sidStatus: status },
      sourceOfTruth: { sid: 'WEALTH_CORE', investmentAccount: 'WEALTH_CORE' },
    }, userId);
    await this.logIntegrationMessage({
      targetSystem: 'WEALTH_CORE',
      messageType: 'SID_ACCOUNT_PORTFOLIO_REGISTRATION',
      entityType: 'oems_wealth_customer_static_data',
      entityId: row.static_data_id,
      payload: data,
      status: status === 'OPENED' ? 'ACKNOWLEDGED' : 'FAILED',
      lastError: status === 'OPENED' ? undefined : 'SID and account portfolio registration for NTI customer is incomplete',
    }, userId);
    return row;
  },

  async initiatePfeRegistration(data: { customerId?: string; productCode?: string; pfeId?: string; status?: string; payload?: unknown }, userId: string) {
    const status = normalizeUpperToken(data.status, 'CAPTURED');
    return this.logIntegrationMessage({
      targetSystem: 'WEALTH_CORE',
      messageType: 'PFE_INITIATION',
      entityType: 'oems_customer',
      entityId: data.customerId ?? 'UNKNOWN',
      payload: { productCode: data.productCode, pfeId: data.pfeId, payload: data.payload },
      status: status === 'CAPTURED' ? 'ACKNOWLEDGED' : 'FAILED',
      lastError: status === 'CAPTURED' ? undefined : 'PFE initiation failed or is incomplete',
    }, userId);
  },

  async syncSalesCertificationToWealthCore(data: { salesUserId: string; productFamily?: OemsProductFamily; certificationStatus?: string; evidence?: unknown }, userId: string) {
    const status = normalizeUpperToken(data.certificationStatus, 'ACTIVE');
    return this.logIntegrationMessage({
      targetSystem: 'WEALTH_CORE',
      messageType: 'SALES_CERTIFICATION_SYNC',
      entityType: 'oems_sales_certification',
      entityId: data.salesUserId,
      payload: { productFamily: data.productFamily, status, evidence: data.evidence },
      status: status === 'ACTIVE' ? 'ACKNOWLEDGED' : 'FAILED',
      lastError: status === 'ACTIVE' ? undefined : 'Sales certification sync/update to Wealth Core failed or certification is inactive',
    }, userId);
  },

  async createMfBondOrder(data: {
    productFamily: 'MUTUAL_FUND' | 'BOND';
    transactionType?: string;
    transactionVariant?: string;
    customerId?: string;
    portfolioId?: string;
    productId?: number;
    productCode?: string;
    amount: number;
    currency?: string;
    sidOpened?: boolean;
    sidStatus?: string;
    accountPortfolioStatus?: string;
    pfeCaptured?: boolean;
    pfeStatus?: string;
    riskProfileCurrent?: boolean;
    riskProfileStatus?: string;
    staticDataSynced?: boolean;
    staticDataStatus?: string;
    salesCertificationStatus?: string;
    digitalVerificationStatus?: string;
    digitalVerificationExpiresAt?: string;
    channel?: OemsChannel;
    assistedByUserId?: string;
    branchCode?: string;
    cherryPickLots?: unknown;
    switchDetails?: unknown;
    auctionDetails?: unknown;
    buybackDetails?: unknown;
    documentRefs?: unknown;
    sourceStatus?: unknown;
    quotaRemaining?: number;
    offeringStart?: string;
    offeringEnd?: string;
    performanceRequired?: boolean;
    performanceStatus?: string;
    payload?: unknown;
  }, userId: string) {
    const transactionVariant = normalizeMfBondVariant(data.productFamily, data.transactionVariant ?? data.transactionType);
    const transactionType = data.transactionType?.trim().toUpperCase() ?? transactionVariant;
    const sidStatus = data.sidStatus ? normalizeUpperToken(data.sidStatus, 'PENDING') : statusFromBoolean(data.sidOpened, 'OPENED');
    const accountPortfolioStatus = normalizeUpperToken(data.accountPortfolioStatus, sidStatus === 'OPENED' ? 'OPENED' : 'PENDING');
    const pfeStatus = data.pfeStatus ? normalizeUpperToken(data.pfeStatus, 'PENDING') : statusFromBoolean(data.pfeCaptured, 'CAPTURED');
    const riskProfileStatus = data.riskProfileStatus ? normalizeUpperToken(data.riskProfileStatus, 'PENDING') : statusFromBoolean(data.riskProfileCurrent, 'CURRENT');
    const staticDataStatus = data.staticDataStatus ? normalizeUpperToken(data.staticDataStatus, 'PENDING') : statusFromBoolean(data.staticDataSynced, 'SYNCED');
    const salesCertificationStatus = normalizeUpperToken(data.salesCertificationStatus, 'ACTIVE');
    const digitalVerificationStatus = normalizeUpperToken(data.digitalVerificationStatus, 'CONFIRMED');
    const digitalExpiry = asOptionalString(data.digitalVerificationExpiresAt) ? new Date(String(data.digitalVerificationExpiresAt)) : undefined;
    const productSetup = await this.validateWealthCoreProductSetup({
      productCode: data.productCode,
      amount: data.amount,
      quotaRemaining: data.quotaRemaining,
      offeringStart: data.offeringStart,
      offeringEnd: data.offeringEnd,
      performanceRequired: data.performanceRequired,
      performanceStatus: data.performanceStatus,
    });

    const order = await this.createOrder({
      productFamily: data.productFamily,
      transactionType,
      customerId: data.customerId,
      portfolioId: data.portfolioId,
      productId: data.productId,
      channel: data.channel,
      assistedByUserId: data.assistedByUserId,
      branchCode: data.branchCode,
      currency: data.currency,
      amount: data.amount,
      documentStatus: 'REQUIRED',
      verificationStatus: digitalVerificationStatus === 'EXPIRED' ? 'EXPIRED' : 'PENDING',
      payload: {
        ...asRecord(data.payload),
        transactionVariant,
        BR_018_1: 'MF transaction variants include subscription, full/partial redemption, full/partial switching and DRIP.',
        BR_018_2: 'Bond variants include buy/sell with cherry pick, switching with cherry pick, auction and buyback.',
      },
    }, userId);

    const findings: ValidationFinding[] = [...productSetup.findings];
    if (!isStatusReady(sidStatus) || !isStatusReady(accountPortfolioStatus)) findings.push({ ruleCode: 'OEMS-MFBOND-SID-001', severity: 'BLOCKING', result: 'FAIL', source: 'WEALTH_CORE', message: 'SID and account portfolio registration for NTI customer must be complete before order entry.' });
    if (!isStatusReady(pfeStatus)) findings.push({ ruleCode: 'OEMS-MFBOND-PFE-001', severity: 'BLOCKING', result: 'FAIL', source: 'WEALTH_CORE', message: 'PFE initiation must be captured before MF/Bond transaction submission.' });
    if (!isStatusReady(riskProfileStatus)) findings.push({ ruleCode: 'OEMS-MFBOND-RISK-001', severity: 'BLOCKING', result: 'FAIL', source: 'OEMS_RISK', message: 'Risk profile assessment must be current before transaction.' });
    if (!isStatusReady(staticDataStatus)) findings.push({ ruleCode: 'OEMS-MFBOND-STATIC-001', severity: 'BLOCKING', result: 'FAIL', source: 'NCBS_RBS_AVANTRADE', message: 'Static data from NCBS, RBS and Avantrade must be retrieved before order entry.' });
    if (!isStatusReady(salesCertificationStatus)) findings.push({ ruleCode: 'OEMS-MFBOND-SALES-CERT-001', severity: 'BLOCKING', result: 'FAIL', source: 'WEALTH_CORE', message: 'Sales certification must be active and synced to Wealth Core before handoff.' });
    if (digitalVerificationStatus === 'EXPIRED' || (digitalExpiry && digitalExpiry.getTime() <= Date.now())) {
      findings.push({ ruleCode: 'OEMS-MFBOND-DIGITAL-001', severity: 'BLOCKING', result: 'FAIL', source: 'OEMS_DIGITAL', message: 'Digital verification expiry blocks Wealth Core handoff.' });
    }
    if (data.productFamily === 'MUTUAL_FUND' && transactionVariant.includes('SWITCH') && Object.keys(asRecord(data.switchDetails)).length === 0) {
      findings.push({ ruleCode: 'OEMS-MF-SWITCH-001', severity: 'BLOCKING', result: 'FAIL', message: 'Mutual-fund switching requires source and target product details.' });
    }
    if (data.productFamily === 'BOND' && ['SELL', 'SWITCHING'].includes(transactionVariant) && !Array.isArray(data.cherryPickLots)) {
      findings.push({ ruleCode: 'OEMS-BOND-CHERRY-PICK-001', severity: 'BLOCKING', result: 'FAIL', message: 'Bond sell/switch transactions require cherry-pick lot selection.' });
    }

    const [detail] = await db.insert(schema.oemsMfBondOrderDetails).values({
      order_id: order.order_id,
      product_family: data.productFamily,
      product_code: data.productCode?.trim().toUpperCase(),
      transaction_variant: transactionVariant,
      sid_status: sidStatus,
      account_portfolio_status: accountPortfolioStatus,
      pfe_status: pfeStatus,
      risk_profile_status: riskProfileStatus,
      static_data_status: staticDataStatus,
      sales_certification_status: salesCertificationStatus,
      digital_verification_status: digitalVerificationStatus,
      digital_verification_expires_at: digitalExpiry,
      wealth_core_target: 'WEALTH_CORE',
      wealth_core_status: findings.some((finding) => finding.severity === 'BLOCKING') ? 'NOT_SENT' : 'READY_TO_SEND',
      product_setup_status: productSetup.passed ? 'PASS' : 'FAILED',
      quota_validation_status: productSetup.findings.some((finding) => finding.ruleCode.includes('QUOTA')) ? 'FAILED' : 'PASS',
      offering_validation_status: productSetup.findings.some((finding) => finding.ruleCode.includes('OFFERING')) ? 'FAILED' : 'PASS',
      performance_claim_status: productSetup.performanceClaimsAllowed ? 'AVAILABLE' : 'DISABLED',
      cherry_pick_lots: data.cherryPickLots ?? [],
      switch_details: data.switchDetails ?? {},
      auction_details: data.auctionDetails ?? {},
      buyback_details: data.buybackDetails ?? {},
      document_refs: data.documentRefs ?? [],
      source_status: data.sourceStatus ?? {},
      payload: { productSetup, findings: findings.map((finding) => finding.ruleCode) },
      created_by: userId,
    }).returning();

    const persistedFindings = findings.length > 0
      ? await persistValidationFindings(order.order_id, findings, userId)
      : await persistValidationFindings(order.order_id, [{ ruleCode: 'OEMS-MFBOND-PASS', severity: 'INFO', result: 'PASS', message: 'MF/Bond pre-trade checks passed.' }], userId);

    if (findings.some((finding) => finding.severity === 'BLOCKING')) {
      await updateOrderWithTransition(order, 'VALIDATION_FAILED', { suitability_result: 'FAIL' }, 'OEMS_MFBOND_PRETRADE_FAILED', userId, undefined, { findingCodes: findings.map((finding) => finding.ruleCode) });
    } else {
      await this.handoffMfBondOrderToWealthCore(order.order_id, { handoffStatus: 'SENT' }, userId);
    }

    return { order, detail, findings: persistedFindings, submissionBlocked: findings.some((finding) => finding.severity === 'BLOCKING') };
  },

  async amendMfBondOrder(orderId: string, data: Partial<{ amount: number; payload: unknown; documentRefs: unknown; switchDetails: unknown; cherryPickLots: unknown }>, userId: string) {
    const detail = await getMfBondOrderDetail(orderId);
    if (!['NOT_SENT', 'READY_TO_SEND', 'FAILED'].includes(detail.wealth_core_status)) {
      throw new ConflictError('MF/Bond create, reject, and amend order lifecycle is auditable before Wealth Core handoff');
    }
    const updatedOrder = await this.amendOrder(orderId, { amount: data.amount, payload: data.payload }, userId);
    await db.update(schema.oemsMfBondOrderDetails).set({
      document_refs: data.documentRefs,
      switch_details: data.switchDetails,
      cherry_pick_lots: data.cherryPickLots,
      payload: { ...asRecord(detail.payload), amendment: data },
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMfBondOrderDetails.order_id, orderId));
    return updatedOrder;
  },

  async rejectMfBondOrder(orderId: string, data: { reason: string }, userId: string) {
    if (!data.reason?.trim()) throw new ValidationError('MF/Bond rejection reason is required');
    const order = await getOemsOrder(orderId);
    if (!['MUTUAL_FUND', 'BOND'].includes(order.product_family)) throw new ValidationError('Order is not an MF/Bond order');
    await db.update(schema.oemsMfBondOrderDetails).set({
      wealth_core_status: 'REJECTED',
      wealth_core_rejection_reason: data.reason.trim(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMfBondOrderDetails.order_id, orderId));
    return updateOrderWithTransition(order, 'REJECTED', {}, 'OEMS_MFBOND_REJECTED', userId, data.reason);
  },

  async lockBondLivePrice(orderId: string, data: {
    bondCode?: string;
    requestedPrice: number;
    marketPrice?: number;
    lowerBound?: number;
    upperBound?: number;
    ttlSeconds?: number;
    payload?: unknown;
  }, userId: string) {
    const order = await getOemsOrder(orderId);
    if (order.product_family !== 'BOND') throw new ValidationError('Order is not a bond order');
    const requested = asNumber(data.requestedPrice);
    const lower = asNumber(data.lowerBound);
    const upper = asNumber(data.upperBound);
    const inRange = lower > 0 && upper > 0 && requested >= lower && requested <= upper;
    const approvalRoute = inRange ? 'SUPERVISOR' : 'TREASURY';
    const [lock] = await db.insert(schema.oemsBondPricingLocks).values({
      lock_id: makeId('BOND-LOCK'),
      order_id: orderId,
      bond_code: data.bondCode?.trim().toUpperCase() ?? String(order.product_id ?? 'BOND'),
      requested_price: toRate(requested) ?? '0.00000000',
      market_price: toRate(data.marketPrice),
      lower_bound: toRate(data.lowerBound),
      upper_bound: toRate(data.upperBound),
      locked_price: toRate(requested) ?? '0.00000000',
      locked_until: addSeconds(data.ttlSeconds ?? 60),
      approval_route: approvalRoute,
      lock_status: 'LOCKED',
      approval_status: 'PENDING',
      payload: { ...asRecord(data.payload), rule: 'Bond live pricing out of range routes to Treasury, in-range exceptions route to supervisor approval' },
      created_by: userId,
    }).returning();
    await db.update(schema.oemsMfBondOrderDetails).set({
      supervisor_approval_status: approvalRoute === 'SUPERVISOR' ? 'PENDING' : undefined,
      treasury_approval_status: approvalRoute === 'TREASURY' ? 'PENDING' : undefined,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMfBondOrderDetails.order_id, orderId));
    return lock;
  },

  async handoffMfBondOrderToWealthCore(orderId: string, data: { handoffStatus?: string; wealthCoreOrderId?: string; rejectionReason?: string; responsePayload?: unknown } = {}, userId: string) {
    const order = await getOemsOrder(orderId);
    if (!['MUTUAL_FUND', 'BOND'].includes(order.product_family)) throw new ValidationError('Order is not an MF/Bond order');
    const detail = await getMfBondOrderDetail(orderId).catch(() => undefined);
    if (order.verification_status === 'EXPIRED' || detail?.digital_verification_status === 'EXPIRED') {
      throw new ConflictError('Digital verification expiry blocks Wealth Core handoff');
    }
    const status = normalizeUpperToken(data.handoffStatus, data.rejectionReason ? 'REJECTED' : 'SENT');
    await db.update(schema.oemsMfBondOrderDetails).set({
      wealth_core_status: status,
      wealth_core_order_id: data.wealthCoreOrderId,
      wealth_core_rejection_reason: data.rejectionReason,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMfBondOrderDetails.order_id, orderId));
    return this.logIntegrationMessage({
      targetSystem: 'WEALTH_CORE',
      messageType: `${order.product_family}_${order.transaction_type}_HANDOFF`,
      entityType: 'oems_order',
      entityId: orderId,
      payload: { order, detail },
      responsePayload: data.responsePayload,
      status: status === 'REJECTED' || status === 'FAILED' ? 'FAILED' : 'QUEUED',
      lastError: data.rejectionReason,
    }, userId);
  },

  async syncWealthCoreOrderStatus(orderId: string, data: { wealthCoreStatus: string; wealthCoreOrderId?: string; rejectionReason?: string; responsePayload?: unknown }, userId: string) {
    const order = await getOemsOrder(orderId);
    const status = normalizeUpperToken(data.wealthCoreStatus, 'ACKNOWLEDGED');
    await db.update(schema.oemsMfBondOrderDetails).set({
      wealth_core_status: status,
      wealth_core_order_id: data.wealthCoreOrderId,
      wealth_core_rejection_reason: data.rejectionReason,
      payload: { responsePayload: data.responsePayload, rule: 'Wealth Core handoff status sync captures downstream rejection reason' },
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMfBondOrderDetails.order_id, orderId));
    const nextStatus: OemsOrderStatus = ['REJECTED', 'FAILED'].includes(status) ? 'REJECTED' : status === 'BOOKED' ? 'BOOKED' : order.order_status;
    if (nextStatus !== order.order_status) {
      return updateOrderWithTransition(order, nextStatus, {}, 'OEMS_WEALTH_CORE_STATUS_SYNC', userId, data.rejectionReason, { wealthCoreStatus: status });
    }
    return getMfBondOrderDetail(orderId);
  },

  async listMfBondOrderDetails(params: { productFamily?: 'MUTUAL_FUND' | 'BOND'; wealthCoreStatus?: string } = {}) {
    const conditions = [eq(schema.oemsMfBondOrderDetails.is_deleted, false)];
    if (params.productFamily) conditions.push(eq(schema.oemsMfBondOrderDetails.product_family, params.productFamily));
    if (params.wealthCoreStatus) conditions.push(eq(schema.oemsMfBondOrderDetails.wealth_core_status, params.wealthCoreStatus.toUpperCase()));
    return db.select().from(schema.oemsMfBondOrderDetails)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMfBondOrderDetails.created_at))
      .limit(100);
  },

  async listBondPricingLocks(params: { orderId?: string; approvalRoute?: string } = {}) {
    const conditions = [eq(schema.oemsBondPricingLocks.is_deleted, false)];
    if (params.orderId) conditions.push(eq(schema.oemsBondPricingLocks.order_id, params.orderId));
    if (params.approvalRoute) conditions.push(eq(schema.oemsBondPricingLocks.approval_route, params.approvalRoute.toUpperCase()));
    return db.select().from(schema.oemsBondPricingLocks)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsBondPricingLocks.created_at))
      .limit(100);
  },

  async createFxLiveRate(data: {
    currencyPair: string;
    bidRate?: number;
    askRate?: number;
    midRate: number;
    sourceSystem?: string;
    rateStatus?: string;
    ttlSeconds?: number;
    payload?: unknown;
  }, userId: string) {
    const pair = normalizeCurrencyPair(data.currencyPair);
    const [rate] = await db.insert(schema.oemsFxLiveRates).values({
      rate_id: makeId('FX-RATE'),
      currency_pair: pair.currencyPair,
      base_currency: pair.dealtCurrency,
      quote_currency: pair.counterCurrency,
      bid_rate: toRate(data.bidRate),
      ask_rate: toRate(data.askRate),
      mid_rate: toRate(data.midRate) ?? '0.00000000',
      source_system: data.sourceSystem?.trim().toUpperCase() ?? 'TREASURY',
      rate_status: normalizeUpperToken(data.rateStatus, 'AVAILABLE'),
      rate_timestamp: new Date(),
      expires_at: addSeconds(data.ttlSeconds ?? 30),
      payload: data.payload ?? {},
      created_by: userId,
    }).returning();
    return rate;
  },

  async listFxLiveRates(params: { currencyPair?: string; status?: string } = {}) {
    const conditions = [eq(schema.oemsFxLiveRates.is_deleted, false)];
    if (params.currencyPair) conditions.push(eq(schema.oemsFxLiveRates.currency_pair, params.currencyPair.toUpperCase()));
    if (params.status) conditions.push(eq(schema.oemsFxLiveRates.rate_status, params.status.toUpperCase()));
    return db.select().from(schema.oemsFxLiveRates)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsFxLiveRates.rate_timestamp))
      .limit(100);
  },

  async createFxTodayOrder(data: {
    customerId?: string;
    portfolioId?: string;
    currencyPair: string;
    dealtCurrency: string;
    counterCurrency: string;
    debitCurrency?: string;
    debitAccountNo?: string;
    creditAccountNo?: string;
    amount: number;
    specialRate: number;
    quoteTtlSeconds?: number;
    underlyingDocumentThreshold?: number;
    underlyingDocumentId?: string;
    customerDetailStatus?: string;
    accountStatus?: string;
    skuStatus?: string;
    pfeStatus?: string;
    digitalAuthStatus?: string;
    fallbackVerifierRole?: string;
    treasurySndApprovalRequired?: boolean;
    lhbuPurposeCode?: string;
    sourceStatus?: unknown;
    channel?: OemsChannel;
    assistedByUserId?: string;
    branchCode?: string;
  }, userId: string) {
    const pair = normalizeCurrencyPair(data.currencyPair, data.dealtCurrency, data.counterCurrency);
    const expiresAt = addSeconds(data.quoteTtlSeconds ?? 30);
    const debitCurrency = normalizeCurrencyCode(data.debitCurrency ?? data.counterCurrency, 'Debit currency');
    const needsUnderlyingDoc = data.underlyingDocumentThreshold !== undefined
      && debitCurrency === 'IDR'
      && data.amount > data.underlyingDocumentThreshold
      && !data.underlyingDocumentId;
    const quoteHash = buildFxQuoteHash({
      currencyPair: pair.currencyPair,
      dealtCurrency: pair.dealtCurrency,
      counterCurrency: pair.counterCurrency,
      amount: data.amount,
      rate: data.specialRate,
      expiresAt,
    });
    const customerDetailStatus = normalizeUpperToken(data.customerDetailStatus, 'AVAILABLE');
    const accountStatus = normalizeUpperToken(data.accountStatus, 'AVAILABLE');
    const skuStatus = normalizeUpperToken(data.skuStatus, 'AVAILABLE');
    const pfeStatus = normalizeUpperToken(data.pfeStatus, 'AVAILABLE');

    const order = await this.createOrder({
      productFamily: 'FX_TODAY',
      transactionType: 'FX_TODAY_SPECIAL_RATE',
      customerId: data.customerId,
      portfolioId: data.portfolioId,
      channel: data.channel ?? 'OEMS_DIRECT',
      assistedByUserId: data.assistedByUserId,
      branchCode: data.branchCode,
      currency: pair.dealtCurrency,
      amount: data.amount,
      rate: data.specialRate,
      tradeDate: todayIso(),
      valueDate: todayIso(),
      documentStatus: needsUnderlyingDoc ? 'REQUIRED' : 'WAIVED',
      verificationStatus: 'PENDING',
      specialRateExpiresAt: expiresAt,
      customerConfirmationDeadline: expiresAt,
      assignedRole: data.treasurySndApprovalRequired === false ? 'BO_CHECKER' : 'TREASURY_SND',
      payload: {
        currencyPair: pair.currencyPair,
        dealtCurrency: pair.dealtCurrency,
        counterCurrency: pair.counterCurrency,
        debitCurrency,
        underlyingDocumentThreshold: data.underlyingDocumentThreshold,
        underlyingDocumentId: data.underlyingDocumentId,
        quoteHash,
      },
    }, userId);

    await db.insert(schema.oemsFxTodayDetails).values({
      order_id: order.order_id,
      currency_pair: pair.currencyPair,
      dealt_currency: pair.dealtCurrency,
      counter_currency: pair.counterCurrency,
      debit_currency: debitCurrency,
      debit_account_no: data.debitAccountNo,
      credit_account_no: data.creditAccountNo,
      amount: toMoney(data.amount) ?? '0.0000',
      quote_rate: toRate(data.specialRate) ?? '0.00000000',
      latest_rate: toRate(data.specialRate),
      quote_hash: quoteHash,
      customer_detail_status: customerDetailStatus,
      account_status: accountStatus,
      sku_status: skuStatus,
      pfe_status: pfeStatus,
      digital_auth_status: normalizeUpperToken(data.digitalAuthStatus, 'PENDING'),
      fallback_verifier_role: data.fallbackVerifierRole,
      treasury_snd_approval_status: data.treasurySndApprovalRequired === false ? 'NOT_REQUIRED' : 'PENDING',
      lhbu_purpose_code: data.lhbuPurposeCode,
      underlying_document_required: needsUnderlyingDoc,
      underlying_document_id: data.underlyingDocumentId,
      source_status: data.sourceStatus ?? {},
      payload: { quoteHash, BR_020_1: 'FX Today homepage uses live Treasury rates with countdown-bound customer confirmation.' },
      created_by: userId,
    }).returning();

    await this.logIntegrationMessage({
      targetSystem: 'TREASURY',
      messageType: 'FX_TODAY_SPECIAL_RATE_REQUEST',
      entityType: 'oems_order',
      entityId: order.order_id,
      payload: order,
    }, userId);

    const findings: ValidationFinding[] = [];
    if (!isStatusReady(customerDetailStatus) || !isStatusReady(accountStatus) || !isStatusReady(skuStatus) || !isStatusReady(pfeStatus)) {
      findings.push({ ruleCode: 'OEMS-FX-CUSTOMER-DATA-001', severity: 'BLOCKING', result: 'FAIL', source: 'NCBS_WEALTH_CORE', message: 'FX Today CIF/account/SKU/PFE retrieval must succeed before order entry.' });
    }
    if (needsUnderlyingDoc) {
      findings.push({ ruleCode: 'OEMS-FX-DOC-001', severity: 'BLOCKING', result: 'FAIL', message: 'Underlying document is required when debit currency is IDR and amount is above configured threshold.' });
    }
    if (findings.length > 0) {
      await persistValidationFindings(order.order_id, findings, userId);
      await updateOrderWithTransition(order, 'VALIDATION_FAILED', { suitability_result: 'FAIL' }, 'OEMS_FX_PRETRADE_FAILED', userId, undefined, { findingCodes: findings.map((finding) => finding.ruleCode) });
    }

    return order;
  },

  async refreshFxTodayRate(orderId: string, data: { latestRate: number; ttlSeconds?: number }, userId: string) {
    const order = await getOemsOrder(orderId);
    if (order.product_family !== 'FX_TODAY') throw new ValidationError('Order is not an FX Today order');
    const detail = await getFxTodayDetail(orderId);
    const expiresAt = addSeconds(data.ttlSeconds ?? 30);
    const newHash = buildFxQuoteHash({
      currencyPair: detail.currency_pair,
      dealtCurrency: detail.dealt_currency,
      counterCurrency: detail.counter_currency,
      amount: detail.amount,
      rate: data.latestRate,
      expiresAt,
    });
    const changed = newHash !== detail.quote_hash || asNumber(detail.quote_rate) !== asNumber(data.latestRate);
    const [updated] = await db.update(schema.oemsFxTodayDetails).set({
      latest_rate: toRate(data.latestRate),
      quote_hash: newHash,
      confirmation_status: changed ? 'RATE_REFRESH_REQUIRED' : detail.confirmation_status,
      payload: { ...asRecord(detail.payload), rule: 'FX Today rate changed during confirmation; customer must reconfirm refreshed rate' },
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsFxTodayDetails.order_id, orderId)).returning();
    await db.update(schema.oemsOrders).set({
      rate: toRate(data.latestRate),
      special_rate_expires_at: expiresAt,
      customer_confirmation_deadline: expiresAt,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsOrders.order_id, orderId));
    return { detail: updated, quoteChanged: changed };
  },

  async confirmFxTodayOrder(orderId: string, data: { customerConfirmed: boolean; manualFallbackReason?: string; quoteHash?: string; confirmedRate?: number; fallbackVerifierRole?: string }, userId: string) {
    const order = await getOemsOrder(orderId);
    if (order.product_family !== 'FX_TODAY') throw new ValidationError('Order is not an FX Today order');
    const detail = await getFxTodayDetail(orderId).catch(() => undefined);
    if (order.special_rate_expires_at && new Date(order.special_rate_expires_at).getTime() < Date.now()) {
      await updateOrderWithTransition(order, 'EXPIRED', { verification_status: 'EXPIRED' }, 'OEMS_FX_QUOTE_EXPIRED', userId);
      throw new ConflictError('FX Today quote expired before customer confirmation');
    }
    const suppliedHash = data.quoteHash;
    const rateChanged = detail && (
      (suppliedHash && suppliedHash !== detail.quote_hash)
      || (data.confirmedRate !== undefined && asNumber(data.confirmedRate) !== asNumber(detail.latest_rate ?? detail.quote_rate))
      || detail.confirmation_status === 'RATE_REFRESH_REQUIRED'
    );
    if (rateChanged) {
      await db.update(schema.oemsFxTodayDetails).set({
        confirmation_status: 'RATE_REFRESH_REQUIRED',
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsFxTodayDetails.order_id, orderId));
      throw new ConflictError('FX Today rate changed during confirmation; customer must reconfirm refreshed rate');
    }

    const verificationStatus = data.manualFallbackReason ? 'MANUAL_VERIFIED' : data.customerConfirmed ? 'CONFIRMED' : 'FAILED';
    if (detail) {
      await db.update(schema.oemsFxTodayDetails).set({
        confirmation_status: verificationStatus === 'FAILED' ? 'REJECTED' : 'CONFIRMED',
        digital_auth_status: verificationStatus,
        fallback_verifier_role: data.fallbackVerifierRole ?? (data.manualFallbackReason ? 'BSM_OR_HEAD_TELLER' : detail.fallback_verifier_role),
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsFxTodayDetails.order_id, orderId));
    }
    return updateOrderWithTransition(
      order,
      verificationStatus === 'FAILED' ? 'REJECTED' : 'PENDING_APPROVAL',
      {
        verification_status: verificationStatus,
        payload: {
          ...(order.payload as Record<string, unknown> | null ?? {}),
          customerConfirmed: data.customerConfirmed,
          manualFallbackReason: data.manualFallbackReason,
          fallbackVerifierRole: data.fallbackVerifierRole,
        },
      },
      verificationStatus === 'FAILED' ? 'OEMS_FX_CUSTOMER_REJECTED' : 'OEMS_FX_CUSTOMER_CONFIRMED',
      userId,
      data.manualFallbackReason,
    );
  },

  async approveFxTreasurySnd(orderId: string, data: { approved: boolean; reason?: string; treasuryReference?: string }, userId: string) {
    const order = await getOemsOrder(orderId);
    if (order.product_family !== 'FX_TODAY') throw new ValidationError('Order is not an FX Today order');
    const status = data.approved ? 'APPROVED' : 'REJECTED';
    await db.update(schema.oemsFxTodayDetails).set({
      treasury_snd_approval_status: status,
      payload: { treasuryReference: data.treasuryReference, reason: data.reason, rule: 'Treasury SND Sales approval is captured for eligible FX Today special-rate transactions.' },
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsFxTodayDetails.order_id, orderId));
    if (!data.approved) return updateOrderWithTransition(order, 'REJECTED', {}, 'OEMS_FX_TREASURY_SND_REJECTED', userId, data.reason);
    return getFxTodayDetail(orderId);
  },

  async confirmFxLhbuPurposeCode(orderId: string, data: { purposeCode: string; confirmed: boolean; settlementStatus?: string }, userId: string) {
    if (!data.purposeCode?.trim()) throw new ValidationError('LHBU purpose code is required for TIWO/Trade Operation confirmation');
    const [updated] = await db.update(schema.oemsFxTodayDetails).set({
      lhbu_purpose_code: data.purposeCode.trim().toUpperCase(),
      lhbu_confirmation_status: data.confirmed ? 'CONFIRMED' : 'REJECTED',
      settlement_status: normalizeUpperToken(data.settlementStatus, data.confirmed ? 'READY_FOR_SETTLEMENT' : 'PENDING'),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsFxTodayDetails.order_id, orderId)).returning();
    return updated;
  },

  async approveFxTodayOrder(orderId: string, data: { ncbsReference?: string; treasuryReference?: string; settlementStatus?: string; overbookSucceeded?: boolean; confirmationNoticeUrl?: string } = {}, userId: string) {
    const order = await getOemsOrder(orderId);
    if (order.product_family !== 'FX_TODAY') throw new ValidationError('Order is not an FX Today order');
    assertDigitalVerificationReady(order);
    await this.assertDocumentChecklistReady(orderId, 'EXECUTION');
    if (!['PENDING_APPROVAL', 'APPROVED'].includes(order.order_status)) {
      throw new ConflictError(`Cannot approve FX Today order in status ${order.order_status}`);
    }
    const detail = await getFxTodayDetail(orderId).catch(() => undefined);

    const updated = await updateOrderWithTransition(order, 'APPROVED', { approved_at: new Date() }, 'OEMS_FX_APPROVED', userId);
    const overbookStatus = data.overbookSucceeded === false ? 'FAILED' : 'BOOKED';
    if (detail) {
      await db.update(schema.oemsFxTodayDetails).set({
        overbook_status: overbookStatus,
        blotter_status: 'BOOKED',
        settlement_status: normalizeUpperToken(data.settlementStatus, 'PENDING'),
        confirmation_notice_url: data.confirmationNoticeUrl,
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsFxTodayDetails.order_id, orderId));
      await db.insert(schema.oemsFxTodayBlotterEntries).values({
        blotter_id: makeId('FX-BLOTTER'),
        order_id: orderId,
        currency_pair: detail.currency_pair,
        dealt_currency: detail.dealt_currency,
        amount: detail.amount,
        booked_rate: detail.latest_rate ?? detail.quote_rate,
        ncbs_reference: data.ncbsReference,
        treasury_reference: data.treasuryReference,
        confirmation_notice_url: data.confirmationNoticeUrl,
        blotter_status: 'BOOKED',
        settlement_status: normalizeUpperToken(data.settlementStatus, 'PENDING'),
        payload: { rule: 'NCBS overbook, FX blotter and confirmation notice are captured after FX Today approval.' },
        created_by: userId,
      }).returning();
    }

    await Promise.all([
      this.logIntegrationMessage({ targetSystem: 'NCBS', messageType: 'FX_TODAY_OVERBOOK', entityType: 'oems_order', entityId: orderId, payload: updated, status: overbookStatus === 'FAILED' ? 'FAILED' : 'ACKNOWLEDGED', lastError: overbookStatus === 'FAILED' ? 'NCBS_OVERBOOK_FAILED' : undefined }, userId),
      this.logIntegrationMessage({ targetSystem: 'TREASURY_SND', messageType: 'FX_TODAY_APPROVAL', entityType: 'oems_order', entityId: orderId, payload: updated, responsePayload: { treasuryReference: data.treasuryReference } }, userId),
    ]);

    return updated;
  },

  async runFxTodayEodSettlementCheck(data: { businessDate?: string } = {}, userId: string) {
    const rows = await db.select().from(schema.oemsFxTodayDetails)
      .where(and(
        eq(schema.oemsFxTodayDetails.is_deleted, false),
        sql`${schema.oemsFxTodayDetails.settlement_status} NOT IN ('SETTLED', 'CANCELLED', 'REJECTED')`,
      ))
      .limit(500) as OemsFxTodayDetail[];
    for (const row of rows) {
      await db.update(schema.oemsFxTodayDetails).set({
        eod_alert_status: 'ALERTED',
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsFxTodayDetails.order_id, row.order_id));
      await this.logIntegrationMessage({
        targetSystem: 'OEMS_OPERATIONS',
        messageType: 'FX_TODAY_EOD_PENDING_SETTLEMENT',
        entityType: 'oems_order',
        entityId: row.order_id,
        status: 'FAILED',
        payload: { businessDate: data.businessDate ?? todayIso(), settlementStatus: row.settlement_status },
        lastError: 'Pending FX Today settlement at EOD triggers alert and exception report',
      }, userId);
    }
    return { businessDate: data.businessDate ?? todayIso(), pendingCount: rows.length, rows };
  },

  async getFxTodayBlotter(params: { settlementStatus?: string; currencyPair?: string } = {}) {
    const conditions = [eq(schema.oemsFxTodayBlotterEntries.is_deleted, false)];
    if (params.settlementStatus) conditions.push(eq(schema.oemsFxTodayBlotterEntries.settlement_status, params.settlementStatus.toUpperCase()));
    if (params.currencyPair) conditions.push(eq(schema.oemsFxTodayBlotterEntries.currency_pair, params.currencyPair.toUpperCase()));
    return db.select().from(schema.oemsFxTodayBlotterEntries)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsFxTodayBlotterEntries.created_at))
      .limit(100);
  },

  async listFxTodayDetails(params: { settlementStatus?: string; confirmationStatus?: string } = {}) {
    const conditions = [eq(schema.oemsFxTodayDetails.is_deleted, false)];
    if (params.settlementStatus) conditions.push(eq(schema.oemsFxTodayDetails.settlement_status, params.settlementStatus.toUpperCase()));
    if (params.confirmationStatus) conditions.push(eq(schema.oemsFxTodayDetails.confirmation_status, params.confirmationStatus.toUpperCase()));
    return db.select().from(schema.oemsFxTodayDetails)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsFxTodayDetails.created_at))
      .limit(100);
  },

  async registerWealthLendingFacility(data: {
    customerId?: string;
    portfolioId?: string;
    loanSystemRef?: string;
    coreBankingRef?: string;
    loanAccountNo?: string;
    currency?: string;
    limitAmount: number;
    outstandingAmount?: number;
    ltvLimit: number;
    ltvWarning: number;
    collateralDecreasePercent?: number | string;
    curePeriodDays?: number | string;
    nextReviewDate?: string;
  }, userId: string) {
    if (data.limitAmount <= 0) throw new ValidationError('Facility limit must be greater than zero');
    if (data.ltvWarning >= data.ltvLimit) throw new ValidationError('LTV warning threshold must be below the LTV limit');
    const facilityId = makeId('OEMS-WL');

    const [facility] = await db.insert(schema.oemsWealthLendingFacilities).values({
      facility_id: facilityId,
      facility_no: makeId('WL-FAC'),
      customer_id: data.customerId,
      portfolio_id: data.portfolioId,
      loan_system_ref: asOptionalString(data.loanSystemRef),
      core_banking_ref: asOptionalString(data.coreBankingRef),
      loan_account_no: asOptionalString(data.loanAccountNo),
      currency: data.currency ?? 'IDR',
      limit_amount: toMoney(data.limitAmount) ?? '0.0000',
      outstanding_amount: toMoney(data.outstandingAmount ?? 0) ?? '0.0000',
      ltv_limit: toRate(data.ltvLimit) ?? '0.00000000',
      ltv_warning: toRate(data.ltvWarning) ?? '0.00000000',
      facility_status: 'PENDING_APPROVAL',
      collateral_decrease_percent: toRate(data.collateralDecreasePercent),
      cure_period_days: normalizePositiveInteger(data.curePeriodDays, 5, 90),
      next_review_date: data.nextReviewDate,
      created_by: userId,
    }).returning();
    return facility;
  },

  async addWealthLendingCollateral(facilityId: string, data: {
    holdingId?: number;
    productFamily: OemsProductFamily;
    productCode: string;
    nominalAmount?: number;
    marketValue: number;
    haircutPercent: number;
    sourceSystem?: string;
    lastPrice?: number;
    priceStatus?: string;
    stalePriceAllowed?: boolean;
    staleToleranceDays?: number | string;
    maturityDate?: string;
    valuationDate?: string;
  }, userId: string) {
    await getFacility(facilityId);
    const eligibleValue = this.calculateEligibleCollateralValue({
      marketValue: data.marketValue,
      haircutPercent: data.haircutPercent,
    });

    const [collateral] = await db.insert(schema.oemsWealthLendingCollaterals).values({
      facility_id: facilityId,
      holding_id: data.holdingId,
      product_family: data.productFamily,
      product_code: data.productCode,
      source_system: asOptionalString(data.sourceSystem)?.toUpperCase(),
      nominal_amount: toMoney(data.nominalAmount),
      market_value: toMoney(data.marketValue) ?? '0.0000',
      last_price: toRate(data.lastPrice),
      price_status: normalizeUpperToken(data.priceStatus, 'AVAILABLE'),
      stale_price_allowed: data.stalePriceAllowed ?? false,
      stale_tolerance_days: normalizePositiveInteger(data.staleToleranceDays, 1, 30),
      haircut_percent: toRate(data.haircutPercent) ?? '0.00000000',
      eligible_value: toMoney(eligibleValue) ?? '0.0000',
      collateral_status: 'PLEDGED',
      valuation_date: data.valuationDate ?? todayIso(),
      maturity_date: data.maturityDate,
      last_price_at: data.lastPrice === undefined ? undefined : new Date(),
      created_by: userId,
    }).returning();

    return collateral;
  },

  async createWealthLendingInstruction(facility: OemsWealthLendingFacility, data: {
    instructionType: string;
    targetSystem: string;
    amount?: number;
    currency?: string;
    requestPayload?: unknown;
    responsePayload?: unknown;
    instructionStatus?: string;
    failureReason?: string;
    idempotencyKey?: string;
  }, userId: string): Promise<OemsWealthLendingInstruction> {
    const instructionType = normalizeUpperToken(data.instructionType, 'GENERAL');
    const targetSystem = normalizeUpperToken(data.targetSystem, 'OEMS');
    const requestPayload = {
      facilityId: facility.facility_id,
      facilityNo: facility.facility_no,
      instructionType,
      targetSystem,
      amount: data.amount,
      currency: data.currency ?? facility.currency,
      ...asRecord(data.requestPayload),
    };
    const status = normalizeIntegrationStatus(data.instructionStatus, data.failureReason ? 'FAILED' : 'QUEUED');
    const idempotencyKey = asOptionalString(data.idempotencyKey)
      ?? `${facility.facility_id}:${instructionType}:${targetSystem}:${hashOemsPayload(requestPayload).slice(0, 18)}`;
    const now = new Date();
    const [instruction] = await db.insert(schema.oemsWealthLendingInstructions).values({
      instruction_id: makeId(`WL-${instructionType}`),
      facility_id: facility.facility_id,
      instruction_type: instructionType,
      target_system: targetSystem,
      idempotency_key: idempotencyKey,
      instruction_status: status,
      amount: toMoney(data.amount),
      currency: data.currency ?? facility.currency,
      failure_reason: data.failureReason,
      next_retry_at: status === 'FAILED' ? addSeconds(300) : undefined,
      sent_at: ['SENT', 'ACKNOWLEDGED', 'RECONCILED'].includes(status) ? now : undefined,
      acknowledged_at: ['ACKNOWLEDGED', 'RECONCILED'].includes(status) ? now : undefined,
      request_payload: requestPayload,
      response_payload: asRecord(data.responsePayload),
      created_by: userId,
    }).returning();

    await this.logIntegrationMessage({
      targetSystem,
      messageType: `WEALTH_LENDING_${instructionType}`,
      entityType: 'wealth_lending_facility',
      entityId: facility.facility_id,
      payload: requestPayload,
      responsePayload: data.responsePayload,
      status,
      lastError: data.failureReason,
      nextRetryAt: status === 'FAILED' ? addSeconds(300) : undefined,
    }, userId);

    return instruction;
  },

  async retrieveWealthLendingMarketPrices(facilityId: string, data: {
    sourceSystems?: unknown;
    sourceStatus?: unknown;
    prices?: unknown;
    pricePayload?: unknown;
    priceStatus?: string;
    priceDate?: string;
    stalePriceAllowed?: boolean;
    staleToleranceDays?: number | string;
  } = {}, userId: string) {
    const facility = await getFacility(facilityId);
    const collaterals: OemsWealthLendingCollateral[] = await db.select().from(schema.oemsWealthLendingCollaterals)
      .where(and(
        eq(schema.oemsWealthLendingCollaterals.facility_id, facilityId),
        inArray(schema.oemsWealthLendingCollaterals.collateral_status, ['PLEDGED', 'ELIGIBLE']),
      ));
    const sources = normalizeSourceSystems(data.sourceSystems, ['RBS', 'AVANTRADE']);
    const pricePayload = asRecord(data.prices ?? data.pricePayload);
    const priceDate = data.priceDate ?? todayIso();
    const rows = [];

    for (const collateral of collaterals) {
      const keyedPayload = asRecord(
        pricePayload[collateral.product_code]
        ?? pricePayload[String(collateral.id)]
        ?? pricePayload.default,
      );
      const sourceSystem = normalizeUpperToken(keyedPayload.sourceSystem ?? keyedPayload.source_system ?? collateral.source_system ?? sources[0], sources[0]);
      const priceStatus = normalizeUpperToken(
        keyedPayload.priceStatus ?? keyedPayload.price_status ?? data.priceStatus,
        resolveSourceRetrievalStatus(sourceSystem, data.sourceStatus),
      );
      const staleAllowed = keyedPayload.stalePriceAllowed === undefined
        ? data.stalePriceAllowed ?? collateral.stale_price_allowed
        : keyedPayload.stalePriceAllowed === true;
      const staleToleranceDays = normalizePositiveInteger(
        (keyedPayload.staleToleranceDays as number | string | undefined) ?? data.staleToleranceDays ?? collateral.stale_tolerance_days,
        collateral.stale_tolerance_days,
        30,
      );
      const marketValueInput = keyedPayload.marketValue ?? keyedPayload.market_value ?? collateral.market_value;
      const marketValue = asNumber(marketValueInput as number | string | null | undefined);
      const marketPrice = keyedPayload.marketPrice ?? keyedPayload.market_price ?? collateral.last_price;
      const staleUsed = !isStatusReady(priceStatus) && staleAllowed;
      const eligibleValue = this.calculateEligibleCollateralValue({
        marketValue,
        haircutPercent: asNumber(collateral.haircut_percent),
      });
      const [priceRow] = await db.insert(schema.oemsWealthLendingMarketPrices).values({
        price_id: makeId('WL-PRICE'),
        facility_id: facilityId,
        collateral_id: collateral.id,
        product_family: collateral.product_family,
        product_code: collateral.product_code,
        source_system: sourceSystem,
        market_price: toRate(marketPrice as number | string | undefined),
        market_value: toMoney(marketValue),
        price_date: priceDate,
        price_status: priceStatus,
        stale_used: staleUsed,
        stale_until: staleUsed ? addDaysIso(priceDate, staleToleranceDays) : undefined,
        failure_reason: !isStatusReady(priceStatus) ? asOptionalString(keyedPayload.failureReason ?? keyedPayload.failure_reason) ?? `Price retrieval status ${priceStatus}` : undefined,
        source_payload: keyedPayload,
        created_by: userId,
      }).returning();
      rows.push(priceRow);

      if (isStatusReady(priceStatus) || staleUsed) {
        await db.update(schema.oemsWealthLendingCollaterals).set({
          source_system: sourceSystem,
          market_value: toMoney(marketValue) ?? collateral.market_value,
          last_price: toRate(marketPrice as number | string | undefined),
          price_status: priceStatus,
          stale_price_allowed: staleAllowed,
          stale_tolerance_days: staleToleranceDays,
          eligible_value: toMoney(eligibleValue) ?? collateral.eligible_value,
          valuation_date: priceDate,
          last_price_at: new Date(),
          updated_by: userId,
          updated_at: new Date(),
        }).where(eq(schema.oemsWealthLendingCollaterals.id, collateral.id));
      } else {
        await db.update(schema.oemsWealthLendingCollaterals).set({
          price_status: priceStatus,
          updated_by: userId,
          updated_at: new Date(),
        }).where(eq(schema.oemsWealthLendingCollaterals.id, collateral.id));
      }
    }

    await db.update(schema.oemsWealthLendingFacilities).set({
      last_price_refresh_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsWealthLendingFacilities.facility_id, facilityId));

    await this.logIntegrationMessage({
      targetSystem: sources.join(','),
      messageType: 'WEALTH_LENDING_MARKET_PRICE_RETRIEVAL',
      entityType: 'wealth_lending_facility',
      entityId: facility.facility_id,
      payload: { facilityId, sources, priceDate, requestedProducts: collaterals.map((collateral) => collateral.product_code) },
      responsePayload: { rowCount: rows.length },
      status: rows.some((row) => !isStatusReady(row.price_status)) ? 'FAILED' : 'ACKNOWLEDGED',
      lastError: rows.some((row) => !isStatusReady(row.price_status)) ? 'One or more collateral prices were unavailable' : undefined,
    }, userId);

    return { facilityId, sources, prices: rows };
  },

  async retrieveWealthLendingOutstanding(facilityId: string, data: {
    sourceSystem?: string;
    loanAccountNo?: string;
    outstandingAmount?: number | string;
    limitAmount?: number | string;
    retrievalStatus?: string;
    asOfDate?: string;
    failureReason?: string;
    sourcePayload?: unknown;
  } = {}, userId: string) {
    const facility = await getFacility(facilityId);
    const sourceSystem = normalizeUpperToken(data.sourceSystem, 'LOAN_SYSTEM');
    const retrievalStatus = normalizeUpperToken(data.retrievalStatus, 'AVAILABLE');
    const snapshotOutstanding = isStatusReady(retrievalStatus) ? asNumber(data.outstandingAmount ?? facility.outstanding_amount) : asNumber(facility.outstanding_amount);
    const snapshotLimit = isStatusReady(retrievalStatus) ? asNumber(data.limitAmount ?? facility.limit_amount) : asNumber(facility.limit_amount);

    const [snapshot] = await db.insert(schema.oemsWealthLendingOutstandingSnapshots).values({
      snapshot_id: makeId('WL-OUT'),
      facility_id: facilityId,
      source_system: sourceSystem,
      loan_account_no: asOptionalString(data.loanAccountNo) ?? facility.loan_account_no,
      outstanding_amount: toMoney(snapshotOutstanding),
      limit_amount: toMoney(snapshotLimit),
      retrieval_status: retrievalStatus,
      as_of_date: data.asOfDate ?? todayIso(),
      failure_reason: isStatusReady(retrievalStatus) ? undefined : asOptionalString(data.failureReason) ?? `Outstanding retrieval status ${retrievalStatus}`,
      source_payload: asRecord(data.sourcePayload),
      created_by: userId,
    }).returning();

    if (isStatusReady(retrievalStatus)) {
      await db.update(schema.oemsWealthLendingFacilities).set({
        loan_account_no: asOptionalString(data.loanAccountNo) ?? facility.loan_account_no,
        limit_amount: toMoney(snapshotLimit) ?? facility.limit_amount,
        outstanding_amount: toMoney(snapshotOutstanding) ?? facility.outstanding_amount,
        last_outstanding_refresh_at: new Date(),
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsWealthLendingFacilities.facility_id, facilityId));
    }

    await this.logIntegrationMessage({
      targetSystem: sourceSystem,
      messageType: 'WEALTH_LENDING_OUTSTANDING_RETRIEVAL',
      entityType: 'wealth_lending_facility',
      entityId: facilityId,
      payload: { facilityId, loanAccountNo: asOptionalString(data.loanAccountNo) ?? facility.loan_account_no },
      responsePayload: snapshot,
      status: isStatusReady(retrievalStatus) ? 'ACKNOWLEDGED' : 'FAILED',
      lastError: isStatusReady(retrievalStatus) ? undefined : snapshot.failure_reason ?? undefined,
    }, userId);

    return snapshot;
  },

  async runWealthLendingM2m(facilityId: string, dataOrUserId: {
    runDate?: string;
    collateralDecreasePercent?: number | string;
    curePeriodDays?: number | string;
  } | string = {}, maybeUserId?: string) {
    const data = typeof dataOrUserId === 'string' ? {} : dataOrUserId;
    const userId = typeof dataOrUserId === 'string' ? dataOrUserId : maybeUserId ?? 'system';
    const facility = await getFacility(facilityId);
    const collaterals: OemsWealthLendingCollateral[] = await db.select().from(schema.oemsWealthLendingCollaterals)
      .where(and(
        eq(schema.oemsWealthLendingCollaterals.facility_id, facilityId),
        inArray(schema.oemsWealthLendingCollaterals.collateral_status, ['PLEDGED', 'ELIGIBLE']),
      ));

    const collateralValue = collaterals.reduce((sum, collateral) => sum + asNumber(collateral.eligible_value), 0);
    const outstandingAmount = asNumber(facility.outstanding_amount);
    const curePeriodDays = normalizePositiveInteger(data.curePeriodDays ?? facility.cure_period_days, 5, 90);
    const requirement = this.calculateWealthLendingCureRequirement({
      outstandingAmount,
      eligibleCollateralValue: collateralValue,
      ltvLimit: asNumber(facility.ltv_limit),
      ltvWarning: asNumber(facility.ltv_warning),
      curePeriodDays,
    });
    const cureDueAt = requirement.breachLevel === 'NONE' ? undefined : new Date(`${addDaysIso(data.runDate ?? todayIso(), curePeriodDays)}T23:59:59.000Z`);

    const [run] = await db.insert(schema.oemsM2mRuns).values({
      facility_id: facilityId,
      run_date: data.runDate ?? todayIso(),
      collateral_value: toMoney(collateralValue) ?? '0.0000',
      outstanding_amount: toMoney(outstandingAmount) ?? '0.0000',
      current_ltv: toRate(Number.isFinite(requirement.currentLtv) ? requirement.currentLtv : 999999) ?? '0.00000000',
      overdraft_limit_amount: toMoney(requirement.overdraftLimitAmount),
      repayment_required: toMoney(requirement.repaymentRequired) ?? '0.0000',
      top_up_required: toMoney(requirement.topUpRequired) ?? '0.0000',
      breach_level: requirement.breachLevel,
      cure_status: requirement.cureStatus,
      cure_due_at: cureDueAt,
      notification_payload: requirement.breachLevel === 'NONE' ? undefined : {
        facilityId,
        currentLtv: requirement.currentLtv,
        warning: requirement.ltvWarning,
        limit: requirement.ltvLimit,
        repaymentRequired: requirement.repaymentRequired,
        topUpRequired: requirement.topUpRequired,
      },
      created_by: userId,
    }).returning();

    await db.update(schema.oemsWealthLendingFacilities).set({
      facility_status: requirement.breachLevel === 'BREACH' ? 'MARGIN_CALL' : 'ACTIVE',
      limit_amount: toMoney(requirement.overdraftLimitAmount) ?? facility.limit_amount,
      repayment_required: toMoney(requirement.repaymentRequired) ?? '0.0000',
      top_up_required: toMoney(requirement.topUpRequired) ?? '0.0000',
      collateral_decrease_percent: toRate(data.collateralDecreasePercent ?? facility.collateral_decrease_percent),
      cure_period_days: curePeriodDays,
      cure_status: requirement.cureStatus,
      cure_due_at: cureDueAt,
      limit_update_status: requirement.breachLevel === 'NONE' ? 'CURRENT' : 'PENDING',
      overdraft_block_status: requirement.breachLevel === 'BREACH' ? 'BLOCK_PENDING' : 'NOT_BLOCKED',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsWealthLendingFacilities.facility_id, facilityId));

    if (requirement.breachLevel !== 'NONE') {
      await this.queueNotification({
        eventCode: `OEMS_WEALTH_LENDING_LTV_${requirement.breachLevel}`,
        recipientId: 'WEALTH_LENDING_OPS',
        payload: {
          facilityId,
          currentLtv: requirement.currentLtv,
          warning: requirement.ltvWarning,
          limit: requirement.ltvLimit,
          repaymentRequired: requirement.repaymentRequired,
          topUpRequired: requirement.topUpRequired,
          cureDueAt,
        },
      }, userId);
      await this.createWealthLendingInstruction(facility, {
        instructionType: 'BLOCK_OVERDRAFT',
        targetSystem: 'DBANK_PRO',
        requestPayload: { reason: 'LTV_BREACH', requirement },
      }, userId);
    }

    return run;
  },

  async publishWealthLendingLimitVisibility(facilityId: string, data: {
    channels?: unknown;
    simulatedStatus?: string;
    responsePayload?: unknown;
  } = {}, userId: string) {
    const facility = await getFacility(facilityId);
    const channels = normalizeStringArray(data.channels);
    const targetChannels = channels.length > 0 ? channels : ['DBANK_PRO', 'CRM_MICROSITE'];
    const status = normalizeIntegrationStatus(data.simulatedStatus, 'ACKNOWLEDGED');
    const instructions = [];
    for (const channel of targetChannels) {
      instructions.push(await this.createWealthLendingInstruction(facility, {
        instructionType: 'PUBLISH_LIMIT_VISIBILITY',
        targetSystem: channel,
        amount: asNumber(facility.limit_amount),
        instructionStatus: status,
        requestPayload: {
          limitAmount: facility.limit_amount,
          outstandingAmount: facility.outstanding_amount,
          repaymentRequired: facility.repayment_required,
          topUpRequired: facility.top_up_required,
          cureStatus: facility.cure_status,
        },
        responsePayload: data.responsePayload,
      }, userId));
    }

    const [updated] = await db.update(schema.oemsWealthLendingFacilities).set({
      dbank_visibility_status: targetChannels.includes('DBANK_PRO') ? (status === 'FAILED' ? 'FAILED' : 'PUBLISHED') : facility.dbank_visibility_status,
      sales_visibility_status: targetChannels.some((channel) => ['CRM_MICROSITE', 'OEMS', 'SALES'].includes(channel)) ? (status === 'FAILED' ? 'FAILED' : 'VISIBLE') : facility.sales_visibility_status,
      limit_update_status: status === 'FAILED' ? 'FAILED' : 'SENT',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsWealthLendingFacilities.facility_id, facilityId)).returning();

    return { facility: updated, instructions };
  },

  async getWealthLendingFacilityVisibility(facilityId: string, data: {
    channel?: string;
    actorCustomerId?: string;
  } = {}, _userId = 'system') {
    const facility = await getFacility(facilityId);
    if (data.actorCustomerId && facility.customer_id && data.actorCustomerId !== facility.customer_id) {
      throw new ForbiddenError('Customer is not allowed to view this wealth-lending facility');
    }
    const collaterals: OemsWealthLendingCollateral[] = await db.select().from(schema.oemsWealthLendingCollaterals)
      .where(and(
        eq(schema.oemsWealthLendingCollaterals.facility_id, facilityId),
        inArray(schema.oemsWealthLendingCollaterals.collateral_status, ['PLEDGED', 'ELIGIBLE']),
      ));
    const collateralValue = collaterals.reduce((sum, collateral) => sum + asNumber(collateral.eligible_value), 0);
    const requirement = this.calculateWealthLendingCureRequirement({
      outstandingAmount: asNumber(facility.outstanding_amount),
      eligibleCollateralValue: collateralValue,
      ltvLimit: asNumber(facility.ltv_limit),
      ltvWarning: asNumber(facility.ltv_warning),
      curePeriodDays: facility.cure_period_days,
    });
    return {
      channel: normalizeUpperToken(data.channel, 'DBANK_PRO'),
      facilityId: facility.facility_id,
      facilityNo: facility.facility_no,
      customerId: facility.customer_id,
      loanAccount: maskScalar(facility.loan_account_no),
      currency: facility.currency,
      limitAmount: asNumber(facility.limit_amount),
      outstandingAmount: asNumber(facility.outstanding_amount),
      collateralValue,
      currentLtv: requirement.currentLtv,
      ltvLimit: requirement.ltvLimit,
      ltvWarning: requirement.ltvWarning,
      cureStatus: facility.cure_status,
      cureDueAt: facility.cure_due_at,
      repaymentRequired: asNumber(facility.repayment_required),
      topUpRequired: asNumber(facility.top_up_required),
      dbankVisibilityStatus: facility.dbank_visibility_status,
      salesVisibilityStatus: facility.sales_visibility_status,
      overdraftBlockStatus: facility.overdraft_block_status,
      collaterals: collaterals.map((collateral) => ({
        productFamily: collateral.product_family,
        productCode: collateral.product_code,
        sourceSystem: collateral.source_system,
        marketValue: asNumber(collateral.market_value),
        eligibleValue: asNumber(collateral.eligible_value),
        priceStatus: collateral.price_status,
        maturityDate: collateral.maturity_date,
      })),
    };
  },

  async recordWealthLendingCureAction(facilityId: string, data: {
    actionType?: string;
    amount?: number | string;
    collateralMarketValue?: number | string;
    productFamily?: OemsProductFamily;
    productCode?: string;
    haircutPercent?: number | string;
    notes?: string;
    payload?: unknown;
  }, userId: string) {
    const facility = await getFacility(facilityId);
    const actionType = normalizeUpperToken(data.actionType, 'REPAYMENT');
    if (!['REPAYMENT', 'TOP_UP', 'WAIVER'].includes(actionType)) {
      throw new ValidationError(`Unsupported wealth-lending cure action: ${actionType}`);
    }
    const amount = asNumber(data.amount);
    const collateralMarketValue = asNumber(data.collateralMarketValue);
    const resultingOutstanding = actionType === 'REPAYMENT'
      ? Math.max(0, asNumber(facility.outstanding_amount) - amount)
      : asNumber(facility.outstanding_amount);

    if (actionType === 'REPAYMENT') {
      await db.update(schema.oemsWealthLendingFacilities).set({
        outstanding_amount: toMoney(resultingOutstanding) ?? facility.outstanding_amount,
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsWealthLendingFacilities.facility_id, facilityId));
    }

    if (actionType === 'TOP_UP' && collateralMarketValue > 0) {
      const haircutPercent = asNumber(data.haircutPercent);
      await this.addWealthLendingCollateral(facilityId, {
        productFamily: data.productFamily ?? 'MUTUAL_FUND',
        productCode: asOptionalString(data.productCode)?.toUpperCase() ?? 'CURE_TOP_UP',
        marketValue: collateralMarketValue,
        haircutPercent,
        sourceSystem: 'CURE_ACTION',
        priceStatus: 'AVAILABLE',
        valuationDate: todayIso(),
      }, userId);
    }

    const [action] = await db.insert(schema.oemsWealthLendingCureActions).values({
      action_id: makeId('WL-CURE'),
      facility_id: facilityId,
      action_type: actionType,
      action_status: 'RECORDED',
      amount: toMoney(amount),
      collateral_market_value: toMoney(collateralMarketValue),
      resulting_outstanding_amount: toMoney(resultingOutstanding),
      cure_due_at: facility.cure_due_at,
      notes: asOptionalString(data.notes),
      payload: asRecord(data.payload),
      created_by: userId,
    }).returning();

    const m2mRun = await this.runWealthLendingM2m(facilityId, {}, userId);
    const resultingLtv = asNumber(m2mRun.current_ltv);
    const actionStatus = m2mRun.breach_level === 'NONE' ? 'CURED' : 'PARTIAL';
    const [updatedAction] = await db.update(schema.oemsWealthLendingCureActions).set({
      action_status: actionStatus,
      resulting_ltv: toRate(resultingLtv),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsWealthLendingCureActions.id, action.id)).returning();

    if (m2mRun.breach_level === 'NONE') {
      const refreshedFacility = await getFacility(facilityId);
      await db.update(schema.oemsWealthLendingFacilities).set({
        cure_status: 'CURED',
        overdraft_block_status: 'UNBLOCK_PENDING',
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsWealthLendingFacilities.facility_id, facilityId));
      await this.createWealthLendingInstruction(refreshedFacility, {
        instructionType: 'UNBLOCK_OVERDRAFT',
        targetSystem: 'DBANK_PRO',
        requestPayload: { reason: 'CURE_COMPLETED', actionId: action.action_id },
      }, userId);
    }

    return { action: updatedAction ?? action, m2mRun };
  },

  async instructWealthLendingSellCollateral(facilityId: string, data: {
    amount?: number | string;
    collateralIds?: unknown;
    productCodes?: unknown;
    instructionStatus?: string;
    failureReason?: string;
    responsePayload?: unknown;
  }, userId: string) {
    const facility = await getFacility(facilityId);
    const amount = asNumber(data.amount);
    if (amount <= 0) throw new ValidationError('Sell-collateral instruction amount must be greater than zero');
    const status = normalizeIntegrationStatus(data.instructionStatus, data.failureReason ? 'FAILED' : 'QUEUED');
    const instruction = await this.createWealthLendingInstruction(facility, {
      instructionType: 'SELL_COLLATERAL',
      targetSystem: 'RBS',
      amount,
      instructionStatus: status,
      failureReason: asOptionalString(data.failureReason),
      requestPayload: {
        collateralIds: normalizeStringArray(data.collateralIds),
        productCodes: normalizeStringArray(data.productCodes),
        reason: 'UNCURED_LTV_BREACH',
      },
      responsePayload: data.responsePayload,
    }, userId);

    if (status === 'FAILED') {
      await db.update(schema.oemsWealthLendingFacilities).set({
        facility_status: 'SUSPENDED',
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsWealthLendingFacilities.facility_id, facilityId));
      await this.queueNotification({
        eventCode: 'OEMS_WEALTH_LENDING_SELL_COLLATERAL_FAILED',
        recipientId: 'WEALTH_LENDING_OPS',
        payload: { facilityId, instructionId: instruction.instruction_id, failureReason: instruction.failure_reason },
      }, userId);
    }

    return instruction;
  },

  async listWealthLendingInstructions(params: {
    facilityId?: string;
    instructionType?: string;
    status?: string;
  } = {}) {
    const conditions = [eq(schema.oemsWealthLendingInstructions.is_deleted, false)];
    if (params.facilityId) conditions.push(eq(schema.oemsWealthLendingInstructions.facility_id, params.facilityId));
    if (params.instructionType) conditions.push(eq(schema.oemsWealthLendingInstructions.instruction_type, params.instructionType.trim().toUpperCase()));
    if (params.status) conditions.push(eq(schema.oemsWealthLendingInstructions.instruction_status, normalizeIntegrationStatus(params.status)));

    return db.select().from(schema.oemsWealthLendingInstructions)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsWealthLendingInstructions.created_at))
      .limit(100);
  },

  async logIntegrationMessage(data: {
    targetSystem: string;
    messageType: string;
    entityType: string;
    entityId: string;
    payload?: unknown;
    responsePayload?: unknown;
    status?: typeof schema.oemsIntegrationStatusEnum.enumValues[number];
    lastError?: string;
    nextRetryAt?: Date;
	  }, userId: string) {
	    const [message] = await db.insert(schema.oemsIntegrationMessages).values({
	      target_system: data.targetSystem,
	      message_type: data.messageType,
	      entity_type: data.entityType,
	      entity_id: data.entityId,
	      integration_status: data.status ?? 'QUEUED',
	      payload: maskIntegrationPayload(data.payload),
	      response_payload: maskIntegrationPayload(data.responsePayload),
	      last_error: data.lastError,
	      next_retry_at: data.nextRetryAt,
	      created_by: userId,
	    }).returning();
    return message;
  },

  async retryIntegrationMessage(messageId: number, userId: string) {
    const [message] = await db.select().from(schema.oemsIntegrationMessages)
      .where(eq(schema.oemsIntegrationMessages.id, messageId))
      .limit(1);
    if (!message) throw new NotFoundError('Integration message not found');
    if (!['FAILED', 'RETRYING', 'QUEUED'].includes(message.integration_status)) {
      throw new ConflictError(`Cannot retry integration message in status ${message.integration_status}`);
    }

    const [updated] = await db.update(schema.oemsIntegrationMessages).set({
      integration_status: 'RETRYING',
      retry_count: sql`${schema.oemsIntegrationMessages.retry_count} + 1`,
      next_retry_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsIntegrationMessages.id, messageId)).returning();
    return updated;
  },

  async createIntegrationAdapter(data: {
    adapterId?: string;
    targetSystem?: string;
    adapterType?: string;
    endpointUrl?: string;
    authProfileRef?: string;
    contractVersion?: string;
    contractSchema?: unknown;
    transformationMap?: unknown;
    timeoutMs?: number;
    maxRetries?: number;
	    retryBackoffSeconds?: number;
	    adapterStatus?: string;
	    certificationStatus?: string;
	    mockMode?: boolean;
	    reconciliationRequired?: boolean;
	    requireTls?: boolean;
	    allowedAddressPatterns?: unknown;
	    allowedSourceCidrs?: unknown;
	    payloadClassification?: string;
	    sensitiveFieldPaths?: unknown;
	    encryptedFieldPaths?: unknown;
	    maskLogPayloads?: boolean;
	    encryptionRequired?: boolean;
	    encryptionProfileRef?: string;
	    transportPolicy?: unknown;
	    securityPolicyStatus?: string;
	    runbookUrl?: string;
	    ownerTeam?: string;
	  }, userId: string) {
	    const targetSystem = asOptionalString(data.targetSystem)?.toUpperCase();
	    if (!targetSystem) throw new ValidationError('Target system is required');
	    const adapterId = asOptionalString(data.adapterId)?.toUpperCase() ?? `ADP-${targetSystem.replace(/_/g, '-')}`;
	    const requireTls = data.requireTls ?? true;
	    const endpointUrl = asOptionalString(data.endpointUrl);
	    if (requireTls && endpointUrl && /^http:\/\//i.test(endpointUrl)) {
	      throw new ValidationError('ADAPTER_TRANSPORT_POLICY_BLOCKED: TLS is required for external OEMS adapters');
	    }
	    const allowedAddressPatterns = normalizeStringArray(data.allowedAddressPatterns);
	    const allowedSourceCidrs = normalizeStringArray(data.allowedSourceCidrs);
	    if (endpointUrl && allowedAddressPatterns.length > 0 && !allowedAddressPatterns.some((pattern) => matchesAddressPattern(endpointUrl, pattern))) {
	      throw new ValidationError(`ADAPTER_ADDRESS_FILTER_BLOCKED: endpoint ${endpointUrl} is not allow-listed`);
	    }

	    const [adapter] = await db.insert(schema.oemsIntegrationAdapters).values({
	      adapter_id: adapterId,
	      target_system: targetSystem,
	      adapter_type: asOptionalString(data.adapterType)?.toUpperCase() ?? 'REST',
	      endpoint_url: endpointUrl,
	      auth_profile_ref: asOptionalString(data.authProfileRef),
	      contract_version: asOptionalString(data.contractVersion) ?? 'v1',
	      contract_schema: asRecord(data.contractSchema),
	      transformation_map: asRecord(data.transformationMap),
	      timeout_ms: normalizePositiveInteger(data.timeoutMs, 30000, 300000),
      max_retries: normalizePositiveInteger(data.maxRetries, 3, 25),
      retry_backoff_seconds: normalizePositiveInteger(data.retryBackoffSeconds, 300, 86400),
      adapter_status: asOptionalString(data.adapterStatus)?.toUpperCase() ?? 'DRAFT',
	      certification_status: asOptionalString(data.certificationStatus)?.toUpperCase() ?? 'UNCERTIFIED',
	      mock_mode: data.mockMode ?? true,
	      reconciliation_required: data.reconciliationRequired ?? true,
	      require_tls: requireTls,
	      allowed_address_patterns: allowedAddressPatterns,
	      allowed_source_cidrs: allowedSourceCidrs,
	      payload_classification: asOptionalString(data.payloadClassification)?.toUpperCase() ?? 'CONFIDENTIAL',
	      sensitive_field_paths: normalizePayloadPaths(data.sensitiveFieldPaths),
	      encrypted_field_paths: normalizeStringArray(data.encryptedFieldPaths),
	      mask_log_payloads: data.maskLogPayloads ?? true,
	      encryption_required: data.encryptionRequired ?? false,
	      encryption_profile_ref: asOptionalString(data.encryptionProfileRef) ?? asOptionalString(data.authProfileRef),
	      transport_policy: {
	        requireTls,
	        allowInternalPaths: true,
	        addressFiltering: allowedAddressPatterns.length > 0 ? 'ENFORCED' : 'NOT_CONFIGURED',
	        ...asRecord(data.transportPolicy),
	      },
	      security_policy_status: asOptionalString(data.securityPolicyStatus)?.toUpperCase() ?? 'ACTIVE',
	      runbook_url: asOptionalString(data.runbookUrl),
	      owner_team: asOptionalString(data.ownerTeam),
	      created_by: userId,
	    }).returning();
	    return adapter;
	  },

	  async updateIntegrationAdapterSecurity(adapterId: string, data: {
	    requireTls?: boolean;
	    allowedAddressPatterns?: unknown;
	    allowedSourceCidrs?: unknown;
	    payloadClassification?: string;
	    sensitiveFieldPaths?: unknown;
	    encryptedFieldPaths?: unknown;
	    maskLogPayloads?: boolean;
	    encryptionRequired?: boolean;
	    encryptionProfileRef?: string;
	    transportPolicy?: unknown;
	    securityPolicyStatus?: string;
	  }, userId: string) {
	    const adapter = await getIntegrationAdapter(adapterId);
	    const requireTls = data.requireTls ?? adapter.require_tls;
	    const allowedAddressPatterns = data.allowedAddressPatterns === undefined
	      ? normalizeStringArray(adapter.allowed_address_patterns)
	      : normalizeStringArray(data.allowedAddressPatterns);
	    if (requireTls && adapter.endpoint_url && /^http:\/\//i.test(adapter.endpoint_url)) {
	      throw new ValidationError('ADAPTER_TRANSPORT_POLICY_BLOCKED: TLS is required for external OEMS adapters');
	    }
	    if (adapter.endpoint_url && allowedAddressPatterns.length > 0 && !allowedAddressPatterns.some((pattern) => matchesAddressPattern(adapter.endpoint_url ?? '', pattern))) {
	      throw new ValidationError(`ADAPTER_ADDRESS_FILTER_BLOCKED: endpoint ${adapter.endpoint_url} is not allow-listed`);
	    }

	    const [updated] = await db.update(schema.oemsIntegrationAdapters).set({
	      require_tls: requireTls,
	      allowed_address_patterns: allowedAddressPatterns,
	      allowed_source_cidrs: data.allowedSourceCidrs === undefined ? normalizeStringArray(adapter.allowed_source_cidrs) : normalizeStringArray(data.allowedSourceCidrs),
	      payload_classification: asOptionalString(data.payloadClassification)?.toUpperCase() ?? adapter.payload_classification,
	      sensitive_field_paths: data.sensitiveFieldPaths === undefined ? normalizePayloadPaths(adapter.sensitive_field_paths) : normalizePayloadPaths(data.sensitiveFieldPaths),
	      encrypted_field_paths: data.encryptedFieldPaths === undefined ? normalizeStringArray(adapter.encrypted_field_paths) : normalizeStringArray(data.encryptedFieldPaths),
	      mask_log_payloads: data.maskLogPayloads ?? adapter.mask_log_payloads,
	      encryption_required: data.encryptionRequired ?? adapter.encryption_required,
	      encryption_profile_ref: asOptionalString(data.encryptionProfileRef) ?? adapter.encryption_profile_ref,
	      transport_policy: {
	        ...asRecord(adapter.transport_policy),
	        ...asRecord(data.transportPolicy),
	        requireTls,
	        addressFiltering: allowedAddressPatterns.length > 0 ? 'ENFORCED' : 'NOT_CONFIGURED',
	      },
	      security_policy_status: asOptionalString(data.securityPolicyStatus)?.toUpperCase() ?? adapter.security_policy_status,
	      updated_by: userId,
	      updated_at: new Date(),
	    }).where(eq(schema.oemsIntegrationAdapters.id, adapter.id)).returning();
	    return updated;
	  },

  previewIntegrationAdapterSecurityControls(data: {
    targetSystem?: string;
    endpointUrl?: string;
    authProfileRef?: string;
    requireTls?: boolean;
    allowedAddressPatterns?: unknown;
    allowedSourceCidrs?: unknown;
    payloadClassification?: string;
    sensitiveFieldPaths?: unknown;
    maskLogPayloads?: boolean;
    encryptionRequired?: boolean;
    encryptionProfileRef?: string;
    payload?: unknown;
    sourceAddress?: string;
    destinationAddress?: string;
  }) {
    const targetSystem = asOptionalString(data.targetSystem)?.toUpperCase() ?? 'OEMS';
    const adapter = {
      adapter_id: `ADP-${targetSystem}`,
      target_system: targetSystem,
      endpoint_url: asOptionalString(data.endpointUrl),
      auth_profile_ref: asOptionalString(data.authProfileRef),
      require_tls: data.requireTls ?? true,
      allowed_address_patterns: normalizeStringArray(data.allowedAddressPatterns),
      allowed_source_cidrs: normalizeStringArray(data.allowedSourceCidrs),
      payload_classification: asOptionalString(data.payloadClassification)?.toUpperCase() ?? 'CONFIDENTIAL',
      sensitive_field_paths: normalizePayloadPaths(data.sensitiveFieldPaths),
      mask_log_payloads: data.maskLogPayloads ?? true,
      encryption_required: data.encryptionRequired ?? false,
      encryption_profile_ref: asOptionalString(data.encryptionProfileRef),
    } as OemsIntegrationAdapter;
    const securityDecision = assertAdapterSecurityPolicy(adapter, {
      sourceAddress: data.sourceAddress,
      destinationAddress: data.destinationAddress,
    });
    const secured = securePayloadForAdapter(adapter, asRecord(data.payload));
    return {
      securityDecision,
      storedPayload: secured.storedPayload,
      maskedPayload: secured.maskedPayload,
      payloadEncrypted: secured.encrypted,
      encryptionProfileRef: secured.profileRef,
    };
  },

  async listIntegrationAdapters(params: {
    targetSystem?: string;
    status?: string;
    certificationStatus?: string;
  } = {}) {
    const conditions = [eq(schema.oemsIntegrationAdapters.is_deleted, false)];
    if (params.targetSystem) conditions.push(eq(schema.oemsIntegrationAdapters.target_system, params.targetSystem.trim().toUpperCase()));
    if (params.status) conditions.push(eq(schema.oemsIntegrationAdapters.adapter_status, params.status.trim().toUpperCase()));
    if (params.certificationStatus) conditions.push(eq(schema.oemsIntegrationAdapters.certification_status, params.certificationStatus.trim().toUpperCase()));

    return db.select().from(schema.oemsIntegrationAdapters)
      .where(and(...conditions))
      .orderBy(schema.oemsIntegrationAdapters.target_system, schema.oemsIntegrationAdapters.adapter_id)
      .limit(100);
  },

  async executeIntegrationAdapter(adapterId: string, data: {
    integrationMessageId?: number | string;
    messageId?: number | string;
    messageType?: string;
    entityType?: string;
    entityId?: string;
    payload?: unknown;
    responsePayload?: unknown;
    idempotencyKey?: string;
    attemptNo?: number | string;
	    simulatedStatus?: string;
	    errorCode?: string;
	    errorMessage?: string;
	    allowDraft?: boolean;
	    sourceAddress?: string;
	    destinationAddress?: string;
	  }, userId: string) {
	    const adapter = await getIntegrationAdapter(adapterId);
	    if (adapter.adapter_status !== 'ACTIVE' && data.allowDraft !== true) {
	      throw new ConflictError(`Integration adapter ${adapter.adapter_id} is not ACTIVE`);
	    }
	    if (adapter.security_policy_status !== 'ACTIVE') {
	      throw new ConflictError(`Integration adapter ${adapter.adapter_id} security policy is ${adapter.security_policy_status}`);
	    }

	    const payload = asRecord(data.payload);
	    const messageType = asOptionalString(data.messageType)?.toUpperCase() ?? 'OEMS_ADAPTER_EXECUTION';
	    const entityType = asOptionalString(data.entityType)?.toUpperCase() ?? 'OEMS_INTEGRATION';
	    const entityId = asOptionalString(data.entityId) ?? adapter.adapter_id;
	    const securityDecision = assertAdapterSecurityPolicy(adapter, {
	      sourceAddress: data.sourceAddress,
	      destinationAddress: data.destinationAddress,
	    });
	    const requestHash = hashOemsPayload({
	      adapterId: adapter.adapter_id,
	      targetSystem: adapter.target_system,
	      messageType,
	      entityType,
      entityId,
      payload,
    });
    const messageIdRaw = data.integrationMessageId ?? data.messageId;
    const suppliedMessageId = messageIdRaw === undefined || messageIdRaw === null ? undefined : Number(messageIdRaw);
    const idempotencyKey = asOptionalString(data.idempotencyKey) ?? `${adapter.adapter_id}:${messageType}:${entityId}:${requestHash.slice(0, 24)}`;
    const executionStatus = normalizeIntegrationStatus(
      data.simulatedStatus ?? (adapter.mock_mode ? 'ACKNOWLEDGED' : 'QUEUED'),
      adapter.mock_mode ? 'ACKNOWLEDGED' : 'QUEUED',
    );
	    const failed = executionStatus === 'FAILED';
	    const now = new Date();
	    const responsePayload = asRecord(data.responsePayload);
	    const securedRequestPayload = securePayloadForAdapter(adapter, payload);
	    const securedResponsePayload = securePayloadForAdapter(adapter, responsePayload);
	    const executionEvidence = 'Certified adapters replace logging-only stubs with contract, retry, idempotency and reconciliation evidence';

	    let messageId = Number.isInteger(suppliedMessageId) ? suppliedMessageId : undefined;
	    if (!messageId) {
	      const message = await this.logIntegrationMessage({
        targetSystem: adapter.target_system,
        messageType,
	        entityType,
	        entityId,
	        payload: {
	          securePayload: securedRequestPayload.storedPayload,
	          adapterId: adapter.adapter_id,
	          contractVersion: adapter.contract_version,
	          securityDecision,
	          evidence: executionEvidence,
	        },
	        responsePayload: securedResponsePayload.storedPayload,
	        status: executionStatus,
	        lastError: failed ? data.errorMessage ?? 'ADAPTER_EXECUTION_FAILED' : undefined,
	        nextRetryAt: failed ? addSeconds(adapter.retry_backoff_seconds) : undefined,
	      }, userId);
      messageId = message.id;
    }

    const [execution] = await db.insert(schema.oemsIntegrationAdapterExecutions).values({
      execution_id: makeId('ADEXEC'),
      adapter_id: adapter.adapter_id,
      integration_message_id: messageId,
	      target_system: adapter.target_system,
	      message_type: messageType,
	      idempotency_key: idempotencyKey,
	      attempt_no: normalizePositiveInteger(data.attemptNo, 1, 100),
	      execution_status: executionStatus,
	      source_address: asOptionalString(data.sourceAddress),
	      destination_address: asOptionalString(data.destinationAddress) ?? adapter.endpoint_url,
	      security_decision: securityDecision,
	      request_hash: requestHash,
	      request_payload: {
	        securePayload: securedRequestPayload.storedPayload,
	        adapterId: adapter.adapter_id,
	        contractVersion: adapter.contract_version,
	        timeoutMs: adapter.timeout_ms,
	        maxRetries: adapter.max_retries,
	        evidence: executionEvidence,
	      },
	      response_payload: {
	        securePayload: securedResponsePayload.storedPayload,
	        mockMode: adapter.mock_mode,
	        certificationStatus: adapter.certification_status,
	      },
	      request_payload_masked: securedRequestPayload.maskedPayload,
	      response_payload_masked: securedResponsePayload.maskedPayload,
	      payload_encrypted: securedRequestPayload.encrypted || securedResponsePayload.encrypted,
	      encryption_profile_ref: securedRequestPayload.profileRef ?? securedResponsePayload.profileRef,
	      latency_ms: adapter.mock_mode ? 25 : undefined,
	      error_code: failed ? asOptionalString(data.errorCode) ?? 'ADAPTER_EXECUTION_FAILED' : undefined,
	      error_message: failed ? asOptionalString(data.errorMessage) ?? 'Adapter execution failed' : undefined,
	      next_retry_at: failed ? addSeconds(adapter.retry_backoff_seconds) : undefined,
      reconciliation_status: adapter.reconciliation_required
        ? executionStatus === 'ACKNOWLEDGED' ? 'PENDING_RECONCILIATION' : 'PENDING'
        : 'NOT_REQUIRED',
      executed_at: now,
      created_by: userId,
    }).returning();

    if (messageId) {
      await db.update(schema.oemsIntegrationMessages).set({
        integration_status: executionStatus,
        response_payload: execution.response_payload,
        last_error: execution.error_message,
        next_retry_at: execution.next_retry_at,
        sent_at: ['SENT', 'ACKNOWLEDGED', 'RECONCILED'].includes(executionStatus) ? now : undefined,
        acknowledged_at: ['ACKNOWLEDGED', 'RECONCILED'].includes(executionStatus) ? now : undefined,
        updated_by: userId,
        updated_at: now,
      }).where(eq(schema.oemsIntegrationMessages.id, messageId));
    }

    return execution;
  },

  async recordIntegrationAdapterHealth(adapterId: string, data: {
    healthStatus?: string;
    certificationStatus?: string;
    responsePayload?: unknown;
  }, userId: string) {
    const adapter = await getIntegrationAdapter(adapterId);
    const healthStatus = asOptionalString(data.healthStatus)?.toUpperCase() ?? 'OK';
    const [updated] = await db.update(schema.oemsIntegrationAdapters).set({
      last_health_status: healthStatus,
      last_health_check_at: new Date(),
      certification_status: asOptionalString(data.certificationStatus)?.toUpperCase() ?? adapter.certification_status,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsIntegrationAdapters.id, adapter.id)).returning();

    await this.executeIntegrationAdapter(adapter.adapter_id, {
      messageType: 'ADAPTER_HEALTH_CHECK',
      entityType: 'OEMS_INTEGRATION_ADAPTER',
      entityId: adapter.adapter_id,
      payload: { healthStatus },
      responsePayload: data.responsePayload ?? { healthStatus },
      simulatedStatus: healthStatus === 'OK' ? 'ACKNOWLEDGED' : 'FAILED',
      allowDraft: true,
    }, userId);

    return updated;
  },

  async listIntegrationAdapterExecutions(params: {
    adapterId?: string;
    targetSystem?: string;
    status?: string;
  } = {}) {
    const conditions = [eq(schema.oemsIntegrationAdapterExecutions.is_deleted, false)];
    if (params.adapterId) conditions.push(eq(schema.oemsIntegrationAdapterExecutions.adapter_id, params.adapterId.trim().toUpperCase()));
    if (params.targetSystem) conditions.push(eq(schema.oemsIntegrationAdapterExecutions.target_system, params.targetSystem.trim().toUpperCase()));
    if (params.status) conditions.push(eq(schema.oemsIntegrationAdapterExecutions.execution_status, normalizeIntegrationStatus(params.status)));

    return db.select().from(schema.oemsIntegrationAdapterExecutions)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsIntegrationAdapterExecutions.created_at))
      .limit(200);
  },

  async createApprovalWorkflowDefinition(data: {
    workflowCode?: string;
    productFamily?: OemsProductFamily;
    transactionType?: string;
    channel?: OemsChannel;
    entityType?: string;
    triggerStatus?: string;
    makerRoles?: unknown;
    checkerRoles?: unknown;
    requiredApprovalCount?: number;
    slaMinutes?: number;
    escalationRoles?: unknown;
    assignmentStrategy?: string;
    workflowStatus?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    payload?: unknown;
  }, userId: string) {
    const workflowCode = asOptionalString(data.workflowCode)?.toUpperCase();
    if (!workflowCode) throw new ValidationError('Approval workflow code is required');
    if (data.productFamily) validateProductFamily(data.productFamily);
    if (data.channel) validateChannel(data.channel);

    const [workflow] = await db.insert(schema.oemsApprovalWorkflowDefinitions).values({
      workflow_code: workflowCode,
      product_family: data.productFamily,
      transaction_type: asOptionalString(data.transactionType)?.toUpperCase(),
      channel: data.channel,
      entity_type: asOptionalString(data.entityType)?.toLowerCase() ?? 'oems_order',
      trigger_status: asOptionalString(data.triggerStatus)?.toUpperCase() ?? 'PENDING_APPROVAL',
      maker_roles: normalizeRoleList(data.makerRoles, ['BO_MAKER']),
      checker_roles: normalizeRoleList(data.checkerRoles, ['BO_CHECKER']),
      required_approval_count: normalizePositiveInteger(data.requiredApprovalCount, 1, 10),
      sla_minutes: normalizePositiveInteger(data.slaMinutes, 240, 10080),
      escalation_roles: normalizeRoleList(data.escalationRoles, ['BO_HEAD']),
      assignment_strategy: asOptionalString(data.assignmentStrategy)?.toUpperCase() ?? 'ROLE_QUEUE',
      workflow_status: asOptionalString(data.workflowStatus)?.toUpperCase() ?? 'ACTIVE',
      effective_from: data.effectiveFrom ?? todayIso(),
      effective_to: data.effectiveTo,
      payload: {
        ...asRecord(data.payload),
        controlNote: 'Danamon role matrix approval queues assign reviewer roles and block maker self-approval',
      },
      created_by: userId,
    }).returning();
    return workflow;
  },

  async listApprovalWorkflowDefinitions(params: {
    productFamily?: OemsProductFamily;
    status?: string;
    entityType?: string;
  } = {}) {
    const conditions = [eq(schema.oemsApprovalWorkflowDefinitions.is_deleted, false)];
    if (params.productFamily) conditions.push(eq(schema.oemsApprovalWorkflowDefinitions.product_family, params.productFamily));
    if (params.status) conditions.push(eq(schema.oemsApprovalWorkflowDefinitions.workflow_status, params.status.trim().toUpperCase()));
    if (params.entityType) conditions.push(eq(schema.oemsApprovalWorkflowDefinitions.entity_type, params.entityType.trim().toLowerCase()));

    return db.select().from(schema.oemsApprovalWorkflowDefinitions)
      .where(and(...conditions))
      .orderBy(schema.oemsApprovalWorkflowDefinitions.workflow_code)
      .limit(100);
  },

  async enqueueApprovalQueueItem(data: {
    workflowCode?: string;
    workflowId?: number | string;
    orderId?: string;
    entityType?: string;
    entityId?: string;
    assignedRole?: string;
    assignedUserId?: string;
    makerUserId?: string;
    payloadSnapshot?: unknown;
  }, userId: string) {
    let workflow: OemsApprovalWorkflowDefinition | undefined;
    if (data.workflowCode) {
      workflow = await getApprovalWorkflowByCode(data.workflowCode);
    } else if (data.workflowId !== undefined && data.workflowId !== null) {
      const workflowId = Number(data.workflowId);
      const [found] = await db.select().from(schema.oemsApprovalWorkflowDefinitions)
        .where(and(
          eq(schema.oemsApprovalWorkflowDefinitions.id, workflowId),
          eq(schema.oemsApprovalWorkflowDefinitions.is_deleted, false),
        ))
        .limit(1);
      workflow = found;
    }
    if (!workflow) throw new ValidationError('Approval workflow code or ID is required');
    if (workflow.workflow_status !== 'ACTIVE') throw new ConflictError(`Approval workflow ${workflow.workflow_code} is not ACTIVE`);

    const entityType = asOptionalString(data.entityType)?.toLowerCase() ?? workflow.entity_type;
    const entityId = asOptionalString(data.entityId ?? data.orderId);
    if (!entityId) throw new ValidationError('Approval queue entity ID is required');
    const checkerRoles = normalizeRoleList(workflow.checker_roles, ['BO_CHECKER']);
    const makerUserId = asOptionalString(data.makerUserId) ?? userId;
    const assignedRole = asOptionalString(data.assignedRole)?.toUpperCase() ?? checkerRoles[0];

    const [item] = await db.insert(schema.oemsApprovalQueueItems).values({
      queue_item_id: makeId('APQ'),
      workflow_id: workflow.id,
      order_id: data.orderId,
      entity_type: entityType,
      entity_id: entityId,
      approval_status: 'PENDING',
      assigned_role: assignedRole,
      assigned_user_id: asOptionalString(data.assignedUserId),
      maker_user_id: makerUserId,
      due_at: addSeconds(workflow.sla_minutes * 60),
      payload_snapshot: {
        ...asRecord(data.payloadSnapshot),
        workflowCode: workflow.workflow_code,
        checkerRoles,
        makerRoles: normalizeRoleList(workflow.maker_roles),
        evidence: 'Danamon role matrix approval queues assign reviewer roles and block maker self-approval',
      },
      created_by: userId,
    }).returning();
    return item;
  },

  async listApprovalQueueItems(params: {
    status?: string;
    assignedRole?: string;
    orderId?: string;
    entityId?: string;
  } = {}) {
    const conditions = [eq(schema.oemsApprovalQueueItems.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.oemsApprovalQueueItems.approval_status, params.status.trim().toUpperCase()));
    if (params.assignedRole) conditions.push(eq(schema.oemsApprovalQueueItems.assigned_role, params.assignedRole.trim().toUpperCase()));
    if (params.orderId) conditions.push(eq(schema.oemsApprovalQueueItems.order_id, params.orderId));
    if (params.entityId) conditions.push(eq(schema.oemsApprovalQueueItems.entity_id, params.entityId));

    return db.select().from(schema.oemsApprovalQueueItems)
      .where(and(...conditions))
      .orderBy(schema.oemsApprovalQueueItems.due_at, desc(schema.oemsApprovalQueueItems.created_at))
      .limit(200);
  },

  async decideApprovalQueueItem(queueItemId: string, data: {
    decision?: string;
    comment?: string;
    reviewerRole?: string;
  }, userId: string) {
    const item = await getApprovalQueueItem(queueItemId);
    if (!['PENDING', 'CLAIMED'].includes(item.approval_status)) {
      throw new ConflictError(`Approval queue item is already ${item.approval_status}`);
    }
    if (item.maker_user_id === userId) {
      throw new ConflictError('Maker cannot approve their own OEMS approval queue item');
    }

    const decision = asOptionalString(data.decision)?.toUpperCase() ?? 'APPROVED';
    if (!['APPROVED', 'REJECTED', 'RETURNED'].includes(decision)) {
      throw new ValidationError('Approval decision must be APPROVED, REJECTED, or RETURNED');
    }
    if (data.reviewerRole && data.reviewerRole.trim().toUpperCase() !== item.assigned_role) {
      throw new ForbiddenError(`Approval item is assigned to role ${item.assigned_role}`);
    }

    const [updated] = await db.update(schema.oemsApprovalQueueItems).set({
      approval_status: decision,
      claimed_by: item.claimed_by ?? userId,
      claimed_at: item.claimed_at ?? new Date(),
      decision_by: userId,
      decision_at: new Date(),
      decision_comment: asOptionalString(data.comment),
      escalation_status: 'NONE',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsApprovalQueueItems.id, item.id)).returning();

    if (item.order_id && item.entity_type === 'oems_order' && ['APPROVED', 'REJECTED'].includes(decision)) {
      await db.update(schema.oemsOrders).set({
        order_status: decision as OemsOrderStatus,
        updated_by: userId,
        updated_at: new Date(),
      }).where(eq(schema.oemsOrders.order_id, item.order_id));
    }

    return updated;
  },

  async renderReportArtifact(exportJobId: string, data: {
    renderPayload?: unknown;
    renderStatus?: string;
    fileUrl?: string;
    fileHash?: string;
  }, userId: string) {
    const job = await getExportJob(exportJobId);
    if (job.export_status === 'FAILED') {
      throw new ConflictError('Failed export jobs must be retried before rendering artifacts');
    }
    const report = await getReportDefinitionById(job.report_id);
    const artifactPayload = buildReportArtifactPayload(job, report, {
      ...asRecord(data.renderPayload),
      note: 'Renderer-backed report artifacts persist file URL, checksum, source manifest and protection evidence',
    });
    const renderPayload = asRecord(data.renderPayload);

    const [artifact] = await db.insert(schema.oemsReportRenderArtifacts).values({
      artifact_id: makeId('ART'),
      export_job_id: job.export_job_id,
      report_code: report.report_code,
      requested_format: job.requested_format,
      renderer: 'OEMS_RENDERER',
      render_status: asOptionalString(data.renderStatus)?.toUpperCase() ?? 'READY',
      file_url: asOptionalString(data.fileUrl) ?? artifactPayload.fileUrl,
      file_hash: asOptionalString(data.fileHash) ?? artifactPayload.fileHash,
      row_count: job.row_count ?? 0,
      protected_file: job.protected_file,
      protection_evidence: artifactPayload.protectionEvidence,
      source_manifest: artifactPayload.sourceManifest,
      render_payload: {
        ...renderPayload,
        evidence: 'Renderer-backed report artifacts persist file URL, checksum, source manifest and protection evidence',
      },
      created_by: userId,
    }).returning();

    await db.update(schema.oemsExportJobs).set({
      export_status: artifact.render_status === 'READY' ? 'READY' : job.export_status,
      file_url: artifact.file_url,
      file_hash: artifact.file_hash,
      generated_at: new Date(),
      completed_at: artifact.render_status === 'READY' ? new Date() : job.completed_at,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsExportJobs.id, job.id));

    return artifact;
  },

  async getReportRenderArtifact(artifactId: string) {
    return getReportRenderArtifact(artifactId);
  },

  async listReportRenderArtifacts(params: {
    exportJobId?: string;
    reportCode?: string;
    status?: string;
  } = {}) {
    const conditions = [eq(schema.oemsReportRenderArtifacts.is_deleted, false)];
    if (params.exportJobId) conditions.push(eq(schema.oemsReportRenderArtifacts.export_job_id, params.exportJobId));
    if (params.reportCode) conditions.push(eq(schema.oemsReportRenderArtifacts.report_code, params.reportCode.trim().toUpperCase()));
    if (params.status) conditions.push(eq(schema.oemsReportRenderArtifacts.render_status, params.status.trim().toUpperCase()));

    return db.select().from(schema.oemsReportRenderArtifacts)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsReportRenderArtifacts.generated_at))
      .limit(200);
  },

  async registerMigrationRollbackScript(data: {
    rollbackId?: string;
    migrationName?: string;
    rollbackScriptPath?: string;
    rollbackSql?: string;
    checksum?: string;
    notes?: string;
  }, userId: string) {
    const migrationName = asOptionalString(data.migrationName);
    const rollbackScriptPath = asOptionalString(data.rollbackScriptPath);
    const rollbackSql = asOptionalString(data.rollbackSql);
    if (!migrationName) throw new ValidationError('Migration name is required');
    if (!rollbackScriptPath) throw new ValidationError('Rollback script path is required');
    if (!rollbackSql) throw new ValidationError('Rollback SQL is required');

    const [rollback] = await db.insert(schema.oemsMigrationRollbackScripts).values({
      rollback_id: asOptionalString(data.rollbackId)?.toUpperCase() ?? makeId('RB'),
      migration_name: migrationName,
      rollback_script_path: rollbackScriptPath,
      rollback_sql: rollbackSql,
      checksum: asOptionalString(data.checksum) ?? hashOemsPayload(rollbackSql),
      verification_status: 'PENDING_REVIEW',
      notes: asOptionalString(data.notes) ?? 'Rollback scripts are registered and checksum-verifiable for OEMS migrations',
      created_by: userId,
    }).returning();
    return rollback;
  },

  async verifyMigrationRollbackScript(rollbackId: string, data: {
    expectedChecksum?: string;
    verificationStatus?: string;
    notes?: string;
  }, userId: string) {
    const [rollback] = await db.select().from(schema.oemsMigrationRollbackScripts)
      .where(and(
        eq(schema.oemsMigrationRollbackScripts.rollback_id, rollbackId.trim().toUpperCase()),
        eq(schema.oemsMigrationRollbackScripts.is_deleted, false),
      ))
      .limit(1);
    if (!rollback) throw new NotFoundError('OEMS migration rollback script not found');
    if (data.expectedChecksum && data.expectedChecksum !== rollback.checksum) {
      throw new ConflictError('Rollback checksum verification failed');
    }

    const [updated] = await db.update(schema.oemsMigrationRollbackScripts).set({
      verification_status: asOptionalString(data.verificationStatus)?.toUpperCase() ?? 'VERIFIED',
      verified_by: userId,
      verified_at: new Date(),
      notes: asOptionalString(data.notes) ?? 'Rollback scripts are registered and checksum-verifiable for OEMS migrations',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsMigrationRollbackScripts.id, rollback.id)).returning();
    return updated;
  },

  async listMigrationRollbackScripts(params: {
    status?: string;
    migrationName?: string;
  } = {}) {
    const conditions = [eq(schema.oemsMigrationRollbackScripts.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.oemsMigrationRollbackScripts.verification_status, params.status.trim().toUpperCase()));
    if (params.migrationName) conditions.push(eq(schema.oemsMigrationRollbackScripts.migration_name, params.migrationName));

    return db.select().from(schema.oemsMigrationRollbackScripts)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMigrationRollbackScripts.created_at))
      .limit(100);
  },

  async listNotificationTemplates(params: {
    eventCode?: string;
    status?: typeof schema.oemsNotificationTemplateStatusEnum.enumValues[number];
    productFamily?: OemsProductFamily;
  } = {}) {
    const conditions = [eq(schema.oemsNotificationTemplates.is_deleted, false)];
    if (params.eventCode) conditions.push(eq(schema.oemsNotificationTemplates.event_code, params.eventCode.trim().toUpperCase()));
    if (params.status) conditions.push(eq(schema.oemsNotificationTemplates.template_status, params.status));
    if (params.productFamily) conditions.push(eq(schema.oemsNotificationTemplates.product_family, params.productFamily));

    return db.select().from(schema.oemsNotificationTemplates)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsNotificationTemplates.created_at))
      .limit(100);
  },

  async createNotificationTemplate(data: OemsNotificationTemplateInput, userId: string) {
    const normalized = normalizeNotificationTemplateInput(data);
    const [template] = await db.insert(schema.oemsNotificationTemplates).values({
      event_code: normalized.eventCode,
      template_code: normalized.templateCode,
      product_family: data.productFamily,
      channel: normalized.channel,
      delivery_channels: normalized.deliveryChannels,
      recipient_role: data.recipientRole.trim().toUpperCase(),
      subject_template: data.subjectTemplate.trim(),
      body_template: data.bodyTemplate.trim(),
      language_default: normalized.languageDefault,
      localized_subjects: normalized.localizedSubjects,
      localized_bodies: normalized.localizedBodies,
      sla_minutes: data.slaMinutes,
      template_status: 'DRAFT',
      critical: normalized.critical,
      requires_attachment: data.requiresAttachment ?? false,
      attachment_password_policy: data.attachmentPasswordPolicy,
      is_active: false,
      created_by: userId,
    }).returning();
    return template;
  },

  async submitNotificationTemplate(templateId: number, userId: string) {
    const template = await getNotificationTemplate(templateId);
    if (!['DRAFT', 'REJECTED'].includes(template.template_status)) {
      throw new ConflictError(`Cannot submit notification template in status ${template.template_status}`);
    }

    const [updated] = await db.update(schema.oemsNotificationTemplates).set({
      template_status: 'PENDING_APPROVAL',
      submitted_by: userId,
      submitted_at: new Date(),
      rejected_reason: null,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsNotificationTemplates.id, templateId)).returning();
    return updated;
  },

  async approveNotificationTemplate(templateId: number, userId: string) {
    const template = await getNotificationTemplate(templateId);
    if (template.template_status !== 'PENDING_APPROVAL') {
      throw new ConflictError(`Cannot approve notification template in status ${template.template_status}`);
    }
    if (template.submitted_by === userId || template.created_by === userId) {
      throw new ConflictError('Maker cannot approve their own OEMS notification template');
    }
    assertNotificationTemplateApprovable(template);

    const [updated] = await db.update(schema.oemsNotificationTemplates).set({
      template_status: 'ACTIVE',
      approved_by: userId,
      approved_at: new Date(),
      is_active: true,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsNotificationTemplates.id, templateId)).returning();
    return updated;
  },

  async rejectNotificationTemplate(templateId: number, reason: string, userId: string) {
    const template = await getNotificationTemplate(templateId);
    if (template.template_status !== 'PENDING_APPROVAL') {
      throw new ConflictError(`Cannot reject notification template in status ${template.template_status}`);
    }
    if (!reason?.trim()) throw new ValidationError('Reject reason is required');

    const [updated] = await db.update(schema.oemsNotificationTemplates).set({
      template_status: 'REJECTED',
      rejected_reason: reason.trim(),
      is_active: false,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsNotificationTemplates.id, templateId)).returning();
    return updated;
  },

  async retireNotificationTemplate(templateId: number, reason: string | undefined, userId: string) {
    const template = await getNotificationTemplate(templateId);
    if (template.critical || criticalNotificationEvents.has(template.event_code)) {
      throw new ConflictError('Critical transactional notifications cannot be disabled or retired');
    }

    const [updated] = await db.update(schema.oemsNotificationTemplates).set({
      template_status: 'RETIRED',
      rejected_reason: reason?.trim(),
      is_active: false,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsNotificationTemplates.id, templateId)).returning();
    return updated;
  },

  async dispatchNotificationEvent(data: OemsNotificationEventInput, userId: string) {
    return dispatchNotificationEventInternal(data, userId);
  },

  async queueNotification(data: {
    eventCode: string;
    orderId?: string;
    recipientId?: string;
    recipientType?: string;
    recipientAddress?: string;
    recipientRole?: string;
    channels?: NotificationChannel[] | string;
    languageCode?: string;
    dueAt?: Date;
    payload?: unknown;
  }, userId: string) {
    const result = await dispatchNotificationEventInternal({
      eventCode: data.eventCode,
      orderId: data.orderId,
      recipientId: data.recipientId,
      recipientType: data.recipientType,
      recipientAddress: data.recipientAddress,
      recipientRole: data.recipientRole,
      dueAt: data.dueAt,
      payload: data.payload,
      languageCode: data.languageCode,
      channels: data.channels ?? ['IN_APP'],
    }, userId);
    return result.deliveries[0] ?? result;
  },

  async listNotificationDeliveries(params: {
    status?: string;
    eventCode?: string;
    channel?: NotificationChannel;
    orderId?: string;
    operationsOnly?: boolean;
  } = {}) {
    const conditions = [eq(schema.oemsNotificationDeliveries.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.oemsNotificationDeliveries.delivery_status, params.status));
    if (params.eventCode) conditions.push(eq(schema.oemsNotificationDeliveries.event_code, params.eventCode.trim().toUpperCase()));
    if (params.channel) conditions.push(eq(schema.oemsNotificationDeliveries.channel, params.channel));
    if (params.orderId) conditions.push(eq(schema.oemsNotificationDeliveries.order_id, params.orderId));
    if (params.operationsOnly) conditions.push(eq(schema.oemsNotificationDeliveries.operations_visible, true));

    return db.select().from(schema.oemsNotificationDeliveries)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsNotificationDeliveries.created_at))
      .limit(200);
  },

  async retryNotificationDelivery(deliveryId: number, userId: string) {
    const delivery = await getNotificationDelivery(deliveryId);
    if (!['FAILED', 'PENDING', 'RETRYING'].includes(delivery.delivery_status)) {
      throw new ConflictError(`Cannot retry notification delivery in status ${delivery.delivery_status}`);
    }
    if (delivery.attempt_count >= delivery.max_attempts) {
      throw new ConflictError('Notification delivery has reached the configured retry limit');
    }

    const attemptNo = delivery.attempt_count + 1;
    const now = new Date();
    const [updated] = await db.update(schema.oemsNotificationDeliveries).set({
      delivery_status: 'RETRYING',
      attempt_count: sql`${schema.oemsNotificationDeliveries.attempt_count} + 1`,
      last_attempt_at: now,
      failure_reason: null,
      exception_reason: null,
      operations_visible: true,
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsNotificationDeliveries.id, deliveryId)).returning();

    await recordNotificationAttempt({
      deliveryId,
      attemptNo,
      channel: delivery.channel,
      provider: 'INTERNAL_RETRY_QUEUE',
      status: 'RETRYING',
      responsePayload: { queuedAt: now.toISOString() },
    }, userId);

    return updated;
  },

  async markNotificationDeliveryResult(deliveryId: number, data: {
    status: NotificationDeliveryStatus;
    providerMessageId?: string;
    failureReason?: string;
    responsePayload?: unknown;
  }, userId: string) {
    const delivery = await getNotificationDelivery(deliveryId);
    const status = data.status.toUpperCase() as NotificationDeliveryStatus;
    if (!['SENT', 'DELIVERED', 'FAILED'].includes(status)) {
      throw new ValidationError('Notification delivery result must be SENT, DELIVERED, or FAILED');
    }
    const now = new Date();
    const timestamps = notificationDeliveryTimestamps(status, now);
    const [updated] = await db.update(schema.oemsNotificationDeliveries).set({
      delivery_status: status,
      sent_at: timestamps.sent_at ?? delivery.sent_at,
      delivered_at: timestamps.delivered_at,
      failed_at: timestamps.failed_at,
      provider_message_id: data.providerMessageId,
      failure_reason: status === 'FAILED' ? data.failureReason ?? 'NOTIFICATION_DELIVERY_FAILED' : null,
      exception_reason: status === 'FAILED' ? data.failureReason ?? 'NOTIFICATION_DELIVERY_FAILED' : null,
      operations_visible: status === 'FAILED',
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsNotificationDeliveries.id, deliveryId)).returning();

    await recordNotificationAttempt({
      deliveryId,
      attemptNo: Math.max(1, delivery.attempt_count),
      channel: delivery.channel,
      status,
      providerMessageId: data.providerMessageId,
      failureReason: data.failureReason,
      responsePayload: data.responsePayload,
    }, userId);

    if (status === 'FAILED') {
      await logNotificationException(updated, data.failureReason ?? 'NOTIFICATION_DELIVERY_FAILED', userId);
    }

    return updated;
  },

  async getNotificationOperationsReport(params: { status?: string } = {}) {
    const deliveries = await this.listNotificationDeliveries({
      status: params.status,
      operationsOnly: true,
    });
    const groups = new Map<string, OemsNotificationDelivery[]>();

    for (const delivery of deliveries) {
      const groupKey = delivery.delivery_group_id ?? `DELIVERY-${delivery.id}`;
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), delivery]);
    }

    const rows = [...groups.entries()].map(([deliveryGroupId, groupDeliveries]) => {
      const failed = groupDeliveries.filter((delivery) => delivery.delivery_status === 'FAILED');
      const successful = groupDeliveries.filter((delivery) => ['SENT', 'DELIVERED'].includes(delivery.delivery_status));
      const pending = groupDeliveries.filter((delivery) => ['PENDING', 'QUEUED', 'RETRYING'].includes(delivery.delivery_status));
      const representative = groupDeliveries[0];
      const groupStatus: NotificationDeliveryStatus = failed.length > 0 && successful.length > 0
        ? 'PARTIALLY_DELIVERED'
        : failed.length > 0
          ? 'FAILED'
          : pending.length > 0
            ? 'PENDING'
            : 'DELIVERED';

      return {
        deliveryGroupId,
        eventCode: representative.event_code,
        orderId: representative.order_id,
        recipientId: representative.recipient_id,
        groupStatus,
        channels: groupDeliveries.map((delivery) => delivery.channel),
        failedChannels: failed.map((delivery) => delivery.channel),
        failureReasons: failed.map((delivery) => delivery.failure_reason ?? delivery.exception_reason ?? 'NOTIFICATION_DELIVERY_FAILED'),
        retryable: failed.some((delivery) => delivery.attempt_count < delivery.max_attempts),
        nonBlockingBusinessTransaction: groupDeliveries.every((delivery) => !delivery.business_transaction_blocking),
        lastAttemptAt: groupDeliveries
          .map((delivery) => delivery.last_attempt_at)
          .filter(Boolean)
          .sort()
          .at(-1),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalGroups: rows.length,
        failedGroups: rows.filter((row) => row.groupStatus === 'FAILED').length,
        partiallyDeliveredGroups: rows.filter((row) => row.groupStatus === 'PARTIALLY_DELIVERED').length,
        retryableGroups: rows.filter((row) => row.retryable).length,
      },
      rows,
    };
  },

  async listReportDefinitions(params: { productFamily?: OemsProductFamily; category?: string; activeOnly?: boolean } = {}) {
    const conditions = [eq(schema.oemsReportDefinitions.is_deleted, false), eq(schema.oemsReportDefinitions.is_active, true)];
    if (params.productFamily) conditions.push(eq(schema.oemsReportDefinitions.product_family, params.productFamily));
    if (params.category) conditions.push(eq(schema.oemsReportDefinitions.report_category, params.category.trim().toUpperCase()));
    if (params.activeOnly === false) conditions.splice(1, 1);
    return db.select().from(schema.oemsReportDefinitions)
      .where(and(...conditions))
      .orderBy(schema.oemsReportDefinitions.report_code);
  },

  async createReportDefinition(data: {
    reportCode: string;
    reportName: string;
    reportCategory?: string;
    productFamily?: OemsProductFamily;
    allowedFormats?: OemsReportFormat[] | string;
    filtersSchema?: unknown;
    columns: unknown;
    dataSources?: string[] | string;
    syncRowThreshold?: number;
    protectionPolicy?: unknown;
    historySourcePolicy?: unknown;
    schedule?: string;
  }, userId: string) {
    if (!data.reportCode?.trim()) throw new ValidationError('Report code is required');
    if (!data.reportName?.trim()) throw new ValidationError('Report name is required');
    if (data.productFamily) validateProductFamily(data.productFamily);
    const allowedFormats = normalizeReportFormats(data.allowedFormats, ['CSV']);
    const dataSources = Array.isArray(data.dataSources)
      ? data.dataSources
      : typeof data.dataSources === 'string'
        ? data.dataSources.split(',').map((source) => source.trim().toUpperCase()).filter(Boolean)
        : ['OEMS'];

    const [definition] = await db.insert(schema.oemsReportDefinitions).values({
      report_code: data.reportCode.trim().toUpperCase(),
      report_name: data.reportName,
      report_category: data.reportCategory?.trim().toUpperCase() ?? data.productFamily ?? 'OPERATIONAL',
      product_family: data.productFamily,
      allowed_formats: allowedFormats,
      filters_schema: data.filtersSchema ?? Object.fromEntries(reportDefaultFilters.map((filter) => [filter, { type: 'text', optional: true }])),
      columns: data.columns,
      data_sources: dataSources,
      sync_row_threshold: data.syncRowThreshold ?? 10000,
      protection_policy: data.protectionPolicy ?? {},
      history_source_policy: data.historySourcePolicy ?? {},
      schedule: data.schedule,
      created_by: userId,
    }).returning();
    return definition;
  },

  async previewReport(reportCode: string, filtersInput: unknown = {}) {
    const report = await getReportDefinition(reportCode);
    const filters = normalizeReportFilters(filtersInput);
    const historyPlan = resolveHistorySourcePlan(filters, filters.sourceStatus);
    const rows = report.report_category === 'AUDIT' || report.report_code.includes('AUDIT')
      ? await db.select({
        id: schema.oemsOrderStatusTransitions.id,
        orderId: schema.oemsOrderStatusTransitions.order_id,
        eventCode: schema.oemsOrderStatusTransitions.event_code,
        fromStatus: schema.oemsOrderStatusTransitions.from_status,
        toStatus: schema.oemsOrderStatusTransitions.to_status,
        changedBy: schema.oemsOrderStatusTransitions.changed_by,
        changedAt: schema.oemsOrderStatusTransitions.changed_at,
      }).from(schema.oemsOrderStatusTransitions)
        .where(eq(schema.oemsOrderStatusTransitions.is_deleted, false))
        .orderBy(desc(schema.oemsOrderStatusTransitions.changed_at))
        .limit(100)
      : await db.select({
        orderId: schema.oemsOrders.order_id,
        orderNo: schema.oemsOrders.order_no,
        productFamily: schema.oemsOrders.product_family,
        customerId: schema.oemsOrders.customer_id,
        channel: schema.oemsOrders.channel,
        branchCode: schema.oemsOrders.branch_code,
        transactionType: schema.oemsOrders.transaction_type,
        currency: schema.oemsOrders.currency,
        amount: schema.oemsOrders.amount,
        status: schema.oemsOrders.order_status,
        externalRefs: schema.oemsOrders.external_refs,
        createdAt: schema.oemsOrders.created_at,
      }).from(schema.oemsOrders)
        .where(and(...buildOrderReportConditions(filters)))
        .orderBy(desc(schema.oemsOrders.created_at))
        .limit(100);

    return {
      reportCode: report.report_code,
      reportName: report.report_name,
      reportCategory: report.report_category,
      allowedFormats: normalizeReportFormats(report.allowed_formats),
      appliedFilters: filters,
      sourcePlan: historyPlan,
      readOnly: true,
      rows,
    };
  },

  async startExportJob(reportCode: string, payload: unknown, userId: string) {
    const report = await getReportDefinition(reportCode);
    const request = normalizeExportRequest(payload);
    const allowedFormats = normalizeReportFormats(report.allowed_formats, ['CSV']);
    if (!allowedFormats.includes(request.requestedFormat)) {
      throw new ValidationError(`UNSUPPORTED_FORMAT: ${request.requestedFormat} is not enabled for ${report.report_code}`);
    }

    const filters: Record<string, unknown> = {
      ...request.filters,
      bigDataAvailable: request.bigDataAvailable ?? request.filters.bigDataAvailable,
    };
    const historyPlan = resolveHistorySourcePlan(filters, request.sourceStatus);
    const rowEstimate = Number.isFinite(request.rowEstimate)
      ? Number(request.rowEstimate)
      : await this.estimateReportRows(report.report_code, filters);
    const asyncRequired = rowEstimate > report.sync_row_threshold;
    const protection = resolveReportProtection(report, request.requestedFormat);

    const groupId = Number(filters.odaGroupId ?? filters.groupId ?? filters.placementGroupId);
    if (isTreasurySummaryDealReport(report.report_code) && Number.isInteger(groupId)) {
      const [pending] = await db.select({ count: sql<number>`count(*)` }).from(schema.oemsOdaRecommendations)
        .where(and(
          eq(schema.oemsOdaRecommendations.placement_group_id, groupId),
          eq(schema.oemsOdaRecommendations.is_deleted, false),
          inArray(schema.oemsOdaRecommendations.lifecycle, ['PRE_ORDER', 'COLLECTED', 'SUMMARY_PENDING']),
        ))
        .limit(1);
      if (Number(pending?.count ?? 0) > 0) {
        throw new ConflictError('Treasury Summary Deal Report cannot be downloaded while the selected ODA group has pending transactions');
      }
    }

    if (historyPlan.olderThan90Days && !historyPlan.bigDataAvailable) {
      const [failedJob] = await db.insert(schema.oemsExportJobs).values({
        export_job_id: makeId('EXP'),
        report_id: report.id,
        requested_by: userId,
        requested_format: request.requestedFormat,
        export_status: 'FAILED',
        filters,
        source_systems: historyPlan.sources,
        execution_mode: asyncRequired ? 'ASYNC' : 'SYNC',
        row_count: rowEstimate,
        async_required: asyncRequired,
        protected_file: protection.protectedFile,
        protection_policy: protection.policy,
        error_code: 'BIG_DATA_UNAVAILABLE',
        error_message: 'Big Data is unavailable for transaction history older than 90 days; no partial export was marked complete',
        retry_count: 0,
        next_retry_at: addSeconds(300),
        created_by: userId,
      }).returning();
      return failedJob;
    }

    const [job] = await db.insert(schema.oemsExportJobs).values({
      export_job_id: makeId('EXP'),
      report_id: report.id,
      requested_by: userId,
      requested_format: request.requestedFormat,
      export_status: asyncRequired ? 'QUEUED' : 'READY',
      filters,
      source_systems: historyPlan.sources,
      execution_mode: asyncRequired ? 'ASYNC' : 'SYNC',
      row_count: rowEstimate,
      async_required: asyncRequired,
      protected_file: protection.protectedFile,
      protection_policy: protection.policy,
      file_url: asyncRequired ? undefined : `/exports/oems/${report.report_code}-${Date.now()}.${request.requestedFormat.toLowerCase()}`,
      file_hash: asyncRequired ? undefined : makeId('HASH'),
      started_at: new Date(),
      generated_at: asyncRequired ? undefined : new Date(),
      completed_at: asyncRequired ? undefined : new Date(),
      created_by: userId,
    }).returning();

    if (!asyncRequired) {
      const artifactPayload = buildReportArtifactPayload(job, report, {
        filters,
        rowEstimate,
        sourcePlan: historyPlan,
        note: 'Renderer-backed report artifacts persist file URL, checksum, source manifest and protection evidence',
      });
      await db.insert(schema.oemsReportRenderArtifacts).values({
        artifact_id: artifactPayload.artifactId,
        export_job_id: job.export_job_id,
        report_code: report.report_code,
        requested_format: job.requested_format,
        renderer: 'OEMS_RENDERER',
        render_status: 'READY',
        file_url: artifactPayload.fileUrl,
        file_hash: artifactPayload.fileHash,
        row_count: job.row_count ?? 0,
        protected_file: job.protected_file,
        protection_evidence: artifactPayload.protectionEvidence,
        source_manifest: artifactPayload.sourceManifest,
        render_payload: {
          filters,
          sourcePlan: historyPlan,
          rowEstimate,
        },
        created_by: userId,
      }).returning();
    }

    return job;
  },

  async estimateReportRows(_reportCode: string, filtersInput: unknown = {}) {
    const filters = normalizeReportFilters(filtersInput);
    const explicitEstimate = Number(filters.rowEstimate);
    if (Number.isFinite(explicitEstimate) && explicitEstimate >= 0) return explicitEstimate;

    const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.oemsOrders)
      .where(and(...buildOrderReportConditions(filters)))
      .limit(1);
    return Number(result?.count ?? 0);
  },

  async listExportJobs(params: { status?: string; reportCode?: string; requestedBy?: string } = {}) {
    const conditions = [eq(schema.oemsExportJobs.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.oemsExportJobs.export_status, params.status.trim().toUpperCase()));
    if (params.requestedBy) conditions.push(eq(schema.oemsExportJobs.requested_by, params.requestedBy));

    if (params.reportCode) {
      const report = await getReportDefinition(params.reportCode);
      conditions.push(eq(schema.oemsExportJobs.report_id, report.id));
    }

    return db.select().from(schema.oemsExportJobs)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsExportJobs.created_at))
      .limit(100);
  },

  async getExportJob(jobId: string) {
    return getExportJob(jobId);
  },

  async retryExportJob(jobId: string, userId: string) {
    const job = await getExportJob(jobId);
    if (!['FAILED', 'QUEUED'].includes(job.export_status)) {
      throw new ConflictError(`Cannot retry export job in status ${job.export_status}`);
    }

    const [updated] = await db.update(schema.oemsExportJobs).set({
      export_status: 'QUEUED',
      retry_count: sql`${schema.oemsExportJobs.retry_count} + 1`,
      next_retry_at: addSeconds(300),
      error_code: null,
      error_message: null,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.oemsExportJobs.id, job.id)).returning();
    return updated;
  },

  async requestTransactionHistory(filtersInput: unknown, userId: string) {
    const filters = normalizeReportFilters(filtersInput);
    const plan = resolveHistorySourcePlan(filters, filters.sourceStatus);
    const failed = plan.olderThan90Days && !plan.bigDataAvailable;

    const [request] = await db.insert(schema.oemsTransactionHistoryRequests).values({
      request_id: makeId('HIST'),
      customer_id: asOptionalString(filters.customerId),
      cif: asOptionalString(filters.cif),
      product_family: asOptionalString(filters.productFamily) as OemsProductFamily | undefined,
      from_date: plan.dateFrom,
      to_date: plan.dateTo,
      history_age_bucket: plan.ageBucket,
      source_systems: plan.sources,
      source_status: plan.sourceStatus,
      filters,
      history_status: failed ? 'FAILED' : 'READY',
      result_summary: failed ? undefined : {
        retrievalMode: plan.ageBucket,
        sourcesQueried: plan.sources,
        readOnly: true,
      },
      error_code: failed ? 'BIG_DATA_UNAVAILABLE' : undefined,
      error_message: failed ? 'Big Data is unavailable for transaction history older than 90 days' : undefined,
      next_retry_at: failed ? addSeconds(300) : undefined,
      created_by: userId,
    }).returning();

    if (failed) {
      await db.insert(schema.oemsIntegrationMessages).values({
        target_system: 'BIG_DATA',
        message_type: 'TRANSACTION_HISTORY_LOOKUP',
        entity_type: 'OEMS_TRANSACTION_HISTORY_REQUEST',
        entity_id: request.request_id,
        integration_status: 'FAILED',
        payload: filters,
        response_payload: { sources: plan.sources, ageBucket: plan.ageBucket },
        last_error: 'BIG_DATA_UNAVAILABLE',
        next_retry_at: addSeconds(300),
        created_by: userId,
      }).returning();
    }

    return {
      ...request,
      sourcePlan: plan,
      rows: failed ? [] : [],
    };
  },

  async createPortfolioHolding(data: {
    customerId?: string;
    portfolioId?: string;
    productFamily: OemsProductFamily;
    productCode: string;
    productName?: string;
    externalAccountNo?: string;
    holdingAmount?: number;
    marketValue?: number;
    originalMarketValue?: number;
    currency?: string;
    localCurrency?: string;
    localMarketValue?: number;
    fxRate?: number;
    fxRateSource?: string;
    fxRateAsOf?: string;
    realizedGainLoss?: number;
    unrealizedGainLoss?: number;
    profitGain?: number;
    leftPrincipal?: number;
    leftTermDays?: number;
    maturityDate?: string;
    valuationDate?: string;
    sourceSystem?: string;
    sourceStatus?: string;
    sourcePayload?: unknown;
    transactionRedirectUrl?: string;
  }, userId: string) {
    validateProductFamily(data.productFamily);
    if (!data.productCode?.trim()) throw new ValidationError('Portfolio holding product code is required');
    if (!data.customerId && !data.portfolioId) throw new ValidationError('Portfolio holding requires customerId or portfolioId');

    const [holding] = await db.insert(schema.oemsPortfolioHoldings).values({
      customer_id: data.customerId,
      portfolio_id: data.portfolioId,
      product_family: data.productFamily,
      product_code: data.productCode.trim().toUpperCase(),
      product_name: data.productName,
      external_account_no: data.externalAccountNo,
      holding_amount: toMoney(data.holdingAmount ?? 0),
      original_market_value: toMoney(data.originalMarketValue ?? data.marketValue ?? 0),
      market_value: toMoney(data.marketValue ?? data.originalMarketValue ?? 0),
      currency: data.currency ?? 'IDR',
      local_currency: data.localCurrency ?? 'IDR',
      local_market_value: toMoney(data.localMarketValue),
      fx_rate: toRate(data.fxRate),
      fx_rate_source: data.fxRateSource,
      fx_rate_as_of: data.fxRateAsOf,
      realized_gain_loss: toMoney(data.realizedGainLoss),
      unrealized_gain_loss: toMoney(data.unrealizedGainLoss),
      profit_gain: toMoney(data.profitGain),
      left_principal: toMoney(data.leftPrincipal),
      left_term_days: data.leftTermDays,
      maturity_date: data.maturityDate,
      valuation_date: data.valuationDate ?? todayIso(),
      source_system: data.sourceSystem ?? 'OEMS',
      source_status: data.sourceStatus?.trim().toUpperCase() ?? 'AVAILABLE',
      source_last_refreshed_at: new Date(),
      source_payload: data.sourcePayload,
      transaction_redirect_url: data.transactionRedirectUrl,
      created_by: userId,
    }).returning();
    return holding;
  },

  async getCombinedPortfolioView(params: {
    customerId?: string;
    cif?: string;
    portfolioId?: string;
    productFamily?: OemsProductFamily;
    holdingMetric?: string;
    sourceStatus?: unknown;
    fxRates?: unknown;
    asOfDate?: string;
    actorRole?: string;
    actorCustomerId?: string;
    assignedCustomerIds?: string[];
  }, userId: string) {
    const customerId = params.customerId ?? params.cif;
    assertPortfolioAccess({
      customerId,
      actorCustomerId: params.actorCustomerId,
      actorRole: params.actorRole,
      assignedCustomerIds: params.assignedCustomerIds,
    });

    const asOfDate = parseReportDate(params.asOfDate, 'As-of date') ?? todayIso();
    const sourceStatus = normalizeSourceStatus(params.sourceStatus);
    const unavailableSources = Object.entries(sourceStatus)
      .filter(([_source, status]) => ['UNAVAILABLE', 'FAILED', 'TIMEOUT'].includes(status))
      .map(([source]) => source);

    await Promise.all(unavailableSources.map((source) => db.insert(schema.oemsIntegrationMessages).values({
      target_system: source,
      message_type: 'PORTFOLIO_SOURCE_SYNC',
      entity_type: 'OEMS_PORTFOLIO',
      entity_id: customerId ?? params.portfolioId ?? 'UNKNOWN',
      integration_status: 'FAILED',
      payload: { customerId, portfolioId: params.portfolioId, asOfDate },
      response_payload: { sourceStatus: sourceStatus[source] },
      retry_count: 0,
      next_retry_at: addSeconds(300),
      last_error: `PORTFOLIO_SOURCE_${sourceStatus[source]}`,
      created_by: userId,
    }).returning()));

    const conditions = [eq(schema.oemsPortfolioHoldings.is_deleted, false)];
    if (customerId) conditions.push(eq(schema.oemsPortfolioHoldings.customer_id, customerId));
    if (params.portfolioId) conditions.push(eq(schema.oemsPortfolioHoldings.portfolio_id, params.portfolioId));
    if (params.productFamily) conditions.push(eq(schema.oemsPortfolioHoldings.product_family, params.productFamily));

    const holdings = await db.select().from(schema.oemsPortfolioHoldings)
      .where(and(...conditions))
      .orderBy(schema.oemsPortfolioHoldings.product_family, schema.oemsPortfolioHoldings.product_code)
      .limit(500) as OemsPortfolioHolding[];

    const availableHoldings = holdings
      .filter((holding) => !holding.source_system || !unavailableSources.includes(holding.source_system))
      .filter((holding) => filterPortfolioHoldingMetric(holding, params.holdingMetric));
    const fxRates = asRecord(params.fxRates);
    const rows = availableHoldings.map((holding) => {
      const local = resolvePortfolioLocalValue(holding, fxRates, asOfDate);
      return {
        id: holding.id,
        customerId: holding.customer_id,
        portfolioId: holding.portfolio_id,
        productFamily: holding.product_family,
        productCode: holding.product_code,
        productName: holding.product_name,
        holdingAmount: asNumber(holding.holding_amount),
        currency: holding.currency,
        originalMarketValue: local.originalValue,
        localCurrency: local.localCurrency,
        localMarketValue: local.localValue,
        realizedGainLoss: asNumber(holding.realized_gain_loss),
        unrealizedGainLoss: asNumber(holding.unrealized_gain_loss),
        profitGain: asNumber(holding.profit_gain),
        leftPrincipal: asNumber(holding.left_principal),
        leftTermDays: asNumber(holding.left_term_days),
        maturityDate: holding.maturity_date,
        sourceSystem: holding.source_system ?? 'OEMS',
        sourceStatus: holding.source_status,
        sourceLastRefreshedAt: holding.source_last_refreshed_at,
        stale: holding.source_status !== 'AVAILABLE',
        fxRate: local.fxRate,
        fxRateSource: local.fxRateSource,
        fxRateAsOf: local.fxRateAsOf,
        transactionRedirectUrl: holding.transaction_redirect_url,
      };
    });

    return {
      customerId,
      portfolioId: params.portfolioId,
      asOfDate,
      localCurrency: 'IDR',
      isPartial: unavailableSources.length > 0,
      sourceStatus: {
        OEMS: sourceStatus.OEMS ?? 'AVAILABLE',
        WEALTH_CORE: sourceStatus.WEALTH_CORE ?? 'AVAILABLE',
        CORE_BANKING: sourceStatus.CORE_BANKING ?? 'AVAILABLE',
        unavailableSources,
      },
      valuationPolicy: {
        fxRateSource: 'APPROVED_TREASURY_RATE',
        asOfDate,
        missingSourcesNotMergedAsZero: true,
      },
      totals: {
        localMarketValue: Number(rows.reduce((sum, row) => sum + (row.localMarketValue ?? 0), 0).toFixed(4)),
        realizedGainLoss: Number(rows.reduce((sum, row) => sum + row.realizedGainLoss, 0).toFixed(4)),
        unrealizedGainLoss: Number(rows.reduce((sum, row) => sum + row.unrealizedGainLoss, 0).toFixed(4)),
      },
      holdings: rows,
    };
  },

  async exportPortfolioView(customerId: string, payload: unknown, userId: string) {
    const request = asRecord(payload);
    return this.startExportJob('PORTFOLIO_PERFORMANCE', {
      requestedFormat: request.requestedFormat ?? request.format ?? 'XLSX',
      rowEstimate: request.rowEstimate,
      filters: {
        ...asRecord(request.filters),
        customerId,
        productFamily: request.productFamily,
        holdingMetric: request.holdingMetric,
        dateFrom: request.dateFrom,
        dateTo: request.dateTo,
      },
    }, userId);
  },

  async getWorkbenchSummary() {
    const [
      openOrders,
      validationFailures,
      pendingIntegrations,
      ltvBreaches,
      activeParameters,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(schema.oemsOrders)
        .where(and(eq(schema.oemsOrders.is_deleted, false), inArray(schema.oemsOrders.order_status, ['DRAFT', 'PENDING_DOCUMENTS', 'PENDING_CUSTOMER_CONFIRMATION', 'PENDING_CUSTOMER_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED']))),
      db.select({ count: sql<number>`count(*)` }).from(schema.oemsOrders)
        .where(and(eq(schema.oemsOrders.is_deleted, false), eq(schema.oemsOrders.order_status, 'VALIDATION_FAILED'))),
      db.select({ count: sql<number>`count(*)` }).from(schema.oemsIntegrationMessages)
        .where(and(eq(schema.oemsIntegrationMessages.is_deleted, false), inArray(schema.oemsIntegrationMessages.integration_status, ['QUEUED', 'FAILED', 'RETRYING']))),
      db.select({ count: sql<number>`count(*)` }).from(schema.oemsM2mRuns)
        .where(and(eq(schema.oemsM2mRuns.is_deleted, false), inArray(schema.oemsM2mRuns.breach_level, ['WARNING', 'BREACH']))),
      db.select({ count: sql<number>`count(*)` }).from(schema.oemsParameterSets)
        .where(and(eq(schema.oemsParameterSets.is_deleted, false), eq(schema.oemsParameterSets.parameter_status, 'ACTIVE'))),
    ]);

    return {
      openOrders: Number(openOrders[0]?.count ?? 0),
      validationFailures: Number(validationFailures[0]?.count ?? 0),
      pendingIntegrations: Number(pendingIntegrations[0]?.count ?? 0),
      ltvBreaches: Number(ltvBreaches[0]?.count ?? 0),
      activeParameters: Number(activeParameters[0]?.count ?? 0),
    };
  },

  async listOdaRecommendations(params: { lifecycle?: string; cutoffFrom?: string; cutoffTo?: string } = {}) {
    const conditions = [eq(schema.oemsOdaRecommendations.is_deleted, false)];
    if (params.lifecycle) conditions.push(eq(schema.oemsOdaRecommendations.lifecycle, params.lifecycle as typeof schema.oemsOdaLifecycleEnum.enumValues[number]));
    if (params.cutoffFrom) conditions.push(gte(schema.oemsOdaRecommendations.cutoff_at, new Date(params.cutoffFrom)));
    if (params.cutoffTo) conditions.push(lte(schema.oemsOdaRecommendations.cutoff_at, new Date(params.cutoffTo)));
    return db.select().from(schema.oemsOdaRecommendations)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsOdaRecommendations.created_at));
  },

  async listMldTranches(params: { lifecycle?: string } = {}) {
    const conditions = [eq(schema.oemsMldTranches.is_deleted, false)];
    if (params.lifecycle) conditions.push(eq(schema.oemsMldTranches.lifecycle, params.lifecycle as typeof schema.oemsMldLifecycleEnum.enumValues[number]));
    return db.select().from(schema.oemsMldTranches)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMldTranches.created_at));
  },

  async listIntegrationMessages(params: { status?: string } = {}) {
    const conditions = [eq(schema.oemsIntegrationMessages.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.oemsIntegrationMessages.integration_status, params.status as typeof schema.oemsIntegrationStatusEnum.enumValues[number]));
    return db.select().from(schema.oemsIntegrationMessages)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsIntegrationMessages.created_at))
      .limit(100);
  },

  // ============================================================================
  // Enhanced Product Setup — FX ODA Product Approval Workflow
  // ============================================================================

  _generateProductCode(family: string): string {
    const prefix = family === 'MLD' ? 'MLD' : 'ODA';
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `${prefix}-${ym}-${seq}`;
  },

  async createProductEnhanced(data: Record<string, any>, userId: string) {
    const code = this._generateProductCode(data.product_family ?? 'ODA');
    const [existing] = await db.select({ id: schema.oemsProducts.id })
      .from(schema.oemsProducts)
      .where(eq(schema.oemsProducts.product_code, code))
      .limit(1);
    if (existing) throw new ConflictError(`Product code ${code} already exists`);

    const [product] = await db.insert(schema.oemsProducts).values({
      product_code: code,
      product_name: data.product_name,
      product_family: data.product_family ?? 'ODA',
      currency: data.currency ?? 'IDR',
      product_status: 'DRAFT',
      currency_pair_from: data.currency_pair_from,
      currency_pair_to: data.currency_pair_to,
      reference_rate_source: data.reference_rate_source,
      oda_transaction_types_allowed: data.oda_transaction_types_allowed ?? [],
      effective_date_types_allowed: data.effective_date_types_allowed ?? [],
      min_placement_amount: data.min_placement_amount,
      min_collective_order_amount: data.min_collective_order_amount,
      spread_tolerance_percent: data.spread_tolerance_percent,
      cutoff_intraday: data.cutoff_intraday,
      cutoff_overnight: data.cutoff_overnight,
      cutoff_gtd: data.cutoff_gtd,
      cutoff_timezone: data.cutoff_timezone ?? 'Asia/Jakarta',
      eligible_account_types: data.eligible_account_types ?? [],
      eligible_account_codes: data.eligible_account_codes ?? [],
      sales_cert_required: data.sales_cert_required ?? false,
      sales_cert_type: data.sales_cert_type,
      sales_cert_expiry_mode: data.sales_cert_expiry_mode,
      trade_ideas_enabled: data.trade_ideas_enabled ?? false,
      trade_ideas_rate: data.trade_ideas_rate,
      trade_ideas_message: data.trade_ideas_message,
      risk_score: data.risk_score,
      min_subscription_amount: data.min_subscription_amount,
      max_subscription_amount: data.max_subscription_amount,
      tenor_days: data.tenor_days,
      is_active: false,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return product;
  },

  async submitProduct(productId: number, userId: string) {
    const [product] = await db.select().from(schema.oemsProducts).where(eq(schema.oemsProducts.id, productId)).limit(1);
    if (!product) throw new NotFoundError('Product not found');
    if (product.product_status !== 'DRAFT' && product.product_status !== 'REJECTED') {
      throw new ValidationError('Only DRAFT or REJECTED products can be submitted');
    }
    const [updated] = await db.update(schema.oemsProducts)
      .set({ product_status: 'PENDING_APPROVAL', submitted_by: userId, submitted_at: new Date(), updated_by: userId })
      .where(eq(schema.oemsProducts.id, productId))
      .returning();
    return updated;
  },

  async approveProduct(productId: number, userId: string) {
    const [product] = await db.select().from(schema.oemsProducts).where(eq(schema.oemsProducts.id, productId)).limit(1);
    if (!product) throw new NotFoundError('Product not found');
    if (product.product_status !== 'PENDING_APPROVAL') throw new ValidationError('Only PENDING_APPROVAL products can be approved');
    if (product.submitted_by === userId) throw new ForbiddenError('Four-eyes: approver must differ from submitter');
    const [updated] = await db.update(schema.oemsProducts)
      .set({ product_status: 'ACTIVE', is_active: true, approved_by: userId, approved_at: new Date(), updated_by: userId })
      .where(eq(schema.oemsProducts.id, productId))
      .returning();
    return updated;
  },

  async rejectProduct(productId: number, reason: string, userId: string) {
    if (!reason || reason.trim().length < 10) throw new ValidationError('Rejection reason must be at least 10 characters');
    const [product] = await db.select().from(schema.oemsProducts).where(eq(schema.oemsProducts.id, productId)).limit(1);
    if (!product) throw new NotFoundError('Product not found');
    if (product.product_status !== 'PENDING_APPROVAL') throw new ValidationError('Only PENDING_APPROVAL products can be rejected');
    if (product.submitted_by === userId) throw new ForbiddenError('Four-eyes: rejector must differ from submitter');
    const [updated] = await db.update(schema.oemsProducts)
      .set({ product_status: 'REJECTED', rejected_reason: reason.trim(), updated_by: userId })
      .where(eq(schema.oemsProducts.id, productId))
      .returning();
    return updated;
  },

  async deactivateProduct(productId: number, reason: string, userId: string) {
    if (!reason || reason.trim().length < 10) throw new ValidationError('Deactivation reason must be at least 10 characters');
    const [product] = await db.select().from(schema.oemsProducts).where(eq(schema.oemsProducts.id, productId)).limit(1);
    if (!product) throw new NotFoundError('Product not found');
    if (product.product_status !== 'ACTIVE') throw new ValidationError('Only ACTIVE products can be deactivated');
    const [updated] = await db.update(schema.oemsProducts)
      .set({ product_status: 'INACTIVE', is_active: false, deactivation_reason: reason.trim(), updated_by: userId })
      .where(eq(schema.oemsProducts.id, productId))
      .returning();
    return updated;
  },

  async modifyProduct(productId: number, data: Record<string, any>, userId: string) {
    const [product] = await db.select().from(schema.oemsProducts).where(eq(schema.oemsProducts.id, productId)).limit(1);
    if (!product) throw new NotFoundError('Product not found');
    if (product.product_status !== 'DRAFT' && product.product_status !== 'REJECTED') {
      throw new ValidationError('Only DRAFT or REJECTED products can be modified');
    }
    const allowedFields = [
      'product_name', 'currency', 'currency_pair_from', 'currency_pair_to', 'reference_rate_source',
      'oda_transaction_types_allowed', 'effective_date_types_allowed', 'min_placement_amount',
      'min_collective_order_amount', 'spread_tolerance_percent', 'cutoff_intraday', 'cutoff_overnight',
      'cutoff_gtd', 'cutoff_timezone', 'eligible_account_types', 'eligible_account_codes',
      'sales_cert_required', 'sales_cert_type', 'sales_cert_expiry_mode',
      'trade_ideas_enabled', 'trade_ideas_rate', 'trade_ideas_message',
      'risk_score', 'min_subscription_amount', 'max_subscription_amount', 'tenor_days',
    ];
    const updates: Record<string, any> = { updated_by: userId };
    for (const key of allowedFields) {
      if (key in data) updates[key] = data[key];
    }
    const [updated] = await db.update(schema.oemsProducts)
      .set(updates)
      .where(eq(schema.oemsProducts.id, productId))
      .returning();
    return updated;
  },

  async listProductsEnhanced(params: {
    search?: string; currencyPair?: string; status?: string;
    dateFrom?: string; dateTo?: string; productFamily?: string;
    page?: number; pageSize?: number;
  } = {}) {
    const conditions: any[] = [eq(schema.oemsProducts.is_deleted, false)];
    if (params.search) {
      conditions.push(sql`(${schema.oemsProducts.product_name} ILIKE ${'%' + params.search + '%'} OR ${schema.oemsProducts.product_code} ILIKE ${'%' + params.search + '%'})`);
    }
    if (params.currencyPair) {
      const [from, to] = params.currencyPair.split('/');
      if (from) conditions.push(eq(schema.oemsProducts.currency_pair_from, from));
      if (to) conditions.push(eq(schema.oemsProducts.currency_pair_to, to));
    }
    if (params.status) conditions.push(eq(schema.oemsProducts.product_status, params.status as any));
    if (params.productFamily) conditions.push(eq(schema.oemsProducts.product_family, params.productFamily as any));
    if (params.dateFrom) conditions.push(gte(schema.oemsProducts.created_at, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(schema.oemsProducts.created_at, new Date(params.dateTo)));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsProducts).where(and(...conditions));
    const total = Number(countResult?.count ?? 0);

    const data = await db.select().from(schema.oemsProducts)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsProducts.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  // ============================================================================
  // Enhanced MLD Tranche Setup — Approval Workflow
  // ============================================================================

  async createMldTrancheEnhanced(data: Record<string, any>, userId: string) {
    const code = this._generateProductCode('MLD');
    const [existing] = await db.select({ id: schema.oemsMldTranches.id })
      .from(schema.oemsMldTranches)
      .where(eq(schema.oemsMldTranches.tranche_code, code))
      .limit(1);
    if (existing) throw new ConflictError(`Tranche code ${code} already exists`);

    const [tranche] = await db.insert(schema.oemsMldTranches).values({
      tranche_code: code,
      tranche_name: data.tranche_name,
      product_id: data.product_id,
      currency: data.currency ?? 'IDR',
      option_type: data.option_type,
      underlying_reference: data.underlying_reference,
      indicative_rate: data.indicative_rate,
      minimum_interest_rate: data.minimum_interest_rate,
      bonus_payout_rate: data.bonus_payout_rate,
      participation_rate: data.participation_rate,
      strike_rate: data.strike_rate,
      tax_rate: data.tax_rate ?? '0',
      offering_start: data.offering_start,
      offering_end: data.offering_end,
      trade_date: data.trade_date,
      value_date: data.value_date,
      fixing_date: data.fixing_date,
      maturity_date: data.maturity_date,
      quota_amount: data.quota_amount,
      min_investment: data.min_investment,
      max_investment: data.max_investment,
      minimum_collective_nominal: data.minimum_collective_nominal,
      product_score: data.product_score,
      product_status: 'DRAFT',
      lifecycle: 'DRAFT',
      option_style: data.option_style,
      observation_period_start: data.observation_period_start,
      observation_period_end: data.observation_period_end,
      reference_spot: data.reference_spot,
      data_source: data.data_source,
      upper_limit: data.upper_limit,
      lower_limit: data.lower_limit,
      calculating_agent: data.calculating_agent,
      max_interest_rate: data.max_interest_rate,
      early_termination_allowed: data.early_termination_allowed ?? false,
      balance_validation_mode: data.balance_validation_mode ?? 'AVAILABLE_BALANCE',
      risk_rating: data.risk_rating,
      suitability_check_mode: data.suitability_check_mode ?? 'STANDARD',
      required_documents: data.required_documents ?? [],
      term_sheet_file_path: data.term_sheet_file_path,
      cutoff_time: data.cutoff_time,
      cutoff_timezone: data.cutoff_timezone ?? 'Asia/Jakarta',
      eligible_account_types: data.eligible_account_types ?? [],
      sales_cert_required: data.sales_cert_required ?? false,
      sales_cert_type: data.sales_cert_type,
      tenor: data.tenor,
      callback_required: data.callback_required ?? true,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return tranche;
  },

  async submitMldTranche(id: number, userId: string) {
    const [tranche] = await db.select().from(schema.oemsMldTranches).where(eq(schema.oemsMldTranches.id, id)).limit(1);
    if (!tranche) throw new NotFoundError('MLD tranche not found');
    if (tranche.product_status !== 'DRAFT' && tranche.product_status !== 'REJECTED') {
      throw new ValidationError('Only DRAFT or REJECTED tranches can be submitted');
    }
    const [updated] = await db.update(schema.oemsMldTranches)
      .set({ product_status: 'PENDING_APPROVAL', submitted_by: userId, submitted_at: new Date(), updated_by: userId })
      .where(eq(schema.oemsMldTranches.id, id))
      .returning();
    return updated;
  },

  async approveMldTranche(id: number, userId: string) {
    const [tranche] = await db.select().from(schema.oemsMldTranches).where(eq(schema.oemsMldTranches.id, id)).limit(1);
    if (!tranche) throw new NotFoundError('MLD tranche not found');
    if (tranche.product_status !== 'PENDING_APPROVAL') throw new ValidationError('Only PENDING_APPROVAL tranches can be approved');
    if (tranche.submitted_by === userId) throw new ForbiddenError('Four-eyes: approver must differ from submitter');
    const [updated] = await db.update(schema.oemsMldTranches)
      .set({ product_status: 'ACTIVE', lifecycle: 'OFFERING', approved_by: userId, approved_at: new Date(), updated_by: userId })
      .where(eq(schema.oemsMldTranches.id, id))
      .returning();
    return updated;
  },

  async rejectMldTranche(id: number, reason: string, userId: string) {
    if (!reason || reason.trim().length < 10) throw new ValidationError('Rejection reason must be at least 10 characters');
    const [tranche] = await db.select().from(schema.oemsMldTranches).where(eq(schema.oemsMldTranches.id, id)).limit(1);
    if (!tranche) throw new NotFoundError('MLD tranche not found');
    if (tranche.product_status !== 'PENDING_APPROVAL') throw new ValidationError('Only PENDING_APPROVAL tranches can be rejected');
    if (tranche.submitted_by === userId) throw new ForbiddenError('Four-eyes: rejector must differ from submitter');
    const [updated] = await db.update(schema.oemsMldTranches)
      .set({ product_status: 'REJECTED', rejected_reason: reason.trim(), updated_by: userId })
      .where(eq(schema.oemsMldTranches.id, id))
      .returning();
    return updated;
  },

  async deactivateMldTranche(id: number, reason: string, userId: string) {
    if (!reason || reason.trim().length < 10) throw new ValidationError('Deactivation reason must be at least 10 characters');
    const [tranche] = await db.select().from(schema.oemsMldTranches).where(eq(schema.oemsMldTranches.id, id)).limit(1);
    if (!tranche) throw new NotFoundError('MLD tranche not found');
    if (tranche.product_status !== 'ACTIVE') throw new ValidationError('Only ACTIVE tranches can be deactivated');
    const [updated] = await db.update(schema.oemsMldTranches)
      .set({ product_status: 'INACTIVE', deactivation_reason: reason.trim(), updated_by: userId })
      .where(eq(schema.oemsMldTranches.id, id))
      .returning();
    return updated;
  },

  async modifyMldTranche(id: number, data: Record<string, any>, userId: string) {
    const [tranche] = await db.select().from(schema.oemsMldTranches).where(eq(schema.oemsMldTranches.id, id)).limit(1);
    if (!tranche) throw new NotFoundError('MLD tranche not found');
    if (tranche.product_status !== 'DRAFT' && tranche.product_status !== 'REJECTED') {
      throw new ValidationError('Only DRAFT or REJECTED tranches can be modified');
    }
    const allowedFields = [
      'tranche_name', 'currency', 'option_type', 'underlying_reference', 'indicative_rate',
      'minimum_interest_rate', 'bonus_payout_rate', 'participation_rate', 'strike_rate', 'tax_rate',
      'offering_start', 'offering_end', 'trade_date', 'value_date', 'fixing_date', 'maturity_date',
      'quota_amount', 'min_investment', 'max_investment', 'minimum_collective_nominal', 'product_score',
      'option_style', 'observation_period_start', 'observation_period_end', 'reference_spot',
      'data_source', 'upper_limit', 'lower_limit', 'calculating_agent', 'max_interest_rate',
      'early_termination_allowed', 'balance_validation_mode', 'risk_rating', 'suitability_check_mode',
      'required_documents', 'term_sheet_file_path', 'cutoff_time', 'cutoff_timezone',
      'eligible_account_types', 'sales_cert_required', 'sales_cert_type', 'tenor', 'callback_required',
    ];
    const updates: Record<string, any> = { updated_by: userId };
    for (const key of allowedFields) {
      if (key in data) updates[key] = data[key];
    }
    const [updated] = await db.update(schema.oemsMldTranches)
      .set(updates)
      .where(eq(schema.oemsMldTranches.id, id))
      .returning();
    return updated;
  },

  async listMldTranchesEnhanced(params: {
    search?: string; optionType?: string; status?: string;
    dateFrom?: string; dateTo?: string; page?: number; pageSize?: number;
  } = {}) {
    const conditions: any[] = [eq(schema.oemsMldTranches.is_deleted, false)];
    if (params.search) {
      conditions.push(sql`(${schema.oemsMldTranches.tranche_name} ILIKE ${'%' + params.search + '%'} OR ${schema.oemsMldTranches.tranche_code} ILIKE ${'%' + params.search + '%'})`);
    }
    if (params.optionType) conditions.push(eq(schema.oemsMldTranches.option_type, params.optionType));
    if (params.status) conditions.push(eq(schema.oemsMldTranches.product_status, params.status as any));
    if (params.dateFrom) conditions.push(gte(schema.oemsMldTranches.created_at, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(schema.oemsMldTranches.created_at, new Date(params.dateTo)));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsMldTranches).where(and(...conditions));
    const total = Number(countResult?.count ?? 0);

    const data = await db.select().from(schema.oemsMldTranches)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMldTranches.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  // ============================================================================
  // ODA Order Management — Enhanced Approval, Blotter, Trade Confirmation, Cancellation
  // ============================================================================

  async listPendingApprovalOdaOrders(params: {
    branch?: string; currencyPair?: string; orderType?: string;
    dateFrom?: string; dateTo?: string; page?: number; pageSize?: number;
  } = {}) {
    const conditions: any[] = [
      eq(schema.oemsOdaRecommendations.is_deleted, false),
      eq(schema.oemsOdaRecommendations.lifecycle, 'AUTHORIZATION_PENDING'),
    ];
    if (params.branch) {
      conditions.push(sql`${schema.oemsOdaRecommendations.payload}->>'branch_code' = ${params.branch}`);
    }
    if (params.currencyPair) {
      conditions.push(eq(schema.oemsOdaRecommendations.currency_pair, params.currencyPair));
    }
    if (params.orderType) {
      conditions.push(eq(schema.oemsOdaRecommendations.direction, params.orderType));
    }
    if (params.dateFrom) conditions.push(gte(schema.oemsOdaRecommendations.created_at, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(schema.oemsOdaRecommendations.created_at, new Date(params.dateTo)));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsOdaRecommendations).where(and(...conditions));
    const total = Number(countResult?.count ?? 0);

    const data = await db.select().from(schema.oemsOdaRecommendations)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsOdaRecommendations.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  async approveOdaOrderEnhanced(recId: number, data: Record<string, any>, userId: string) {
    const [rec] = await db.select().from(schema.oemsOdaRecommendations).where(eq(schema.oemsOdaRecommendations.id, recId)).limit(1);
    if (!rec) throw new NotFoundError('ODA recommendation not found');
    if (rec.lifecycle !== 'AUTHORIZATION_PENDING') throw new ValidationError('Order not in AUTHORIZATION_PENDING state');
    const [updated] = await db.update(schema.oemsOdaRecommendations)
      .set({
        lifecycle: 'AUTHORIZED',
        authorization_status: 'APPROVED',
        payload: { ...(rec.payload as any ?? {}), approval_notes: data.notes, authorized_by: userId, authorized_at: new Date().toISOString() },
        updated_by: userId,
      })
      .where(eq(schema.oemsOdaRecommendations.id, recId))
      .returning();
    return updated;
  },

  async rejectOdaOrderWithReason(recId: number, reason: string, userId: string) {
    if (!reason || reason.trim().length < 10) throw new ValidationError('Rejection reason must be at least 10 characters');
    const [rec] = await db.select().from(schema.oemsOdaRecommendations).where(eq(schema.oemsOdaRecommendations.id, recId)).limit(1);
    if (!rec) throw new NotFoundError('ODA recommendation not found');
    if (rec.lifecycle !== 'AUTHORIZATION_PENDING') throw new ValidationError('Order not in AUTHORIZATION_PENDING state');
    const [updated] = await db.update(schema.oemsOdaRecommendations)
      .set({
        lifecycle: 'REJECTED',
        payload: { ...(rec.payload as any ?? {}), rejection_reason: reason.trim() },
        updated_by: userId,
      })
      .where(eq(schema.oemsOdaRecommendations.id, recId))
      .returning();
    return updated;
  },

  async requestOdaMoreInfo(recId: number, comment: string, userId: string) {
    if (!comment || comment.trim().length < 5) throw new ValidationError('Comment must be at least 5 characters');
    const [rec] = await db.select().from(schema.oemsOdaRecommendations).where(eq(schema.oemsOdaRecommendations.id, recId)).limit(1);
    if (!rec) throw new NotFoundError('ODA recommendation not found');
    const queries = Array.isArray((rec.payload as any)?.info_queries) ? (rec.payload as any).info_queries : [];
    queries.push({ comment: comment.trim(), by: userId, at: new Date().toISOString() });
    const [updated] = await db.update(schema.oemsOdaRecommendations)
      .set({ payload: { ...(rec.payload as any ?? {}), info_queries: queries }, updated_by: userId })
      .where(eq(schema.oemsOdaRecommendations.id, recId))
      .returning();
    return updated;
  },

  async listOdaBlotterEnhanced(params: {
    dateFrom?: string; dateTo?: string; currencyPair?: string; lifecycle?: string;
    orderType?: string; direction?: string; branch?: string; search?: string;
    page?: number; pageSize?: number;
  } = {}) {
    const conditions: any[] = [eq(schema.oemsOdaRecommendations.is_deleted, false)];
    if (params.lifecycle) {
      const statuses = params.lifecycle.split(',') as any[];
      conditions.push(inArray(schema.oemsOdaRecommendations.lifecycle, statuses));
    }
    if (params.currencyPair) {
      conditions.push(eq(schema.oemsOdaRecommendations.currency_pair, params.currencyPair));
    }
    if (params.branch) {
      conditions.push(sql`${schema.oemsOdaRecommendations.payload}->>'branch_code' = ${params.branch}`);
    }
    if (params.dateFrom) conditions.push(gte(schema.oemsOdaRecommendations.created_at, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(schema.oemsOdaRecommendations.created_at, new Date(params.dateTo)));
    if (params.search) {
      conditions.push(sql`${schema.oemsOdaRecommendations.payload}::text ILIKE ${'%' + params.search + '%'}`);
    }

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsOdaRecommendations).where(and(...conditions));
    const total = Number(countResult?.count ?? 0);

    const data = await db.select().from(schema.oemsOdaRecommendations)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsOdaRecommendations.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  async getOdaTreasurySummaryWithDetails(params: { date?: string; currencyPair?: string; direction?: string } = {}) {
    const conditions: any[] = [eq(schema.oemsOdaBlotterGroups.is_deleted, false)];
    if (params.date) conditions.push(eq(schema.oemsOdaBlotterGroups.summary_date, params.date));
    if (params.currencyPair) {
      conditions.push(eq(schema.oemsOdaBlotterGroups.currency_pair, params.currencyPair));
    }
    if (params.direction) {
      conditions.push(eq(schema.oemsOdaBlotterGroups.direction, params.direction));
    }

    const groups = await db.select().from(schema.oemsOdaBlotterGroups)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsOdaBlotterGroups.created_at));

    const result = [];
    for (const group of groups) {
      const recs = await db.select().from(schema.oemsOdaRecommendations)
        .where(eq(schema.oemsOdaRecommendations.placement_group_id, group.id))
        .orderBy(desc(schema.oemsOdaRecommendations.created_at));
      result.push({ ...group, recommendations: recs });
    }
    return result;
  },

  async createOdaTradeConfirmation(data: Record<string, any>, userId: string) {
    const confNo = `TC-${Date.now()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    if (data.execution_status === 'EXECUTED' && !data.deal_reference) {
      throw new ValidationError('Deal reference is mandatory when execution status is EXECUTED');
    }
    if (data.execution_status === 'EXPIRED' && !data.expiry_reason) {
      throw new ValidationError('Expiry reason is mandatory when execution status is EXPIRED');
    }
    const [conf] = await db.insert(schema.oemsOdaTradeConfirmations).values({
      confirmation_no: confNo,
      recommendation_id: data.recommendation_id,
      group_id: data.group_id,
      execution_status: data.execution_status ?? 'PENDING',
      deal_reference: data.deal_reference,
      execution_date: data.execution_date,
      execution_time: data.execution_time,
      auto_settle_flag: data.auto_settle_flag ?? false,
      expiry_reason: data.expiry_reason,
      observation_notes: data.observation_notes,
      confirmation_status: 'DRAFT',
      maker_by: userId,
      maker_at: new Date(),
      payload: data.payload ?? {},
      created_by: userId,
      updated_by: userId,
    }).returning();
    return conf;
  },

  async approveOdaTradeConfirmation(confirmId: number, data: Record<string, any>, userId: string) {
    const [conf] = await db.select().from(schema.oemsOdaTradeConfirmations)
      .where(eq(schema.oemsOdaTradeConfirmations.id, confirmId)).limit(1);
    if (!conf) throw new NotFoundError('Trade confirmation not found');
    if (conf.confirmation_status !== 'DRAFT') throw new ValidationError('Only DRAFT confirmations can be approved');
    if (conf.maker_by === userId) throw new ForbiddenError('Four-eyes: checker must differ from maker');

    const newStatus = data.action === 'REJECT' ? 'REJECTED' : 'APPROVED';
    if (data.action === 'REJECT' && (!data.reason || data.reason.trim().length < 10)) {
      throw new ValidationError('Rejection reason must be at least 10 characters');
    }

    const [updated] = await db.update(schema.oemsOdaTradeConfirmations)
      .set({
        confirmation_status: newStatus,
        checker_by: userId,
        checker_at: new Date(),
        rejection_reason: data.action === 'REJECT' ? data.reason?.trim() : null,
        updated_by: userId,
      })
      .where(eq(schema.oemsOdaTradeConfirmations.id, confirmId))
      .returning();
    return updated;
  },

  async listOdaTradeConfirmations(params: { date?: string; currencyPair?: string; status?: string; page?: number; pageSize?: number } = {}) {
    const conditions: any[] = [];
    if (params.status) conditions.push(eq(schema.oemsOdaTradeConfirmations.confirmation_status, params.status));
    if (params.date) conditions.push(eq(schema.oemsOdaTradeConfirmations.execution_date, params.date));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsOdaTradeConfirmations).where(whereClause);
    const total = Number(countResult?.count ?? 0);

    const data = await db.select().from(schema.oemsOdaTradeConfirmations)
      .where(whereClause)
      .orderBy(desc(schema.oemsOdaTradeConfirmations.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  async listOdaCancelledOrders(params: {
    dateFrom?: string; dateTo?: string; currencyPair?: string; reason?: string;
    page?: number; pageSize?: number;
  } = {}) {
    const cancelledStatuses: any[] = ['CANCELLED', 'EXPIRED', 'REJECTED', 'EXCEPTION'];
    const conditions: any[] = [
      eq(schema.oemsOdaRecommendations.is_deleted, false),
      inArray(schema.oemsOdaRecommendations.lifecycle, cancelledStatuses),
    ];
    if (params.currencyPair) {
      conditions.push(sql`${schema.oemsOdaRecommendations.payload}->>'currency_pair' = ${params.currencyPair}`);
    }
    if (params.dateFrom) conditions.push(gte(schema.oemsOdaRecommendations.created_at, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(schema.oemsOdaRecommendations.created_at, new Date(params.dateTo)));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsOdaRecommendations).where(and(...conditions));
    const total = Number(countResult?.count ?? 0);

    const data = await db.select().from(schema.oemsOdaRecommendations)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsOdaRecommendations.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  async retryOdaUnhold(recId: number, userId: string) {
    const [rec] = await db.select().from(schema.oemsOdaRecommendations).where(eq(schema.oemsOdaRecommendations.id, recId)).limit(1);
    if (!rec) throw new NotFoundError('ODA recommendation not found');
    // Create a new unhold fund instruction
    const [instr] = await db.insert(schema.oemsOdaFundInstructions).values({
      recommendation_id: recId,
      instruction_type: 'UNHOLD',
      instruction_status: 'QUEUED' as any,
      amount: (rec.payload as any)?.amount ?? '0',
      currency: (rec.payload as any)?.currency ?? 'IDR',
      account_no: (rec.payload as any)?.account_no ?? '',
      payload: { retry: true, retried_by: userId, retried_at: new Date().toISOString() },
      created_by: userId,
      updated_by: userId,
    }).returning();
    return instr;
  },

  async resendOdaNotification(recId: number, eventCode: string, userId: string) {
    const [rec] = await db.select().from(schema.oemsOdaRecommendations).where(eq(schema.oemsOdaRecommendations.id, recId)).limit(1);
    if (!rec) throw new NotFoundError('ODA recommendation not found');
    // Dispatch notification event
    const delivery = await this.dispatchNotificationEvent({
      eventCode,
      orderId: rec.order_id ?? undefined,
      recipientId: rec.customer_id ?? undefined,
      recipientAddress: (rec.payload as any)?.customer_phone ?? '',
      payload: { order_id: String(recId), status: rec.lifecycle },
    }, userId);
    return delivery;
  },

  // ============================================================================
  // MLD Order Management — Enhanced Approval, Blotter, Cancellation
  // ============================================================================

  async listPendingApprovalMldOrders(params: {
    trancheId?: number; search?: string; dateFrom?: string; dateTo?: string;
    page?: number; pageSize?: number;
  } = {}) {
    const conditions: any[] = [eq(schema.oemsMldOrderDetails.is_deleted, false)];
    if (params.trancheId) conditions.push(eq(schema.oemsMldOrderDetails.tranche_id, params.trancheId));
    if (params.search) {
      conditions.push(sql`${schema.oemsMldOrderDetails.customer_id} ILIKE ${'%' + params.search + '%'}`);
    }
    if (params.dateFrom) conditions.push(gte(schema.oemsMldOrderDetails.created_at, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(schema.oemsMldOrderDetails.created_at, new Date(params.dateTo)));

    // Join with orders to filter lifecycle
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const data = await db.select().from(schema.oemsMldOrderDetails)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMldOrderDetails.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsMldOrderDetails).where(and(...conditions));
    const total = Number(countResult?.count ?? 0);

    return { data, total, page, pageSize };
  },

  async approveMldOrderEnhanced(orderId: number, data: Record<string, any>, userId: string) {
    const [detail] = await db.select().from(schema.oemsMldOrderDetails).where(eq(schema.oemsMldOrderDetails.id, orderId)).limit(1);
    if (!detail) throw new NotFoundError('MLD order detail not found');
    // Update CIF status + hold instruction
    const [updated] = await db.update(schema.oemsMldOrderDetails)
      .set({
        cif_status: 'APPROVED',
        hold_instruction_status: 'QUEUED',
        updated_by: userId,
      })
      .where(eq(schema.oemsMldOrderDetails.id, orderId))
      .returning();
    // Also update the parent order status
    if (detail.order_id) {
      await db.update(schema.oemsOrders)
        .set({ order_status: 'APPROVED', approved_at: new Date(), updated_by: userId })
        .where(eq(schema.oemsOrders.order_id, detail.order_id));
    }
    return updated;
  },

  async rejectMldOrderWithReason(orderId: number, reason: string, userId: string) {
    if (!reason || reason.trim().length < 10) throw new ValidationError('Rejection reason must be at least 10 characters');
    const [detail] = await db.select().from(schema.oemsMldOrderDetails).where(eq(schema.oemsMldOrderDetails.id, orderId)).limit(1);
    if (!detail) throw new NotFoundError('MLD order detail not found');
    const [updated] = await db.update(schema.oemsMldOrderDetails)
      .set({ cif_status: 'REJECTED', updated_by: userId })
      .where(eq(schema.oemsMldOrderDetails.id, orderId))
      .returning();
    if (detail.order_id) {
      await db.update(schema.oemsOrders)
        .set({ order_status: 'REJECTED', updated_by: userId, payload: sql`jsonb_set(COALESCE(payload, '{}'), '{rejection_reason}', ${JSON.stringify(reason.trim())}::jsonb)` })
        .where(eq(schema.oemsOrders.order_id, detail.order_id));
    }
    return updated;
  },

  async requestMldMoreInfo(orderId: number, comment: string, userId: string) {
    if (!comment || comment.trim().length < 5) throw new ValidationError('Comment must be at least 5 characters');
    const [detail] = await db.select().from(schema.oemsMldOrderDetails).where(eq(schema.oemsMldOrderDetails.id, orderId)).limit(1);
    if (!detail) throw new NotFoundError('MLD order detail not found');
    const existing = (detail as any).payload?.info_queries ?? [];
    existing.push({ comment: comment.trim(), by: userId, at: new Date().toISOString() });
    const [updated] = await db.update(schema.oemsMldOrderDetails)
      .set({ updated_by: userId })
      .where(eq(schema.oemsMldOrderDetails.id, orderId))
      .returning();
    return updated;
  },

  async listMldBlotterEnhanced(params: {
    trancheId?: number; lifecycle?: string; dateFrom?: string; dateTo?: string;
    page?: number; pageSize?: number;
  } = {}) {
    const conditions: any[] = [eq(schema.oemsMldOrderDetails.is_deleted, false)];
    if (params.trancheId) conditions.push(eq(schema.oemsMldOrderDetails.tranche_id, params.trancheId));
    if (params.dateFrom) conditions.push(gte(schema.oemsMldOrderDetails.created_at, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(schema.oemsMldOrderDetails.created_at, new Date(params.dateTo)));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsMldOrderDetails).where(and(...conditions));
    const total = Number(countResult?.count ?? 0);

    const data = await db.select().from(schema.oemsMldOrderDetails)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMldOrderDetails.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  async listMldCancelledOrders(params: {
    lifecycle?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number;
  } = {}) {
    // Find orders with CANCELLED/TERMINATED/EXCEPTION lifecycle
    const cancelledStatuses: any[] = ['CANCELLED', 'TERMINATED', 'EXCEPTION'];
    const conditions: any[] = [eq(schema.oemsMldOrderDetails.is_deleted, false)];
    if (params.dateFrom) conditions.push(gte(schema.oemsMldOrderDetails.created_at, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(schema.oemsMldOrderDetails.created_at, new Date(params.dateTo)));

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.oemsMldOrderDetails).where(and(...conditions));
    const total = Number(countResult?.count ?? 0);

    const data = await db.select().from(schema.oemsMldOrderDetails)
      .where(and(...conditions))
      .orderBy(desc(schema.oemsMldOrderDetails.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  // ─── ODA Deaggregation + Partial Fulfillment ──────────────────────────────────

  async deaggregateFromBlotterGroup(groupId: number, data: {
    recommendationIds: number[];
    reason: string;
  }, userId: string) {
    const group = await getOdaBlotterGroup(groupId);
    const allowedLifecycles: OemsOdaLifecycle[] = ['SUMMARY_PENDING', 'COLLECTED', 'SUMMARY_APPROVED'];
    if (!allowedLifecycles.includes(group.lifecycle)) {
      throw new ConflictError(`Cannot deaggregate from ODA group in status ${group.lifecycle}`);
    }
    if (!data.recommendationIds || data.recommendationIds.length === 0) {
      throw new ValidationError('At least one recommendation ID is required');
    }
    if (!data.reason || data.reason.trim().length < 3) {
      throw new ValidationError('Deaggregation reason must be at least 3 characters');
    }

    const childRecommendations = await db.select().from(schema.oemsOdaRecommendations)
      .where(and(
        eq(schema.oemsOdaRecommendations.placement_group_id, groupId),
        eq(schema.oemsOdaRecommendations.is_deleted, false),
      ));

    const childIds = (childRecommendations as OemsOdaRecommendation[]).map((r: OemsOdaRecommendation) => r.id);
    const invalidIds = data.recommendationIds.filter((id: number) => !childIds.includes(id));
    if (invalidIds.length > 0) {
      throw new ValidationError(`Recommendations [${invalidIds.join(', ')}] do not belong to group ${groupId}`);
    }

    const now = new Date();
    const originalTotalNominal = group.original_total_nominal ?? group.total_nominal;
    const originalOrderCount = group.original_order_count ?? childRecommendations.length;

    const removedRecs = (childRecommendations as OemsOdaRecommendation[]).filter((r: OemsOdaRecommendation) => data.recommendationIds.includes(r.id));
    const remainingRecs = (childRecommendations as OemsOdaRecommendation[]).filter((r: OemsOdaRecommendation) => !data.recommendationIds.includes(r.id));

    // Revert removed recommendations to HELD, clear placement_group_id
    for (const rec of removedRecs) {
      await db.update(schema.oemsOdaRecommendations).set({
        lifecycle: 'HELD',
        placement_group_id: null,
        updated_by: userId,
        updated_at: now,
      }).where(eq(schema.oemsOdaRecommendations.id, rec.id));

      // Record deaggregation event
      await db.insert(schema.oemsOdaDeaggregationEvents).values({
        event_id: makeId('ODA-DEAGG'),
        group_id: groupId,
        recommendation_id: rec.id,
        previous_lifecycle: rec.lifecycle,
        new_lifecycle: 'HELD',
        reason: data.reason,
        group_total_nominal_before: String(group.total_nominal),
        group_total_nominal_after: remainingRecs.length > 0
          ? String(remainingRecs.reduce((sum: number, r: OemsOdaRecommendation) => sum + Number(r.nominal_amount), 0))
          : '0',
        group_order_count_before: childRecommendations.length,
        group_order_count_after: remainingRecs.length,
        below_minimum_after: false,
        created_by: userId,
      });
    }

    // If all removed → cancel group
    if (remainingRecs.length === 0) {
      await db.update(schema.oemsOdaBlotterGroups).set({
        lifecycle: 'CANCELLED',
        original_total_nominal: String(originalTotalNominal),
        original_order_count: originalOrderCount,
        total_nominal: '0',
        deaggregation_log: appendDeaggLog(group.deaggregation_log, {
          removedIds: data.recommendationIds,
          reason: data.reason,
          by: userId,
          at: now.toISOString(),
          remainingCount: 0,
        }),
        updated_by: userId,
        updated_at: now,
      }).where(eq(schema.oemsOdaBlotterGroups.id, groupId));

      await this.logIntegrationMessage({
        targetSystem: 'INTERNAL',
        messageType: 'ODA_BLOTTER_GROUP_CANCELLED_DEAGGREGATION',
        entityType: 'oems_oda_blotter_group',
        entityId: String(groupId),
        payload: { reason: data.reason, removedIds: data.recommendationIds },
      }, userId);

      return { group: { ...group, lifecycle: 'CANCELLED' as const, total_nominal: '0' }, removedCount: removedRecs.length, remainingCount: 0, belowMinimum: false };
    }

    // Recalculate group totals
    const newTotalNominal = remainingRecs.reduce((sum: number, r: OemsOdaRecommendation) => sum + Number(r.nominal_amount), 0);
    const weightedRateSum = remainingRecs.reduce((sum: number, r: OemsOdaRecommendation) => sum + Number(r.rate) * Number(r.nominal_amount), 0);
    const newAverageRate = newTotalNominal > 0 ? weightedRateSum / newTotalNominal : 0;
    const newOrderCost = remainingRecs.reduce((sum: number, r: OemsOdaRecommendation) => sum + Number(r.order_cost_before_swap ?? 0), 0);
    const minimumCollective = Number(group.minimum_collective_amount ?? 0);
    const belowMinimum = minimumCollective > 0 && newTotalNominal < minimumCollective;

    await db.update(schema.oemsOdaBlotterGroups).set({
      total_nominal: String(newTotalNominal),
      average_rate: String(newAverageRate),
      order_cost_before_swap: String(newOrderCost),
      qualifies_minimum_collective: !belowMinimum,
      original_total_nominal: String(originalTotalNominal),
      original_order_count: originalOrderCount,
      deaggregation_log: appendDeaggLog(group.deaggregation_log, {
        removedIds: data.recommendationIds,
        reason: data.reason,
        by: userId,
        at: now.toISOString(),
        remainingCount: remainingRecs.length,
      }),
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsOdaBlotterGroups.id, groupId));

    // Update below_minimum flag on deaggregation events
    if (belowMinimum) {
      for (const rec of removedRecs) {
        await db.update(schema.oemsOdaDeaggregationEvents).set({
          below_minimum_after: true,
        }).where(and(
          eq(schema.oemsOdaDeaggregationEvents.group_id, groupId),
          eq(schema.oemsOdaDeaggregationEvents.recommendation_id, rec.id),
        ));
      }
    }

    await this.logIntegrationMessage({
      targetSystem: 'INTERNAL',
      messageType: 'ODA_BLOTTER_DEAGGREGATION',
      entityType: 'oems_oda_blotter_group',
      entityId: String(groupId),
      payload: { reason: data.reason, removedIds: data.recommendationIds, newTotal: newTotalNominal, belowMinimum },
    }, userId);

    const updatedGroup = await getOdaBlotterGroup(groupId);
    return { group: updatedGroup, removedCount: removedRecs.length, remainingCount: remainingRecs.length, belowMinimum };
  },

  async allocateOdaBlotterGroup(groupId: number, data: {
    executedAmount: number;
    allocationMethod: 'PROPORTIONATE' | 'FIFO' | 'MANUAL';
    allocations?: { recommendationId: number; filledAmount: number }[];
  }, userId: string) {
    const group = await getOdaBlotterGroup(groupId);
    const allowedLifecycles: OemsOdaLifecycle[] = ['SUMMARY_APPROVED', 'PLACED', 'TREASURY_UPDATE_PENDING'];
    if (!allowedLifecycles.includes(group.lifecycle)) {
      throw new ConflictError(`Cannot allocate ODA group in status ${group.lifecycle}`);
    }
    const totalNominal = Number(group.total_nominal);
    if (!data.executedAmount || data.executedAmount <= 0) {
      throw new ValidationError('Executed amount must be greater than zero');
    }
    if (data.executedAmount > totalNominal) {
      throw new ValidationError(`Executed amount ${data.executedAmount} exceeds group total nominal ${totalNominal}`);
    }

    const childRecommendations = await db.select().from(schema.oemsOdaRecommendations)
      .where(and(
        eq(schema.oemsOdaRecommendations.placement_group_id, groupId),
        eq(schema.oemsOdaRecommendations.is_deleted, false),
      ))
      .orderBy(schema.oemsOdaRecommendations.created_at);

    if (childRecommendations.length === 0) {
      throw new ValidationError('No recommendations found in this blotter group');
    }

    // Compute allocations
    let allocations: { recommendationId: number; filledAmount: number; nominal: number }[];
    switch (data.allocationMethod) {
      case 'PROPORTIONATE':
        allocations = computeProportionateAllocation(childRecommendations, data.executedAmount, totalNominal);
        break;
      case 'FIFO':
        allocations = computeFifoAllocation(childRecommendations, data.executedAmount);
        break;
      case 'MANUAL':
        if (!data.allocations || data.allocations.length === 0) {
          throw new ValidationError('Manual allocations must be provided');
        }
        allocations = computeManualAllocation(childRecommendations, data.executedAmount, data.allocations);
        break;
      default:
        throw new ValidationError(`Invalid allocation method: ${data.allocationMethod}`);
    }

    const now = new Date();
    const groupFillPercentage = (data.executedAmount / totalNominal) * 100;

    // Persist allocations
    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i];
      const fillPct = alloc.nominal > 0 ? (alloc.filledAmount / alloc.nominal) * 100 : 0;
      const fillStatus: 'UNFILLED' | 'PARTIAL' | 'FULL' =
        alloc.filledAmount <= 0 ? 'UNFILLED' :
        alloc.filledAmount >= alloc.nominal ? 'FULL' : 'PARTIAL';

      // Update recommendation
      await db.update(schema.oemsOdaRecommendations).set({
        filled_amount: String(alloc.filledAmount),
        fill_percentage: String(fillPct),
        fill_status: fillStatus,
        allocation_method: data.allocationMethod,
        allocation_at: now,
        allocation_by: userId,
        updated_by: userId,
        updated_at: now,
      }).where(eq(schema.oemsOdaRecommendations.id, alloc.recommendationId));

      // Insert allocation log
      await db.insert(schema.oemsOdaAllocationLog).values({
        log_id: makeId('ODA-ALLOC'),
        group_id: groupId,
        recommendation_id: alloc.recommendationId,
        allocation_method: data.allocationMethod,
        group_total_nominal: String(totalNominal),
        executed_amount: String(data.executedAmount),
        order_nominal: String(alloc.nominal),
        filled_amount: String(alloc.filledAmount),
        fill_percentage: String(fillPct),
        fill_status: fillStatus,
        sequence_number: i + 1,
        rounding_adjustment: '0',
        created_by: userId,
      });

      // Post-allocation lifecycle transitions
      if (fillStatus === 'FULL' || fillStatus === 'PARTIAL') {
        // Release funds with filled amount
        await this.releaseOdaFundsPartial(alloc.recommendationId, {
          instructionType: 'UNHOLD',
          amount: alloc.filledAmount,
        }, userId);
        await this.releaseOdaFundsPartial(alloc.recommendationId, {
          instructionType: 'OVERBOOK',
          amount: alloc.filledAmount,
        }, userId);
        // Update lifecycle to EXECUTED
        await db.update(schema.oemsOdaRecommendations).set({
          lifecycle: 'EXECUTED',
          nominal_amount: String(alloc.filledAmount),
          updated_by: userId,
          updated_at: now,
        }).where(eq(schema.oemsOdaRecommendations.id, alloc.recommendationId));
      } else {
        // UNFILLED → revert to HELD, clear group
        await db.update(schema.oemsOdaRecommendations).set({
          lifecycle: 'HELD',
          placement_group_id: null,
          updated_by: userId,
          updated_at: now,
        }).where(eq(schema.oemsOdaRecommendations.id, alloc.recommendationId));
      }
    }

    // Update blotter group
    await db.update(schema.oemsOdaBlotterGroups).set({
      executed_amount: String(data.executedAmount),
      fill_percentage: String(groupFillPercentage),
      allocation_method: data.allocationMethod,
      allocation_at: now,
      allocation_by: userId,
      lifecycle: 'EXECUTED',
      updated_by: userId,
      updated_at: now,
    }).where(eq(schema.oemsOdaBlotterGroups.id, groupId));

    await this.logIntegrationMessage({
      targetSystem: 'INTERNAL',
      messageType: 'ODA_BLOTTER_ALLOCATION',
      entityType: 'oems_oda_blotter_group',
      entityId: String(groupId),
      payload: {
        executedAmount: data.executedAmount,
        allocationMethod: data.allocationMethod,
        fillPercentage: groupFillPercentage,
        allocations: allocations.map(a => ({ id: a.recommendationId, filled: a.filledAmount })),
      },
    }, userId);

    return {
      groupId,
      executedAmount: data.executedAmount,
      allocationMethod: data.allocationMethod,
      fillPercentage: groupFillPercentage,
      allocations: allocations.map(a => ({
        recommendationId: a.recommendationId,
        nominal: a.nominal,
        filledAmount: a.filledAmount,
        fillPercentage: a.nominal > 0 ? (a.filledAmount / a.nominal) * 100 : 0,
        fillStatus: a.filledAmount <= 0 ? 'UNFILLED' : a.filledAmount >= a.nominal ? 'FULL' : 'PARTIAL',
      })),
    };
  },

  async releaseOdaFundsPartial(recommendationId: number, data: {
    instructionType: 'UNHOLD' | 'OVERBOOK';
    amount: number;
  }, userId: string) {
    const recommendation = await getOdaRecommendation(recommendationId);
    const status = odaInstructionStatus(undefined);
    const now = new Date();
    const [instruction] = await db.insert(schema.oemsOdaFundInstructions).values({
      instruction_id: makeId(`ODA-${data.instructionType}`),
      recommendation_id: recommendation.id,
      order_id: recommendation.order_id,
      group_id: recommendation.placement_group_id,
      instruction_type: data.instructionType,
      target_system: 'NCBS',
      idempotency_key: `ODA-${data.instructionType}-PARTIAL-${recommendation.id}-${Date.now()}`,
      account_no: data.instructionType === 'OVERBOOK' ? recommendation.credit_account_no : recommendation.debit_account_no,
      amount: String(data.amount),
      currency: recommendation.currency,
      instruction_status: status,
      sent_at: now,
      acknowledged_at: now,
      request_payload: { recommendationId, instructionType: data.instructionType, amount: data.amount, partial: true },
      response_payload: {},
      created_by: userId,
    }).returning();
    return instruction;
  },

  async listOdaAllocationLog(groupId: number) {
    return db.select().from(schema.oemsOdaAllocationLog)
      .where(eq(schema.oemsOdaAllocationLog.group_id, groupId))
      .orderBy(schema.oemsOdaAllocationLog.sequence_number);
  },

  async listOdaDeaggregationEvents(groupId: number) {
    return db.select().from(schema.oemsOdaDeaggregationEvents)
      .where(eq(schema.oemsOdaDeaggregationEvents.group_id, groupId))
      .orderBy(desc(schema.oemsOdaDeaggregationEvents.created_at));
  },

  async searchClients(search: string, limit = 20) {
    if (!search || search.trim().length < 2) return [];
    const term = `%${search.trim()}%`;
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    return db.select({
      client_id: schema.clients.client_id,
      legal_name: schema.clients.legal_name,
      risk_profile: schema.clients.risk_profile,
    })
      .from(schema.clients)
      .where(or(ilike(schema.clients.client_id, term), ilike(schema.clients.legal_name, term)))
      .limit(safeLimit);
  },

  async getClientPortfolios(clientId: string) {
    if (!clientId) return [];
    return db.select({
      portfolio_id: schema.portfolios.portfolio_id,
      type: schema.portfolios.type,
      base_currency: schema.portfolios.base_currency,
      aum: schema.portfolios.aum,
      portfolio_status: schema.portfolios.portfolio_status,
    })
      .from(schema.portfolios)
      .where(eq(schema.portfolios.client_id, clientId));
  },
};
