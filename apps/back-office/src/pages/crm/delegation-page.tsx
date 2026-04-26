/**
 * Delegation Create & Manage Page (HAM Module)
 *
 * Provides two main sections:
 *   1. Create New Delegation -- entity selection (Lead/Prospect/Client) with
 *      checkboxes, delegate RM picker, date range, reason, and 90-day
 *      duration warning.
 *   2. Active Delegations table -- view, cancel, and extend existing
 *      delegations.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ui/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Badge } from "@ui/components/ui/badge";
import { Checkbox } from "@ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/components/ui/dialog";
import { toast } from "sonner";
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Auth helpers ---------- */

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch { /* ignored */ }
  return '';
}

async function fetcher<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

async function poster<T>(url: string, payload: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

/* ---------- Types ---------- */

interface DelegationEntity {
  entity_id: string;
  entity_name: string;
  current_rm: string;
  branch: string;
  aum: number;
}

interface EntityListResponse {
  data: DelegationEntity[];
  total: number;
  page: number;
  pageSize: number;
}

interface RMOption {
  id: string;
  name: string;
  branch: string;
}

interface RMListResponse {
  data: RMOption[];
}

interface ActiveDelegation {
  id: number;
  delegation_type: string;
  outgoing_rm: string;
  delegate_rm: string;
  start_date: string;
  end_date: string;
  status: string;
  days_remaining: number;
}

interface ActiveDelegationsResponse {
  data: ActiveDelegation[];
  total: number;
}

interface DelegationRequestPayload {
  entity_type: EntityTab;
  entity_ids: string[];
  delegate_rm_id: string;
  start_date: string;
  end_date: string;
  reason: string;
}

type EntityTab = "lead" | "prospect" | "client";

/* ---------- Constants ---------- */

const API = "/api/v1/ham";
const MAX_DELEGATION_DAYS = 90;

const ENTITY_ENDPOINTS: Record<EntityTab, string> = {
  lead: `${API}/delegation/leads`,
  prospect: `${API}/delegation/prospects`,
  client: `${API}/delegation/clients`,
};

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PENDING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  EXPIRED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  EXTENDED:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

/* ---------- Helpers ---------- */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

/* ========== Main Component ========== */

export default function DelegationPage() {
  const queryClient = useQueryClient();

  /* ---------- Create-form state ---------- */

  const [entityTab, setEntityTab] = useState<EntityTab>("lead");
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [delegateRmId, setDelegateRmId] = useState("");
  const [rmSearch, setRmSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  /* ---------- Active delegations state ---------- */

  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendTarget, setExtendTarget] = useState<ActiveDelegation | null>(
    null,
  );
  const [extendNewEndDate, setExtendNewEndDate] = useState("");
  const [extendReason, setExtendReason] = useState("");

  /* ---------- Queries ---------- */

  // Entity list for the create form
  const {
    data: entityResult,
    isPending: entityPending,
    isError: entityError,
  } = useQuery<EntityListResponse>({
    queryKey: ["delegation-entities", entityTab, entitySearch],
    queryFn: () =>
      fetcher<EntityListResponse>(
        `${ENTITY_ENDPOINTS[entityTab]}?search=${encodeURIComponent(entitySearch)}&page=1&pageSize=50`,
      ),
  });

  const entities: DelegationEntity[] = entityResult?.data ?? [];

  // RM list (searchable)
  const { data: rmResult, isPending: rmPending } = useQuery<RMListResponse>({
    queryKey: ["delegation-rms", rmSearch],
    queryFn: () =>
      fetcher<RMListResponse>(
        `${API}/rms?search=${encodeURIComponent(rmSearch)}`,
      ),
  });

  const rmOptions: RMOption[] = rmResult?.data ?? [];

  // Active delegations table
  const {
    data: activeResult,
    isPending: activePending,
    isError: activeError,
  } = useQuery<ActiveDelegationsResponse>({
    queryKey: ["delegation-active"],
    queryFn: () =>
      fetcher<ActiveDelegationsResponse>(`${API}/delegation/active`),
    refetchInterval: 30_000,
  });

  const activeDelegations: ActiveDelegation[] = activeResult?.data ?? [];

  /* ---------- Derived data ---------- */

  const selectedEntities = useMemo(
    () => entities.filter((e) => selectedIds.has(e.entity_id)),
    [entities, selectedIds],
  );

  const selectedAum = useMemo(
    () => selectedEntities.reduce((sum, e) => sum + (e.aum ?? 0), 0),
    [selectedEntities],
  );

  const durationDays =
    startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const durationExceeded = durationDays > MAX_DELEGATION_DAYS;

  const allChecked =
    entities.length > 0 &&
    entities.every((e) => selectedIds.has(e.entity_id));

  const canSubmit =
    selectedIds.size > 0 &&
    delegateRmId &&
    startDate &&
    endDate &&
    reason.trim().length > 0 &&
    durationDays > 0;

  /* ---------- Selection helpers ---------- */

  function toggleEntity(entityId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entities.map((e) => e.entity_id)));
    }
  }

  /* ---------- Reset form ---------- */

  function resetForm() {
    setSelectedIds(new Set());
    setDelegateRmId("");
    setRmSearch("");
    setStartDate("");
    setEndDate("");
    setReason("");
  }

  /* ---------- Mutations ---------- */

  // Create delegation
  const createMutation = useMutation({
    mutationFn: (payload: DelegationRequestPayload) =>
      poster(`${API}/delegation/request`, payload),
    onSuccess: () => {
      toast.success("Delegation request created successfully");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["delegation-active"] });
      queryClient.invalidateQueries({ queryKey: ["delegation-entities"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleCreate() {
    if (!canSubmit) return;

    createMutation.mutate({
      entity_type: entityTab,
      entity_ids: Array.from(selectedIds),
      delegate_rm_id: delegateRmId,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
    });
  }

  // Cancel delegation
  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      poster(`${API}/delegation/cancel/${id}`, {}),
    onSuccess: () => {
      toast.success("Delegation cancelled");
      queryClient.invalidateQueries({ queryKey: ["delegation-active"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Extend delegation
  const extendMutation = useMutation({
    mutationFn: ({
      id,
      new_end_date,
      reason: extReason,
    }: {
      id: number;
      new_end_date: string;
      reason: string;
    }) =>
      poster(`${API}/delegation/extend/${id}`, {
        new_end_date,
        reason: extReason,
      }),
    onSuccess: () => {
      toast.success("Delegation extended successfully");
      setExtendDialogOpen(false);
      setExtendTarget(null);
      setExtendNewEndDate("");
      setExtendReason("");
      queryClient.invalidateQueries({ queryKey: ["delegation-active"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openExtendDialog(delegation: ActiveDelegation) {
    setExtendTarget(delegation);
    setExtendNewEndDate("");
    setExtendReason("");
    setExtendDialogOpen(true);
  }

  function handleExtend() {
    if (!extendTarget || !extendNewEndDate || !extendReason.trim()) return;
    extendMutation.mutate({
      id: extendTarget.id,
      new_end_date: extendNewEndDate,
      reason: extendReason.trim(),
    });
  }

  /* ---------- Render: Entity selection table ---------- */

  function renderEntityTable() {
    if (entityError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <p className="font-medium">Failed to load {entityTab}s</p>
          <p className="text-sm">
            Please try again later or check your connection.
          </p>
        </div>
      );
    }

    if (entityPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Current RM</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">AUM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={6} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (entities.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <p>No {entityTab}s found</p>
          <p className="text-sm">
            {entitySearch
              ? "Try a different search term."
              : "No records are available."}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Current RM</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">AUM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entities.map((entity) => {
              const isSelected = selectedIds.has(entity.entity_id);
              return (
                <TableRow
                  key={entity.entity_id}
                  className={`cursor-pointer ${isSelected ? "bg-muted/50" : ""}`}
                  onClick={() => toggleEntity(entity.entity_id)}
                >
                  <TableCell
                    className="w-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleEntity(entity.entity_id)}
                      aria-label={`Select ${entity.entity_name}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {entity.entity_id}
                  </TableCell>
                  <TableCell className="font-medium">
                    {entity.entity_name}
                  </TableCell>
                  <TableCell className="text-sm">{entity.current_rm}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {entity.branch}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(entity.aum)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Delegation Management</h1>
        <p className="text-muted-foreground">
          Create temporary delegations and manage active delegation assignments
        </p>
      </div>

      {/* ================================================================ */}
      {/* SECTION 1: Create New Delegation                                 */}
      {/* ================================================================ */}

      <Card>
        <CardHeader>
          <CardTitle>Create New Delegation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Entity Type Tabs + Selection Grid */}
          <div>
            <label className="text-sm font-medium">
              Select Entities to Delegate
            </label>
            <Tabs
              value={entityTab}
              onValueChange={(v: string) => {
                setEntityTab(v as EntityTab);
                setSelectedIds(new Set());
                setEntitySearch("");
              }}
              className="mt-2"
            >
              <TabsList>
                <TabsTrigger value="lead">Lead</TabsTrigger>
                <TabsTrigger value="prospect">Prospect</TabsTrigger>
                <TabsTrigger value="client">Client</TabsTrigger>
              </TabsList>

              {(["lead", "prospect", "client"] as EntityTab[]).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-4 space-y-4">
                  {/* Search */}
                  <Input
                    placeholder={`Search ${tab}s by name or ID...`}
                    value={entitySearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEntitySearch(e.target.value)
                    }
                    className="max-w-sm"
                  />

                  {/* Entity table */}
                  {renderEntityTable()}

                  {/* Selected summary */}
                  {selectedIds.size > 0 && (
                    <div className="flex items-center gap-4 rounded-md border bg-muted/30 px-4 py-3 text-sm">
                      <span className="font-medium">
                        {selectedIds.size} {tab}(s) selected
                      </span>
                      <span className="text-muted-foreground">|</span>
                      <span>
                        Total AUM:{" "}
                        <span className="font-mono font-medium">
                          {formatCurrency(selectedAum)}
                        </span>
                      </span>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {/* Delegate RM + Date Range row */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Delegate RM */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Delegate RM *</label>
              <Input
                placeholder="Search RMs by name..."
                value={rmSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRmSearch(e.target.value)
                }
              />
              <Select value={delegateRmId} onValueChange={setDelegateRmId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      rmPending ? "Loading RMs..." : "Select delegate RM"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {rmOptions.length === 0 && !rmPending && (
                    <SelectItem value="__none" disabled>
                      No RMs found
                    </SelectItem>
                  )}
                  {rmOptions.map((rm) => (
                    <SelectItem key={rm.id} value={rm.id}>
                      {rm.name} ({rm.branch})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date *</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setStartDate(e.target.value)
                }
              />
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date *</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEndDate(e.target.value)
                }
              />
            </div>
          </div>

          {/* Duration warning */}
          {startDate && endDate && durationDays > 0 && (
            <div
              className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
                durationExceeded
                  ? "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200"
                  : "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200"
              }`}
            >
              <span className="font-medium">Duration: {durationDays} day(s)</span>
              {durationExceeded && (
                <span>
                  -- Exceeds maximum of {MAX_DELEGATION_DAYS} days. This
                  delegation will require additional approval.
                </span>
              )}
            </div>
          )}

          {startDate && endDate && durationDays <= 0 && (
            <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              <span className="font-medium">
                Invalid date range. End date must be after start date.
              </span>
            </div>
          )}

          {/* Delegation Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Delegation Reason *</label>
            <Textarea
              placeholder="Provide the reason for this delegation (e.g. vacation, medical leave, training)..."
              rows={3}
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setReason(e.target.value)
              }
            />
            <p className="text-xs text-muted-foreground">
              {reason.trim().length === 0
                ? "A reason is required to submit."
                : `${reason.trim().length} character(s)`}
            </p>
          </div>

          {/* Submit button */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={resetForm}
              disabled={createMutation.isPending}
            >
              Reset
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!canSubmit || createMutation.isPending}
            >
              {createMutation.isPending
                ? "Submitting..."
                : "Submit Delegation Request"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* SECTION 2: Active Delegations Table                              */}
      {/* ================================================================ */}

      <Card>
        <CardHeader>
          <CardTitle>Active Delegations</CardTitle>
        </CardHeader>
        <CardContent>
          {activeError ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p className="font-medium">Failed to load active delegations</p>
              <p className="text-sm">
                Please try again later or check your connection.
              </p>
            </div>
          ) : activePending ? (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Outgoing RM</TableHead>
                    <TableHead>Delegate RM</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Days Remaining</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SkeletonRows cols={8} />
                </TableBody>
              </Table>
            </div>
          ) : activeDelegations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p>No active delegations found</p>
              <p className="text-sm">
                Create a new delegation using the form above.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Outgoing RM</TableHead>
                    <TableHead>Delegate RM</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Days Remaining</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeDelegations.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm font-medium">
                        {d.delegation_type}
                      </TableCell>
                      <TableCell className="text-sm">{d.outgoing_rm}</TableCell>
                      <TableCell className="text-sm">{d.delegate_rm}</TableCell>
                      <TableCell className="text-sm">
                        {formatDate(d.start_date)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(d.end_date)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            statusColors[d.status?.toUpperCase()] || ""
                          }
                          variant="secondary"
                        >
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {d.days_remaining > 0 ? d.days_remaining : 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openExtendDialog(d)}
                            disabled={extendMutation.isPending}
                          >
                            Extend
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => cancelMutation.mutate(d.id)}
                            disabled={cancelMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Extend Delegation Dialog                                         */}
      {/* ================================================================ */}

      <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Extend Delegation</DialogTitle>
          </DialogHeader>
          {extendTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                <p>
                  <span className="font-medium">Type:</span>{" "}
                  {extendTarget.delegation_type}
                </p>
                <p>
                  <span className="font-medium">Outgoing RM:</span>{" "}
                  {extendTarget.outgoing_rm}
                </p>
                <p>
                  <span className="font-medium">Delegate RM:</span>{" "}
                  {extendTarget.delegate_rm}
                </p>
                <p>
                  <span className="font-medium">Current End Date:</span>{" "}
                  {formatDate(extendTarget.end_date)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">New End Date *</label>
                <Input
                  type="date"
                  value={extendNewEndDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setExtendNewEndDate(e.target.value)
                  }
                />
                {extendNewEndDate &&
                  extendTarget.end_date &&
                  daysBetween(extendTarget.start_date, extendNewEndDate) >
                    MAX_DELEGATION_DAYS && (
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      Warning: Total delegation duration exceeds{" "}
                      {MAX_DELEGATION_DAYS} days. Additional approval may be
                      required.
                    </p>
                  )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Reason for Extension *
                </label>
                <Textarea
                  placeholder="Provide the reason for extending this delegation..."
                  rows={3}
                  value={extendReason}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setExtendReason(e.target.value)
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExtendDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExtend}
              disabled={
                !extendNewEndDate ||
                !extendReason.trim() ||
                extendMutation.isPending
              }
            >
              {extendMutation.isPending ? "Extending..." : "Confirm Extension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
