/**
 * Margin Lending Workbench — Enterprise Operational Page
 * Covers: Maintenance, Facilities, Credit View, Margin Calls, EOD & Simulation, Reports & Audit
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/components/ui/dialog";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Separator } from "@ui/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Textarea } from "@ui/components/ui/textarea";
import {
  AlertTriangle, BadgeCheck, Calculator, CheckCircle2, Download,
  FileBarChart, Filter, Landmark, Play, Plus,
  RefreshCw, Search, Shield, ShieldCheck, TrendingDown, Upload, XCircle,
} from "lucide-react";

/* ---------- Types ---------- */
type AnyRecord = Record<string, any>;

type RecordStatus = "DRAFT" | "UNAUTHORIZED" | "AUTHORIZED" | "REJECTED" | "MODIFIED";
type MarginStatus = "NORMAL" | "MARGIN_CALL" | "SELL_OUT";

/* ---------- Constants ---------- */
const MAINTENANCE_ENTITIES: Array<{ key: string; label: string; columns: string[] }> = [
  { key: "attribute-settings", label: "Attributes", columns: ["setting_id", "maintenance_type", "definition_type", "asset_class", "ltv_percent", "top_up_percent", "sell_out_percent", "record_status"] },
  { key: "references", label: "References", columns: ["reference_id", "reference_type", "reference_code", "reference_value", "effective_from", "record_status"] },
  { key: "scrip-settings", label: "Scrips", columns: ["setting_id", "security_code", "security_name", "issuer_code", "ltv_percent", "record_status"] },
  { key: "exposure-limits", label: "Exposure Limits", columns: ["limit_id", "limit_code", "limit_name", "currency", "amount", "threshold_percent", "record_status"] },
  { key: "cross-currency-haircuts", label: "Haircuts", columns: ["haircut_id", "source_currency", "target_currency", "buffer_percent", "volatility_percent", "record_status"] },
  { key: "facility-groups", label: "Facility Groups", columns: ["facility_group_id", "base_number", "base_name", "limit_amount", "currency", "record_status"] },
  { key: "portfolio-links", label: "Portfolio Links", columns: ["link_id", "facility_group_id", "portfolio_id", "cross_pledge_flag", "priority", "record_status"] },
  { key: "asset-settings", label: "Asset Settings", columns: ["setting_id", "base_number", "security_code", "ltv_percent", "top_up_percent", "sell_out_percent", "record_status"] },
];

const REPORT_CODES = [
  { value: "PRODUCT_DETAILS", label: "Product Details" },
  { value: "AUDIT_TRAIL", label: "Audit Trail" },
  { value: "LIST_OF_FACILITIES", label: "List of Facilities" },
  { value: "MARGIN_CALL_PORTFOLIO", label: "Margin Call Portfolio" },
  { value: "MARGIN_CALL_SECURITY", label: "Margin Call Security" },
  { value: "RATING_MAINTENANCE", label: "Rating Maintenance" },
  { value: "LEVERAGED_CLIENT_VIEW", label: "Leveraged Client View" },
] as const;

/* ---------- Status Badge ---------- */
function RecordStatusBadge({ status }: { status?: string }) {
  const s = (status || "UNKNOWN") as RecordStatus;
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    AUTHORIZED: "default",
    UNAUTHORIZED: "outline",
    DRAFT: "secondary",
    REJECTED: "destructive",
    MODIFIED: "outline",
  };
  return (
    <Badge variant={variants[s] ?? "secondary"} className={s === "MODIFIED" ? "border-yellow-500 text-yellow-700 dark:text-yellow-400" : s === "AUTHORIZED" ? "bg-green-600 dark:bg-green-700" : ""}>
      {s}
    </Badge>
  );
}

function MarginStatusBadge({ status }: { status?: string }) {
  const s = (status || "UNKNOWN") as MarginStatus;
  if (s === "SELL_OUT") return <Badge variant="destructive">{s}</Badge>;
  if (s === "MARGIN_CALL") return <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-400">{s}</Badge>;
  return <Badge variant="default" className="bg-green-600 dark:bg-green-700">{s}</Badge>;
}

