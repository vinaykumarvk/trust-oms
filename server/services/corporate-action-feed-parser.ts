/**
 * Corporate action feed parsers.
 *
 * This module intentionally has no database dependency. It normalizes external
 * feed payloads into the existing corporate action ingestion contract and
 * returns validation errors instead of mutating application state.
 */

export type CorporateActionFeedFormat =
  | 'NORMALIZED_JSON'
  | 'PSE_EDGE_JSON'
  | 'ISO20022_CA_EVENT'
  | 'SWIFT_MT564'
  | 'DTCC_GCAV_CSV';

export interface CorporateActionFeedInput {
  sourceSystem: string;
  format: CorporateActionFeedFormat;
  payload: unknown;
}

export interface NormalizedCorporateActionFeedEvent {
  externalEventId: string | null;
  securityId: number | null;
  externalSecurityId: string | null;
  type: string | null;
  exDate: string | null;
  recordDate: string | null;
  paymentDate: string | null;
  ratio: string | null;
  amountPerShare: string | null;
  electionDeadline: string | null;
  source: string;
  calendarKey: string | null;
}

export interface CorporateActionFeedParseResult {
  normalized: NormalizedCorporateActionFeedEvent;
  validationErrors: string[];
}

const TYPE_MAP: Record<string, string> = {
  DVCA: 'DIVIDEND_CASH',
  CASH_DIVIDEND: 'DIVIDEND_CASH',
  DIVIDEND_CASH: 'DIVIDEND_CASH',
  DVSE: 'DIVIDEND_STOCK',
  STOCK_DIVIDEND: 'DIVIDEND_STOCK',
  BONU: 'BONUS_ISSUE',
  BONUS: 'BONUS_ISSUE',
  SPLF: 'SPLIT',
  SPLIT: 'SPLIT',
  RHTS: 'RIGHTS',
  RIGHTS: 'RIGHTS',
  INTR: 'COUPON',
  COUPON: 'COUPON',
  REDM: 'FULL_REDEMPTION',
  MATURITY: 'MATURITY',
  TEND: 'TENDER',
  TENDER: 'TENDER',
  MRGR: 'MERGER',
  MERGER: 'MERGER',
};

const SUPPORTED_CA_TYPES = new Set([
  'DIVIDEND_CASH', 'DIVIDEND_STOCK', 'BONUS_ISSUE', 'SPLIT', 'REVERSE_SPLIT', 'CONSOLIDATION',
  'COUPON', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION', 'MATURITY',
  'CAPITAL_DISTRIBUTION', 'CAPITAL_GAINS_DISTRIBUTION', 'RETURN_OF_CAPITAL',
  'NAME_CHANGE', 'ISIN_CHANGE', 'TICKER_CHANGE', 'PAR_VALUE_CHANGE', 'SECURITY_RECLASSIFICATION',
  'RIGHTS', 'TENDER', 'BUYBACK', 'DUTCH_AUCTION', 'EXCHANGE_OFFER', 'WARRANT_EXERCISE', 'CONVERSION',
  'MERGER', 'PROXY_VOTE', 'CLASS_ACTION',
  'DIVIDEND_WITH_OPTION', 'MERGER_WITH_ELECTION', 'SPINOFF_WITH_OPTION',
  'BONUS', 'TENDER_OFFER',
]);

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: unknown): string | null {
  const str = stringValue(value);
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{8}$/.test(str)) return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  return str;
}

function normalizeType(value: unknown): string | null {
  const raw = stringValue(value)?.toUpperCase().replace(/[\s-]+/g, '_') ?? null;
  if (!raw) return null;
  return TYPE_MAP[raw] ?? raw;
}

function buildBase(sourceSystem: string): NormalizedCorporateActionFeedEvent {
  return {
    externalEventId: null,
    securityId: null,
    externalSecurityId: null,
    type: null,
    exDate: null,
    recordDate: null,
    paymentDate: null,
    ratio: null,
    amountPerShare: null,
    electionDeadline: null,
    source: sourceSystem,
    calendarKey: 'PH',
  };
}

