/**
 * BSP Examiner Portal -- Phase 10C (Regulator Portal Enhancements)
 *
 * Read-only dashboard for Bangko Sentral ng Pilipinas (BSP) examiners.
 * Provides a consolidated view of trust operations compliance data:
 *   1. Trust Fund Compliance Status -- pass/fail summary cards
 *   2. AML/KYC Screening Results -- flagged accounts & screening stats
 *   3. Regulatory Report Generation -- shortcuts to BSP-mandated reports
 *   4. DOSRI Monitoring -- related-party transaction oversight
 *   5. Client Complaint Tracker -- complaint volume & resolution stats
 *
 * All views are strictly read-only with no edit/delete capabilities.
 * Data refreshes automatically every 60 seconds.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  AlertTriangle,
  FileBarChart,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Landmark,
  MessageSquareWarning,
  Download,
  Eye,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceSummary {
  totalFunds: number;
  passCount: number;
  failCount: number;
  warningCount: number;
  lastAssessmentDate: string;
  overallScore: number;
}

interface AmlKycSummary {
  totalScreened: number;
  clearCount: number;
  flaggedCount: number;
  pendingCount: number;
  highRiskCount: number;
  lastScreeningDate: string;
}

interface AmlFlag {
  id: string;
  clientName: string;
  accountNumber: string;
  riskRating: "HIGH" | "MEDIUM" | "LOW";
  flagType: string;
  flagDate: string;
  status: "OPEN" | "UNDER_REVIEW" | "CLEARED";
}

interface DosriEntry {
  id: string;
  relatedParty: string;
  relationship: string;
  transactionType: string;
  amount: number;
  currency: string;
  date: string;
  withinLimit: boolean;
  limitUtilization: number;
}

interface DosriSummary {
  totalRelatedParties: number;
  totalTransactions: number;
  withinLimitCount: number;
  breachCount: number;
  totalExposure: number;
  regulatoryLimit: number;
}

interface ComplaintEntry {
  id: string;
  complainant: string;
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  dateReceived: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED";
  resolutionDays: number | null;
}

interface ComplaintSummary {
  totalComplaints: number;
  openCount: number;
  resolvedCount: number;
  escalatedCount: number;
  avgResolutionDays: number;
  mtdComplaints: number;
}

// ---------------------------------------------------------------------------
// Mock data fallbacks (used when API returns no data)
// ---------------------------------------------------------------------------

const MOCK_COMPLIANCE: ComplianceSummary = {
  totalFunds: 142,
  passCount: 128,
  failCount: 6,
  warningCount: 8,
  lastAssessmentDate: "2026-04-21",
  overallScore: 94.2,
};

const MOCK_AML_KYC: AmlKycSummary = {
  totalScreened: 8_432,
  clearCount: 8_201,
  flaggedCount: 147,
  pendingCount: 84,
  highRiskCount: 23,
  lastScreeningDate: "2026-04-22",
};

const MOCK_AML_FLAGS: AmlFlag[] = [
  { id: "AML-001", clientName: "Santos Holdings Corp", accountNumber: "TF-20241001", riskRating: "HIGH", flagType: "Unusual Transaction Pattern", flagDate: "2026-04-20", status: "OPEN" },
  { id: "AML-002", clientName: "Metro Trading Inc", accountNumber: "TF-20240872", riskRating: "HIGH", flagType: "PEP Match", flagDate: "2026-04-19", status: "UNDER_REVIEW" },
  { id: "AML-003", clientName: "Pacific Ventures Ltd", accountNumber: "TF-20240655", riskRating: "MEDIUM", flagType: "Sanctions List Near-Match", flagDate: "2026-04-18", status: "UNDER_REVIEW" },
  { id: "AML-004", clientName: "Golden Star Enterprises", accountNumber: "TF-20241122", riskRating: "MEDIUM", flagType: "Structuring Alert", flagDate: "2026-04-17", status: "OPEN" },
  { id: "AML-005", clientName: "Rivera Family Trust", accountNumber: "TF-20240233", riskRating: "LOW", flagType: "KYC Document Expiry", flagDate: "2026-04-15", status: "CLEARED" },
];

const MOCK_DOSRI_SUMMARY: DosriSummary = {
  totalRelatedParties: 34,
  totalTransactions: 89,
  withinLimitCount: 85,
  breachCount: 4,
  totalExposure: 2_450_000_000,
  regulatoryLimit: 3_000_000_000,
};

const MOCK_DOSRI_ENTRIES: DosriEntry[] = [
  { id: "DOS-001", relatedParty: "Board Director - A. Cruz", relationship: "Director", transactionType: "Loan", amount: 150_000_000, currency: "PHP", date: "2026-04-20", withinLimit: true, limitUtilization: 72 },
  { id: "DOS-002", relatedParty: "Subsidiary - Cruz Holdings", relationship: "Affiliate", transactionType: "Investment", amount: 320_000_000, currency: "PHP", date: "2026-04-18", withinLimit: true, limitUtilization: 85 },
  { id: "DOS-003", relatedParty: "Officer - R. Santos", relationship: "Senior Officer", transactionType: "Loan", amount: 85_000_000, currency: "PHP", date: "2026-04-15", withinLimit: true, limitUtilization: 45 },
  { id: "DOS-004", relatedParty: "Related Co - Santos Inc", relationship: "Related Interest", transactionType: "Credit Line", amount: 510_000_000, currency: "PHP", date: "2026-04-12", withinLimit: false, limitUtilization: 102 },
];

const MOCK_COMPLAINT_SUMMARY: ComplaintSummary = {
  totalComplaints: 67,
  openCount: 12,
  resolvedCount: 48,
  escalatedCount: 7,
  avgResolutionDays: 4.2,
  mtdComplaints: 8,
};

const MOCK_COMPLAINTS: ComplaintEntry[] = [
  { id: "CMP-067", complainant: "J. Reyes", category: "Delayed Settlement", severity: "HIGH", dateReceived: "2026-04-21", status: "OPEN", resolutionDays: null },
  { id: "CMP-066", complainant: "M. Garcia", category: "Fee Dispute", severity: "MEDIUM", dateReceived: "2026-04-20", status: "IN_PROGRESS", resolutionDays: null },
  { id: "CMP-065", complainant: "L. Tan", category: "Incorrect NAV", severity: "HIGH", dateReceived: "2026-04-19", status: "ESCALATED", resolutionDays: null },
  { id: "CMP-064", complainant: "S. Cruz", category: "Reporting Error", severity: "LOW", dateReceived: "2026-04-18", status: "RESOLVED", resolutionDays: 3 },
  { id: "CMP-063", complainant: "R. Mendoza", category: "Account Access", severity: "MEDIUM", dateReceived: "2026-04-17", status: "RESOLVED", resolutionDays: 2 },
];

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function riskBadge(rating: string) {
  switch (rating) {
    case "HIGH":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">High</Badge>;
    case "MEDIUM":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Medium</Badge>;
    case "LOW":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Low</Badge>;
    default:
      return <Badge variant="outline">{rating}</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "OPEN":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Open</Badge>;
    case "UNDER_REVIEW":
    case "IN_PROGRESS":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">{status === "UNDER_REVIEW" ? "Under Review" : "In Progress"}</Badge>;
    case "CLEARED":
    case "RESOLVED":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{status === "CLEARED" ? "Cleared" : "Resolved"}</Badge>;
    case "ESCALATED":
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Escalated</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function limitBadge(withinLimit: boolean) {
  return withinLimit
    ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Within Limit</Badge>
    : <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Breach</Badge>;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatCurrency(value: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Shield;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  const colorMap = {
    default: "text-primary",
    success: "text-green-600 dark:text-green-400",
    danger: "text-red-600 dark:text-red-400",
    warning: "text-yellow-600 dark:text-yellow-400",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${colorMap[variant]}`} aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab: Trust Fund Compliance Status
// ---------------------------------------------------------------------------

function ComplianceTab() {
  const { data, isLoading } = useQuery<ComplianceSummary>({
    queryKey: ["/api/v1/regulator/compliance-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/regulator/compliance-summary")).then(
        (r) => r.json()
      ),
    refetchInterval: 60_000,
    placeholderData: MOCK_COMPLIANCE,
  });

  const summary = data ?? MOCK_COMPLIANCE;

  if (isLoading && !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Trust Funds"
          value={summary.totalFunds}
          subtitle={`Last assessed ${formatDate(summary.lastAssessmentDate)}`}
          icon={Landmark}
        />
        <SummaryCard
          title="Compliant (Pass)"
          value={summary.passCount}
          subtitle={formatPercent((summary.passCount / summary.totalFunds) * 100)}
          icon={CheckCircle}
          variant="success"
        />
        <SummaryCard
          title="Non-Compliant (Fail)"
          value={summary.failCount}
          subtitle={formatPercent((summary.failCount / summary.totalFunds) * 100)}
          icon={XCircle}
          variant="danger"
        />
        <SummaryCard
          title="Warnings"
          value={summary.warningCount}
          subtitle={`Overall score: ${formatPercent(summary.overallScore)}`}
          icon={AlertTriangle}
          variant="warning"
        />
      </div>

      {/* Compliance score bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Compliance Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Compliance Rate</span>
              <span className="font-semibold">{formatPercent(summary.overallScore)}</span>
            </div>
            <div
              className="h-3 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={summary.overallScore}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Overall compliance score: ${formatPercent(summary.overallScore)}`}
            >
              <div
                className={`h-full rounded-full transition-all ${
                  summary.overallScore >= 90
                    ? "bg-green-500"
                    : summary.overallScore >= 70
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${Math.min(summary.overallScore, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>BSP Minimum: 85%</span>
              <span>100%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance Assessment Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Last Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { category: "Investment Limits (BSP Circular 1098)", status: "PASS", score: 98, date: "2026-04-21" },
                { category: "Single Borrower Limits", status: "PASS", score: 95, date: "2026-04-21" },
                { category: "Related Party Transactions", status: "WARNING", score: 88, date: "2026-04-20" },
                { category: "UITF Concentration Limits", status: "PASS", score: 96, date: "2026-04-21" },
                { category: "Fiduciary Duty Compliance", status: "PASS", score: 99, date: "2026-04-21" },
                { category: "AML/CFT Requirements", status: "WARNING", score: 85, date: "2026-04-19" },
                { category: "Trust Fund Documentation", status: "FAIL", score: 72, date: "2026-04-18" },
                { category: "Risk Management Framework", status: "PASS", score: 93, date: "2026-04-20" },
              ].map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        row.status === "PASS"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : row.status === "WARNING"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatPercent(row.score)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: AML / KYC Screening
// ---------------------------------------------------------------------------

function AmlKycTab() {
  const { data: summary } = useQuery<AmlKycSummary>({
    queryKey: ["/api/v1/regulator/aml-kyc-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/regulator/aml-kyc-summary")).then((r) => r.json()),
    refetchInterval: 60_000,
    placeholderData: MOCK_AML_KYC,
  });

  const { data: flags } = useQuery<AmlFlag[]>({
    queryKey: ["/api/v1/regulator/aml-flags"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/regulator/aml-flags")).then((r) => r.json()),
    refetchInterval: 60_000,
    placeholderData: MOCK_AML_FLAGS,
  });

  const aml = summary ?? MOCK_AML_KYC;
  const flagList = flags ?? MOCK_AML_FLAGS;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <SummaryCard title="Total Screened" value={aml.totalScreened.toLocaleString()} icon={Users} />
        <SummaryCard title="Clear" value={aml.clearCount.toLocaleString()} icon={CheckCircle} variant="success" />
        <SummaryCard title="Flagged" value={aml.flaggedCount} icon={ShieldAlert} variant="danger" />
        <SummaryCard title="Pending Review" value={aml.pendingCount} icon={Clock} variant="warning" />
        <SummaryCard title="High Risk" value={aml.highRiskCount} icon={AlertTriangle} variant="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flagged Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag ID</TableHead>
                <TableHead>Client Name</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Risk Rating</TableHead>
                <TableHead>Flag Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flagList.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell className="font-mono text-xs">{flag.id}</TableCell>
                  <TableCell className="font-medium">{flag.clientName}</TableCell>
                  <TableCell className="font-mono text-xs">{flag.accountNumber}</TableCell>
                  <TableCell>{riskBadge(flag.riskRating)}</TableCell>
                  <TableCell>{flag.flagType}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(flag.flagDate)}</TableCell>
                  <TableCell>{statusBadge(flag.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: BSP Reports
// ---------------------------------------------------------------------------

function ReportsTab() {
  const reports = [
    { id: "BSP-FRP", name: "Fund Risk Profile Report (FRPTI)", description: "Monthly risk profile and trust investment portfolio report per BSP Circular 1098", frequency: "Monthly", lastGenerated: "2026-03-31", icon: FileBarChart },
    { id: "BSP-CAMELS", name: "Trust CAMELS Rating Report", description: "Quarterly composite rating across Capital, Asset Quality, Management, Earnings, Liquidity, Sensitivity", frequency: "Quarterly", lastGenerated: "2026-03-31", icon: FileText },
    { id: "BSP-STR", name: "Suspicious Transaction Report (STR)", description: "Filed STRs per AMLA requirements and BSP Circular 706", frequency: "As needed", lastGenerated: "2026-04-18", icon: ShieldAlert },
    { id: "BSP-CTR", name: "Covered Transaction Report (CTR)", description: "Transactions exceeding PHP 500,000 threshold per AMLA Section 9", frequency: "Within 5 days", lastGenerated: "2026-04-21", icon: FileText },
    { id: "BSP-DOSRI", name: "DOSRI Report", description: "Directors, Officers, Stockholders and Related Interests loan/transaction exposure report", frequency: "Quarterly", lastGenerated: "2026-03-31", icon: Users },
    { id: "BSP-CAR", name: "Capital Adequacy Report", description: "Trust department capital adequacy ratio per BSP Circular 538", frequency: "Quarterly", lastGenerated: "2026-03-31", icon: Landmark },
    { id: "BSP-UITF", name: "UITF Performance Report", description: "Unit Investment Trust Fund performance disclosure per BSP Circular 447", frequency: "Daily", lastGenerated: "2026-04-21", icon: FileBarChart },
    { id: "BSP-AML", name: "AML Compliance Report", description: "Anti-Money Laundering program effectiveness and risk assessment summary", frequency: "Semi-Annual", lastGenerated: "2026-03-31", icon: Shield },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">BSP Regulatory Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {reports.map((report) => (
              <Card key={report.id} className="border border-border/60">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <report.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold truncate">{report.name}</h4>
                        <Badge variant="outline" className="shrink-0 text-xs">{report.frequency}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{report.description}</p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted-foreground">
                          Last: {formatDate(report.lastGenerated)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          aria-label={`View ${report.name}`}
                        >
                          <Eye className="h-3 w-3" aria-hidden="true" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Generation Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="gap-2" aria-label="Generate FRPTI Report">
              <Download className="h-4 w-4" aria-hidden="true" />
              Generate FRPTI Report
            </Button>
            <Button variant="outline" className="gap-2" aria-label="Generate DOSRI Report">
              <Download className="h-4 w-4" aria-hidden="true" />
              Generate DOSRI Report
            </Button>
            <Button variant="outline" className="gap-2" aria-label="Generate UITF Report">
              <Download className="h-4 w-4" aria-hidden="true" />
              Generate UITF Report
            </Button>
            <Button variant="outline" className="gap-2" aria-label="Generate AML Summary">
              <Download className="h-4 w-4" aria-hidden="true" />
              Generate AML Summary
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: DOSRI Monitoring
// ---------------------------------------------------------------------------

function DosriTab() {
  const { data: summary } = useQuery<DosriSummary>({
    queryKey: ["/api/v1/regulator/dosri-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/regulator/dosri-summary")).then((r) => r.json()),
    refetchInterval: 60_000,
    placeholderData: MOCK_DOSRI_SUMMARY,
  });

  const { data: entries } = useQuery<DosriEntry[]>({
    queryKey: ["/api/v1/regulator/dosri-entries"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/regulator/dosri-entries")).then((r) => r.json()),
    refetchInterval: 60_000,
    placeholderData: MOCK_DOSRI_ENTRIES,
  });

  const dosri = summary ?? MOCK_DOSRI_SUMMARY;
  const dosriList = entries ?? MOCK_DOSRI_ENTRIES;

  const utilizationPercent = (dosri.totalExposure / dosri.regulatoryLimit) * 100;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Related Parties" value={dosri.totalRelatedParties} icon={Users} />
        <SummaryCard title="Total Transactions" value={dosri.totalTransactions} icon={FileText} />
        <SummaryCard title="Within Limits" value={dosri.withinLimitCount} icon={CheckCircle} variant="success" />
        <SummaryCard title="Limit Breaches" value={dosri.breachCount} icon={AlertTriangle} variant="danger" />
      </div>

      {/* Aggregate exposure bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aggregate DOSRI Exposure</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {formatCurrency(dosri.totalExposure)} / {formatCurrency(dosri.regulatoryLimit)}
              </span>
              <span className="font-semibold">{formatPercent(utilizationPercent)}</span>
            </div>
            <div
              className="h-3 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={utilizationPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`DOSRI exposure utilization: ${formatPercent(utilizationPercent)}`}
            >
              <div
                className={`h-full rounded-full transition-all ${
                  utilizationPercent >= 90
                    ? "bg-red-500"
                    : utilizationPercent >= 75
                    ? "bg-yellow-500"
                    : "bg-green-500"
                }`}
                style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              BSP regulatory limit per Circular 423 (as amended)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related-Party Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Related Party</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Limit Status</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dosriList.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">{entry.id}</TableCell>
                  <TableCell className="font-medium">{entry.relatedParty}</TableCell>
                  <TableCell>{entry.relationship}</TableCell>
                  <TableCell>{entry.transactionType}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(entry.amount, entry.currency)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(entry.date)}</TableCell>
                  <TableCell>{limitBadge(entry.withinLimit)}</TableCell>
                  <TableCell className="text-right">
                    <span className={entry.limitUtilization > 100 ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                      {formatPercent(entry.limitUtilization)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Client Complaint Tracker
// ---------------------------------------------------------------------------

function ComplaintsTab() {
  const { data: summary } = useQuery<ComplaintSummary>({
    queryKey: ["/api/v1/regulator/complaints-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/regulator/complaints-summary")).then((r) => r.json()),
    refetchInterval: 60_000,
    placeholderData: MOCK_COMPLAINT_SUMMARY,
  });

  const { data: complaints } = useQuery<ComplaintEntry[]>({
    queryKey: ["/api/v1/regulator/complaints"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/regulator/complaints")).then((r) => r.json()),
    refetchInterval: 60_000,
    placeholderData: MOCK_COMPLAINTS,
  });

  const stats = summary ?? MOCK_COMPLAINT_SUMMARY;
  const list = complaints ?? MOCK_COMPLAINTS;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <SummaryCard title="Total (YTD)" value={stats.totalComplaints} icon={MessageSquareWarning} />
        <SummaryCard title="Open" value={stats.openCount} icon={AlertTriangle} variant="danger" />
        <SummaryCard title="Resolved" value={stats.resolvedCount} icon={CheckCircle} variant="success" />
        <SummaryCard title="Escalated" value={stats.escalatedCount} icon={ShieldAlert} variant="warning" />
        <SummaryCard
          title="Avg Resolution"
          value={`${stats.avgResolutionDays} days`}
          subtitle={`${stats.mtdComplaints} this month`}
          icon={Clock}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Complaints</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Complainant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Date Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Resolution (days)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((complaint) => (
                <TableRow key={complaint.id}>
                  <TableCell className="font-mono text-xs">{complaint.id}</TableCell>
                  <TableCell className="font-medium">{complaint.complainant}</TableCell>
                  <TableCell>{complaint.category}</TableCell>
                  <TableCell>{riskBadge(complaint.severity)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(complaint.dateReceived)}</TableCell>
                  <TableCell>{statusBadge(complaint.status)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {complaint.resolutionDays !== null ? complaint.resolutionDays : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Regulator Portal Page
// ---------------------------------------------------------------------------

export default function RegulatorPortal() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10" aria-hidden="true">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BSP Examiner View</h1>
          <p className="text-sm text-muted-foreground">
            Bangko Sentral ng Pilipinas -- Regulatory Examination Portal (Read-Only)
          </p>
        </div>
        <Badge className="ml-auto bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
          <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
          Read-Only Access
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="compliance" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="compliance" className="gap-1 text-xs sm:text-sm">
            <ShieldCheck className="h-4 w-4 hidden sm:inline" aria-hidden="true" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="aml-kyc" className="gap-1 text-xs sm:text-sm">
            <UserCheck className="h-4 w-4 hidden sm:inline" aria-hidden="true" />
            AML/KYC
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1 text-xs sm:text-sm">
            <FileBarChart className="h-4 w-4 hidden sm:inline" aria-hidden="true" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="dosri" className="gap-1 text-xs sm:text-sm">
            <Users className="h-4 w-4 hidden sm:inline" aria-hidden="true" />
            DOSRI
          </TabsTrigger>
          <TabsTrigger value="complaints" className="gap-1 text-xs sm:text-sm">
            <MessageSquareWarning className="h-4 w-4 hidden sm:inline" aria-hidden="true" />
            Complaints
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compliance">
          <ComplianceTab />
        </TabsContent>
        <TabsContent value="aml-kyc">
          <AmlKycTab />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="dosri">
          <DosriTab />
        </TabsContent>
        <TabsContent value="complaints">
          <ComplaintsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
