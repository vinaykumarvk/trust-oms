/**
 * Whistleblower Case Management — Phase 4C (CCO Conduct Risk)
 *
 * CCO-facing interface for managing whistleblower reports. Supports
 * multiple intake channels (hotline, email, web portal, walk-in),
 * anonymous reporting, DPO notification, and conduct risk analytics.
 * Two-tab interface: Cases and Conduct Risk Dashboard.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Textarea } from "@ui/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  Shield, RefreshCw, Plus, UserCheck, Bell,
  ChevronDown, ChevronUp, Eye, BarChart3,
  Phone, Mail, Globe, UserX,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WhistleblowerCase {
  id: string;
  channel: string;
  anonymous: boolean;
  description: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  dpo_notified: boolean;
  status: string;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

interface WhistleblowerListResponse {
  data: WhistleblowerCase[];
  total: number;
  page: number;
  pageSize: number;
}

interface ConductRiskSummary {
  total_cases: number;
  under_review: number;
  investigating: number;
  resolved: number;
  closed: number;
  submitted: number;
  anonymous_count: number;
  named_count: number;
  anonymous_ratio: number;
  by_channel: Record<string, number>;
  by_month: { month: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CHANNELS = ["HOTLINE", "EMAIL", "WEB_PORTAL", "WALK_IN"] as const;
const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "INVESTIGATING", "RESOLVED", "CLOSED"] as const;

const CHANNEL_COLORS: Record<string, string> = {
  HOTLINE: "bg-red-100 text-red-800",
  EMAIL: "bg-blue-100 text-blue-800",
  WEB_PORTAL: "bg-purple-100 text-purple-800",
  WALK_IN: "bg-green-100 text-green-800",
};

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  HOTLINE: Phone,
  EMAIL: Mail,
  WEB_PORTAL: Globe,
  WALK_IN: UserCheck,
};

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-yellow-100 text-yellow-800",
  UNDER_REVIEW: "bg-blue-100 text-blue-800",
  INVESTIGATING: "bg-orange-100 text-orange-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-muted text-foreground",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function truncate(s: string, len: number = 60): string {
  if (!s) return "-";
  return s.length > len ? s.slice(0, len) + "..." : s;
}

function badgeColor(key: string, map: Record<string, string>): string {
  return map[key] ?? "bg-muted text-foreground";
}

function formatChannelLabel(ch: string): string {
  return ch.replace(/_/g, " ");
}

function formatStatusLabel(s: string): string {
  return s.replace(/_/g, " ");
}

// Reusable sub-components
function SummaryCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-16" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
        {msg}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Whistleblower() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("cases");

  // Cases tab state
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterAnon, setFilterAnon] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Submit new case state
  const [submitOpen, setSubmitOpen] = useState(false);
  const [newChannel, setNewChannel] = useState<string>(CHANNELS[0]);
  const [newDescription, setNewDescription] = useState("");
  const [newAnonymous, setNewAnonymous] = useState(false);

  // Assign reviewer dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [assignReviewer, setAssignReviewer] = useState("");

  // Update status dialog
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [statusValue, setStatusValue] = useState<string>("");
  const [statusResolution, setStatusResolution] = useState("");

  // Notify DPO confirm dialog
  const [dpoOpen, setDpoOpen] = useState(false);
  const [dpoId, setDpoId] = useState<string | null>(null);

  // --- Queries ---
  const casesQ = useQuery<WhistleblowerListResponse>({
    queryKey: ["whistleblower-cases", filterStatus, filterChannel, filterAnon, page],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (filterStatus !== "all") p.set("status", filterStatus);
      if (filterChannel !== "all") p.set("channel", filterChannel);
      if (filterAnon !== "all") p.set("anonymous", filterAnon);
      return apiRequest("GET", apiUrl(`/api/v1/whistleblower?${p.toString()}`));
    },
    refetchInterval: 30_000,
  });
  const cases = casesQ.data?.data ?? [];
  const casesTotal = casesQ.data?.total ?? 0;
  const totalPages = Math.ceil(casesTotal / pageSize);

  const conductQ = useQuery<ConductRiskSummary>({
    queryKey: ["conduct-risk"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/whistleblower/conduct-risk")),
    refetchInterval: 30_000,
  });
  const conduct = conductQ.data;

  // --- Mutations ---
  const createMut = useMutation({
    mutationFn: (body: { channel: string; description: string; anonymous: boolean }) =>
      apiRequest("POST", apiUrl("/api/v1/whistleblower"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistleblower-cases"] });
      qc.invalidateQueries({ queryKey: ["conduct-risk"] });
      setNewDescription("");
      setNewAnonymous(false);
      setSubmitOpen(false);
    },
  });

  const assignMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { reviewer_id: string } }) =>
      apiRequest("POST", apiUrl(`/api/v1/whistleblower/${id}/assign`), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistleblower-cases"] });
      setAssignOpen(false);
      setAssignId(null);
      setAssignReviewer("");
    },
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status: string; resolution?: string } }) =>
      apiRequest("PUT", apiUrl(`/api/v1/whistleblower/${id}`), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistleblower-cases"] });
      qc.invalidateQueries({ queryKey: ["conduct-risk"] });
      setStatusOpen(false);
      setStatusId(null);
      setStatusValue("");
      setStatusResolution("");
    },
  });

  const notifyDpoMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl(`/api/v1/whistleblower/${id}/notify-dpo`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whistleblower-cases"] });
      setDpoOpen(false);
      setDpoId(null);
    },
  });

  // --- Handlers ---
  const openAssign = (c: WhistleblowerCase) => {
    setAssignId(c.id);
    setAssignReviewer(c.reviewer_id ?? "");
    setAssignOpen(true);
  };

  const submitAssign = () => {
    if (!assignId || !assignReviewer.trim()) return;
    assignMut.mutate({ id: assignId, body: { reviewer_id: assignReviewer.trim() } });
  };

  const openStatus = (c: WhistleblowerCase) => {
    setStatusId(c.id);
    setStatusValue(c.status);
    setStatusResolution(c.resolution ?? "");
    setStatusOpen(true);
  };

  const submitStatus = () => {
    if (!statusId || !statusValue) return;
    const body: { status: string; resolution?: string } = { status: statusValue };
    if (statusResolution.trim()) body.resolution = statusResolution.trim();
    updateStatusMut.mutate({ id: statusId, body });
  };

  const openDpo = (c: WhistleblowerCase) => {
    setDpoId(c.id);
    setDpoOpen(true);
  };

  const submitNewCase = () => {
    if (!newDescription.trim()) return;
    createMut.mutate({
      channel: newChannel,
      description: newDescription.trim(),
      anonymous: newAnonymous,
    });
  };

  // Derived summary values
  const summaryTotalCases = conduct?.total_cases ?? casesTotal;
  const summaryUnderReview = conduct?.under_review ?? 0;
  const summaryInvestigating = conduct?.investigating ?? 0;
  const summaryResolved = conduct?.resolved ?? 0;
  const summaryAnonRatio = conduct
    ? `${(conduct.anonymous_ratio * 100).toFixed(0)}%`
    : "-";

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Whistleblower Case Management</h1>
            <p className="text-sm text-muted-foreground">
              CCO conduct risk oversight and whistleblower intake
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            casesQ.refetch();
            conductQ.refetch();
          }}
          disabled={casesQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${casesQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Conduct Risk Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          title="Total Cases"
          value={summaryTotalCases}
          icon={Shield}
          accent="bg-blue-600"
        />
        <SummaryCard
          title="Under Review"
          value={summaryUnderReview}
          icon={Eye}
          accent="bg-blue-500"
        />
        <SummaryCard
          title="Investigating"
          value={summaryInvestigating}
          icon={Shield}
          accent="bg-orange-500"
        />
        <SummaryCard
          title="Resolved"
          value={summaryResolved}
          icon={UserCheck}
          accent="bg-green-600"
        />
        <SummaryCard
          title="Anonymous Ratio"
          value={summaryAnonRatio}
          icon={UserX}
          accent="bg-purple-600"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cases">Cases</TabsTrigger>
          <TabsTrigger value="dashboard">Conduct Risk Dashboard</TabsTrigger>
        </TabsList>

        {/* ==================== CASES TAB ==================== */}
        <TabsContent value="cases" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={filterStatus}
              onValueChange={(v) => {
                setFilterStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {formatStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filterChannel}
              onValueChange={(v) => {
                setFilterChannel(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {CHANNELS.map((ch) => (
                  <SelectItem key={ch} value={ch}>
                    {formatChannelLabel(ch)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filterAnon}
              onValueChange={(v) => {
                setFilterAnon(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Anonymous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reports</SelectItem>
                <SelectItem value="true">Anonymous</SelectItem>
                <SelectItem value="false">Named</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {casesTotal} case{casesTotal !== 1 ? "s" : ""}
              </span>
              <Button size="sm" onClick={() => setSubmitOpen(!submitOpen)}>
                {submitOpen ? (
                  <ChevronUp className="h-4 w-4 mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                New Case
              </Button>
            </div>
          </div>

          {/* Collapsible Submit New Case */}
          {submitOpen && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Submit New Whistleblower Case
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Channel</label>
                    <Select value={newChannel} onValueChange={setNewChannel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((ch) => (
                          <SelectItem key={ch} value={ch}>
                            {formatChannelLabel(ch)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Anonymous Report</label>
                    <div className="flex items-center gap-3 h-10">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newAnonymous}
                          onChange={(e) => setNewAnonymous(e.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-sm">
                          {newAnonymous ? "Anonymous" : "Named reporter"}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    placeholder="Describe the conduct concern or whistleblower report..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={submitNewCase}
                    disabled={createMut.isPending || !newDescription.trim()}
                  >
                    {createMut.isPending ? "Submitting..." : "Submit Case"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewChannel(CHANNELS[0]);
                      setNewDescription("");
                      setNewAnonymous(false);
                      setSubmitOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>

                {createMut.isError && (
                  <p className="text-sm text-red-600">
                    Failed to submit case. Please try again.
                  </p>
                )}
                {createMut.isSuccess && (
                  <p className="text-sm text-green-600">Case submitted successfully.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cases Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Anonymous</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>DPO Notified</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {casesQ.isLoading ? (
                  <SkeletonRows cols={9} />
                ) : cases.length === 0 ? (
                  <EmptyRow cols={9} msg="No whistleblower cases found" />
                ) : (
                  cases.map((c) => {
                    const ChannelIcon = CHANNEL_ICONS[c.channel] ?? Shield;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">
                          {c.id.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <Badge className={badgeColor(c.channel, CHANNEL_COLORS)}>
                            <ChannelIcon className="h-3 w-3 mr-1" />
                            {formatChannelLabel(c.channel)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {c.anonymous ? (
                            <Badge className="bg-purple-100 text-purple-800">Anonymous</Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground">Named</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {truncate(c.description)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.reviewer_name ?? c.reviewer_id ?? (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.dpo_notified ? (
                            <Badge className="bg-green-100 text-green-800">Yes</Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={badgeColor(c.status, STATUS_COLORS)}>
                            {formatStatusLabel(c.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(c.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Assign Reviewer"
                              onClick={() => openAssign(c)}
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Update Status"
                              onClick={() => openStatus(c)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {!c.dpo_notified && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Notify DPO"
                                className="text-orange-600 hover:text-orange-700"
                                onClick={() => openDpo(c)}
                              >
                                <Bell className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, casesTotal)} of{" "}
                {casesTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {casesQ.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to load whistleblower cases. Please try again.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== CONDUCT RISK DASHBOARD TAB ==================== */}
        <TabsContent value="dashboard" className="space-y-4">
          {conductQ.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-40 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : conductQ.isError ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to load conduct risk data. Please try again.
                </p>
              </CardContent>
            </Card>
          ) : conduct ? (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Cases by Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Cases by Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {STATUSES.map((status) => {
                    const count =
                      status === "SUBMITTED"
                        ? conduct.submitted
                        : status === "UNDER_REVIEW"
                          ? conduct.under_review
                          : status === "INVESTIGATING"
                            ? conduct.investigating
                            : status === "RESOLVED"
                              ? conduct.resolved
                              : conduct.closed;
                    const pct =
                      conduct.total_cases > 0
                        ? (count / conduct.total_cases) * 100
                        : 0;
                    return (
                      <div key={status} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Badge className={badgeColor(status, STATUS_COLORS)}>
                              {formatStatusLabel(status)}
                            </Badge>
                          </div>
                          <span className="font-mono font-medium">{count}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              status === "SUBMITTED"
                                ? "bg-yellow-500"
                                : status === "UNDER_REVIEW"
                                  ? "bg-blue-500"
                                  : status === "INVESTIGATING"
                                    ? "bg-orange-500"
                                    : status === "RESOLVED"
                                      ? "bg-green-500"
                                      : "bg-muted0"
                            }`}
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Anonymous vs Named */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <UserX className="h-4 w-4" />
                    Anonymous vs Named
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 text-center">
                      <p className="text-3xl font-bold text-purple-700">
                        {conduct.anonymous_count}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Anonymous</p>
                    </div>
                    <Separator orientation="vertical" className="h-16" />
                    <div className="flex-1 text-center">
                      <p className="text-3xl font-bold text-foreground">
                        {conduct.named_count}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Named</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>Anonymous Ratio</span>
                      <span className="font-mono font-medium">
                        {(conduct.anonymous_ratio * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted">
                      <div
                        className="h-3 rounded-full bg-purple-500 transition-all"
                        style={{ width: `${conduct.anonymous_ratio * 100}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cases by Channel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Cases by Channel
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {conduct.by_channel &&
                    Object.entries(conduct.by_channel).map(([channel, count]) => {
                      const ChannelIcon = CHANNEL_ICONS[channel] ?? Shield;
                      const pct =
                        conduct.total_cases > 0
                          ? (count / conduct.total_cases) * 100
                          : 0;
                      return (
                        <div key={channel} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Badge className={badgeColor(channel, CHANNEL_COLORS)}>
                                <ChannelIcon className="h-3 w-3 mr-1" />
                                {formatChannelLabel(channel)}
                              </Badge>
                            </div>
                            <span className="font-mono font-medium">{count}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                channel === "HOTLINE"
                                  ? "bg-red-500"
                                  : channel === "EMAIL"
                                    ? "bg-blue-500"
                                    : channel === "WEB_PORTAL"
                                      ? "bg-purple-500"
                                      : "bg-green-500"
                              }`}
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  {(!conduct.by_channel ||
                    Object.keys(conduct.by_channel).length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No channel data available
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Monthly Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Monthly Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {conduct.by_month && conduct.by_month.length > 0 ? (
                    <div className="space-y-2">
                      {conduct.by_month.map((entry) => {
                        const maxCount = Math.max(
                          ...conduct.by_month.map((e) => e.count),
                          1
                        );
                        const pct = (entry.count / maxCount) * 100;
                        return (
                          <div key={entry.month} className="flex items-center gap-3">
                            <span className="text-xs font-mono w-20 text-muted-foreground">
                              {entry.month}
                            </span>
                            <div className="flex-1 h-5 rounded bg-muted">
                              <div
                                className="h-5 rounded bg-blue-500 flex items-center justify-end pr-2 transition-all"
                                style={{ width: `${Math.max(pct, 3)}%` }}
                              >
                                {pct > 15 && (
                                  <span className="text-xs font-medium text-white">
                                    {entry.count}
                                  </span>
                                )}
                              </div>
                            </div>
                            {pct <= 15 && (
                              <span className="text-xs font-mono font-medium w-8">
                                {entry.count}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No monthly trend data available
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* ==================== ASSIGN REVIEWER DIALOG ==================== */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Reviewer</DialogTitle>
            <DialogDescription>
              Assign a CCO reviewer to this whistleblower case.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Reviewer / CCO ID</label>
              <Input
                placeholder="Enter reviewer ID..."
                value={assignReviewer}
                onChange={(e) => setAssignReviewer(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitAssign}
              disabled={assignMut.isPending || !assignReviewer.trim()}
            >
              {assignMut.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== UPDATE STATUS DIALOG ==================== */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Case Status</DialogTitle>
            <DialogDescription>
              Change the status and optionally record a resolution.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Status</label>
              <Select value={statusValue} onValueChange={setStatusValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Resolution (optional)</label>
              <Textarea
                placeholder="Describe the resolution or findings..."
                value={statusResolution}
                onChange={(e) => setStatusResolution(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitStatus}
              disabled={updateStatusMut.isPending || !statusValue}
            >
              {updateStatusMut.isPending ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== NOTIFY DPO CONFIRM DIALOG ==================== */}
      <Dialog open={dpoOpen} onOpenChange={setDpoOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Notify Data Protection Officer</DialogTitle>
            <DialogDescription>
              This will send a notification to the DPO regarding this whistleblower case.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDpoOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (dpoId) notifyDpoMut.mutate(dpoId);
              }}
              disabled={notifyDpoMut.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Bell className="h-4 w-4 mr-2" />
              {notifyDpoMut.isPending ? "Notifying..." : "Confirm Notify DPO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