function parseNormalizedJson(input: CorporateActionFeedInput): NormalizedCorporateActionFeedEvent {
  const p = asRecord(input.payload);
  return {
    ...buildBase(input.sourceSystem),
    externalEventId: stringValue(p.externalEventId ?? p.external_event_id ?? p.eventId ?? p.event_id),
    securityId: numberValue(p.securityId ?? p.security_id),
    externalSecurityId: stringValue(p.externalSecurityId ?? p.external_security_id ?? p.isin ?? p.security_code),
    type: normalizeType(p.type ?? p.ca_type ?? p.event_type),
    exDate: normalizeDate(p.exDate ?? p.ex_date),
    recordDate: normalizeDate(p.recordDate ?? p.record_date),
    paymentDate: normalizeDate(p.paymentDate ?? p.payment_date),
    ratio: stringValue(p.ratio),
    amountPerShare: stringValue(p.amountPerShare ?? p.amount_per_share ?? p.cash_amount),
    electionDeadline: normalizeDate(p.electionDeadline ?? p.election_deadline),
    source: stringValue(p.source) ?? input.sourceSystem,
    calendarKey: stringValue(p.calendarKey ?? p.calendar_key) ?? 'PH',
  };
}

function parsePseEdgeJson(input: CorporateActionFeedInput): NormalizedCorporateActionFeedEvent {
  const p = asRecord(input.payload);
  return {
    ...buildBase(input.sourceSystem),
    externalEventId: stringValue(p.disclosure_id ?? p.event_id ?? p.reference_no),
    securityId: numberValue(p.security_id),
    externalSecurityId: stringValue(p.isin ?? p.stock_symbol ?? p.security_code),
    type: normalizeType(p.action_type ?? p.ca_type ?? p.event_type),
    exDate: normalizeDate(p.ex_date ?? p.exDate),
    recordDate: normalizeDate(p.record_date ?? p.recordDate),
    paymentDate: normalizeDate(p.payment_date ?? p.paymentDate),
    ratio: stringValue(p.ratio ?? p.stock_ratio),
    amountPerShare: stringValue(p.cash_amount ?? p.amount_per_share),
    electionDeadline: normalizeDate(p.election_deadline),
    source: input.sourceSystem,
    calendarKey: 'PH',
  };
}

function parseIso20022Json(input: CorporateActionFeedInput): NormalizedCorporateActionFeedEvent {
  const p = asRecord(input.payload);
  const root = asRecord(p.CorpActnNtfctn ?? p.corporate_action_notification ?? p);
  const general = asRecord(root.CorpActnGnlInf ?? root.general_information);
  const notification = asRecord(root.NtfctnGnlInf ?? root.notification);
  const details = asRecord(root.CorpActnDtls ?? root.details);
  const security = asRecord(root.UndrlygScty ?? root.security);
  const dates = asRecord(details.Dates ?? details.dates);
  const amountDetails = asRecord(details.RateAndAmtDtls ?? details.amounts);
  const ratioDetails = asRecord(details.RatioDtls ?? details.ratios);

  return {
    ...buildBase(input.sourceSystem),
    externalEventId: stringValue(notification.NtfctnId ?? notification.id ?? root.event_id),
    securityId: numberValue(root.securityId ?? root.security_id),
    externalSecurityId: stringValue(security.ISIN ?? security.isin ?? security.security_code),
    type: normalizeType(asRecord(general.EvtTp).Cd ?? general.event_type ?? root.event_type),
    exDate: normalizeDate(asRecord(dates.ExDt).Dt ?? details.ex_date),
    recordDate: normalizeDate(asRecord(dates.RcrdDt).Dt ?? details.record_date),
    paymentDate: normalizeDate(asRecord(dates.PmtDt).Dt ?? details.payment_date),
    ratio: stringValue(ratioDetails.Ratio ?? ratioDetails.ratio),
    amountPerShare: stringValue(amountDetails.Amt ?? amountDetails.amount_per_share),
    electionDeadline: normalizeDate(asRecord(dates.ElectnDdln).Dt ?? details.election_deadline),
    source: input.sourceSystem,
    calendarKey: 'PH',
  };
}

