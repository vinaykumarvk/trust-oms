/**
 * ebt-dashboard.tsx — Employee Benefit Trust Dashboard
 *
 * Overview of EBT plans, members, contributions, claims, and key metrics.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Badge } from "@ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ui/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Label } from "@ui/components/ui/label";
import { Textarea } from "@ui/components/ui/textarea";
import { useToast } from "@ui/hooks/use-toast";
import {
  Heart,
  Plus,
  Search,
  Users,
  Banknote,
  Clock,
  CheckCircle,
} from "lucide-react";

const API = "/api/v1/ebt";

function fmt(n: string | number | null | undefined): string {
  const val = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return val.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  SEPARATED: "bg-red-100 text-red-800",
  RETIRED: "bg-blue-100 text-blue-800",
  REINSTATED: "bg-purple-100 text-purple-800",
  DRAFT: "bg-gray-100 text-gray-800",
  SUBMITTED: "bg-yellow-100 text-yellow-800",
  UNDER_REVIEW: "bg-orange-100 text-orange-800",
  APPROVED: "bg-green-100 text-green-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  RELEASED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-800",
  ON_HOLD: "bg-amber-100 text-amber-800",
};

export default function EbtDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Determine active tab from URL
  const activeTab = location.pathname.includes("/claims")
    ? "claims"
    : location.pathname.includes("/separations")
    ? "separations"
    : location.pathname.includes("/plans") && !location.pathname.includes("/plans/")
    ? "plans"
    : "dashboard";

  // Fetch plans
  const { data: plans = [] } = useQuery({
    queryKey: ["ebt-plans"],
    queryFn: async () => {
      const res = await fetch(API + "/plans", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
  });

  // Fetch dashboard summary
  const { data: summary } = useQuery({
    queryKey: ["ebt-dashboard"],
    queryFn: async () => {
      const res = await fetch(API + "/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
  });

  // Fetch claims
  const { data: claims = [] } = useQuery({
    queryKey: ["ebt-claims"],
    queryFn: async () => {
      const res = await fetch(API + "/claims", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch claims");
      return res.json();
    },
    enabled: activeTab === "claims" || activeTab === "dashboard",
  });

  // Create plan mutation
  const createPlan = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch(API + "/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ebt-plans"] });
      queryClient.invalidateQueries({ queryKey: ["ebt-dashboard"] });
      setShowCreate(false);
      toast({ title: "Plan created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredPlans = plans.filter((p: any) =>
    `${p.plan_name} ${p.plan_id}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredClaims = claims.filter((c: any) =>
    `${c.claim_id} ${c.member_id}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6" />
            Employee Benefit Trust
          </h1>
          <p className="text-muted-foreground">
            Manage EBT plans, members, contributions, and benefit claims
          </p>
        </div>
        <Sheet open={showCreate} onOpenChange={setShowCreate}>
          <SheetTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Plan
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Create EBT Plan</SheetTitle>
            </SheetHeader>
            <CreatePlanForm
              onSubmit={(data) => createPlan.mutate(data)}
              isSubmitting={createPlan.isPending}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_members ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.active_members ?? 0} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                PHP {fmt(summary.total_balance)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Employer: {fmt(summary.total_employer_contrib)} | Employee: {fmt(summary.total_employee_contrib)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Claims
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {summary.pending_claims ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.approved_claims ?? 0} approved
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Released Benefits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                PHP {fmt(summary.released_amount)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={activeTab === "claims" ? "Search claims..." : "Search plans..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Plans Table (default or /plans) */}
      {(activeTab === "dashboard" || activeTab === "plans") && (
        <Card>
          <CardHeader>
            <CardTitle>EBT Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Multi-Employer</TableHead>
                  <TableHead>Vesting (yrs)</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No plans found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPlans.map((plan: any) => (
                    <TableRow
                      key={plan.plan_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/ebt/plans/${plan.plan_id}`)}
                    >
                      <TableCell className="font-mono text-sm">{plan.plan_id}</TableCell>
                      <TableCell className="font-medium">{plan.plan_name}</TableCell>
                      <TableCell>{plan.plan_type}</TableCell>
                      <TableCell>
                        {plan.is_multi_employer ? (
                          <Badge variant="outline">Multi</Badge>
                        ) : (
                          "Single"
                        )}
                      </TableCell>
                      <TableCell>{plan.vesting_years}</TableCell>
                      <TableCell>{plan.effective_date}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/ebt/plans/${plan.plan_id}`);
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Claims Table */}
      {activeTab === "claims" && (
        <Card>
          <CardHeader>
            <CardTitle>Benefit Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim ID</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Separation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClaims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No claims found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClaims.map((c: any) => (
                    <TableRow key={c.claim_id}>
                      <TableCell className="font-mono text-sm">{c.claim_id}</TableCell>
                      <TableCell>{c.member_id}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[c.claim_status] ?? ""}>
                          {c.claim_status}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.calculation_method}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(c.gross_benefit_amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(c.tax_amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {fmt(c.net_benefit_amount)}
                      </TableCell>
                      <TableCell>{c.separation_reason}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Separations Table */}
      {activeTab === "separations" && (
        <SeparationsView />
      )}
    </div>
  );
}

// ─── Create Plan Form ────────────────────────────────────────────────────────

function CreatePlanForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (data: Record<string, any>) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    plan_name: "",
    plan_type: "DEFINED_CONTRIBUTION",
    vesting_years: "5",
    employer_contribution_rate: "",
    employee_contribution_rate: "",
    is_multi_employer: false,
    minimum_benefit_enabled: false,
    minimum_benefit_amount: "",
    income_distribution_method: "PRO_RATA_BALANCE",
    reinstatement_cutoff_days: "365",
    remarks: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      vesting_years: parseInt(form.vesting_years) || 5,
      reinstatement_cutoff_days: parseInt(form.reinstatement_cutoff_days) || 365,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label>Plan Name</Label>
        <Input
          required
          value={form.plan_name}
          onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
        />
      </div>
      <div>
        <Label>Plan Type</Label>
        <Select
          value={form.plan_type}
          onValueChange={(v) => setForm({ ...form, plan_type: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="DEFINED_CONTRIBUTION">Defined Contribution</SelectItem>
            <SelectItem value="DEFINED_BENEFIT">Defined Benefit</SelectItem>
            <SelectItem value="HYBRID">Hybrid</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Vesting Years</Label>
          <Input
            type="number"
            min="1"
            value={form.vesting_years}
            onChange={(e) => setForm({ ...form, vesting_years: e.target.value })}
          />
        </div>
        <div>
          <Label>Reinstatement Cutoff (days)</Label>
          <Input
            type="number"
            min="0"
            value={form.reinstatement_cutoff_days}
            onChange={(e) => setForm({ ...form, reinstatement_cutoff_days: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Employer Contrib. Rate</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 0.05"
            value={form.employer_contribution_rate}
            onChange={(e) => setForm({ ...form, employer_contribution_rate: e.target.value })}
          />
        </div>
        <div>
          <Label>Employee Contrib. Rate</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 0.03"
            value={form.employee_contribution_rate}
            onChange={(e) => setForm({ ...form, employee_contribution_rate: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label>Income Distribution Method</Label>
        <Select
          value={form.income_distribution_method}
          onValueChange={(v) => setForm({ ...form, income_distribution_method: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PRO_RATA_BALANCE">Pro-Rata by Balance</SelectItem>
            <SelectItem value="EQUAL_SHARE">Equal Share</SelectItem>
            <SelectItem value="UNITS_HELD">Units Held</SelectItem>
            <SelectItem value="CUSTOM">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Remarks</Label>
        <Textarea
          value={form.remarks}
          onChange={(e) => setForm({ ...form, remarks: e.target.value })}
        />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Creating..." : "Create Plan"}
      </Button>
    </form>
  );
}

// ─── Separations View ────────────────────────────────────────────────────────

function SeparationsView() {
  const { data: reasons = [] } = useQuery({
    queryKey: ["ebt-separation-reasons"],
    queryFn: async () => {
      const res = await fetch(API + "/separation-reasons", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Separation Reasons Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Notice Period</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reasons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No separation reasons configured
                </TableCell>
              </TableRow>
            ) : (
              reasons.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.reason_code}</TableCell>
                  <TableCell>{r.reason_name}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell>
                    {r.requires_notice_period
                      ? `${r.notice_period_days} days`
                      : "No"}
                  </TableCell>
                  <TableCell>
                    <Badge className={r.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {r.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
