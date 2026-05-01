/**
 * ebt-plan-detail.tsx — EBT Plan Detail with Tabbed Views
 *
 * Shows plan overview, members, contributions, balance sheets,
 * benefit claims, gratuity rules, tax rules, loans, and income distributions.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ui/components/ui/tabs";
import { useToast } from "@ui/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Users,
  Banknote,
  FileText,
  Scale,
  Shield,
  DollarSign,
  UserMinus,
  Undo2,
} from "lucide-react";

const API = "/api/v1/ebt";

function fmt(n: string | number | null | undefined): string {
  const val = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  SEPARATED: "bg-red-100 text-red-800",
  RETIRED: "bg-blue-100 text-blue-800",
  REINSTATED: "bg-purple-100 text-purple-800",
  DECEASED: "bg-gray-200 text-gray-600",
};

export default function EbtPlanDetail() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddMember, setShowAddMember] = useState(false);

  // Fetch plan
  const { data: plan } = useQuery({
    queryKey: ["ebt-plan", planId],
    queryFn: async () => {
      const res = await fetch(`${API}/plans/${planId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Plan not found");
      return res.json();
    },
    enabled: !!planId,
  });

  // Fetch members
  const { data: membersResult } = useQuery({
    queryKey: ["ebt-members", planId],
    queryFn: async () => {
      const res = await fetch(`${API}/plans/${planId}/members?pageSize=100`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    enabled: !!planId,
  });
  const members = membersResult?.data ?? [];

  // Fetch gratuity rules
  const { data: gratuityRules = [] } = useQuery({
    queryKey: ["ebt-gratuity-rules", planId],
    queryFn: async () => {
      const res = await fetch(`${API}/plans/${planId}/gratuity-rules`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!planId && activeTab === "gratuity",
  });

  // Fetch tax rules
  const { data: taxRules = [] } = useQuery({
    queryKey: ["ebt-tax-rules", planId],
    queryFn: async () => {
      const res = await fetch(`${API}/plans/${planId}/tax-rules`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!planId && activeTab === "tax",
  });

  // Fetch income distributions
  const { data: distributions = [] } = useQuery({
    queryKey: ["ebt-distributions", planId],
    queryFn: async () => {
      const res = await fetch(`${API}/plans/${planId}/income-distributions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!planId && activeTab === "income",
  });

  // Add member mutation
  const addMember = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch(`${API}/plans/${planId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ebt-members", planId] });
      setShowAddMember(false);
      toast({ title: "Member added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!plan) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading plan...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/ebt/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{plan.plan_name}</h1>
          <p className="text-muted-foreground">
            {plan.plan_id} | {plan.plan_type} | Vesting: {plan.vesting_years} yrs
            {plan.is_multi_employer ? " | Multi-Employer" : ""}
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Members</p>
            <p className="text-2xl font-bold">{members.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Employer Contrib. Rate</p>
            <p className="text-2xl font-bold">
              {plan.employer_contribution_rate
                ? `${(parseFloat(plan.employer_contribution_rate) * 100).toFixed(1)}%`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Income Distribution</p>
            <p className="text-lg font-bold">{plan.income_distribution_method?.replace(/_/g, " ")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Minimum Benefit</p>
            <p className="text-lg font-bold">
              {plan.minimum_benefit_enabled
                ? `PHP ${fmt(plan.minimum_benefit_amount)}`
                : "Disabled"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview"><Users className="h-4 w-4 mr-1" /> Members</TabsTrigger>
          <TabsTrigger value="gratuity"><Scale className="h-4 w-4 mr-1" /> Gratuity Rules</TabsTrigger>
          <TabsTrigger value="tax"><Shield className="h-4 w-4 mr-1" /> Tax Rules</TabsTrigger>
          <TabsTrigger value="income"><DollarSign className="h-4 w-4 mr-1" /> Income Dist.</TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Plan Members</CardTitle>
              <Sheet open={showAddMember} onOpenChange={setShowAddMember}>
                <SheetTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Member</Button>
                </SheetTrigger>
                <SheetContent className="w-[500px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Add Member</SheetTitle>
                  </SheetHeader>
                  <AddMemberForm
                    onSubmit={(data) => addMember.mutate(data)}
                    isSubmitting={addMember.isPending}
                  />
                </SheetContent>
              </Sheet>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Vesting %</TableHead>
                    <TableHead>Enrolled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No members enrolled
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((m: any) => (
                      <TableRow key={m.member_id}>
                        <TableCell className="font-mono text-sm">{m.member_id}</TableCell>
                        <TableCell>{m.employee_id}</TableCell>
                        <TableCell className="font-medium">
                          {m.first_name} {m.last_name}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[m.member_status] ?? ""}>
                            {m.member_status}
                          </Badge>
                        </TableCell>
                        <TableCell>{m.department ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(m.current_balance)}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.vesting_percentage
                            ? `${parseFloat(m.vesting_percentage).toFixed(1)}%`
                            : "—"}
                        </TableCell>
                        <TableCell>{m.enrollment_date}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gratuity Rules Tab */}
        <TabsContent value="gratuity">
          <Card>
            <CardHeader>
              <CardTitle>Gratuity Calculation Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule ID</TableHead>
                    <TableHead>Min Years</TableHead>
                    <TableHead>Max Years</TableHead>
                    <TableHead>Multiplier</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>Cap</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gratuityRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No gratuity rules configured
                      </TableCell>
                    </TableRow>
                  ) : (
                    gratuityRules.map((r: any) => (
                      <TableRow key={r.rule_id}>
                        <TableCell className="font-mono text-sm">{r.rule_id}</TableCell>
                        <TableCell>{r.min_years_of_service}</TableCell>
                        <TableCell>{r.max_years_of_service ?? "—"}</TableCell>
                        <TableCell className="font-medium">{r.multiplier}x</TableCell>
                        <TableCell>{r.base_type?.replace(/_/g, " ")}</TableCell>
                        <TableCell>{r.cap_amount ? fmt(r.cap_amount) : "None"}</TableCell>
                        <TableCell>
                          <Badge className={r.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                            {r.is_active ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax Rules Tab */}
        <TabsContent value="tax">
          <Card>
            <CardHeader>
              <CardTitle>Tax Structure & Exemption Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule ID</TableHead>
                    <TableHead>Tax Type</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Exempt</TableHead>
                    <TableHead>Min Years</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No tax rules configured
                      </TableCell>
                    </TableRow>
                  ) : (
                    taxRules.map((r: any) => (
                      <TableRow key={r.rule_id}>
                        <TableCell className="font-mono text-sm">{r.rule_id}</TableCell>
                        <TableCell>{r.tax_type}</TableCell>
                        <TableCell>{r.applies_to}</TableCell>
                        <TableCell>{(parseFloat(r.tax_rate) * 100).toFixed(2)}%</TableCell>
                        <TableCell>{r.threshold_amount ? fmt(r.threshold_amount) : "—"}</TableCell>
                        <TableCell>
                          {r.is_exempt ? (
                            <Badge className="bg-green-100 text-green-800">Exempt</Badge>
                          ) : "No"}
                        </TableCell>
                        <TableCell>{r.min_years_for_exemption ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Income Distribution Tab */}
        <TabsContent value="income">
          <Card>
            <CardHeader>
              <CardTitle>Income Distributions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Distribution ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead className="text-right">Total Income</TableHead>
                    <TableHead className="text-right">Distributed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distributions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No income distributions recorded
                      </TableCell>
                    </TableRow>
                  ) : (
                    distributions.map((d: any) => (
                      <TableRow key={d.distribution_id}>
                        <TableCell className="font-mono text-sm">{d.distribution_id}</TableCell>
                        <TableCell>{d.distribution_date}</TableCell>
                        <TableCell>{d.distribution_method?.replace(/_/g, " ")}</TableCell>
                        <TableCell>{d.member_count}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(d.total_income)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(d.total_distributed)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Add Member Form ─────────────────────────────────────────────────────────

function AddMemberForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (data: Record<string, any>) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    employee_id: "",
    first_name: "",
    last_name: "",
    middle_name: "",
    date_of_birth: "",
    date_of_hire: "",
    department: "",
    position: "",
    monthly_salary: "",
    beneficiary_name: "",
    beneficiary_relationship: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label>Employee ID</Label>
        <Input required value={form.employee_id}
          onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>First Name</Label>
          <Input required value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
        </div>
        <div>
          <Label>Last Name</Label>
          <Input required value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Date of Birth</Label>
          <Input type="date" value={form.date_of_birth}
            onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
        </div>
        <div>
          <Label>Date of Hire</Label>
          <Input type="date" value={form.date_of_hire}
            onChange={(e) => setForm({ ...form, date_of_hire: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Department</Label>
          <Input value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </div>
        <div>
          <Label>Position</Label>
          <Input value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Monthly Salary</Label>
        <Input type="number" step="0.01" value={form.monthly_salary}
          onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Beneficiary Name</Label>
          <Input value={form.beneficiary_name}
            onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })} />
        </div>
        <div>
          <Label>Relationship</Label>
          <Input value={form.beneficiary_relationship}
            onChange={(e) => setForm({ ...form, beneficiary_relationship: e.target.value })} />
        </div>
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Adding..." : "Add Member"}
      </Button>
    </form>
  );
}
