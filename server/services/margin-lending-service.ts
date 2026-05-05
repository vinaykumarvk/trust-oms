import crypto from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { NotFoundError, ValidationError } from './service-errors';

type MlRecordStatus = 'DRAFT' | 'UNAUTHORIZED' | 'AUTHORIZED' | 'REJECTED' | 'MODIFIED';
type MlMarginStatus = 'NORMAL' | 'MARGIN_CALL' | 'SELL_OUT';
type MlDecision = 'AUTHORIZE' | 'APPROVE' | 'REJECT';
type MlEntityType =
  | 'attribute-settings'
  | 'references'
  | 'scrip-settings'
  | 'exposure-limits'
  | 'cross-currency-haircuts'
  | 'facility-groups'
  | 'portfolio-links'
  | 'asset-settings';

type JsonRecord = Record<string, unknown>;

interface MlMetricsInput {
  marketValue: number | string;
  exposureAmount: number | string;
  ltvPercent: number | string;
  topUpPercent: number | string;
  sellOutPercent: number | string;
  crossCurrencyHaircutPercent?: number | string;
}

interface MlRuleResolutionInput {
  businessDate?: string;
  baseNumber?: string;
  securityCode?: string;
  assetClass?: string;
  assetCurrency?: string;
  facilityCurrency?: string;
  ltvPercent?: number | string;
  topUpPercent?: number | string;
  sellOutPercent?: number | string;
  crossCurrencyHaircutPercent?: number | string;
  attributeSettings?: unknown;
  scripSettings?: unknown;
  assetSettings?: unknown;
  crossCurrencyHaircuts?: unknown;
}

interface MlRuleResolution {
  ltvPercent: number;
  topUpPercent: number;
  sellOutPercent: number;
  crossCurrencyHaircutPercent: number;
  ruleSource: string;
  authorizedRuleIds: string[];
  missingRequiredRule?: string;
}

export interface MlMarginMetrics {
  marketValue: number;
  exposureAmount: number;
  ltvPercent: number;
  effectiveLtvPercent: number;
  topUpPercent: number;
  sellOutPercent: number;
  crossCurrencyHaircutPercent: number;
  gcmvAmount: number;
  ncmvAmount: number;
  topUpAmount: number;
  sellOutAmount: number;
  utilizedLtvPercent: number;
  availableDrawingPower: number;
  marginStatus: MlMarginStatus;
  shortfallAmount: number;
}

const lifecycleConfig: Record<MlEntityType, { table: any; idColumn: any; businessIdKey: string; label: string }> = {
  'attribute-settings': {
    table: schema.mlAttributeSettings,
    idColumn: schema.mlAttributeSettings.setting_id,
    businessIdKey: 'setting_id',
    label: 'ML Attribute Setting',
  },
  references: {
    table: schema.mlReferences,
    idColumn: schema.mlReferences.reference_id,
    businessIdKey: 'reference_id',
    label: 'ML Reference',
  },
  'scrip-settings': {
    table: schema.mlScripSettings,
    idColumn: schema.mlScripSettings.scrip_setting_id,
    businessIdKey: 'scrip_setting_id',
    label: 'ML Scrip Setting',
  },
  'exposure-limits': {
    table: schema.mlExposureLimits,
    idColumn: schema.mlExposureLimits.exposure_limit_id,
    businessIdKey: 'exposure_limit_id',
    label: 'ML Exposure Limit',
  },
  'cross-currency-haircuts': {
    table: schema.mlCrossCurrencyHaircuts,
    idColumn: schema.mlCrossCurrencyHaircuts.haircut_id,
    businessIdKey: 'haircut_id',
    label: 'ML Cross Currency Haircut',
  },
  'facility-groups': {
    table: schema.mlFacilityGroups,
    idColumn: schema.mlFacilityGroups.facility_group_id,
    businessIdKey: 'facility_group_id',
    label: 'ML Facility Group',
  },
  'portfolio-links': {
    table: schema.mlPortfolioLinks,
    idColumn: schema.mlPortfolioLinks.portfolio_link_id,
    businessIdKey: 'portfolio_link_id',
    label: 'ML Portfolio Link',
  },
  'asset-settings': {
    table: schema.mlAssetSettings,
    idColumn: schema.mlAssetSettings.asset_setting_id,
    businessIdKey: 'asset_setting_id',
    label: 'ML Asset Setting',
  },
};

function makeMlId(prefix: string): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${ymd}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function asNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`Invalid numeric value: ${value}`);
  return n;
}

function toMoney(value: number | string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return asNumber(value).toFixed(4);
}

function toPct(value: number | string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return asNumber(value).toFixed(4);
}

function normalizeUpper(value: unknown, fallback: string): string {
  const raw = String(value ?? fallback).trim();
  return (raw || fallback).replace(/[\s-]+/g, '_').toUpperCase();
}

function optionalString(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  return raw || undefined;
}

function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return normalizeArray(parsed);
      } catch {
        return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
      }
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function normalizeRecordArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item) && Object.keys(item as JsonRecord).length > 0);
}

function recordStatus(value: unknown, fallback: MlRecordStatus = 'UNAUTHORIZED'): MlRecordStatus {
  const status = normalizeUpper(value, fallback);
  if (!['DRAFT', 'UNAUTHORIZED', 'AUTHORIZED', 'REJECTED', 'MODIFIED'].includes(status)) {
    throw new ValidationError(`Unsupported ML record status: ${status}`);
  }
  return status as MlRecordStatus;
}

function assertRequired(value: unknown, label: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) throw new ValidationError(`${label} is required`);
  return raw;
}

function assertPercent(value: number | string | null | undefined, label: string, allowZero = true): number {
  const n = asNumber(value);
  if ((!allowZero && n <= 0) || (allowZero && n < 0) || n > 100) {
    throw new ValidationError(`${label} must be ${allowZero ? 'between 0 and 100' : 'greater than 0 and less than or equal to 100'}`);
  }
  return n;
}

function assertDateRange(from: string | undefined, to: string | undefined, startLabel = 'Effective-from date', endLabel = 'Effective-to date'): void {
  if (!from) throw new ValidationError(`${startLabel} is required`);
  if (to && to <= from) throw new ValidationError(`${endLabel} must be after ${startLabel.toLowerCase()}`);
}

function assertThresholds(ltv: number, topUp: number, sellOut: number): void {
  if (topUp < ltv) throw new ValidationError('Top-up percent must be greater than or equal to LTV percent');
  if (sellOut <= topUp) throw new ValidationError('Sell-out percent must be greater than top-up percent');
}

function ensureNonEmptyRow(row: unknown, label: string, id: string): JsonRecord {
  if (!row || typeof row !== 'object' || Object.keys(row as JsonRecord).length === 0) {
    throw new NotFoundError(`${label} ${id} was not found`);
  }
  return row as JsonRecord;
}

function rowHasBusinessId(row: JsonRecord, keys: string[]): boolean {
  return keys.some((key) => optionalString(row[key]));
}

function isAuthorizedEffective(row: JsonRecord, businessDate: string): boolean {
  const status = normalizeUpper(row.record_status, 'DRAFT');
  const from = optionalString(row.effective_from ?? row.effectiveFrom);
  const to = optionalString(row.effective_to ?? row.effectiveTo);
  return status === 'AUTHORIZED' && (!from || from <= businessDate) && (!to || to >= businessDate) && row.is_deleted !== true;
}

function rowNumber(row: JsonRecord, snakeKey: string, camelKey: string, fallback?: number): number | undefined {
  const value = row[snakeKey] ?? row[camelKey];
  if (value === null || value === undefined || value === '') return fallback;
  return asNumber(value as string | number);
}

function boolValue(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || String(value).toLowerCase() === 'true';
}

function stringMatches(rowValue: unknown, expected?: string): boolean {
  if (!expected) return true;
  const raw = rowValue;
  if (Array.isArray(raw)) return raw.map((item) => String(item).toUpperCase()).includes(expected.toUpperCase());
  if (typeof raw === 'string') {
    const values = normalizeArray(raw).map((item) => item.toUpperCase());
    return values.length === 0 || values.includes(expected.toUpperCase()) || raw.toUpperCase() === expected.toUpperCase();
  }
  return raw === undefined || raw === null || String(raw).toUpperCase() === expected.toUpperCase();
}

function daysOverdueFrom(noticeDueDate: unknown, asOfDate: string): number {
  const due = optionalString(noticeDueDate);
  if (!due || due >= asOfDate) return 0;
  const dueDate = new Date(`${due}T00:00:00.000Z`);
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
  return Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000));
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

async function insertReturning(table: any, values: JsonRecord): Promise<JsonRecord> {
  const [row] = await (db as any).insert(table).values(values).returning();
  return row && Object.keys(row).length > 0 ? row as JsonRecord : values;
}

async function updateReturning(table: any, idColumn: any, businessId: string, values: JsonRecord): Promise<JsonRecord> {
  const [row] = await (db as any).update(table).set(values).where(eq(idColumn, businessId)).returning();
  return row && Object.keys(row).length > 0 ? row as JsonRecord : { ...values };
}

async function listRows(table: any, statusColumn: any, status?: string, limit = 100): Promise<JsonRecord[]> {
  const conditions = [eq(table.is_deleted, false)];
  if (status) conditions.push(eq(statusColumn, normalizeUpper(status, status)));
  const rows = await (db as any).select().from(table).where(and(...conditions)).orderBy(desc(table.created_at)).limit(limit);
  return Array.isArray(rows) ? rows as JsonRecord[] : [];
}

async function countRows(table: any, whereColumn?: any, whereValue?: string): Promise<number> {
  const conditions = [eq(table.is_deleted, false)];
  if (whereColumn && whereValue) conditions.push(eq(whereColumn, whereValue));
  const rows = await (db as any).select({ count: sql<number>`count(*)` }).from(table).where(and(...conditions));
  const first = Array.isArray(rows) ? rows[0] as { count?: number | string } | undefined : undefined;
  return Number(first?.count ?? 0);
}

