/**
 * loan-dashboard.tsx — Corporate Trust Loan Management Dashboard
 *
 * Displays all loan facilities with summary cards, filterable table,
 * overdue alerts, and upcoming payment notifications.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Badge } from "@ui/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ui/components/ui/sheet";
import { Label } from "@ui/components/ui/label";
import { Skeleton } from "@ui/components/ui/skeleton";
import { useToast } from "@ui/components/ui/toast";
import {
  Banknote, Plus, Search, AlertTriangle, Calendar, TrendingUp,
  DollarSign, ChevronLeft, ChevronRight, Eye,
} from "lucide-react";

const API_BASE = "/api/v1/loans";

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(num);
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    PENDING_APPROVAL: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-blue-100 text-blue-800",
    ACTIVE: "bg-green-100 text-green-800",
    MATURED: "bg-purple-100 text-purple-800",
    DEFAULTED: "bg-red-100 text-red-800",
    RESTRUCTURED: "bg-orange-100 text-orange-800",
    CLOSED: "bg-gray-200 text-gray-600",
    CANCELLED: "bg-gray-200 text-gray-500",
  };
  return <Badge className={colors[status] ?? "bg-gray-100"}>{status.replace(/_/g, " ")}</Badge>;
}

export default function LoanDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const summaryQuery = useQuery({
    queryKey: ["loans", "dashboard-summary"],
    queryFn: () => fetch(`${API_BASE}/dashboard/summary`).then((r) => r.json()),
  });

  const listQuery = useQuery({
    queryKey: ["loans", "list", page, pageSize, search, statusFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("loanType", typeFilter);
      return fetch(`${API_BASE}?${params}`).then((r) => r.json());
    },
  });

  const upcomingQuery = useQuery({
    queryKey: ["loans", "upcoming-payments"],
    queryFn: () => fetch(`${API_BASE}/dashboard/upcoming-payments?days=15`).then((r) => r.json()),
  });

  const overdueQuery = useQuery({
    queryKey: ["loans", "overdue-payments"],
    queryFn: () => fetch(`${API_BASE}/dashboard/overdue`).then((r) => r.json()),
  });

  // ── Create mutation ─────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: any) =>
      fetch(API_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then((r) => { if (!r.ok) throw new Error("Failed to create"); return r.json(); }),
    onSuccess: () => {
      toast({ title: "Loan facility created" });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setCreateOpen(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const summary = summaryQuery.data;
  const facilities = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const upcoming = upcomingQuery.data ?? [];
  const overdue = overdueQuery.data ?? [];

  // ── Create form state ───────────────────────────────────────────────────────
  const [formData, setFormData] = useState<Record<string, any>>({
    facility_name: "", loan_type: "TERM_LOAN", currency: "PHP", facility_amount: "",
    interest_rate: "", interest_type: "FIXED", interest_basis: "ACT_360",
    amortization_type: "EQUAL_AMORTIZATION", payment_frequency: "QUARTERLY",
    effective_date: "", maturity_date: "",
  });

  const handleCreate = useCallback(() => {
    if (!formData.facility_name || !formData.facility_amount || !formData.effective_date || !formData.maturity_date) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  }, [formData, createMutation, toast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Corporate Trust — Loan Management</h1>
          <p className="text-muted-foreground">Manage loan facilities, payments, collaterals, and MPCs</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Facility
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Facilities</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_facilities ?? "—"}</div>
            <p className="text-xs text-muted-foreground">{summary?.active_count ?? 0} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Principal</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary ? formatCurrency(summary.total_outstanding) : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Credit</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary ? formatCurrency(summary.total_available) : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Payments</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary?.overdue_count ?? 0}</div>
            <p className="text-xs text-muted-foreground">{summary ? formatCurrency(summary.overdue_amount) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Row */}
      {(overdue.length > 0 || upcoming.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {overdue.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-700">
                  <AlertTriangle className="inline h-4 w-4 mr-1" /> Overdue Payments ({overdue.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                  {overdue.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="flex justify-between">
                      <span>{p.facility_id} — {p.payment_type}</span>
                      <span className="font-medium text-red-600">{formatCurrency(p.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {upcoming.length > 0 && (
            <Card className="border-yellow-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-700">
                  <Calendar className="inline h-4 w-4 mr-1" /> Upcoming Payments — Next 15 Days ({upcoming.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                  {upcoming.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="flex justify-between">
                      <span>{p.facility_id} — {p.scheduled_date}</span>
                      <span className="font-medium">{formatCurrency(p.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search facilities..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "ALL" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="MATURED">Matured</SelectItem>
            <SelectItem value="DEFAULTED">Defaulted</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "ALL" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="TERM_LOAN">Term Loan</SelectItem>
            <SelectItem value="REVOLVING_CREDIT">Revolving Credit</SelectItem>
            <SelectItem value="PROJECT_FINANCE">Project Finance</SelectItem>
            <SelectItem value="SYNDICATED_LOAN">Syndicated Loan</SelectItem>
            <SelectItem value="MORTGAGE_LOAN">Mortgage Loan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Facility ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Facility Amount</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Maturity</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : facilities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No loan facilities found
                </TableCell>
              </TableRow>
            ) : (
              facilities.map((f: any) => (
                <TableRow
                  key={f.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/corporate-trust/loans/${f.facility_id}`)}
                >
                  <TableCell className="font-mono text-sm">{f.facility_id}</TableCell>
                  <TableCell className="font-medium">{f.facility_name}</TableCell>
                  <TableCell>{f.loan_type?.replace(/_/g, " ")}</TableCell>
                  <TableCell>{statusBadge(f.loan_status)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(f.facility_amount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(f.outstanding_principal)}</TableCell>
                  <TableCell>{parseFloat(f.interest_rate).toFixed(2)}%</TableCell>
                  <TableCell>{f.maturity_date}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/corporate-trust/loans/${f.facility_id}`); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Facility Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Loan Facility</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Facility Name *</Label>
              <Input value={formData.facility_name} onChange={(e) => setFormData({ ...formData, facility_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Loan Type</Label>
                <Select value={formData.loan_type} onValueChange={(v) => setFormData({ ...formData, loan_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TERM_LOAN">Term Loan</SelectItem>
                    <SelectItem value="REVOLVING_CREDIT">Revolving Credit</SelectItem>
                    <SelectItem value="PROJECT_FINANCE">Project Finance</SelectItem>
                    <SelectItem value="SYNDICATED_LOAN">Syndicated Loan</SelectItem>
                    <SelectItem value="BILATERAL_LOAN">Bilateral Loan</SelectItem>
                    <SelectItem value="MORTGAGE_LOAN">Mortgage Loan</SelectItem>
                    <SelectItem value="BRIDGE_LOAN">Bridge Loan</SelectItem>
                    <SelectItem value="WORKING_CAPITAL">Working Capital</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHP">PHP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Facility Amount *</Label>
              <Input type="number" value={formData.facility_amount} onChange={(e) => setFormData({ ...formData, facility_amount: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Interest Rate (%) *</Label>
                <Input type="number" step="0.01" value={formData.interest_rate} onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })} />
              </div>
              <div>
                <Label>Interest Type</Label>
                <Select value={formData.interest_type} onValueChange={(v) => setFormData({ ...formData, interest_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed</SelectItem>
                    <SelectItem value="FLOATING">Floating</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Day Count</Label>
                <Select value={formData.interest_basis} onValueChange={(v) => setFormData({ ...formData, interest_basis: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACT_360">ACT/360</SelectItem>
                    <SelectItem value="ACT_365">ACT/365</SelectItem>
                    <SelectItem value="ACT_ACT">ACT/ACT</SelectItem>
                    <SelectItem value="30_360">30/360</SelectItem>
                    <SelectItem value="30_365">30/365</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Frequency</Label>
                <Select value={formData.payment_frequency} onValueChange={(v) => setFormData({ ...formData, payment_frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                    <SelectItem value="SEMI_ANNUAL">Semi-Annual</SelectItem>
                    <SelectItem value="ANNUAL">Annual</SelectItem>
                    <SelectItem value="AT_MATURITY">At Maturity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Amortization Type</Label>
              <Select value={formData.amortization_type} onValueChange={(v) => setFormData({ ...formData, amortization_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EQUAL_AMORTIZATION">Equal Amortization (French)</SelectItem>
                  <SelectItem value="EQUAL_PRINCIPAL">Equal Principal</SelectItem>
                  <SelectItem value="BULLET">Bullet</SelectItem>
                  <SelectItem value="BALLOON">Balloon</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Effective Date *</Label>
                <Input type="date" value={formData.effective_date} onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })} />
              </div>
              <div>
                <Label>Maturity Date *</Label>
                <Input type="date" value={formData.maturity_date} onChange={(e) => setFormData({ ...formData, maturity_date: e.target.value })} />
              </div>
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Facility"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