/* ---------- Summary KPI Tile ---------- */
function KpiTile({ label, value, icon: Icon, variant }: { label: string; value: number | string; icon: any; variant?: "danger" | "warning" }) {
  const cls = variant === "danger" ? "text-red-600" : variant === "warning" ? "text-orange-600" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${cls}`} />
      </CardContent>
    </Card>
  );
}

/* ---------- Reusable Data Table ---------- */
function DataTable({ rows, columns, onRowAction, actionLabel, actionIcon: ActionIcon }: {
  rows?: AnyRecord[];
  columns: string[];
  onRowAction?: (row: AnyRecord) => void;
  actionLabel?: string;
  actionIcon?: any;
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col} className="whitespace-nowrap text-xs font-medium">{col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</TableHead>
            ))}
            {onRowAction && <TableHead className="w-24 text-xs">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {safeRows.length === 0 ? (
            <TableRow><TableCell colSpan={columns.length + (onRowAction ? 1 : 0)} className="h-20 text-center text-sm text-muted-foreground">No records found</TableCell></TableRow>
          ) : safeRows.map((row, idx) => (
            <TableRow key={row.id ?? row.setting_id ?? row.case_id ?? row.facility_group_id ?? row.eod_run_id ?? idx}>
              {columns.map((col) => (
                <TableCell key={col} className="max-w-48 truncate text-xs">
                  {col === "record_status" ? <RecordStatusBadge status={String(row[col] ?? "")} /> :
                   col === "margin_status" ? <MarginStatusBadge status={String(row[col] ?? "")} /> :
                   col === "run_status" || col === "case_status" ? <Badge variant={String(row[col]).includes("FAIL") || String(row[col]).includes("CLOSED") ? "destructive" : "secondary"}>{String(row[col] ?? "")}</Badge> :
                   String(row[col] ?? "")}
                </TableCell>
              ))}
              {onRowAction && (
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => onRowAction(row)}>
                    {ActionIcon && <ActionIcon className="mr-1 h-3 w-3" />}
                    {actionLabel || "View"}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------- Form Field ---------- */
function FormField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} type={type} placeholder={placeholder} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} className="h-9" />
    </div>
  );
}

/* ========== MAINTENANCE TAB ========== */
function MaintenanceTab() {
  const queryClient = useQueryClient();
  const [activeEntity, setActiveEntity] = useState(MAINTENANCE_ENTITIES[0].key);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AnyRecord | null>(null);
  const [decisionType, setDecisionType] = useState<"AUTHORIZE" | "REJECT">("AUTHORIZE");
  const [decisionReason, setDecisionReason] = useState("");
  const [formData, setFormData] = useState<AnyRecord>({});

  const entity = MAINTENANCE_ENTITIES.find((e) => e.key === activeEntity)!;

  const listQuery = useQuery<AnyRecord[]>({
    queryKey: ["ml-maintenance", activeEntity, statusFilter],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/margin-lending/${activeEntity}${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`)),
  });

  const createMutation = useMutation({
    mutationFn: (body: AnyRecord) => apiRequest("POST", apiUrl(`/api/v1/margin-lending/${activeEntity}`), body),
    onSuccess: () => { setCreateOpen(false); setFormData({}); queryClient.invalidateQueries({ queryKey: ["ml-maintenance", activeEntity] }); },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: string; reason?: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/margin-lending/${activeEntity}/${id}/decision`), { decision, reason }),
    onSuccess: () => { setDecisionOpen(false); setDecisionReason(""); queryClient.invalidateQueries({ queryKey: ["ml-maintenance", activeEntity] }); },
  });

  const filteredRows = useMemo(() => {
    const rows = listQuery.data ?? [];
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(term)));
  }, [listQuery.data, searchTerm]);

  const handleDecision = (row: AnyRecord, type: "AUTHORIZE" | "REJECT") => {
    setSelectedRow(row);
    setDecisionType(type);
    setDecisionOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Entity sub-tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {MAINTENANCE_ENTITIES.map((e) => (
          <button key={e.key} onClick={() => setActiveEntity(e.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeEntity === e.key ? "bg-background shadow-sm" : "hover:bg-background/50"}`}>
            {e.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)} placeholder="Search records..." className="h-9 pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44"><Filter className="mr-2 h-3 w-3" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="UNAUTHORIZED">Unauthorized</SelectItem>
            <SelectItem value="AUTHORIZED">Authorized</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="MODIFIED">Modified</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => { setFormData({}); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Create
        </Button>
        <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["ml-maintenance", activeEntity] })}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Table */}
      <DataTable
        rows={filteredRows}
        columns={entity.columns}
        onRowAction={(row) => handleDecision(row, "AUTHORIZE")}
        actionLabel="Authorize"
        actionIcon={CheckCircle2}
      />

      {/* Reject button row for selected */}
      {filteredRows.length > 0 && (
        <div className="flex gap-2">
          <p className="text-xs text-muted-foreground pt-1">Row actions: click Authorize on table, or select a row below for Reject.</p>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create {entity.label} Record</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-4 max-h-[60vh] overflow-y-auto">
            {entity.columns.filter((c) => c !== "record_status" && !c.endsWith("_id") || c === "facility_group_id").map((col) => (
              <FormField key={col} label={col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                value={formData[col] ?? ""} onChange={(v) => setFormData({ ...formData, [col]: v })} />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(formData)} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision Dialog */}
      <Dialog open={decisionOpen} onOpenChange={setDecisionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{decisionType === "AUTHORIZE" ? "Authorize" : "Reject"} Record</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">Record ID: <span className="font-mono">{selectedRow?.setting_id ?? selectedRow?.reference_id ?? selectedRow?.haircut_id ?? selectedRow?.limit_id ?? selectedRow?.facility_group_id ?? selectedRow?.link_id ?? "N/A"}</span></p>
            <div className="flex gap-2">
              <Button size="sm" variant={decisionType === "AUTHORIZE" ? "default" : "outline"} onClick={() => setDecisionType("AUTHORIZE")}>Authorize</Button>
              <Button size="sm" variant={decisionType === "REJECT" ? "destructive" : "outline"} onClick={() => setDecisionType("REJECT")}>Reject</Button>
            </div>
            {decisionType === "REJECT" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Rejection Reason</Label>
                <Textarea value={decisionReason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDecisionReason(e.target.value)} rows={3} placeholder="Enter reason for rejection..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionOpen(false)}>Cancel</Button>
            <Button variant={decisionType === "REJECT" ? "destructive" : "default"}
              onClick={() => {
                const id = selectedRow?.setting_id ?? selectedRow?.reference_id ?? selectedRow?.haircut_id ?? selectedRow?.limit_id ?? selectedRow?.facility_group_id ?? selectedRow?.link_id;
                if (id) decisionMutation.mutate({ id: String(id), decision: decisionType, reason: decisionReason || undefined });
              }}
              disabled={decisionMutation.isPending}>
              {decisionMutation.isPending ? "Processing..." : `Confirm ${decisionType}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ========== FACILITIES TAB ========== */
function FacilitiesTab() {
  const [filters, setFilters] = useState({ facilityGroupId: "", status: "all", assetClass: "all", currency: "all" });

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.facilityGroupId) params.set("facilityGroupId", filters.facilityGroupId);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.assetClass !== "all") params.set("assetClass", filters.assetClass);
    if (filters.currency !== "all") params.set("currency", filters.currency);
    return params.toString();
  }, [filters]);

  const facilitiesQuery = useQuery<AnyRecord[]>({
    queryKey: ["ml-facilities", queryParams],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/margin-lending/facilities${queryParams ? `?${queryParams}` : ""}`)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" /> Facility Register</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Facility Group ID" value={filters.facilityGroupId}
              onChange={(v) => setFilters({ ...filters, facilityGroupId: v })} placeholder="Filter by group..." />
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="AUTHORIZED">Authorized</SelectItem>
                  <SelectItem value="UNAUTHORIZED">Unauthorized</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Asset Class</Label>
              <Select value={filters.assetClass} onValueChange={(v) => setFilters({ ...filters, assetClass: v })}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="FIXED_INCOME">Fixed Income</SelectItem>
                  <SelectItem value="EQUITY">Equity</SelectItem>
                  <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
                  <SelectItem value="MULTI_ASSET">Multi-Asset</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Select value={filters.currency} onValueChange={(v) => setFilters({ ...filters, currency: v })}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="IDR">IDR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="SGD">SGD</SelectItem>
                  <SelectItem value="PHP">PHP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="mt-auto">
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
          </div>

          {/* Table */}
          <DataTable
            rows={facilitiesQuery.data}
            columns={["facility_id", "facility_group_id", "base_number", "asset_class", "currency", "limit_amount", "utilized_amount", "available_amount", "record_status"]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ========== CREDIT VIEW TAB ========== */
function CreditViewTab() {
  const [baseNumber, setBaseNumber] = useState("");
  const [facilityGroupId, setFacilityGroupId] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [exposureAmount, setExposureAmount] = useState("");

  const creditMutation = useMutation<AnyRecord, Error, AnyRecord>({
    mutationFn: (body: AnyRecord) => apiRequest("POST", apiUrl("/api/v1/margin-lending/credit-view"), body),
  });

  const metrics = creditMutation.data?.metrics;
  const drilldowns = creditMutation.data?.drilldowns;

  const handleSubmit = () => {
    const body: AnyRecord = { baseNumber };
    if (facilityGroupId) body.facilityGroupId = facilityGroupId;
    if (marketValue) body.marketValue = Number(marketValue);
    if (exposureAmount) body.exposureAmount = Number(exposureAmount);
    creditMutation.mutate(body);
  };

  const marginStatusColor = (s?: string) => {
    if (s === "SELL_OUT") return "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800";
    if (s === "MARGIN_CALL") return "bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800";
    return "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" /> Credit View Inquiry</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <FormField label="Base Number *" value={baseNumber} onChange={setBaseNumber} placeholder="e.g. BASE-001" />
            <FormField label="Facility Group ID" value={facilityGroupId} onChange={setFacilityGroupId} placeholder="Optional" />
            <FormField label="Market Value Override" value={marketValue} onChange={setMarketValue} placeholder="Optional" type="number" />
            <FormField label="Exposure Override" value={exposureAmount} onChange={setExposureAmount} placeholder="Optional" type="number" />
            <div className="flex items-end">
              <Button onClick={handleSubmit} disabled={!baseNumber || creditMutation.isPending} className="w-full">
                <Search className="mr-2 h-4 w-4" /> {creditMutation.isPending ? "Loading..." : "Get Credit View"}
              </Button>
            </div>
          </div>

          {/* Results */}
          {metrics && (
            <>
              <Separator />
              <div className={`rounded-lg border p-4 ${marginStatusColor(metrics.marginStatus)}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Margin Metrics</h3>
                  <MarginStatusBadge status={metrics.marginStatus} />
                </div>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <p className="text-xs text-muted-foreground">LTV %</p>
                    <p className="text-lg font-semibold">{Number(metrics.ltvPercent ?? 0).toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Market Value</p>
                    <p className="text-lg font-semibold">{Number(metrics.marketValue ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Exposure</p>
                    <p className="text-lg font-semibold">{Number(metrics.exposureAmount ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Drawing Power</p>
                    <p className="text-lg font-semibold">{Number(metrics.availableDrawingPower ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Shortfall</p>
                    <p className={`text-lg font-semibold ${Number(metrics.shortfallAmount ?? 0) > 0 ? "text-red-600" : ""}`}>
                      {Number(metrics.shortfallAmount ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Margin Status</p>
                    <p className="text-lg font-semibold">{metrics.marginStatus ?? "N/A"}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {drilldowns?.linkedPortfolios && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="text-xs font-medium mb-2 text-muted-foreground">Linked Portfolios</h4>
                <DataTable rows={drilldowns.linkedPortfolios} columns={["portfolioId", "crossPledge", "priority", "source"]} />
              </div>
              <div>
                <h4 className="text-xs font-medium mb-2 text-muted-foreground">Holdings</h4>
                <DataTable rows={drilldowns.holdings} columns={["portfolioId", "securityCode", "quantity", "marketValue"]} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ========== MARGIN CALLS TAB ========== */
function MarginCallsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [baseFilter, setBaseFilter] = useState("");
  const [actionOpen, setActionOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<AnyRecord | null>(null);
  const [actionType, setActionType] = useState("DEFERRAL");
  const [actionReason, setActionReason] = useState("");
  const [actionAmount, setActionAmount] = useState("");
  const [decisionType, setDecisionType] = useState<"AUTHORIZE" | "REJECT">("AUTHORIZE");
  const [decisionReason, setDecisionReason] = useState("");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (baseFilter) params.set("baseNumber", baseFilter);
    return params.toString();
  }, [statusFilter, baseFilter]);

  const casesQuery = useQuery<AnyRecord[]>({
    queryKey: ["ml-margin-cases", queryParams],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/margin-lending/margin-call-cases${queryParams ? `?${queryParams}` : ""}`)),
  });

  const actionMutation = useMutation({
    mutationFn: ({ caseId, body }: { caseId: string; body: AnyRecord }) =>
      apiRequest("POST", apiUrl(`/api/v1/margin-lending/margin-call-cases/${caseId}/actions`), body),
    onSuccess: () => { setActionOpen(false); setActionReason(""); setActionAmount(""); queryClient.invalidateQueries({ queryKey: ["ml-margin-cases"] }); },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ caseId, body }: { caseId: string; body: AnyRecord }) =>
      apiRequest("POST", apiUrl(`/api/v1/margin-lending/margin-call-cases/${caseId}/decision`), body),
    onSuccess: () => { setDecisionOpen(false); setDecisionReason(""); queryClient.invalidateQueries({ queryKey: ["ml-margin-cases"] }); },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Margin Call Cases</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Margin Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="MARGIN_CALL">Margin Call</SelectItem>
                  <SelectItem value="SELL_OUT">Sell Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FormField label="Base Number" value={baseFilter} onChange={setBaseFilter} placeholder="Filter by base..." />
            <Button variant="outline" size="sm" className="mt-auto" onClick={() => queryClient.invalidateQueries({ queryKey: ["ml-margin-cases"] })}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Case ID</TableHead>
                  <TableHead className="text-xs">Base Number</TableHead>
                  <TableHead className="text-xs">Portfolio</TableHead>
                  <TableHead className="text-xs">Margin Status</TableHead>
                  <TableHead className="text-xs">Case Status</TableHead>
                  <TableHead className="text-xs">Shortfall</TableHead>
                  <TableHead className="text-xs">Advice Status</TableHead>
                  <TableHead className="text-xs w-48">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(casesQuery.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="h-20 text-center text-sm text-muted-foreground">No margin call cases</TableCell></TableRow>
                ) : (casesQuery.data ?? []).map((row) => (
                  <TableRow key={row.case_id}>
                    <TableCell className="text-xs font-mono">{row.case_id}</TableCell>
                    <TableCell className="text-xs">{row.base_number}</TableCell>
                    <TableCell className="text-xs">{row.portfolio_id}</TableCell>
                    <TableCell><MarginStatusBadge status={row.margin_status} /></TableCell>
                    <TableCell><Badge variant="secondary">{row.case_status}</Badge></TableCell>
                    <TableCell className="text-xs font-semibold text-red-600">{Number(row.shortfall_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{row.advice_status ?? "N/A"}</TableCell>
                    <TableCell className="space-x-1">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedCase(row); setActionOpen(true); }}>
                        <Plus className="mr-1 h-3 w-3" /> Action
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedCase(row); setDecisionType("AUTHORIZE"); setDecisionOpen(true); }}>
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Decide
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Action Dialog */}
      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Case Action</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">Case: <span className="font-mono">{selectedCase?.case_id}</span></p>
            <div className="space-y-1.5">
              <Label className="text-xs">Action Type</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEFERRAL">Deferral</SelectItem>
                  <SelectItem value="DUE">Due</SelectItem>
                  <SelectItem value="MANUAL_CLOSURE">Manual Closure</SelectItem>
                  <SelectItem value="TOP_UP">Top Up</SelectItem>
                  <SelectItem value="PARTIAL_SELL">Partial Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FormField label="Amount (optional)" value={actionAmount} onChange={setActionAmount} type="number" placeholder="For top-up/sell actions" />
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Textarea value={actionReason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setActionReason(e.target.value)} rows={3} placeholder="Justification for this action..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (selectedCase) {
                const body: AnyRecord = { actionType, reason: actionReason };
                if (actionAmount) body.amount = Number(actionAmount);
                actionMutation.mutate({ caseId: selectedCase.case_id, body });
              }
            }} disabled={actionMutation.isPending}>
              {actionMutation.isPending ? "Saving..." : "Submit Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision Dialog */}
      <Dialog open={decisionOpen} onOpenChange={setDecisionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Case Decision</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">Case: <span className="font-mono">{selectedCase?.case_id}</span> — {selectedCase?.base_number}</p>
            <div className="flex gap-2">
              <Button size="sm" variant={decisionType === "AUTHORIZE" ? "default" : "outline"} onClick={() => setDecisionType("AUTHORIZE")}>Authorize</Button>
              <Button size="sm" variant={decisionType === "REJECT" ? "destructive" : "outline"} onClick={() => setDecisionType("REJECT")}>Reject</Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason {decisionType === "REJECT" ? "(required)" : "(optional)"}</Label>
              <Textarea value={decisionReason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDecisionReason(e.target.value)} rows={3} placeholder="Decision reason..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionOpen(false)}>Cancel</Button>
            <Button variant={decisionType === "REJECT" ? "destructive" : "default"}
              onClick={() => {
                if (selectedCase) decisionMutation.mutate({ caseId: selectedCase.case_id, body: { decision: decisionType, reason: decisionReason || undefined } });
              }} disabled={decisionMutation.isPending}>
              {decisionMutation.isPending ? "Processing..." : `Confirm ${decisionType}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ========== EOD & SIMULATION TAB ========== */
function EodSimulationTab() {
  const queryClient = useQueryClient();
  const [eodStatusFilter, setEodStatusFilter] = useState("all");
  const [simBaseNumber, setSimBaseNumber] = useState("");
  const [simMarketValue, setSimMarketValue] = useState("");
  const [simExposure, setSimExposure] = useState("");
  const [simLtv, setSimLtv] = useState("");
  const [simTopUp, setSimTopUp] = useState("");
  const [simSellOut, setSimSellOut] = useState("");

  const eodQuery = useQuery<AnyRecord[]>({
    queryKey: ["ml-eod-runs", eodStatusFilter],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/margin-lending/eod-runs${eodStatusFilter !== "all" ? `?status=${eodStatusFilter}` : ""}`)),
  });

  const simulationsQuery = useQuery<AnyRecord[]>({
    queryKey: ["ml-simulations"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/margin-lending/simulations")),
  });

  const triggerEodMutation = useMutation({
    mutationFn: () => apiRequest("POST", apiUrl("/api/v1/margin-lending/eod-runs"), {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ml-eod-runs"] }),
  });

  const runSimMutation = useMutation<AnyRecord, Error, AnyRecord>({
    mutationFn: (body: AnyRecord) => apiRequest("POST", apiUrl("/api/v1/margin-lending/simulations"), body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ml-simulations"] }),
  });

  const handleRunSimulation = () => {
    const beforeMetrics: AnyRecord = {};
    if (simMarketValue) beforeMetrics.marketValue = Number(simMarketValue);
    if (simExposure) beforeMetrics.exposureAmount = Number(simExposure);
    if (simLtv) beforeMetrics.ltvPercent = Number(simLtv);
    if (simTopUp) beforeMetrics.topUpPercent = Number(simTopUp);
    if (simSellOut) beforeMetrics.sellOutPercent = Number(simSellOut);
    runSimMutation.mutate({ type: "CUSTOMER", baseNumber: simBaseNumber, beforeMetrics });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* EOD Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" /> End-of-Day Runs</CardTitle>
            <Button size="sm" onClick={() => triggerEodMutation.mutate()} disabled={triggerEodMutation.isPending}>
              <Play className="mr-2 h-4 w-4" /> {triggerEodMutation.isPending ? "Triggering..." : "Trigger EOD"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Status Filter</Label>
              <Select value={eodStatusFilter} onValueChange={setEodStatusFilter}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="RUNNING">Running</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DataTable rows={eodQuery.data} columns={["eod_run_id", "business_date", "run_status", "processed_count", "failed_count", "started_at"]} />
        </CardContent>
      </Card>

      {/* Simulation Section */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4" /> What-If Simulation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Base Number *" value={simBaseNumber} onChange={setSimBaseNumber} placeholder="e.g. BASE-001" />
            <FormField label="Market Value" value={simMarketValue} onChange={setSimMarketValue} type="number" placeholder="Current MV" />
            <FormField label="Exposure Amount" value={simExposure} onChange={setSimExposure} type="number" placeholder="Current exposure" />
            <FormField label="LTV %" value={simLtv} onChange={setSimLtv} type="number" placeholder="e.g. 70" />
            <FormField label="Top Up %" value={simTopUp} onChange={setSimTopUp} type="number" placeholder="e.g. 80" />
            <FormField label="Sell Out %" value={simSellOut} onChange={setSimSellOut} type="number" placeholder="e.g. 90" />
          </div>
          <Button onClick={handleRunSimulation} disabled={!simBaseNumber || runSimMutation.isPending}>
            <Calculator className="mr-2 h-4 w-4" /> {runSimMutation.isPending ? "Running..." : "Run Simulation"}
          </Button>

          {runSimMutation.data && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="text-xs font-semibold mb-2">Simulation Result</h4>
              <pre className="text-xs overflow-auto whitespace-pre-wrap">{JSON.stringify(runSimMutation.data, null, 2)}</pre>
            </div>
          )}

          <Separator />
          <h4 className="text-xs font-medium text-muted-foreground">Recent Simulations</h4>
          <DataTable rows={simulationsQuery.data} columns={["simulation_id", "base_number", "business_date", "run_status"]} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ========== REPORTS & AUDIT TAB ========== */
function ReportsAuditTab() {
  const [reportCode, setReportCode] = useState("PRODUCT_DETAILS");
  const [auditEntityType, setAuditEntityType] = useState("all");

  const reportMutation = useMutation<AnyRecord, Error, string>({
    mutationFn: (code: string) => apiRequest("GET", apiUrl(`/api/v1/margin-lending/reports/${code}`)),
  });

  const auditQuery = useQuery<AnyRecord[]>({
    queryKey: ["ml-audit-events", auditEntityType],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/margin-lending/audit-events${auditEntityType !== "all" ? `?entityType=${auditEntityType}` : ""}`)),
  });

  const handleExportCsv = () => {
    window.open(apiUrl(`/api/v1/margin-lending/reports/${reportCode}/export.csv`), "_blank");
  };

  return (
    <div className="space-y-4">
      {/* Reports */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileBarChart className="h-4 w-4" /> Reports</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 min-w-[220px]">
              <Label className="text-xs">Report Type</Label>
              <Select value={reportCode} onValueChange={setReportCode}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_CODES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => reportMutation.mutate(reportCode)} disabled={reportMutation.isPending}>
              <FileBarChart className="mr-2 h-4 w-4" /> {reportMutation.isPending ? "Generating..." : "Generate"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>

          {reportMutation.data ? (
            <DataTable rows={reportMutation.data.rows} columns={reportMutation.data.csvHeaders ?? reportMutation.data.columns ?? []} />
          ) : (
            <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Select a report type and click Generate to view results</div>
          )}
        </CardContent>
      </Card>

      {/* Audit Trail */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Audit Trail</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Entity Type</Label>
              <Select value={auditEntityType} onValueChange={setAuditEntityType}>
                <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  <SelectItem value="ATTRIBUTE_SETTING">Attribute Setting</SelectItem>
                  <SelectItem value="REFERENCE">Reference</SelectItem>
                  <SelectItem value="SCRIP_SETTING">Scrip Setting</SelectItem>
                  <SelectItem value="EXPOSURE_LIMIT">Exposure Limit</SelectItem>
                  <SelectItem value="HAIRCUT">Haircut</SelectItem>
                  <SelectItem value="FACILITY_GROUP">Facility Group</SelectItem>
                  <SelectItem value="PORTFOLIO_LINK">Portfolio Link</SelectItem>
                  <SelectItem value="ASSET_SETTING">Asset Setting</SelectItem>
                  <SelectItem value="MARGIN_CALL_CASE">Margin Call Case</SelectItem>
                  <SelectItem value="EOD_RUN">EOD Run</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DataTable rows={auditQuery.data} columns={["event_id", "entity_type", "entity_id", "action", "actor_user_id", "event_time", "details"]} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ========== MAIN COMPONENT ========== */
export default function MarginLendingWorkbench() {
  const summaryQuery = useQuery<AnyRecord>({
    queryKey: ["ml-summary"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/margin-lending/summary")),
    refetchInterval: 60000,
  });

  const summary = summaryQuery.data ?? {};

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Margin Lending</h1>
          <p className="text-sm text-muted-foreground">Collateral maintenance, facility management, credit assessment, margin call processing, and reporting.</p>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Pending Authorization" value={summary.pendingMaintenance ?? 0} icon={ShieldCheck} />
        <KpiTile label="Active Facility Groups" value={summary.authorizedFacilityGroups ?? 0} icon={BadgeCheck} />
        <KpiTile label="Open Margin Calls" value={summary.openMarginCalls ?? 0} icon={AlertTriangle} variant={Number(summary.openMarginCalls ?? 0) > 0 ? "warning" : undefined} />
        <KpiTile label="Sell Out Cases" value={summary.openSellOuts ?? 0} icon={TrendingDown} variant={Number(summary.openSellOuts ?? 0) > 0 ? "danger" : undefined} />
        <KpiTile label="EOD Failures" value={summary.eodFailures ?? 0} icon={XCircle} variant={Number(summary.eodFailures ?? 0) > 0 ? "danger" : undefined} />
        <KpiTile label="Simulations Run" value={summary.simulations ?? 0} icon={Calculator} />
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="maintenance" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
          <TabsTrigger value="credit-view">Credit View</TabsTrigger>
          <TabsTrigger value="margin-calls">Margin Calls</TabsTrigger>
          <TabsTrigger value="eod-simulation">EOD & Simulation</TabsTrigger>
          <TabsTrigger value="reports-audit">Reports & Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance"><MaintenanceTab /></TabsContent>
        <TabsContent value="facilities"><FacilitiesTab /></TabsContent>
        <TabsContent value="credit-view"><CreditViewTab /></TabsContent>
        <TabsContent value="margin-calls"><MarginCallsTab /></TabsContent>
        <TabsContent value="eod-simulation"><EodSimulationTab /></TabsContent>
        <TabsContent value="reports-audit"><ReportsAuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}