function maskSensitivePayload(payload: JsonRecord): JsonRecord {
  const masked: JsonRecord = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/customer|base|portfolio|facility|amount|exposure|market|ltv|tin|account/i.test(key)) {
      masked[key] = { masked: true };
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export function validateMakerCheckerDecision(params: { makerUserId?: string | null; checkerUserId: string }): void {
  if (params.makerUserId && params.makerUserId === params.checkerUserId) {
    throw new ValidationError('MAKER_CHECKER_VIOLATION');
  }
}

export const marginLendingService = {
  makeMlId,
  todayIso,

  calculateCrossCurrencyHaircut(params: {
    sourceCurrency?: string;
    targetCurrency?: string;
    bufferPercent: number | string;
    volatilityPercent: number | string;
  }): number {
    if (params.sourceCurrency && params.targetCurrency && params.sourceCurrency.toUpperCase() === params.targetCurrency.toUpperCase()) {
      throw new ValidationError('Source currency and target currency cannot be the same');
    }
    const buffer = assertPercent(params.bufferPercent, 'Buffer percent');
    const volatility = assertPercent(params.volatilityPercent, 'Volatility percent');
    return Number((buffer + volatility).toFixed(4));
  },

  calculateMarginMetrics(params: MlMetricsInput): MlMarginMetrics {
    const marketValue = asNumber(params.marketValue);
    const exposureAmount = asNumber(params.exposureAmount);
    const ltvPercent = assertPercent(params.ltvPercent, 'LTV percent');
    const topUpPercent = assertPercent(params.topUpPercent, 'Top-up percent');
    const sellOutPercent = assertPercent(params.sellOutPercent, 'Sell-out percent');
    const crossCurrencyHaircutPercent = assertPercent(params.crossCurrencyHaircutPercent ?? 0, 'Cross-currency haircut percent');
    assertThresholds(ltvPercent, topUpPercent, sellOutPercent);
    if (marketValue < 0) throw new ValidationError('Market value cannot be negative');
    if (exposureAmount < 0) throw new ValidationError('Exposure amount cannot be negative');

    const effectiveLtvPercent = Math.max(0, ltvPercent - crossCurrencyHaircutPercent);
    const gcmvAmount = Number((marketValue * effectiveLtvPercent / 100).toFixed(4));
    const topUpAmount = Number((marketValue * topUpPercent / 100).toFixed(4));
    const sellOutAmount = Number((marketValue * sellOutPercent / 100).toFixed(4));
    const ncmvAmount = Number((gcmvAmount - exposureAmount).toFixed(4));
    const utilizedLtvPercent = marketValue > 0 ? Number((exposureAmount / marketValue * 100).toFixed(4)) : exposureAmount > 0 ? Number.POSITIVE_INFINITY : 0;
    const marginStatus: MlMarginStatus = exposureAmount > sellOutAmount
      ? 'SELL_OUT'
      : exposureAmount > topUpAmount
        ? 'MARGIN_CALL'
        : 'NORMAL';
    const shortfallAmount = marginStatus === 'NORMAL' ? 0 : Number(Math.max(0, exposureAmount - topUpAmount).toFixed(4));

    return {
      marketValue,
      exposureAmount,
      ltvPercent,
      effectiveLtvPercent,
      topUpPercent,
      sellOutPercent,
      crossCurrencyHaircutPercent,
      gcmvAmount,
      ncmvAmount,
      topUpAmount,
      sellOutAmount,
      utilizedLtvPercent,
      availableDrawingPower: Number(Math.max(0, ncmvAmount).toFixed(4)),
      marginStatus,
      shortfallAmount,
    };
  },

  calculateBlockedQuantity(params: {
    marketValue: number | string;
    ltvPercent: number | string;
    exposureAmount: number | string;
    quantityOrNominal: number | string;
  }): number {
    const marketValue = asNumber(params.marketValue);
    const ltvPercent = assertPercent(params.ltvPercent, 'LTV percent');
    const exposureAmount = asNumber(params.exposureAmount);
    const quantityOrNominal = asNumber(params.quantityOrNominal);
    if (exposureAmount <= 0) throw new ValidationError('Exposure amount must be greater than zero');
    return Number((((marketValue * ltvPercent / 100) / exposureAmount) * quantityOrNominal).toFixed(4));
  },

  resolveAuthorizedRuleHierarchy(params: MlRuleResolutionInput): MlRuleResolution {
    const businessDate = params.businessDate ?? todayIso();
    const baseNumber = optionalString(params.baseNumber);
    const securityCode = optionalString(params.securityCode)?.toUpperCase();
    const assetClass = optionalString(params.assetClass)?.toUpperCase();
    const assetCurrency = optionalString(params.assetCurrency)?.toUpperCase();
    const facilityCurrency = optionalString(params.facilityCurrency)?.toUpperCase() ?? assetCurrency;
    const authorizedRuleIds: string[] = [];
    const fallback = {
      ltvPercent: assertPercent(params.ltvPercent ?? 70, 'LTV percent'),
      topUpPercent: assertPercent(params.topUpPercent ?? 80, 'Top-up percent'),
      sellOutPercent: assertPercent(params.sellOutPercent ?? 90, 'Sell-out percent'),
    };

    const assetRule = normalizeRecordArray(params.assetSettings)
      .filter((row) => isAuthorizedEffective(row, businessDate))
      .find((row) => stringMatches(row.base_number ?? row.baseNumber, baseNumber) && stringMatches(row.security_code ?? row.securityCode, securityCode));
    if (assetRule && !boolValue(assetRule.inheritance_flag ?? assetRule.inheritanceFlag, true)) {
      const ltv = rowNumber(assetRule, 'ltv_percent', 'ltvPercent');
      const topUp = rowNumber(assetRule, 'top_up_percent', 'topUpPercent');
      const sellOut = rowNumber(assetRule, 'sell_out_percent', 'sellOutPercent');
      if (ltv === undefined || topUp === undefined || sellOut === undefined) throw new ValidationError('ML_ASSET_SETTING_INVALID');
      assertThresholds(ltv, topUp, sellOut);
      authorizedRuleIds.push(String(assetRule.asset_setting_id ?? assetRule.assetSettingId));
      return {
        ...this.resolveCurrencyHaircut(params, businessDate, authorizedRuleIds),
        ltvPercent: ltv,
        topUpPercent: topUp,
        sellOutPercent: sellOut,
        ruleSource: 'AUTHORIZED_ASSET_SETTING',
        authorizedRuleIds,
      };
    }

    const scripRule = normalizeRecordArray(params.scripSettings)
      .filter((row) => isAuthorizedEffective(row, businessDate))
      .find((row) => stringMatches(row.security_code ?? row.securityCode, securityCode));
    if (scripRule && !boolValue(scripRule.inheritance_flag ?? scripRule.inheritanceFlag, true)) {
      const ltv = rowNumber(scripRule, 'ltv_percent', 'ltvPercent');
      const topUp = rowNumber(scripRule, 'top_up_percent', 'topUpPercent');
      const sellOut = rowNumber(scripRule, 'sell_out_percent', 'sellOutPercent');
      if (ltv === undefined || topUp === undefined || sellOut === undefined) throw new ValidationError('ML_SCRIP_SETTING_INVALID');
      assertThresholds(ltv, topUp, sellOut);
      authorizedRuleIds.push(String(scripRule.scrip_setting_id ?? scripRule.scripSettingId));
      return {
        ...this.resolveCurrencyHaircut(params, businessDate, authorizedRuleIds),
        ltvPercent: ltv,
        topUpPercent: topUp,
        sellOutPercent: sellOut,
        ruleSource: 'AUTHORIZED_SCRIP_SETTING',
        authorizedRuleIds,
      };
    }

    const attributeRule = normalizeRecordArray(params.attributeSettings)
      .filter((row) => isAuthorizedEffective(row, businessDate))
      .find((row) => stringMatches(row.asset_class ?? row.assetClass, assetClass) && stringMatches(row.currencies, assetCurrency));
    if (attributeRule) {
      const ltv = rowNumber(attributeRule, 'ltv_percent', 'ltvPercent', fallback.ltvPercent);
      const topUp = rowNumber(attributeRule, 'top_up_percent', 'topUpPercent', fallback.topUpPercent);
      const sellOut = rowNumber(attributeRule, 'sell_out_percent', 'sellOutPercent', fallback.sellOutPercent);
      if (ltv === undefined || topUp === undefined || sellOut === undefined) throw new ValidationError('ML_ATTRIBUTE_SETTING_INVALID');
      assertThresholds(ltv, topUp, sellOut);
      authorizedRuleIds.push(String(attributeRule.setting_id ?? attributeRule.settingId));
      return {
        ...this.resolveCurrencyHaircut(params, businessDate, authorizedRuleIds),
        ltvPercent: ltv,
        topUpPercent: topUp,
        sellOutPercent: sellOut,
        ruleSource: 'AUTHORIZED_ATTRIBUTE_SETTING',
        authorizedRuleIds,
      };
    }

    return {
      ...this.resolveCurrencyHaircut(params, businessDate, authorizedRuleIds),
      ...fallback,
      ruleSource: 'ADHOC_REQUEST_VALUES',
      authorizedRuleIds,
    };
  },

  resolveCurrencyHaircut(params: MlRuleResolutionInput, businessDate: string, authorizedRuleIds: string[] = []) {
    const assetCurrency = optionalString(params.assetCurrency)?.toUpperCase();
    const facilityCurrency = optionalString(params.facilityCurrency)?.toUpperCase() ?? assetCurrency;
    if (!assetCurrency || !facilityCurrency || assetCurrency === facilityCurrency) {
      return { crossCurrencyHaircutPercent: 0 };
    }
    if (params.crossCurrencyHaircutPercent !== undefined) {
      return { crossCurrencyHaircutPercent: assertPercent(params.crossCurrencyHaircutPercent, 'Cross-currency haircut percent') };
    }
    const haircutRule = normalizeRecordArray(params.crossCurrencyHaircuts)
      .filter((row) => isAuthorizedEffective(row, businessDate))
      .find((row) => String(row.source_currency ?? row.sourceCurrency).toUpperCase() === assetCurrency && String(row.target_currency ?? row.targetCurrency).toUpperCase() === facilityCurrency);
    if (!haircutRule) throw new ValidationError('ML_CROSS_CURRENCY_HAIRCUT_MISSING');
    const haircut = rowNumber(haircutRule, 'haircut_percent', 'haircutPercent');
    if (haircut === undefined) throw new ValidationError('ML_CROSS_CURRENCY_HAIRCUT_MISSING');
    authorizedRuleIds.push(String(haircutRule.haircut_id ?? haircutRule.haircutId));
    return { crossCurrencyHaircutPercent: assertPercent(haircut, 'Cross-currency haircut percent') };
  },

  applySimulationActions(base: {
    marketValue: number;
    exposureAmount: number;
    ltvPercent: number;
    topUpPercent: number;
    sellOutPercent: number;
    crossCurrencyHaircutPercent?: number;
  }, data: JsonRecord) {
    let marketValue = base.marketValue;
    let exposureAmount = base.exposureAmount;
    const assetActions = normalizeRecordArray(data.assets ?? data.assetActions);
    const exposureActions = normalizeRecordArray(data.exposures ?? data.exposureActions);
    for (const action of assetActions) {
      const actionType = normalizeUpper(action.action ?? action.actionType, 'MODIFY');
      const amount = asNumber(action.marketValue as string | number | undefined ?? action.amount as string | number | undefined, 0);
      if (actionType === 'ADD') marketValue += amount;
      else if (actionType === 'DELETE') marketValue -= amount;
      else if (actionType === 'MODIFY') marketValue += asNumber(action.marketValueDelta as string | number | undefined ?? action.delta as string | number | undefined, amount);
    }
    for (const action of exposureActions) {
      const actionType = normalizeUpper(action.action ?? action.actionType, 'MODIFY');
      const amount = asNumber(action.exposureAmount as string | number | undefined ?? action.amount as string | number | undefined, 0);
      if (actionType === 'ADD') exposureAmount += amount;
      else if (actionType === 'DELETE') exposureAmount -= amount;
      else if (actionType === 'MODIFY') exposureAmount += asNumber(action.exposureDelta as string | number | undefined ?? action.delta as string | number | undefined, amount);
    }
    return {
      marketValue: Math.max(0, marketValue),
      exposureAmount: Math.max(0, exposureAmount),
      ltvPercent: base.ltvPercent,
      topUpPercent: base.topUpPercent,
      sellOutPercent: base.sellOutPercent,
      crossCurrencyHaircutPercent: base.crossCurrencyHaircutPercent,
    };
  },

  async loadAuthorizedRuleSets(params: JsonRecord = {}, businessDate = todayIso()): Promise<Partial<MlRuleResolutionInput>> {
    const inlineRuleSets = {
      attributeSettings: normalizeRecordArray(params.attributeSettings),
      scripSettings: normalizeRecordArray(params.scripSettings),
      assetSettings: normalizeRecordArray(params.assetSettings),
      crossCurrencyHaircuts: normalizeRecordArray(params.crossCurrencyHaircuts),
    };
    if (Object.values(inlineRuleSets).some((rows) => rows.length > 0)) return inlineRuleSets;
    const [attributeSettings, scripSettings, assetSettings, crossCurrencyHaircuts] = await Promise.all([
      this.listAttributeSettings({ status: 'AUTHORIZED' }).catch(() => []),
      this.listScripSettings({ status: 'AUTHORIZED' }).catch(() => []),
      this.listAssetSettings({ status: 'AUTHORIZED' }).catch(() => []),
      this.listCrossCurrencyHaircuts({ status: 'AUTHORIZED' }).catch(() => []),
    ]);
    return {
      attributeSettings: normalizeRecordArray(attributeSettings)
        .filter((row) => rowHasBusinessId(row, ['setting_id', 'settingId']))
        .filter((row) => isAuthorizedEffective(row, businessDate)),
      scripSettings: normalizeRecordArray(scripSettings)
        .filter((row) => rowHasBusinessId(row, ['scrip_setting_id', 'scripSettingId']))
        .filter((row) => isAuthorizedEffective(row, businessDate)),
      assetSettings: normalizeRecordArray(assetSettings)
        .filter((row) => rowHasBusinessId(row, ['asset_setting_id', 'assetSettingId']))
        .filter((row) => isAuthorizedEffective(row, businessDate)),
      crossCurrencyHaircuts: normalizeRecordArray(crossCurrencyHaircuts)
        .filter((row) => rowHasBusinessId(row, ['haircut_id', 'haircutId']))
        .filter((row) => isAuthorizedEffective(row, businessDate)),
    };
  },

  async logAuditEvent(data: {
    entityType: string;
    entityId: string;
    action: string;
    actorUserId: string;
    actorRole?: string;
    beforePayload?: unknown;
    afterPayload?: unknown;
    decision?: string;
    reason?: string;
    sourceIp?: string;
  }): Promise<JsonRecord> {
    const afterPayload = asRecord(data.afterPayload);
    return insertReturning(schema.mlAuditEvents, {
      event_id: makeMlId('ML-AUD'),
      entity_type: data.entityType,
      entity_id: data.entityId,
      action: normalizeUpper(data.action, 'ACCESS'),
      actor_user_id: data.actorUserId,
      actor_role: data.actorRole,
      before_payload: asRecord(data.beforePayload),
      after_payload: afterPayload,
      decision: data.decision,
      reason: data.reason,
      source_ip: data.sourceIp,
      masked_payload: maskSensitivePayload(afterPayload),
      created_by: data.actorUserId,
    });
  },

  async createAttributeSetting(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const ltv = assertPercent(data.ltvPercent as string | number, 'LTV percent');
    const topUp = assertPercent(data.topUpPercent as string | number, 'Top-up percent');
    const sellOut = assertPercent(data.sellOutPercent as string | number, 'Sell-out percent');
    assertThresholds(ltv, topUp, sellOut);
    assertDateRange(optionalString(data.effectiveFrom) ?? todayIso(), optionalString(data.effectiveTo));
    const values: JsonRecord = {
      setting_id: optionalString(data.settingId) ?? makeMlId('ML-AS'),
      maintenance_type: normalizeUpper(data.maintenanceType, 'FIXED_INCOME_ATTRIBUTE'),
      definition_type: assertRequired(data.definitionType, 'Definition type'),
      asset_class: optionalString(data.assetClass),
      sub_asset_classes: normalizeArray(data.subAssetClasses),
      currencies: normalizeArray(data.currencies),
      industry_codes: normalizeArray(data.industryCodes),
      market_groups: normalizeArray(data.marketGroups),
      security_domiciles: normalizeArray(data.securityDomiciles),
      security_issuers: normalizeArray(data.securityIssuers),
      rating_agencies: normalizeArray(data.ratingAgencies),
      ratings: normalizeArray(data.ratings),
      residual_tenors: normalizeArray(data.residualTenors),
      issuer_categories: normalizeArray(data.issuerCategories),
      capital_protection: optionalString(data.capitalProtection),
      fund_domiciles: normalizeArray(data.fundDomiciles),
      security_risk_profiles: normalizeArray(data.securityRiskProfiles),
      fund_houses: normalizeArray(data.fundHouses),
      ltv_percent: toPct(ltv),
      top_up_percent: toPct(topUp),
      sell_out_percent: toPct(sellOut),
      record_status: recordStatus(data.recordStatus),
      effective_from: optionalString(data.effectiveFrom) ?? todayIso(),
      effective_to: optionalString(data.effectiveTo),
      submitted_by: userId,
      submitted_at: new Date(),
      remarks: optionalString(data.remarks),
      created_by: userId,
    };
    const row = await insertReturning(schema.mlAttributeSettings, values);
    await this.logAuditEvent({ entityType: 'ML_ATTRIBUTE_SETTING', entityId: String(values.setting_id), action: 'ADD', actorUserId: userId, afterPayload: values });
    return row;
  },

  async createReference(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const referenceType = normalizeUpper(data.referenceType, 'MARGIN_CALL_NOTICE_PERIOD');
    const referenceValue = assertRequired(data.referenceValue, 'Reference value');
    const numericValue = Number(referenceValue);
    if (referenceType === 'MARGIN_CALL_NOTICE_PERIOD' && (!Number.isFinite(numericValue) || numericValue <= 0 || !Number.isInteger(numericValue))) {
      throw new ValidationError('Notice period value must be a positive integer number of days');
    }
    const values: JsonRecord = {
      reference_id: optionalString(data.referenceId) ?? makeMlId('ML-REF'),
      reference_type: referenceType,
      reference_code: assertRequired(data.referenceCode, 'Reference code'),
      reference_value: referenceValue,
      reference_value_numeric: Number.isFinite(numericValue) ? numericValue.toFixed(8) : undefined,
      record_status: recordStatus(data.recordStatus),
      effective_from: optionalString(data.effectiveFrom) ?? todayIso(),
      effective_to: optionalString(data.effectiveTo),
      remarks: optionalString(data.remarks),
      created_by: userId,
    };
    const row = await insertReturning(schema.mlReferences, values);
    await this.logAuditEvent({ entityType: 'ML_REFERENCE', entityId: String(values.reference_id), action: 'ADD', actorUserId: userId, afterPayload: values });
    return row;
  },

  async createScripSetting(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const inherit = data.inheritanceFlag === undefined ? true : data.inheritanceFlag === true || data.inheritanceFlag === 'true';
    const ltv = data.ltvPercent === undefined ? undefined : assertPercent(data.ltvPercent as string | number, 'LTV percent');
    const topUp = data.topUpPercent === undefined ? undefined : assertPercent(data.topUpPercent as string | number, 'Top-up percent');
    const sellOut = data.sellOutPercent === undefined ? undefined : assertPercent(data.sellOutPercent as string | number, 'Sell-out percent');
    if (!inherit) {
      if (ltv === undefined || topUp === undefined || sellOut === undefined) throw new ValidationError('LTV, top-up, and sell-out are mandatory when inheritance flag is false');
      assertThresholds(ltv, topUp, sellOut);
    }
    const values: JsonRecord = {
      scrip_setting_id: optionalString(data.scripSettingId) ?? makeMlId('ML-SCR'),
      security_id: data.securityId === undefined ? undefined : Number(data.securityId),
      security_code: assertRequired(data.securityCode, 'Security code'),
      security_name: assertRequired(data.securityName, 'Security name'),
      currency: optionalString(data.currency)?.toUpperCase(),
      issuer_code: optionalString(data.issuerCode),
      security_concentration_flag: data.securityConcentrationFlag === true || data.securityConcentrationFlag === 'true',
      inheritance_flag: inherit,
      ltv_percent: toPct(ltv),
      top_up_percent: toPct(topUp),
      sell_out_percent: toPct(sellOut),
      record_status: recordStatus(data.recordStatus),
      effective_from: optionalString(data.effectiveFrom) ?? todayIso(),
      effective_to: optionalString(data.effectiveTo),
      remarks: optionalString(data.remarks),
      created_by: userId,
    };
    const row = await insertReturning(schema.mlScripSettings, values);
    await this.logAuditEvent({ entityType: 'ML_SCRIP_SETTING', entityId: String(values.scrip_setting_id), action: 'ADD', actorUserId: userId, afterPayload: values });
    return row;
  },

  async createExposureLimit(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const amount = asNumber(data.amount as string | number);
    if (amount <= 0) throw new ValidationError('Exposure amount must be greater than zero');
    const threshold = assertPercent(data.thresholdPercent as string | number, 'Threshold percentage', false);
    assertDateRange(optionalString(data.effectiveFrom) ?? todayIso(), optionalString(data.effectiveTo));
    const values: JsonRecord = {
      exposure_limit_id: optionalString(data.exposureLimitId) ?? makeMlId('ML-EXP'),
      limit_code: assertRequired(data.limitCode, 'Limit code'),
      limit_name: assertRequired(data.limitName, 'Limit name'),
      currency: assertRequired(data.currency, 'Currency').toUpperCase(),
      amount: toMoney(amount),
      threshold_percent: toPct(threshold),
      category: normalizeUpper(data.category, 'ASSET_CLASS'),
      sub_category: optionalString(data.subCategory),
      category_values: normalizeArray(data.categoryValues),
      sub_category_values: normalizeArray(data.subCategoryValues),
      record_status: recordStatus(data.recordStatus),
      effective_from: optionalString(data.effectiveFrom) ?? todayIso(),
      effective_to: optionalString(data.effectiveTo),
      remarks: optionalString(data.remarks),
      created_by: userId,
    };
    const row = await insertReturning(schema.mlExposureLimits, values);
    await this.logAuditEvent({ entityType: 'ML_EXPOSURE_LIMIT', entityId: String(values.exposure_limit_id), action: 'ADD', actorUserId: userId, afterPayload: values });
    return row;
  },

  async createCrossCurrencyHaircut(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const sourceCurrency = assertRequired(data.sourceCurrency, 'Source currency').toUpperCase();
    const targetCurrency = assertRequired(data.targetCurrency, 'Target currency').toUpperCase();
    const haircut = this.calculateCrossCurrencyHaircut({
      sourceCurrency,
      targetCurrency,
      bufferPercent: data.bufferPercent as string | number,
      volatilityPercent: data.volatilityPercent as string | number,
    });
    const values: JsonRecord = {
      haircut_id: optionalString(data.haircutId) ?? makeMlId('ML-FXHC'),
      source_currency: sourceCurrency,
      target_currency: targetCurrency,
      buffer_percent: toPct(data.bufferPercent as string | number),
      volatility_percent: toPct(data.volatilityPercent as string | number),
      haircut_percent: toPct(haircut),
      record_status: recordStatus(data.recordStatus),
      effective_from: optionalString(data.effectiveFrom) ?? todayIso(),
      effective_to: optionalString(data.effectiveTo),
      remarks: optionalString(data.remarks),
      created_by: userId,
    };
    const row = await insertReturning(schema.mlCrossCurrencyHaircuts, values);
    await this.logAuditEvent({ entityType: 'ML_CROSS_CURRENCY_HAIRCUT', entityId: String(values.haircut_id), action: 'ADD', actorUserId: userId, afterPayload: values });
    return row;
  },

  async createFacilityGroup(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const startDate = assertRequired(data.startDate, 'Start date');
    const maturityDate = assertRequired(data.maturityDate, 'Maturity date');
    assertDateRange(startDate, maturityDate, 'Start date', 'Maturity date');
    const limitAmount = asNumber(data.limitAmount as string | number);
    if (limitAmount <= 0) throw new ValidationError('Facility group limit amount must be greater than zero');
    const utilizedAmount = asNumber(data.utilizedAmount as string | number | undefined, 0);
    const values: JsonRecord = {
      facility_group_id: optionalString(data.facilityGroupId) ?? makeMlId('ML-FG'),
      base_number: assertRequired(data.baseNumber, 'Base number'),
      base_name: assertRequired(data.baseName, 'Base name'),
      customer_id: optionalString(data.customerId),
      description: optionalString(data.description),
      start_date: startDate,
      maturity_date: maturityDate,
      limit_amount: toMoney(limitAmount),
      utilized_amount: toMoney(utilizedAmount) ?? '0.0000',
      available_drawing_power: toMoney(Math.max(0, limitAmount - utilizedAmount)) ?? '0.0000',
      currency: assertRequired(data.currency, 'Currency').toUpperCase(),
      record_status: recordStatus(data.recordStatus),
      remarks: optionalString(data.remarks),
      created_by: userId,
    };
    const row = await insertReturning(schema.mlFacilityGroups, values);
    await this.logAuditEvent({ entityType: 'ML_FACILITY_GROUP', entityId: String(values.facility_group_id), action: 'ADD', actorUserId: userId, afterPayload: values });
    return row;
  },

  async createFacility(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const limitAmount = asNumber(data.limitAmount as string | number);
    if (limitAmount <= 0) throw new ValidationError('Facility limit amount must be greater than zero');
    const utilizedAmount = asNumber(data.utilizedAmount as string | number | undefined, 0);
    const values: JsonRecord = {
      facility_id: optionalString(data.facilityId) ?? makeMlId('ML-FAC'),
      facility_group_id: assertRequired(data.facilityGroupId, 'Facility group ID'),
      source_system: normalizeUpper(data.sourceSystem, 'PMX'),
      source_facility_ref: assertRequired(data.sourceFacilityRef, 'Source facility reference'),
      asset_class: assertRequired(data.assetClass, 'Asset class'),
      sub_asset_class: optionalString(data.subAssetClass),
      currency: assertRequired(data.currency, 'Currency').toUpperCase(),
      limit_amount: toMoney(limitAmount),
      utilized_amount: toMoney(utilizedAmount) ?? '0.0000',
      available_amount: toMoney(Math.max(0, limitAmount - utilizedAmount)) ?? '0.0000',
      facility_status: normalizeUpper(data.facilityStatus, 'ACTIVE'),
      payload: asRecord(data.payload),
      created_by: userId,
    };
    const row = await insertReturning(schema.mlFacilities, values);
    await this.logAuditEvent({ entityType: 'ML_FACILITY', entityId: String(values.facility_id), action: 'IMPORT', actorUserId: userId, afterPayload: values });
    return row;
  },

  async createPortfolioLink(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const crossPledge = data.crossPledgeFlag === true || data.crossPledgeFlag === 'true';
    const baseNumber = assertRequired(data.baseNumber, 'Base number');
    const pledgorBaseNumber = optionalString(data.pledgorBaseNumber);
    if (crossPledge && (!pledgorBaseNumber || pledgorBaseNumber === baseNumber)) {
      throw new ValidationError('Cross pledge requires explicit pledgor base number different from target base number');
    }
    const values: JsonRecord = {
      portfolio_link_id: optionalString(data.portfolioLinkId) ?? makeMlId(crossPledge ? 'ML-XPL' : 'ML-PL'),
      facility_group_id: assertRequired(data.facilityGroupId, 'Facility group ID'),
      base_number: baseNumber,
      portfolio_id: assertRequired(data.portfolioId, 'Portfolio ID'),
      linked_flag: data.linkedFlag === undefined ? true : data.linkedFlag === true || data.linkedFlag === 'true',
      cross_pledge_flag: crossPledge,
      pledgor_base_number: pledgorBaseNumber,
      priority: Number(data.priority ?? 1),
      ownership_evidence_ref: optionalString(data.ownershipEvidenceRef),
      pledge_status: normalizeUpper(data.pledgeStatus, 'AVAILABLE'),
      record_status: recordStatus(data.recordStatus),
      remarks: optionalString(data.remarks),
      created_by: userId,
    };
    if (crossPledge && values.pledge_status === 'SELL_OUT_LOCKED') {
      throw new ValidationError('Pledged portfolio is already pledged to another active sell-out case');
    }
    const row = await insertReturning(schema.mlPortfolioLinks, values);
    await this.logAuditEvent({ entityType: crossPledge ? 'ML_CROSS_PLEDGE' : 'ML_PORTFOLIO_LINK', entityId: String(values.portfolio_link_id), action: 'ADD', actorUserId: userId, afterPayload: values });
    return row;
  },

  async createAssetSetting(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const inherit = data.inheritanceFlag === undefined ? true : data.inheritanceFlag === true || data.inheritanceFlag === 'true';
    const ltv = data.ltvPercent === undefined ? undefined : assertPercent(data.ltvPercent as string | number, 'LTV percent');
    const topUp = data.topUpPercent === undefined ? undefined : assertPercent(data.topUpPercent as string | number, 'Top-up percent');
    const sellOut = data.sellOutPercent === undefined ? undefined : assertPercent(data.sellOutPercent as string | number, 'Sell-out percent');
    if (!inherit) {
      if (ltv === undefined || topUp === undefined || sellOut === undefined) throw new ValidationError('ML_ASSET_SETTING_INVALID');
      assertThresholds(ltv, topUp, sellOut);
    }
    const issuerConcentration = inherit || data.issuerConcentrationPercent === undefined ? undefined : assertPercent(data.issuerConcentrationPercent as string | number, 'Issuer concentration percent');
    const securityConcentration = inherit || data.securityConcentrationPercent === undefined ? undefined : assertPercent(data.securityConcentrationPercent as string | number, 'Security concentration percent');
    const values: JsonRecord = {
      asset_setting_id: optionalString(data.assetSettingId) ?? makeMlId('ML-AST'),
      base_number: assertRequired(data.baseNumber, 'Base number'),
      customer_id: optionalString(data.customerId),
      security_id: data.securityId === undefined ? undefined : Number(data.securityId),
      security_code: assertRequired(data.securityCode, 'Security code'),
      security_name: assertRequired(data.securityName, 'Security name'),
      inheritance_flag: inherit,
      issuer_concentration_percent: toPct(issuerConcentration),
      security_concentration_percent: toPct(securityConcentration),
      ltv_percent: inherit ? undefined : toPct(ltv),
      top_up_percent: inherit ? undefined : toPct(topUp),
      sell_out_percent: inherit ? undefined : toPct(sellOut),
      record_status: recordStatus(data.recordStatus),
      effective_from: optionalString(data.effectiveFrom) ?? todayIso(),
      effective_to: optionalString(data.effectiveTo),
      remarks: optionalString(data.remarks),
      created_by: userId,
    };
    const row = await insertReturning(schema.mlAssetSettings, values);
    await this.logAuditEvent({ entityType: 'ML_ASSET_SETTING', entityId: String(values.asset_setting_id), action: 'ADD', actorUserId: userId, afterPayload: values });
    return row;
  },

  async decideRecord(entityType: MlEntityType, businessId: string, data: JsonRecord, checkerUserId: string): Promise<JsonRecord> {
    const config = lifecycleConfig[entityType];
    const [existingRaw] = await (db as any).select().from(config.table).where(eq(config.idColumn, businessId)).limit(1);
    const existing = ensureNonEmptyRow(existingRaw, config.label, businessId);
    validateMakerCheckerDecision({ makerUserId: optionalString(existing.created_by), checkerUserId });
    const decision = normalizeUpper(data.decision, 'AUTHORIZE') as MlDecision;
    if (!['AUTHORIZE', 'APPROVE', 'REJECT'].includes(decision)) throw new ValidationError('Decision must be AUTHORIZE or REJECT');
    const approved = decision === 'AUTHORIZE' || decision === 'APPROVE';
    if (approved && entityType === 'portfolio-links') {
      if (!optionalString(existing.ownership_evidence_ref ?? data.ownershipEvidenceRef)) {
        throw new ValidationError('ML_PORTFOLIO_OWNERSHIP_MISSING');
      }
      if (boolValue(existing.cross_pledge_flag ?? existing.crossPledgeFlag) && normalizeUpper(existing.pledge_status, 'AVAILABLE') === 'SELL_OUT_LOCKED') {
        throw new ValidationError('ML_CROSS_PLEDGE_SELL_OUT_LOCKED');
      }
      if (boolValue(existing.cross_pledge_flag ?? existing.crossPledgeFlag)) {
        const lockedCases = await (db as any).select().from(schema.mlMarginCallCases).where(and(
          eq(schema.mlMarginCallCases.portfolio_id, String(existing.portfolio_id ?? existing.portfolioId)),
          eq(schema.mlMarginCallCases.margin_status, 'SELL_OUT'),
          eq(schema.mlMarginCallCases.case_status, 'OPEN'),
          eq(schema.mlMarginCallCases.is_deleted, false),
        )).limit(1).catch(() => []);
        const activeSellOut = normalizeRecordArray(lockedCases).find((row) => rowHasBusinessId(row, ['case_id', 'caseId']));
        if (activeSellOut) throw new ValidationError('ML_CROSS_PLEDGE_SELL_OUT_LOCKED');
      }
    }
    const values: JsonRecord = approved
      ? { record_status: 'AUTHORIZED', authorized_by: checkerUserId, authorized_at: new Date(), updated_by: checkerUserId, updated_at: new Date() }
      : { record_status: 'REJECTED', rejected_reason: optionalString(data.reason) ?? 'Rejected by checker', updated_by: checkerUserId, updated_at: new Date() };
    const row = await updateReturning(config.table, config.idColumn, businessId, values);
    await this.logAuditEvent({
      entityType: config.label.toUpperCase().replace(/\s+/g, '_'),
      entityId: businessId,
      action: approved ? 'AUTHORIZE' : 'REJECT',
      actorUserId: checkerUserId,
      beforePayload: existing,
      afterPayload: { ...existing, ...values },
      decision,
      reason: optionalString(data.reason),
    });
    return row;
  },

  async copyRecord(entityType: MlEntityType, businessId: string, data: JsonRecord, userId: string): Promise<JsonRecord> {
    const config = lifecycleConfig[entityType];
    const [existingRaw] = await (db as any).select().from(config.table).where(eq(config.idColumn, businessId)).limit(1);
    const existing = ensureNonEmptyRow(existingRaw, config.label, businessId);
    const copied = { ...existing };
    delete copied.id;
    delete copied.created_at;
    delete copied.updated_at;
    delete copied.authorized_by;
    delete copied.authorized_at;
    delete copied.rejected_by;
    delete copied.rejected_at;
    delete copied.rejected_reason;
    const newId = optionalString(data.newBusinessId) ?? makeMlId(String(existing[config.businessIdKey] ?? businessId).split('-').slice(0, 2).join('-') || 'ML-COPY');
    copied[config.businessIdKey] = newId;
    copied.record_status = recordStatus(data.recordStatus, 'UNAUTHORIZED');
    copied.created_by = userId;
    copied.updated_by = userId;
    copied.version = 1;
    copied.remarks = optionalString(data.remarks) ?? `Copied from ${businessId}`;
    const row = await insertReturning(config.table, copied);
    await this.logAuditEvent({
      entityType: config.label.toUpperCase().replace(/\s+/g, '_'),
      entityId: newId,
      action: 'COPY',
      actorUserId: userId,
      beforePayload: existing,
      afterPayload: row,
    });
    return row;
  },

  async updateRecord(entityType: MlEntityType, businessId: string, data: JsonRecord, userId: string): Promise<JsonRecord> {
    const config = lifecycleConfig[entityType];
    const [existingRaw] = await (db as any).select().from(config.table).where(eq(config.idColumn, businessId)).limit(1);
    const existing = ensureNonEmptyRow(existingRaw, config.label, businessId);
    const currentStatus = normalizeUpper(existing.record_status, 'DRAFT');
    const values: JsonRecord = {
      record_status: currentStatus === 'AUTHORIZED' ? 'MODIFIED' : 'UNAUTHORIZED',
      remarks: optionalString(data.remarks) ?? optionalString(existing.remarks),
      updated_by: userId,
      updated_at: new Date(),
    };
    if (entityType === 'cross-currency-haircuts') {
      const buffer = data.bufferPercent === undefined ? asNumber(existing.buffer_percent as string | number) : assertPercent(data.bufferPercent as string | number, 'Buffer percent');
      const volatility = data.volatilityPercent === undefined ? asNumber(existing.volatility_percent as string | number) : assertPercent(data.volatilityPercent as string | number, 'Volatility percent');
      values.buffer_percent = toPct(buffer);
      values.volatility_percent = toPct(volatility);
      values.haircut_percent = toPct(this.calculateCrossCurrencyHaircut({
        sourceCurrency: optionalString(data.sourceCurrency) ?? optionalString(existing.source_currency),
        targetCurrency: optionalString(data.targetCurrency) ?? optionalString(existing.target_currency),
        bufferPercent: buffer,
        volatilityPercent: volatility,
      }));
    }
    if (data.effectiveTo !== undefined) values.effective_to = optionalString(data.effectiveTo);
    const row = await updateReturning(config.table, config.idColumn, businessId, values);
    await this.logAuditEvent({
      entityType: config.label.toUpperCase().replace(/\s+/g, '_'),
      entityId: businessId,
      action: 'MODIFY',
      actorUserId: userId,
      beforePayload: existing,
      afterPayload: { ...existing, ...values },
    });
    return row;
  },

  async softDeleteRecord(entityType: MlEntityType, businessId: string, userId: string): Promise<JsonRecord> {
    const config = lifecycleConfig[entityType];
    const [existingRaw] = await (db as any).select().from(config.table).where(eq(config.idColumn, businessId)).limit(1);
    const existing = ensureNonEmptyRow(existingRaw, config.label, businessId);
    if (existing.record_status === 'AUTHORIZED') throw new ValidationError('Authorized records cannot be deleted without a retirement flow');
    const values = { is_deleted: true, updated_by: userId, updated_at: new Date() };
    const row = await updateReturning(config.table, config.idColumn, businessId, values);
    await this.logAuditEvent({ entityType: config.label.toUpperCase().replace(/\s+/g, '_'), entityId: businessId, action: 'DELETE', actorUserId: userId, beforePayload: existing, afterPayload: values });
    return row;
  },

  listAttributeSettings(params: { status?: string } = {}): Promise<JsonRecord[]> {
    return listRows(schema.mlAttributeSettings, schema.mlAttributeSettings.record_status, params.status);
  },

  listReferences(params: { status?: string } = {}): Promise<JsonRecord[]> {
    return listRows(schema.mlReferences, schema.mlReferences.record_status, params.status);
  },

  listScripSettings(params: { status?: string } = {}): Promise<JsonRecord[]> {
    return listRows(schema.mlScripSettings, schema.mlScripSettings.record_status, params.status);
  },

  listExposureLimits(params: { status?: string } = {}): Promise<JsonRecord[]> {
    return listRows(schema.mlExposureLimits, schema.mlExposureLimits.record_status, params.status);
  },

  listCrossCurrencyHaircuts(params: { status?: string } = {}): Promise<JsonRecord[]> {
    return listRows(schema.mlCrossCurrencyHaircuts, schema.mlCrossCurrencyHaircuts.record_status, params.status);
  },

  listFacilityGroups(params: { status?: string } = {}): Promise<JsonRecord[]> {
    return listRows(schema.mlFacilityGroups, schema.mlFacilityGroups.record_status, params.status);
  },

  listFacilities(params: { facilityGroupId?: string; status?: string; assetClass?: string; subAssetClass?: string; currency?: string } = {}): Promise<JsonRecord[]> {
    const conditions = [eq(schema.mlFacilities.is_deleted, false)];
    if (params.facilityGroupId) conditions.push(eq(schema.mlFacilities.facility_group_id, params.facilityGroupId));
    if (params.status) conditions.push(eq(schema.mlFacilities.facility_status, normalizeUpper(params.status, params.status)));
    if (params.assetClass) conditions.push(eq(schema.mlFacilities.asset_class, normalizeUpper(params.assetClass, params.assetClass)));
    if (params.subAssetClass) conditions.push(eq(schema.mlFacilities.sub_asset_class, params.subAssetClass));
    if (params.currency) conditions.push(eq(schema.mlFacilities.currency, params.currency.toUpperCase()));
    return (db as any).select().from(schema.mlFacilities).where(and(...conditions)).orderBy(desc(schema.mlFacilities.created_at)).limit(100);
  },

  listPortfolioLinks(params: { facilityGroupId?: string; status?: string } = {}): Promise<JsonRecord[]> {
    const conditions = [eq(schema.mlPortfolioLinks.is_deleted, false)];
    if (params.facilityGroupId) conditions.push(eq(schema.mlPortfolioLinks.facility_group_id, params.facilityGroupId));
    if (params.status) conditions.push(eq(schema.mlPortfolioLinks.record_status, normalizeUpper(params.status, params.status)));
    return (db as any).select().from(schema.mlPortfolioLinks).where(and(...conditions)).orderBy(desc(schema.mlPortfolioLinks.created_at)).limit(100);
  },

  listAssetSettings(params: { status?: string } = {}): Promise<JsonRecord[]> {
    return listRows(schema.mlAssetSettings, schema.mlAssetSettings.record_status, params.status);
  },

  async getCreditView(params: JsonRecord, userId = 'system'): Promise<JsonRecord> {
    const baseNumber = assertRequired(params.baseNumber, 'Base number');
    const facilityGroupId = optionalString(params.facilityGroupId);
    const facilityCurrency = optionalString(params.facilityCurrency ?? params.currency)?.toUpperCase() ?? 'IDR';
    const assetCurrency = optionalString(params.assetCurrency)?.toUpperCase() ?? facilityCurrency;
    const businessDate = optionalString(params.businessDate) ?? todayIso();
    const partialSources: string[] = [];
    if (normalizeUpper(params.priceStatus, 'AVAILABLE') !== 'AVAILABLE') partialSources.push('PRICE');
    if (normalizeUpper(params.holdingStatus, 'AVAILABLE') !== 'AVAILABLE') partialSources.push('HOLDING');

    const authorizedRuleSets = await this.loadAuthorizedRuleSets(params, businessDate);
    const ruleResolution = this.resolveAuthorizedRuleHierarchy({
      ...params,
      ...authorizedRuleSets,
      businessDate,
      baseNumber,
      assetCurrency,
      facilityCurrency,
      securityCode: optionalString(params.securityCode),
      assetClass: optionalString(params.assetClass),
    });
    const metrics = this.calculateMarginMetrics({
      marketValue: params.marketValue as string | number ?? 0,
      exposureAmount: params.exposureAmount as string | number ?? 0,
      ltvPercent: ruleResolution.ltvPercent,
      topUpPercent: ruleResolution.topUpPercent,
      sellOutPercent: ruleResolution.sellOutPercent,
      crossCurrencyHaircutPercent: ruleResolution.crossCurrencyHaircutPercent,
    });
    let persistedLinkRows = normalizeRecordArray(params.portfolioLinks);
    if (persistedLinkRows.length === 0 && facilityGroupId) {
      const rows = await this.listPortfolioLinks({ facilityGroupId, status: 'AUTHORIZED' }).catch(() => []);
      persistedLinkRows = normalizeRecordArray(rows).filter((row) => rowHasBusinessId(row, ['portfolio_link_id', 'portfolioLinkId']));
    }
    const linkedPortfolios = persistedLinkRows.length > 0
      ? persistedLinkRows.map((row, index) => ({
          portfolioId: String(row.portfolio_id ?? row.portfolioId ?? ''),
          crossPledge: boolValue(row.cross_pledge_flag ?? row.crossPledgeFlag),
          priority: Number(row.priority ?? index + 1),
          source: 'AUTHORIZED_PORTFOLIO_LINK',
        })).filter((row) => row.portfolioId)
      : normalizeArray(params.linkedPortfolios).map((portfolioId, index) => ({
      portfolioId,
      crossPledge: false,
      priority: index + 1,
      source: 'REQUEST',
    }));
    const crossPledgedPortfolios = normalizeArray(params.crossPledgedPortfolios).map((portfolioId, index) => ({
      portfolioId,
      crossPledge: true,
      priority: index + 1,
      source: 'REQUEST',
    }));
    const result: JsonRecord = {
      baseNumber,
      baseName: optionalString(params.baseName),
      facilityGroupId,
      facilityCurrency,
      assetCurrency,
      creditDate: businessDate,
      partial: partialSources.length > 0,
      partialSources,
      metrics,
      ruleResolution,
      linkedPortfolios: [...linkedPortfolios, ...crossPledgedPortfolios],
      holdings: Array.isArray(params.holdings) ? params.holdings : [],
      drilldowns: {
        linkedPortfolios: [...linkedPortfolios, ...crossPledgedPortfolios],
        holdings: Array.isArray(params.holdings) ? params.holdings : [],
      },
      statusEvidence: {
        rule: 'SELL_OUT takes priority over MARGIN_CALL when both thresholds are breached.',
        source: 'Margin Lending BRD FR-011 and FR-013',
      },
    };
    await this.logAuditEvent({ entityType: 'ML_CREDIT_VIEW', entityId: `${baseNumber}:${facilityGroupId ?? 'ADHOC'}`, action: 'VIEW', actorUserId: userId, afterPayload: result });
    return result;
  },

  async listMarginCallCases(params: { status?: string; baseNumber?: string } = {}): Promise<JsonRecord[]> {
    const conditions = [eq(schema.mlMarginCallCases.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.mlMarginCallCases.case_status, normalizeUpper(params.status, params.status)));
    if (params.baseNumber) conditions.push(eq(schema.mlMarginCallCases.base_number, params.baseNumber));
    return (db as any).select().from(schema.mlMarginCallCases).where(and(...conditions)).orderBy(desc(schema.mlMarginCallCases.created_at)).limit(100);
  },

  async listMarginCallActions(caseId: string): Promise<JsonRecord[]> {
    const conditions = [
      eq(schema.mlMarginCallActions.is_deleted, false),
      eq(schema.mlMarginCallActions.case_id, caseId),
    ];
    return (db as any).select().from(schema.mlMarginCallActions).where(and(...conditions)).orderBy(desc(schema.mlMarginCallActions.created_at)).limit(100);
  },

  async createMarginCallCaseFromSnapshot(snapshot: JsonRecord, businessDate: string, userId: string, noticePeriodDays = 0): Promise<JsonRecord | null> {
    const metrics = this.calculateMarginMetrics({
      marketValue: snapshot.marketValue as string | number ?? 0,
      exposureAmount: snapshot.exposureAmount as string | number ?? 0,
      ltvPercent: snapshot.ltvPercent as string | number ?? 70,
      topUpPercent: snapshot.topUpPercent as string | number ?? 80,
      sellOutPercent: snapshot.sellOutPercent as string | number ?? 90,
      crossCurrencyHaircutPercent: snapshot.crossCurrencyHaircutPercent as string | number | undefined,
    });
    if (metrics.marginStatus === 'NORMAL') return null;
    const adviceFailed = normalizeUpper(snapshot.adviceGenerationStatus, 'GENERATED') === 'FAILED';
    const values: JsonRecord = {
      case_id: optionalString(snapshot.caseId) ?? makeMlId(metrics.marginStatus === 'SELL_OUT' ? 'ML-SO' : 'ML-MC'),
      facility_group_id: optionalString(snapshot.facilityGroupId),
      base_number: assertRequired(snapshot.baseNumber, 'Snapshot base number'),
      portfolio_id: optionalString(snapshot.portfolioId),
      security_code: optionalString(snapshot.securityCode),
      case_level: optionalString(snapshot.securityCode) ? 'SECURITY' : 'PORTFOLIO',
      case_status: 'OPEN',
      margin_status: metrics.marginStatus,
      business_date: businessDate,
      market_value: toMoney(metrics.marketValue),
      gcmv_amount: toMoney(metrics.gcmvAmount),
      exposure_amount: toMoney(metrics.exposureAmount),
      ncmv_amount: toMoney(metrics.ncmvAmount),
      top_up_amount: toMoney(metrics.topUpAmount),
      sell_out_amount: toMoney(metrics.sellOutAmount),
      shortfall_amount: toMoney(metrics.shortfallAmount),
      advice_reference: adviceFailed ? undefined : optionalString(snapshot.adviceReference) ?? makeMlId('ML-ADV'),
      advice_status: adviceFailed ? 'FAILED' : 'GENERATED',
      notice_due_date: noticePeriodDays > 0 ? addDaysIso(businessDate, noticePeriodDays) : undefined,
      source_payload: adviceFailed ? { ...snapshot, errorCode: 'ML_ADVICE_GENERATION_FAILED' } : snapshot,
      created_by: userId,
    };
    const row = await insertReturning(schema.mlMarginCallCases, values);
    await this.logAuditEvent({ entityType: 'ML_MARGIN_CALL_CASE', entityId: String(values.case_id), action: metrics.marginStatus, actorUserId: userId, afterPayload: values });
    return row;
  },

  async resolveNoticePeriodDays(data: JsonRecord, businessDate: string): Promise<number> {
    const inlineReferences = normalizeRecordArray(data.references ?? data.referenceSettings)
      .filter((row) => isAuthorizedEffective(row, businessDate));
    let authorizedReferences = inlineReferences;
    if (authorizedReferences.length === 0) {
      const rows = await this.listReferences({ status: 'AUTHORIZED' }).catch(() => []);
      authorizedReferences = normalizeRecordArray(rows)
        .filter((row) => rowHasBusinessId(row, ['reference_id', 'referenceId']))
        .filter((row) => isAuthorizedEffective(row, businessDate));
    }
    const noticeReference = authorizedReferences.find((row) => normalizeUpper(row.reference_type ?? row.referenceType, '') === 'MARGIN_CALL_NOTICE_PERIOD');
    const referenceDays = rowNumber(noticeReference ?? {}, 'reference_value_numeric', 'referenceValueNumeric')
      ?? rowNumber(noticeReference ?? {}, 'reference_value', 'referenceValue');
    if (referenceDays !== undefined) {
      if (!Number.isInteger(referenceDays) || referenceDays <= 0) throw new ValidationError('ML_NOTICE_PERIOD_INVALID');
      return referenceDays;
    }
    const requestedDays = data.noticePeriodDays === undefined ? 0 : asNumber(data.noticePeriodDays as string | number);
    if (!Number.isInteger(requestedDays) || requestedDays < 0) throw new ValidationError('ML_NOTICE_PERIOD_INVALID');
    return requestedDays;
  },

  async processMarginCallSnapshots(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const businessDate = optionalString(data.businessDate) ?? todayIso();
    const snapshots = Array.isArray(data.portfolioSnapshots) ? data.portfolioSnapshots as JsonRecord[] : [];
    if (snapshots.length === 0) throw new ValidationError('At least one portfolio snapshot is required');
    const noticePeriodDays = await this.resolveNoticePeriodDays(data, businessDate);
    const generatedCases: JsonRecord[] = [];
    const failedSnapshots: JsonRecord[] = [];
    for (const snapshot of snapshots) {
      try {
        const generated = await this.createMarginCallCaseFromSnapshot(snapshot, businessDate, userId, noticePeriodDays);
        if (generated) generatedCases.push(generated);
      } catch (err) {
        failedSnapshots.push({
          snapshot,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const result = {
      processId: makeMlId('ML-MCP'),
      businessDate,
      noticePeriodDays,
      processedCount: snapshots.length,
      generatedCount: generatedCases.length,
      failedCount: failedSnapshots.length,
      generatedCases,
      failedSnapshots,
    };
    await this.logAuditEvent({ entityType: 'ML_MARGIN_CALL_PROCESS', entityId: result.processId, action: 'RUN', actorUserId: userId, afterPayload: result });
    return result;
  },

  async updateMarginCallCase(caseId: string, data: JsonRecord, userId: string): Promise<JsonRecord> {
    const actionType = normalizeUpper(data.actionType ?? data.updateType, 'DUE');
    if (!['DEFERRAL', 'DUE', 'MANUAL_CLOSURE'].includes(actionType)) {
      throw new ValidationError('Margin-call update type must be DEFERRAL, DUE, or MANUAL_CLOSURE');
    }
    const [existingRaw] = await (db as any).select().from(schema.mlMarginCallCases).where(eq(schema.mlMarginCallCases.case_id, caseId)).limit(1);
    const existing = existingRaw && typeof existingRaw === 'object' && rowHasBusinessId(existingRaw as JsonRecord, ['case_id', 'caseId'])
      ? existingRaw as JsonRecord
      : {};
    const deferralExpiryDate = optionalString(data.deferralExpiryDate);
    const reason = optionalString(data.reason);
    const remarks = optionalString(data.remarks);
    const closureEvidenceRef = optionalString(data.closureEvidenceRef);
    if (actionType === 'DEFERRAL' && (!deferralExpiryDate || !reason)) {
      throw new ValidationError('Deferral requires deferral expiry date and reason');
    }
    if (actionType === 'MANUAL_CLOSURE' && !remarks) {
      throw new ValidationError('Manual closure requires remarks');
    }
    const currentMarginStatus = normalizeUpper(existing.margin_status ?? data.marginStatus, 'NORMAL');
    const sellOutClosure = actionType === 'MANUAL_CLOSURE' && (currentMarginStatus === 'SELL_OUT' || data.sellOutCase === true || data.sellOutCase === 'true');
    if (sellOutClosure && !closureEvidenceRef) {
      throw new ValidationError('ML_SELL_OUT_CLOSURE_EVIDENCE_REQUIRED');
    }
    const closureEvidence = closureEvidenceRef ? {
      closureEvidenceRef,
      closureEvidenceType: optionalString(data.closureEvidenceType) ?? 'MANUAL_CLOSURE_DOCUMENT',
      closureApprovedBy: optionalString(data.closureApprovedBy),
      capturedAt: new Date().toISOString(),
    } : undefined;
    const actionValues: JsonRecord = {
      action_id: makeMlId('ML-MCA'),
      case_id: caseId,
      action_type: actionType,
      action_status: 'UNAUTHORIZED',
      deferral_expiry_date: deferralExpiryDate,
      reason,
      remarks,
      payload: data,
      created_by: userId,
    };
    await insertReturning(schema.mlMarginCallActions, actionValues);
    const caseValues: JsonRecord = {
      pending_action_type: actionType,
      last_action_by: userId,
      last_action_at: new Date(),
      deferral_expiry_date: actionType === 'DEFERRAL' ? deferralExpiryDate : undefined,
      closure_remarks: actionType === 'MANUAL_CLOSURE' ? remarks : undefined,
      source_payload: closureEvidence ? { ...asRecord(existing.source_payload ?? existing.sourcePayload), closureEvidence } : undefined,
      updated_by: userId,
      updated_at: new Date(),
    };
    const row = await updateReturning(schema.mlMarginCallCases, schema.mlMarginCallCases.case_id, caseId, caseValues);
    await this.logAuditEvent({ entityType: 'ML_MARGIN_CALL_CASE', entityId: caseId, action: actionType, actorUserId: userId, afterPayload: { ...caseValues, action: actionValues } });
    return row;
  },

  async decideMarginCallCase(caseId: string, data: JsonRecord, checkerUserId: string): Promise<JsonRecord> {
    const [existingRaw] = await (db as any).select().from(schema.mlMarginCallCases).where(eq(schema.mlMarginCallCases.case_id, caseId)).limit(1);
    const existing = ensureNonEmptyRow(existingRaw, 'ML Margin Call Case', caseId);
    validateMakerCheckerDecision({ makerUserId: optionalString(existing.last_action_by ?? existing.created_by), checkerUserId });
    const decision = normalizeUpper(data.decision, 'AUTHORIZE');
    const values: JsonRecord = decision === 'REJECT'
      ? { rejected_reason: optionalString(data.reason) ?? 'Rejected by checker', updated_by: checkerUserId, updated_at: new Date() }
      : {
          case_status: existing.pending_action_type === 'MANUAL_CLOSURE' ? 'MANUALLY_CLOSED' : existing.pending_action_type === 'DEFERRAL' ? 'DEFERRED' : 'DUE',
          authorized_by: checkerUserId,
          authorized_at: new Date(),
          updated_by: checkerUserId,
          updated_at: new Date(),
        };
    const row = await updateReturning(schema.mlMarginCallCases, schema.mlMarginCallCases.case_id, caseId, values);
    await this.logAuditEvent({ entityType: 'ML_MARGIN_CALL_CASE', entityId: caseId, action: decision === 'REJECT' ? 'REJECT' : 'AUTHORIZE', actorUserId: checkerUserId, beforePayload: existing, afterPayload: { ...existing, ...values }, decision, reason: optionalString(data.reason) });
    return row;
  },

  async runEod(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const jobId = assertRequired(data.jobId, 'EOD job ID');
    const jobType = normalizeUpper(data.jobType, 'MARGIN_CALL_PROCESS');
    const businessDate = optionalString(data.businessDate) ?? todayIso();
    const sourceStatus = normalizeUpper(data.sourceStatus, 'AVAILABLE');
    const snapshots = Array.isArray(data.portfolioSnapshots) ? data.portfolioSnapshots as JsonRecord[] : [];
    const existingRuns = await (db as any).select().from(schema.mlEodRuns).where(and(
      eq(schema.mlEodRuns.job_id, jobId),
      eq(schema.mlEodRuns.job_type, jobType),
      eq(schema.mlEodRuns.business_date, businessDate),
      eq(schema.mlEodRuns.is_deleted, false),
    )).limit(1).catch(() => []);
    const existingRun = normalizeRecordArray(existingRuns).find((row) => rowHasBusinessId(row, ['eod_run_id', 'eodRunId']));
    if (existingRun) {
      await this.logAuditEvent({ entityType: 'ML_EOD_RUN', entityId: String(existingRun.eod_run_id ?? existingRun.eodRunId), action: 'IDEMPOTENT_REPLAY', actorUserId: userId, afterPayload: existingRun });
      return { ...existingRun, idempotentReplay: true };
    }
    const noticePeriodDays = await this.resolveNoticePeriodDays(data, businessDate);
    if (sourceStatus !== 'AVAILABLE') {
      const failedValues: JsonRecord = {
        eod_run_id: makeMlId('ML-EOD'),
        job_id: jobId,
        job_type: jobType,
        business_date: businessDate,
        run_status: 'FAILED',
        completed_at: new Date(),
        processed_count: 0,
        failed_count: snapshots.length || 1,
        error_reason: 'ML_SOURCE_OUTAGE',
        source_status: sourceStatus,
        result_payload: {
          notification: 'Source outage marks EOD failed and does not publish new margin statuses.',
          operationsNotification: {
            notificationId: makeMlId('ML-NOTIF'),
            eventType: 'SOURCE_OUTAGE',
            jobId,
            jobType,
            businessDate,
            sourceStatus,
          },
        },
        created_by: userId,
      };
      await insertReturning(schema.mlEodRuns, failedValues);
      await this.logAuditEvent({ entityType: 'ML_EOD_RUN', entityId: String(failedValues.eod_run_id), action: 'FAILED', actorUserId: userId, afterPayload: failedValues });
      await this.logAuditEvent({ entityType: 'ML_OPERATIONS_NOTIFICATION', entityId: String((failedValues.result_payload as JsonRecord).operationsNotification ? ((failedValues.result_payload as JsonRecord).operationsNotification as JsonRecord).notificationId : failedValues.eod_run_id), action: 'SOURCE_OUTAGE', actorUserId: userId, afterPayload: failedValues.result_payload });
      return failedValues;
    }

    const authorizedRuleSets = await this.loadAuthorizedRuleSets(data, businessDate);
    const loanableValueHierarchy = (jobType === 'LTV_LOGIC' || jobType === 'MARGIN_CALL_PROCESS')
      ? snapshots.map((snapshot) => ({
          baseNumber: optionalString(snapshot.baseNumber),
          securityCode: optionalString(snapshot.securityCode),
          assetClass: optionalString(snapshot.assetClass),
          ruleResolution: this.resolveAuthorizedRuleHierarchy({
            ...data,
            ...snapshot,
            ...authorizedRuleSets,
            businessDate,
            baseNumber: optionalString(snapshot.baseNumber),
            securityCode: optionalString(snapshot.securityCode),
            assetClass: optionalString(snapshot.assetClass),
            assetCurrency: optionalString(snapshot.assetCurrency ?? data.assetCurrency),
            facilityCurrency: optionalString(snapshot.facilityCurrency ?? snapshot.currency ?? data.facilityCurrency ?? data.currency),
          }),
        }))
      : [];
    const generatedCases: JsonRecord[] = [];
    let failedCount = 0;
    for (const snapshot of snapshots) {
      try {
        const facilityGroupId = optionalString(snapshot.facilityGroupId);
        const persistedLinks = facilityGroupId && normalizeRecordArray(snapshot.portfolioLinks).length === 0
          ? normalizeRecordArray(await this.listPortfolioLinks({ facilityGroupId, status: 'AUTHORIZED' }).catch(() => []))
            .filter((row) => rowHasBusinessId(row, ['portfolio_link_id', 'portfolioLinkId']))
          : [];
        const snapshotWithLinks = persistedLinks.length > 0 ? { ...snapshot, portfolioLinks: persistedLinks } : snapshot;
        const generated = await this.createMarginCallCaseFromSnapshot(snapshotWithLinks, businessDate, userId, noticePeriodDays);
        if (generated) generatedCases.push(generated);
      } catch (err) {
        failedCount += 1;
        await this.logAuditEvent({
          entityType: 'ML_EOD_RUN',
          entityId: jobId,
          action: 'SNAPSHOT_FAILED',
          actorUserId: userId,
          afterPayload: { snapshot, error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    const values: JsonRecord = {
      eod_run_id: makeMlId('ML-EOD'),
      job_id: jobId,
      job_type: jobType,
      business_date: businessDate,
      run_status: failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      completed_at: new Date(),
      processed_count: snapshots.length,
      failed_count: failedCount,
      source_status: sourceStatus,
      result_payload: {
        generatedCases,
        noticePeriodDays,
        loanableValueHierarchy,
        ltvLogicRefreshed: loanableValueHierarchy.length > 0,
        partialStatusPublished: false,
      },
      created_by: userId,
    };
    const row = await insertReturning(schema.mlEodRuns, values);
    await this.logAuditEvent({ entityType: 'ML_EOD_RUN', entityId: String(values.eod_run_id), action: 'RUN', actorUserId: userId, afterPayload: values });
    return { ...row, generatedCases };
  },

  async listEodRuns(params: { status?: string } = {}): Promise<JsonRecord[]> {
    const conditions = [eq(schema.mlEodRuns.is_deleted, false)];
    if (params.status) conditions.push(eq(schema.mlEodRuns.run_status, normalizeUpper(params.status, params.status)));
    return (db as any).select().from(schema.mlEodRuns).where(and(...conditions)).orderBy(desc(schema.mlEodRuns.started_at)).limit(100);
  },

  async runSimulation(data: JsonRecord, userId: string): Promise<JsonRecord> {
    const simulationType = normalizeUpper(data.simulationType, 'CUSTOMER');
    if (simulationType !== 'CUSTOMER') throw new ValidationError('Simulation type must be CUSTOMER');
    const baseNumber = assertRequired(data.baseNumber, 'Base number');
    const businessDate = optionalString(data.businessDate) ?? todayIso();
    const before = asRecord(data.beforeMetrics);
    if (Object.keys(before).length === 0) {
      throw new ValidationError('Invalid simulation payload: beforeMetrics are required');
    }
    const authorizedRuleSets = await this.loadAuthorizedRuleSets(data, businessDate);
    const ruleResolution = this.resolveAuthorizedRuleHierarchy({
      ...data,
      ...authorizedRuleSets,
      businessDate,
      baseNumber,
      securityCode: optionalString(data.securityCode ?? before.securityCode),
      assetClass: optionalString(data.assetClass ?? before.assetClass),
      assetCurrency: optionalString(data.assetCurrency ?? before.assetCurrency),
      facilityCurrency: optionalString(data.facilityCurrency ?? data.currency ?? before.facilityCurrency ?? before.currency),
      ltvPercent: before.ltvPercent as string | number | undefined ?? data.ltvPercent as string | number | undefined ?? 70,
      topUpPercent: before.topUpPercent as string | number | undefined ?? data.topUpPercent as string | number | undefined ?? 80,
      sellOutPercent: before.sellOutPercent as string | number | undefined ?? data.sellOutPercent as string | number | undefined ?? 90,
      crossCurrencyHaircutPercent: before.crossCurrencyHaircutPercent as string | number | undefined ?? data.crossCurrencyHaircutPercent as string | number | undefined,
    });
    const beforeMetrics = this.calculateMarginMetrics({
      marketValue: before.marketValue as string | number ?? 0,
      exposureAmount: before.exposureAmount as string | number ?? 0,
      ltvPercent: ruleResolution.ltvPercent,
      topUpPercent: ruleResolution.topUpPercent,
      sellOutPercent: ruleResolution.sellOutPercent,
      crossCurrencyHaircutPercent: ruleResolution.crossCurrencyHaircutPercent,
    });
    const after = asRecord(data.afterMetrics);
    const afterInput = Object.keys(after).length > 0
      ? after
      : this.applySimulationActions({
          marketValue: beforeMetrics.marketValue,
          exposureAmount: beforeMetrics.exposureAmount,
          ltvPercent: beforeMetrics.ltvPercent,
          topUpPercent: beforeMetrics.topUpPercent,
          sellOutPercent: beforeMetrics.sellOutPercent,
          crossCurrencyHaircutPercent: beforeMetrics.crossCurrencyHaircutPercent,
        }, data);
    const afterMetrics = this.calculateMarginMetrics({
      marketValue: afterInput.marketValue as string | number ?? beforeMetrics.marketValue,
      exposureAmount: afterInput.exposureAmount as string | number ?? beforeMetrics.exposureAmount,
      ltvPercent: ruleResolution.ltvPercent,
      topUpPercent: ruleResolution.topUpPercent,
      sellOutPercent: ruleResolution.sellOutPercent,
      crossCurrencyHaircutPercent: ruleResolution.crossCurrencyHaircutPercent,
    });
    const comparisonPayload: JsonRecord = {
      gcmvDelta: Number((afterMetrics.gcmvAmount - beforeMetrics.gcmvAmount).toFixed(4)),
      ncmvDelta: Number((afterMetrics.ncmvAmount - beforeMetrics.ncmvAmount).toFixed(4)),
      exposureDelta: Number((afterMetrics.exposureAmount - beforeMetrics.exposureAmount).toFixed(4)),
      availableDrawingPowerDelta: Number((afterMetrics.availableDrawingPower - beforeMetrics.availableDrawingPower).toFixed(4)),
      beforeStatus: beforeMetrics.marginStatus,
      afterStatus: afterMetrics.marginStatus,
      actionSemanticsApplied: Object.keys(after).length === 0,
      ruleResolution,
      widgets: {
        assets: normalizeRecordArray(data.assets ?? data.assetActions),
        exposures: normalizeRecordArray(data.exposures ?? data.exposureActions),
        exposure: { before: beforeMetrics.exposureAmount, after: afterMetrics.exposureAmount },
        gcmv: { before: beforeMetrics.gcmvAmount, after: afterMetrics.gcmvAmount },
        creditView: {
          grid: [beforeMetrics, afterMetrics],
          summaryChart: [
            { label: 'Before', value: beforeMetrics.gcmvAmount },
            { label: 'After', value: afterMetrics.gcmvAmount },
          ],
          detailsChart: [
            { label: 'NCMV', before: beforeMetrics.ncmvAmount, after: afterMetrics.ncmvAmount },
            { label: 'Exposure', before: beforeMetrics.exposureAmount, after: afterMetrics.exposureAmount },
          ],
        },
      },
    };
    const values: JsonRecord = {
      simulation_id: makeMlId('ML-SIM'),
      simulation_type: simulationType,
      base_number: baseNumber,
      facility_group_id: optionalString(data.facilityGroupId),
      business_date: businessDate,
      input_payload: data,
      before_metrics: beforeMetrics as unknown as JsonRecord,
      after_metrics: afterMetrics as unknown as JsonRecord,
      comparison_payload: comparisonPayload,
      run_status: 'COMPLETED',
      created_by: userId,
    };
    const row = await insertReturning(schema.mlSimulationRuns, values);
    await this.logAuditEvent({ entityType: 'ML_SIMULATION_RUN', entityId: String(values.simulation_id), action: 'SIMULATE', actorUserId: userId, afterPayload: values });
    return { ...row, comparisonPayload };
  },

  async listSimulationRuns(): Promise<JsonRecord[]> {
    return (db as any).select().from(schema.mlSimulationRuns).where(eq(schema.mlSimulationRuns.is_deleted, false)).orderBy(desc(schema.mlSimulationRuns.created_at)).limit(100);
  },

  async getReport(reportCode: string, filters: JsonRecord, userId: string): Promise<JsonRecord> {
    const code = normalizeUpper(reportCode, 'PRODUCT_DETAILS');
    const generatedAt = new Date().toISOString();
    let rows: JsonRecord[] = [];
    let columns: string[] = [];
    if (code === 'PRODUCT_DETAILS') {
      const [attributes, scrips, assets] = await Promise.all([
        this.listAttributeSettings({ status: filters.status as string | undefined }),
        this.listScripSettings({ status: filters.status as string | undefined }),
        this.listAssetSettings({ status: filters.status as string | undefined }),
      ]);
      rows = [
        ...normalizeRecordArray(attributes).map((row) => ({
          product_level: 'ATTRIBUTE',
          product_id: row.setting_id,
          asset_class: row.asset_class,
          security_code: '',
          base_number: '',
          ltv_percent: row.ltv_percent,
          top_up_percent: row.top_up_percent,
          sell_out_percent: row.sell_out_percent,
          record_status: row.record_status,
        })),
        ...normalizeRecordArray(scrips).map((row) => ({
          product_level: 'SCRIP',
          product_id: row.scrip_setting_id,
          asset_class: '',
          security_code: row.security_code,
          base_number: '',
          ltv_percent: row.ltv_percent,
          top_up_percent: row.top_up_percent,
          sell_out_percent: row.sell_out_percent,
          record_status: row.record_status,
        })),
        ...normalizeRecordArray(assets).map((row) => ({
          product_level: 'ASSET',
          product_id: row.asset_setting_id,
          asset_class: '',
          security_code: row.security_code,
          base_number: row.base_number,
          ltv_percent: row.ltv_percent,
          top_up_percent: row.top_up_percent,
          sell_out_percent: row.sell_out_percent,
          record_status: row.record_status,
        })),
      ];
      columns = ['product_level', 'product_id', 'asset_class', 'security_code', 'base_number', 'ltv_percent', 'top_up_percent', 'sell_out_percent', 'record_status'];
    } else if (code === 'AUDIT_TRAIL') {
      rows = await this.listAuditEvents({ entityType: filters.entityType as string | undefined });
      columns = ['event_id', 'entity_type', 'entity_id', 'action', 'actor_user_id', 'event_time'];
    } else if (code === 'LIST_OF_FACILITIES') {
      const facilities = await this.listFacilities({
        facilityGroupId: filters.facilityGroupId as string | undefined,
        assetClass: filters.assetClass as string | undefined,
        subAssetClass: filters.subAssetClass as string | undefined,
        currency: filters.currency as string | undefined,
        status: filters.status as string | undefined,
      });
      rows = normalizeRecordArray(facilities).map((row) => {
        const payload = asRecord(row.payload);
        const marketValue = asNumber(row.market_value as string | number | undefined ?? row.marketValue as string | number | undefined ?? payload.marketValue as string | number | undefined, 0);
        const exposureAmount = asNumber(row.utilized_amount as string | number | undefined ?? row.utilizedAmount as string | number | undefined, 0);
        const metrics = marketValue > 0 ? this.calculateMarginMetrics({
          marketValue,
          exposureAmount,
          ltvPercent: payload.ltvPercent as string | number | undefined ?? filters.ltvPercent as string | number | undefined ?? 70,
          topUpPercent: payload.topUpPercent as string | number | undefined ?? filters.topUpPercent as string | number | undefined ?? 80,
          sellOutPercent: payload.sellOutPercent as string | number | undefined ?? filters.sellOutPercent as string | number | undefined ?? 90,
          crossCurrencyHaircutPercent: payload.crossCurrencyHaircutPercent as string | number | undefined ?? filters.crossCurrencyHaircutPercent as string | number | undefined,
        }) : undefined;
        return {
          ...row,
          market_value: toMoney(metrics?.marketValue ?? marketValue) ?? '0.0000',
          exposure_amount: toMoney(metrics?.exposureAmount ?? exposureAmount) ?? '0.0000',
          ncmv_amount: toMoney(metrics?.ncmvAmount ?? asNumber(row.available_amount as string | number | undefined, 0)) ?? '0.0000',
          margin_amount_required: toMoney(metrics?.shortfallAmount ?? 0) ?? '0.0000',
          margin_status: metrics?.marginStatus ?? 'UNASSESSED',
        };
      });
      columns = ['facility_id', 'facility_group_id', 'asset_class', 'sub_asset_class', 'currency', 'limit_amount', 'utilized_amount', 'available_amount', 'market_value', 'exposure_amount', 'ncmv_amount', 'margin_amount_required', 'margin_status', 'facility_status'];
    } else if (code === 'MARGIN_CALL_PORTFOLIO' || code === 'MARGIN_CALL_SECURITY') {
      const asOfDate = optionalString(filters.asOfDate) ?? todayIso();
      rows = normalizeRecordArray(await this.listMarginCallCases({ status: filters.status as string | undefined, baseNumber: filters.baseNumber as string | undefined }))
        .map((row) => ({
          ...row,
          days_overdue: daysOverdueFrom(row.notice_due_date ?? row.noticeDueDate, asOfDate),
        }));
      columns = ['case_id', 'case_level', 'market_value', 'gcmv_amount', 'exposure_amount', 'ncmv_amount', 'margin_status', 'shortfall_amount', 'notice_due_date', 'days_overdue'];
    } else if (code === 'RATING_MAINTENANCE') {
      rows = await this.listScripSettings({ status: filters.status as string | undefined });
      columns = ['scrip_setting_id', 'security_code', 'security_name', 'issuer_code', 'record_status'];
    } else if (code === 'LEVERAGED_CLIENT_VIEW') {
      rows = await this.listFacilityGroups({ status: filters.status as string | undefined });
      columns = ['facility_group_id', 'base_number', 'base_name', 'limit_amount', 'utilized_amount', 'available_drawing_power'];
    } else {
      throw new ValidationError(`Unsupported ML report code: ${reportCode}`);
    }
    const totals = columns.reduce((acc: JsonRecord, column) => {
      if (!['market_value', 'gcmv_amount', 'exposure_amount', 'ncmv_amount', 'shortfall_amount', 'margin_amount_required', 'limit_amount', 'utilized_amount', 'available_amount'].includes(column)) return acc;
      acc[column] = Number(rows.reduce((sum, row) => sum + asNumber(row[column] as string | number | undefined, 0), 0).toFixed(4));
      return acc;
    }, {});
    const report = {
      reportCode: code,
      generatedAt,
      generatedBy: userId,
      filters,
      csvExportAvailable: true,
      csvHeaders: columns,
      rowCount: rows.length,
      totals,
      rows,
    };
    await this.logAuditEvent({ entityType: 'ML_REPORT', entityId: code, action: 'EXPORT', actorUserId: userId, afterPayload: report });
    return report;
  },

  async renderReportCsv(reportCode: string, filters: JsonRecord, userId: string): Promise<JsonRecord> {
    const report = await this.getReport(reportCode, filters, userId);
    const columns = Array.isArray(report.csvHeaders) ? report.csvHeaders as string[] : [];
    const rows = normalizeRecordArray(report.rows);
    const content = [
      columns.map(csvEscape).join(','),
      ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
    ].join('\n');
    return {
      fileName: `${String(report.reportCode).toLowerCase()}-${todayIso()}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content,
      report,
    };
  },

  async listAuditEvents(params: { entityType?: string } = {}): Promise<JsonRecord[]> {
    const conditions = [eq(schema.mlAuditEvents.is_deleted, false)];
    if (params.entityType) conditions.push(eq(schema.mlAuditEvents.entity_type, normalizeUpper(params.entityType, params.entityType)));
    return (db as any).select().from(schema.mlAuditEvents).where(and(...conditions)).orderBy(desc(schema.mlAuditEvents.event_time)).limit(100);
  },

  async getSummary(): Promise<JsonRecord> {
    const [
      pendingMaintenance,
      authorizedFacilityGroups,
      openMarginCalls,
      openSellOuts,
      eodFailures,
      simulations,
    ] = await Promise.all([
      countRows(schema.mlAttributeSettings, schema.mlAttributeSettings.record_status, 'UNAUTHORIZED'),
      countRows(schema.mlFacilityGroups, schema.mlFacilityGroups.record_status, 'AUTHORIZED'),
      countRows(schema.mlMarginCallCases, schema.mlMarginCallCases.margin_status, 'MARGIN_CALL'),
      countRows(schema.mlMarginCallCases, schema.mlMarginCallCases.margin_status, 'SELL_OUT'),
      countRows(schema.mlEodRuns, schema.mlEodRuns.run_status, 'FAILED'),
      countRows(schema.mlSimulationRuns),
    ]);
    return {
      pendingMaintenance,
      authorizedFacilityGroups,
      openMarginCalls,
      openSellOuts,
      eodFailures,
      simulations,
      serviceStatus: 'READY',
      refreshedAt: new Date().toISOString(),
    };
  },
};