function parseSwiftMt564(input: CorporateActionFeedInput): NormalizedCorporateActionFeedEvent {
  const raw = String(input.payload ?? '');
  const event = buildBase(input.sourceSystem);

  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (line.includes('SECURITY_ID=')) event.securityId = numberValue(line.split('SECURITY_ID=')[1]);
    if (line.includes(':20C::CORP//')) event.externalEventId = stringValue(line.split(':20C::CORP//')[1]);
    if (line.includes(':22F::CAEV//')) event.type = normalizeType(line.split(':22F::CAEV//')[1]);
    if (line.includes(':98A::XDTE//')) event.exDate = normalizeDate(line.split(':98A::XDTE//')[1]);
    if (line.includes(':98A::RDTE//')) event.recordDate = normalizeDate(line.split(':98A::RDTE//')[1]);
    if (line.includes(':98A::PAYD//')) event.paymentDate = normalizeDate(line.split(':98A::PAYD//')[1]);
    if (line.includes(':98A::EARD//')) event.electionDeadline = normalizeDate(line.split(':98A::EARD//')[1]);
    if (line.includes(':35B:ISIN')) event.externalSecurityId = stringValue(line.split(':35B:ISIN')[1]);
    if (line.includes(':92A::GRSS//')) event.amountPerShare = stringValue(line.split(':92A::GRSS//')[1])?.replace(',', '.') ?? null;
    if (line.includes(':92A::RATO//')) event.ratio = stringValue(line.split(':92A::RATO//')[1])?.replace(',', '.') ?? null;
  }

  return event;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseDtccGcavCsv(input: CorporateActionFeedInput): NormalizedCorporateActionFeedEvent {
  const raw = String(input.payload ?? '');
  const [headerLine, dataLine] = raw.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine ?? '').map((h) => h.toLowerCase());
  const values = parseCsvLine(dataLine ?? '');
  const row: Record<string, string> = {};
  headers.forEach((h, idx) => {
    row[h] = values[idx] ?? '';
  });

  return {
    ...buildBase(input.sourceSystem),
    externalEventId: stringValue(row.event_id ?? row.eventid),
    securityId: numberValue(row.security_id),
    externalSecurityId: stringValue(row.isin ?? row.cusip),
    type: normalizeType(row.caev ?? row.event_type ?? row.action_type),
    exDate: normalizeDate(row.ex_date),
    recordDate: normalizeDate(row.record_date),
    paymentDate: normalizeDate(row.payment_date),
    ratio: stringValue(row.ratio),
    amountPerShare: stringValue(row.amount_per_share ?? row.cash_amount),
    electionDeadline: normalizeDate(row.election_deadline),
    source: input.sourceSystem,
    calendarKey: 'PH',
  };
}

function validate(event: NormalizedCorporateActionFeedEvent): string[] {
  const errors: string[] = [];
  if (!event.securityId) errors.push('securityId is required or security mapping is unresolved');
  if (!event.type) errors.push('type is required');
  if (event.type && !SUPPORTED_CA_TYPES.has(event.type)) errors.push(`unsupported corporate action type: ${event.type}`);
  if (!event.exDate) errors.push('exDate is required');
  if (!event.recordDate) errors.push('recordDate is required');
  for (const [field, value] of Object.entries({ exDate: event.exDate, recordDate: event.recordDate, paymentDate: event.paymentDate, electionDeadline: event.electionDeadline })) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${field} must be YYYY-MM-DD`);
  }
  return errors;
}

export function parseCorporateActionFeed(input: CorporateActionFeedInput): CorporateActionFeedParseResult {
  let normalized: NormalizedCorporateActionFeedEvent;
  switch (input.format) {
    case 'NORMALIZED_JSON':
      normalized = parseNormalizedJson(input);
      break;
    case 'PSE_EDGE_JSON':
      normalized = parsePseEdgeJson(input);
      break;
    case 'ISO20022_CA_EVENT':
      normalized = parseIso20022Json(input);
      break;
    case 'SWIFT_MT564':
      normalized = parseSwiftMt564(input);
      break;
    case 'DTCC_GCAV_CSV':
      normalized = parseDtccGcavCsv(input);
      break;
    default:
      normalized = buildBase(input.sourceSystem);
      normalized.source = input.sourceSystem;
      return { normalized, validationErrors: [`unsupported feed format: ${String(input.format)}`] };
  }

  return { normalized, validationErrors: validate(normalized) };
}
