/**
 * AuditDiffView — Side-by-side diff viewer for a single audit record.
 *
 * Shows old vs new values with color-coded changes:
 *   - Added fields in green
 *   - Removed fields in red
 *   - Modified fields in yellow
 *   - PII fields masked
 */

import type { MergedFieldConfig } from '@shared/entity-configs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditDiffViewProps {
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  piiFields?: string[];
  fieldConfigs?: MergedFieldConfig[];
}

interface DiffEntry {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  isPii: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskValue(val: string): string {
  if (!val || val === '-') return val;
  if (val.length <= 4) return '****';
  return val.slice(0, 2) + '*'.repeat(val.length - 4) + val.slice(-2);
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function computeDiff(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  piiFields: Set<string>,
  fieldConfigs: Map<string, MergedFieldConfig>,
): DiffEntry[] {
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  const entries: DiffEntry[] = [];

  for (const key of allKeys) {
    const hasOld = key in oldValues;
    const hasNew = key in newValues;
    const oldStr = formatValue(oldValues[key]);
    const newStr = formatValue(newValues[key]);
    const isPii = piiFields.has(key);
    const label = fieldConfigs.get(key)?.label ?? key;

    let type: DiffEntry['type'];
    if (!hasOld && hasNew) {
      type = 'added';
    } else if (hasOld && !hasNew) {
      type = 'removed';
    } else if (oldStr !== newStr) {
      type = 'modified';
    } else {
      type = 'unchanged';
    }

    // Skip unchanged fields to reduce noise
    if (type === 'unchanged') continue;

    entries.push({
      field: key,
      label,
      oldValue: isPii ? maskValue(oldStr) : oldStr,
      newValue: isPii ? maskValue(newStr) : newStr,
      type,
      isPii,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function rowBgClass(type: DiffEntry['type']): string {
  switch (type) {
    case 'added':
      return 'bg-green-50';
    case 'removed':
      return 'bg-red-50';
    case 'modified':
      return 'bg-yellow-50';
    default:
      return '';
  }
}

function typeLabel(type: DiffEntry['type']): { text: string; className: string } {
  switch (type) {
    case 'added':
      return { text: 'Added', className: 'text-green-700' };
    case 'removed':
      return { text: 'Removed', className: 'text-red-700' };
    case 'modified':
      return { text: 'Changed', className: 'text-yellow-700' };
    default:
      return { text: '', className: '' };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuditDiffView({
  oldValues,
  newValues,
  piiFields = [],
  fieldConfigs = [],
}: AuditDiffViewProps) {
  const piiSet = new Set(piiFields);
  const configMap = new Map(fieldConfigs.map((f) => [f.fieldName, f]));

  // Also mark fields from config that have piiSensitive
  for (const fc of fieldConfigs) {
    if (fc.piiSensitive) piiSet.add(fc.fieldName);
  }

  const diffs = computeDiff(oldValues, newValues, piiSet, configMap);

  if (diffs.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">No changes recorded.</p>
    );
  }

  return (
    <div className="rounded-md border text-sm">
      {/* Header */}
      <div className="grid grid-cols-4 gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div>Field</div>
        <div>Old Value</div>
        <div>New Value</div>
        <div>Change</div>
      </div>

      {/* Rows */}
      {diffs.map((entry) => {
        const badge = typeLabel(entry.type);
        return (
          <div
            key={entry.field}
            className={`grid grid-cols-4 gap-2 border-b px-3 py-2 last:border-b-0 ${rowBgClass(entry.type)}`}
          >
            <div className="font-medium">{entry.label}</div>
            <div className="break-all text-muted-foreground">
              {entry.type === 'added' ? '-' : entry.oldValue}
            </div>
            <div className="break-all">
              {entry.type === 'removed' ? '-' : entry.newValue}
            </div>
            <div className={`text-xs font-medium ${badge.className}`}>
              {badge.text}
              {entry.isPii && (
                <span className="ml-1 text-muted-foreground">(PII)</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
