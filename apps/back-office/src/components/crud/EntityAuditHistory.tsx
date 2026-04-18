/**
 * EntityAuditHistory — Timeline view of audit records for an entity.
 *
 * Fetches from `/api/v1/audit/:entityType/:entityId`, displays each record
 * with action, actor, timestamp, changes summary, and expandable diff view.
 * Shows hash-chain integrity indicator.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import type { MergedFieldConfig } from '@shared/entity-configs/types';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/components/ui/collapsible';
import { Skeleton } from '@ui/components/ui/skeleton';
import { AuditDiffView } from './AuditDiffView';
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  Shield,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityAuditHistoryProps {
  entityType: string;
  entityId: string | number;
  fieldConfigs?: MergedFieldConfig[];
}

interface AuditRecord {
  id: string | number;
  action: string;
  actor: string;
  timestamp: string;
  changesSummary?: string;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  hash: string;
  previousHash: string;
  hashValid?: boolean;
}

interface AuditResponse {
  records: AuditRecord[];
  chainIntegrity: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actionBadgeVariant(
  action: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = action.toLowerCase();
  if (lower === 'create' || lower === 'insert') return 'default';
  if (lower === 'delete' || lower === 'remove') return 'destructive';
  if (lower === 'update' || lower === 'edit') return 'secondary';
  return 'outline';
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityAuditHistory({
  entityType,
  entityId,
  fieldConfigs = [],
}: EntityAuditHistoryProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(new Set());

  const { data, isLoading, error } = useQuery<AuditResponse>({
    queryKey: ['audit', entityType, entityId],
    queryFn: () => apiRequest('GET', `/api/v1/audit/${entityType}/${entityId}`),
    enabled: !!entityType && !!entityId,
  });

  const toggleExpanded = (id: string | number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const piiFields = fieldConfigs.filter((f) => f.piiSensitive).map((f) => f.fieldName);

  // ---- Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // ---- Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load audit history: {(error as Error).message}
          </p>
        </CardContent>
      </Card>
    );
  }

  const records = data?.records ?? [];
  const chainIntegrity = data?.chainIntegrity ?? true;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Audit History</CardTitle>
        {/* Chain integrity indicator */}
        {records.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-muted-foreground" />
            {chainIntegrity ? (
              <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Chain valid
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                Chain broken
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {records.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No audit records found.
          </p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-4">
              {records.map((record) => {
                const isExpanded = expandedIds.has(record.id);
                return (
                  <Collapsible
                    key={record.id}
                    open={isExpanded}
                    onOpenChange={() => toggleExpanded(record.id)}
                  >
                    <div className="relative pl-8">
                      {/* Timeline dot */}
                      <div className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />

                      <CollapsibleTrigger className="flex w-full cursor-pointer items-start justify-between rounded-md p-2 text-left hover:bg-muted/50">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={actionBadgeVariant(record.action)}>
                              {record.action}
                            </Badge>
                            {record.hashValid === false && (
                              <Badge variant="destructive" className="text-xs">
                                <XCircle className="mr-1 h-3 w-3" />
                                Hash invalid
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {record.actor}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTimestamp(record.timestamp)}
                            </span>
                          </div>
                          {record.changesSummary && (
                            <p className="text-xs text-muted-foreground">
                              {record.changesSummary}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 pt-1">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="px-2 pb-2 pt-1">
                        <AuditDiffView
                          oldValues={record.oldValues}
                          newValues={record.newValues}
                          piiFields={piiFields}
                          fieldConfigs={fieldConfigs}
                        />
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
