/**
 * Tax Management -- Philippine Taxation Engine (Phase 3D)
 *
 * Summary cards, tax events table with pagination, BIR form generation,
 * FATCA/CRS reporting, 1601-FQ monthly filing tracker, and PH WHT rate reference.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  Loader2, FileText, Globe, Calculator, Receipt,
  ChevronLeft, ChevronRight, Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TaxEvent {
  id: number;
  trade_id: string | null;
  portfolio_id: string | null;
  tax_type: string | null;
  gross_amount: string | null;
  tax_rate: string | null;
  tax_amount: string | null;
  certificate_ref: string | null;
  tin: string | null;
  bir_form_type: string | null;
  filing_status: string | null;
  created_at: string;
}

interface TaxSummary {
  totalEvents: number;
  totalWHT: number;
  fatcaReportableAccounts: number;
  birFormsGenerated: number;
  byType: Array<{ taxType: string; count: number; totalGross: string; totalTax: string }>;
}

interface BIRFormResult {
  formType: string;
  data: Array<{ portfolioId: string; tin: string | null; totalGross: number; totalTax: number; count: number }>;
  totalTax: number;
  generatedAt: string;
  note?: string;
}

interface FATCACRSResult {
  reportType: string;
  year: number;
  reportableAccounts: number;
  generatedAt: string;
}

interface Filing1601FQ {
  month: string;
  totalWHT: number;
  eventCount: number;
  breakdown: Array<{ taxType: string; count: number; totalGross: number; totalTax: number }>;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtCurrency = (v: string | number | null) => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
};

const fmtPct = (v: string | null) => {
  const n = parseFloat(v ?? "0");
  return `${(n * 100).toFixed(2)}%`;
};

const fmtDate = (d: string | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

const taxBadgeVariant = (t: string | null) => {
  switch (t) {
    case "WHT": return "default";
    case "FATCA": return "destructive";
    case "CRS": return "secondary";
    default: return "outline";
  }
};

const statusBadgeVariant = (s: string | null) => {
  switch (s) {
    case "GENERATED": return "default";
    case "FILED": return "secondary";
    case "PENDING": return "outline";
    default: return "outline";
  }
};

const thisYear = new Date().getFullYear();
const today = new Date().toISOString().split("T")[0];
const janFirst = `${thisYear}-01-01`;
const PAGE_SIZE = 25;

const PH_WHT_RATES = [
  { category: "UITF Distributions (Resident)", rate: "25%" },
  { category: "UITF Distributions (Non-Resident)", rate: "30%" },
  { category: "Fixed Income Interest", rate: "20%" },
  { category: "Equity Dividends (Listed)", rate: "10%" },
  { category: "Equity Dividends (Unlisted)", rate: "25%" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TaxManagement() {
  const qc = useQueryClient();

  // Events tab state
  const [taxTypeFilter, setTaxTypeFilter] = useState<string>("ALL");
  const [portfolioFilter, setPortfolioFilter] = useState("");
  const [startDate, setStartDate] = useState(janFirst);
  const [endDate, setEndDate] = useState(today);
  const [page, setPage] = useState(1);

  // BIR Forms tab state
  const [birFormType, setBirFormType] = useState<string>("2307");
  const [birPortfolioId, setBirPortfolioId] = useState("");
  const [birPeriodFrom, setBirPeriodFrom] = useState(janFirst);
  const [birPeriodTo, setBirPeriodTo] = useState(today);
  const [birResult, setBirResult] = useState<BIRFormResult | null>(null);

  // FATCA / CRS tab state
  const [fatcaYear, setFatcaYear] = useState(String(thisYear));
  const [crsYear, setCrsYear] = useState(String(thisYear));
  const [fatcaResult, setFatcaResult] = useState<FATCACRSResult | null>(null);
  const [crsResult, setCrsResult] = useState<FATCACRSResult | null>(null);

  // 1601-FQ tab state
  const currentMonth = `${thisYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [filingMonth, setFilingMonth] = useState(currentMonth);
  const [filings, setFilings] = useState<Filing1601FQ[]>([]);

  // -- Queries --
  const summaryQ = useQuery<{ data: TaxSummary }>({
    queryKey: ["tax-summary", startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.set("periodFrom", startDate);
      if (endDate) params.set("periodTo", endDate);
      return apiRequest("GET", apiUrl("/api/v1/tax/summary?" + params.toString()));
    },
    refetchInterval: 30_000,
  });

  const eventsQ = useQuery<{ data: TaxEvent[]; total: number }>({
    queryKey: ["tax-events", taxTypeFilter, portfolioFilter, startDate, endDate, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (taxTypeFilter !== "ALL") params.set("taxType", taxTypeFilter);
      if (portfolioFilter.trim()) params.set("portfolioId", portfolioFilter.trim());
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      return apiRequest("GET", apiUrl("/api/v1/tax/events?" + params.toString()));
    },
    refetchInterval: 30_000,
  });

  const summary = summaryQ.data?.data;
  const events = eventsQ.data?.data ?? [];
  const totalEvents = eventsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));

  // -- Mutations --
  const birMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl("/api/v1/tax/bir/" + birFormType), {
        portfolioId: birPortfolioId || undefined,
        periodFrom: birPeriodFrom,
        periodTo: birPeriodTo,
      }),
    onSuccess: (res: { data: BIRFormResult }) => {
      setBirResult(res.data);
      qc.invalidateQueries({ queryKey: ["tax-events"] });
      qc.invalidateQueries({ queryKey: ["tax-summary"] });
    },
  });

  const fatcaMutation = useMutation({
    mutationFn: () => apiRequest("POST", apiUrl("/api/v1/tax/fatca/" + fatcaYear), {}),
    onSuccess: (res: { data: FATCACRSResult }) => {
      setFatcaResult(res.data);
      qc.invalidateQueries({ queryKey: ["tax-events"] });
      qc.invalidateQueries({ queryKey: ["tax-summary"] });
    },
  });

  const crsMutation = useMutation({
    mutationFn: () => apiRequest("POST", apiUrl("/api/v1/tax/crs/" + crsYear), {}),
    onSuccess: (res: { data: FATCACRSResult }) => {
      setCrsResult(res.data);
      qc.invalidateQueries({ queryKey: ["tax-events"] });
      qc.invalidateQueries({ queryKey: ["tax-summary"] });
    },
  });

  const filingMutation = useMutation({
    mutationFn: () => apiRequest("POST", apiUrl("/api/v1/tax/1601fq/" + filingMonth), {}),
    onSuccess: (res: { data: Filing1601FQ }) => {
      setFilings((prev) => [res.data, ...prev.filter((f) => f.month !== res.data.month)]);
      qc.invalidateQueries({ queryKey: ["tax-summary"] });
    },
  });

  // -- Render --
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tax Management</h1>
          <p className="text-muted-foreground">Philippine taxation engine -- WHT, BIR forms, FATCA/CRS reporting</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Info className="mr-2 h-4 w-4" />PH WHT Rates</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Philippine WHT Rate Schedule</DialogTitle></DialogHeader>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PH_WHT_RATES.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell>{r.category}</TableCell>
                    <TableCell className="text-right font-medium">{r.rate}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      {/* Summary cards */}
      {summaryQ.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Tax Events</CardTitle>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalEvents ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">In selected period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">WHT Collected</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtCurrency(summary?.totalWHT ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">Withholding tax total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">BIR Forms Generated</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.birFormsGenerated ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">2306 / 2307 / 2316</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">FATCA/CRS Status</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.fatcaReportableAccounts ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Reportable accounts</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Tax Events</TabsTrigger>
          <TabsTrigger value="bir">BIR Forms</TabsTrigger>
          <TabsTrigger value="fatca-crs">FATCA / CRS</TabsTrigger>
          <TabsTrigger value="1601fq">1601-FQ</TabsTrigger>
        </TabsList>

        {/* ---- Tax Events ---- */}
        <TabsContent value="events" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Tax Type</label>
              <Select value={taxTypeFilter} onValueChange={(v) => { setTaxTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="WHT">WHT</SelectItem>
                  <SelectItem value="FATCA">FATCA</SelectItem>
                  <SelectItem value="CRS">CRS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Portfolio</label>
              <Input value={portfolioFilter} onChange={(e) => { setPortfolioFilter(e.target.value); setPage(1); }} placeholder="e.g. PF-001" className="w-[160px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="w-[160px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="w-[160px]" />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Trade ID</TableHead>
                    <TableHead>Portfolio</TableHead>
                    <TableHead>Tax Type</TableHead>
                    <TableHead className="text-right">Gross Amount</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Tax Amount</TableHead>
                    <TableHead>BIR Form</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventsQ.isLoading && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />Loading...
                      </TableCell>
                    </TableRow>
                  )}
                  {!eventsQ.isLoading && events.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No tax events found for the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {events.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(ev.created_at)}</TableCell>
                      <TableCell className="font-mono text-xs">{ev.trade_id ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{ev.portfolio_id ?? "-"}</TableCell>
                      <TableCell><Badge variant={taxBadgeVariant(ev.tax_type) as any}>{ev.tax_type}</Badge></TableCell>
                      <TableCell className="text-right">{fmtCurrency(ev.gross_amount)}</TableCell>
                      <TableCell className="text-right">{fmtPct(ev.tax_rate)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtCurrency(ev.tax_amount)}</TableCell>
                      <TableCell>{ev.bir_form_type ?? "-"}</TableCell>
                      <TableCell><Badge variant={statusBadgeVariant(ev.filing_status) as any}>{ev.filing_status ?? "N/A"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {events.length} of {totalEvents} events (page {page} of {totalPages})
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4 mr-1" />Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ---- BIR Forms ---- */}
        <TabsContent value="bir" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Generate BIR Form</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Form Type</label>
                  <Select value={birFormType} onValueChange={setBirFormType}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2306">2306 -- Creditable WHT</SelectItem>
                      <SelectItem value="2307">2307 -- Expanded WHT</SelectItem>
                      <SelectItem value="2316">2316 -- Annual Wages</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Portfolio ID (optional)</label>
                  <Input value={birPortfolioId} onChange={(e) => setBirPortfolioId(e.target.value)} placeholder="e.g. PF-001" className="w-[180px]" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Period From</label>
                  <Input type="date" value={birPeriodFrom} onChange={(e) => setBirPeriodFrom(e.target.value)} className="w-[160px]" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Period To</label>
                  <Input type="date" value={birPeriodTo} onChange={(e) => setBirPeriodTo(e.target.value)} className="w-[160px]" />
                </div>
                <Button onClick={() => birMutation.mutate()} disabled={birMutation.isPending}>
                  {birMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Generate
                </Button>
              </div>

              {birMutation.isError && (
                <p className="text-sm text-destructive">Failed to generate BIR form. Please try again.</p>
              )}

              {birResult && (
                <div className="mt-4 space-y-3">
                  <Separator />
                  <div className="flex items-center gap-2">
                    <Badge>BIR {birResult.formType}</Badge>
                    <span className="text-sm text-muted-foreground">Generated {fmtDate(birResult.generatedAt)}</span>
                    <span className="text-sm font-medium ml-auto">Total Tax: {fmtCurrency(birResult.totalTax)}</span>
                  </div>
                  {birResult.note && <p className="text-sm text-muted-foreground">{birResult.note}</p>}
                  {birResult.data.length > 0 ? (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Portfolio</TableHead>
                          <TableHead>TIN</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Tax</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {birResult.data.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{r.portfolioId}</TableCell>
                            <TableCell>{r.tin ?? "-"}</TableCell>
                            <TableCell className="text-right">{fmtCurrency(r.totalGross)}</TableCell>
                            <TableCell className="text-right font-medium">{fmtCurrency(r.totalTax)}</TableCell>
                            <TableCell className="text-right">{r.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-3">No matching tax events for the selected criteria.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- FATCA / CRS ---- */}
        <TabsContent value="fatca-crs" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">FATCA Report</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Foreign Account Tax Compliance Act -- annual report of US-person reportable accounts.
                </p>
                <div className="flex items-end gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Year</label>
                    <Input type="number" min={2000} max={2100} value={fatcaYear} onChange={(e) => setFatcaYear(e.target.value)} className="w-[120px]" />
                  </div>
                  <Button onClick={() => fatcaMutation.mutate()} disabled={fatcaMutation.isPending}>
                    {fatcaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Generate FATCA
                  </Button>
                </div>
                {fatcaMutation.isError && <p className="text-sm text-destructive">FATCA generation failed.</p>}
                {fatcaResult && (
                  <div className="rounded border p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">FATCA</Badge>
                      <span className="text-sm font-medium">{fatcaResult.year}</span>
                    </div>
                    <p className="text-sm">Reportable accounts: <strong>{fatcaResult.reportableAccounts}</strong></p>
                    <p className="text-xs text-muted-foreground">Generated: {fmtDate(fatcaResult.generatedAt)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">CRS Report</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Common Reporting Standard -- annual report of non-resident reportable accounts.
                </p>
                <div className="flex items-end gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Year</label>
                    <Input type="number" min={2000} max={2100} value={crsYear} onChange={(e) => setCrsYear(e.target.value)} className="w-[120px]" />
                  </div>
                  <Button onClick={() => crsMutation.mutate()} disabled={crsMutation.isPending}>
                    {crsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Generate CRS
                  </Button>
                </div>
                {crsMutation.isError && <p className="text-sm text-destructive">CRS generation failed.</p>}
                {crsResult && (
                  <div className="rounded border p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">CRS</Badge>
                      <span className="text-sm font-medium">{crsResult.year}</span>
                    </div>
                    <p className="text-sm">Reportable accounts: <strong>{crsResult.reportableAccounts}</strong></p>
                    <p className="text-xs text-muted-foreground">Generated: {fmtDate(crsResult.generatedAt)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---- 1601-FQ ---- */}
        <TabsContent value="1601fq" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Monthly 1601-FQ Filing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                BIR Form 1601-FQ -- Quarterly Remittance Return of Final Income Taxes Withheld.
              </p>
              <div className="flex items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Month (YYYY-MM)</label>
                  <Input type="month" value={filingMonth} onChange={(e) => setFilingMonth(e.target.value)} className="w-[180px]" />
                </div>
                <Button onClick={() => filingMutation.mutate()} disabled={filingMutation.isPending}>
                  {filingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Generate 1601-FQ
                </Button>
              </div>

              {filingMutation.isError && (
                <p className="text-sm text-destructive">Filing generation failed. Please try again.</p>
              )}

              {filings.length > 0 && (
                <>
                  <Separator />
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Total WHT</TableHead>
                        <TableHead className="text-right">Events</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Generated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filings.map((f) => (
                        <TableRow key={f.month}>
                          <TableCell className="font-medium">{f.month}</TableCell>
                          <TableCell className="text-right font-medium">{fmtCurrency(f.totalWHT)}</TableCell>
                          <TableCell className="text-right">{f.eventCount}</TableCell>
                          <TableCell><Badge variant="default">GENERATED</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{fmtDate(f.generatedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </>
              )}

              {filings.length === 0 && !filingMutation.isPending && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No filings generated yet. Select a month and click Generate.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
