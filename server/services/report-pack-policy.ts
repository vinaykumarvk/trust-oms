import crypto from 'crypto';

export interface ReportPackRecipient {
  recipient_type: string;
  recipient_id: string;
}

export function buildReportPackRunId(templateId: number, requestedAt: Date = new Date()): string {
  const stamp = requestedAt.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `RPK-${templateId}-${stamp}-${random}`;
}

export function stableReportPayloadHash(payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload ?? {}))
    .digest('hex');
}

export function buildReportOutputReference(
  runId: string,
  reportType: string,
  outputFormat: string,
): string {
  const safeReport = reportType.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return `report-packs/${runId}/${safeReport}.${outputFormat.toLowerCase()}`;
}

export function calculateRetentionUntil(years: number, from: Date = new Date()): string {
  const safeYears = Number.isFinite(years) && years > 0 ? Math.floor(years) : 7;
  const retention = new Date(from);
  retention.setFullYear(retention.getFullYear() + safeYears);
  return retention.toISOString().split('T')[0];
}

export function nextReportPackRetryAt(
  retryCount: number,
  backoffMinutes = 15,
  from: Date = new Date(),
): Date {
  const multiplier = Math.max(1, retryCount + 1);
  return new Date(from.getTime() + multiplier * backoffMinutes * 60 * 1000);
}

export function normalizeReportRecipients(value: unknown): ReportPackRecipient[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((recipient) => {
      const record = recipient as Record<string, unknown>;
      return {
        recipient_type: String(record.recipient_type ?? record.type ?? '').trim(),
        recipient_id: String(record.recipient_id ?? record.id ?? '').trim(),
      };
    })
    .filter((recipient) => recipient.recipient_type && recipient.recipient_id);
}

export function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((entry) => String(entry).trim().toUpperCase())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

export function estimateReportRowCount(report: unknown): number {
  const record = report as Record<string, unknown>;
  const data = record?.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return 0;
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value.length;
  }
  return 1;
}
