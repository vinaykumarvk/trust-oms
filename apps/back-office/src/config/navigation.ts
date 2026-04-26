/**
 * Back-Office Navigation Configuration
 *
 * Data-driven navigation structure for the TrustOMS back-office sidebar.
 * Each section is collapsible and contains navigation items with icons and routes.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Database,
  BookOpen,
  Settings,
  Shield,
  BarChart3,
  Wrench,
  Briefcase,
  Landmark,
  Users,
  Building2,
  UserCog,
  Globe,
  Banknote,
  Layers,
  GitBranch,
  Tag,
  Calculator,
  ArrowLeftRight,
  Clock,
  TrendingUp,
  Activity,
  Scale,
  GitCompare,
  DollarSign,
  Plug,
  CheckCircle,
  Settings2,
  FileText,
  UserCheck,
  Eye,
  FileBarChart,
  PenTool,
  Upload,
  TestTube,
  Cpu,
  Target,
  ShieldCheck,
  CalendarClock,
  PiggyBank,
  ExternalLink,
  RefreshCcw,
  PieChart,
  FileSearch,
  Receipt,
  RotateCcw,
  Send,
  ArrowDownCircle,
  ArrowUpCircle,
  Sliders,
  AlertTriangle,
  Gavel,
  Power,
  AlertOctagon,
  MessageSquareWarning,
  Gauge,
  Radio,
  Brain,
  Zap,
  ShieldAlert,
  UserX,
  CalendarDays,
  Building,
  Router,
  ClipboardCheck,
  FileWarning,
  PlusCircle,
  ClipboardList,
  UserSearch,
  FileSpreadsheet,
  Compass,
  LineChart,
  Megaphone,
  ListFilter,
  UserPlus,
  CalendarRange,
  MessageCircle,
  ArrowRightLeft,
  Calendar,
  CheckSquare,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  roles?: string[];
}

export interface NavSection {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  defaultOpen?: boolean;
}

export interface NavTopLevel {
  label: string;
  path: string;
  icon: LucideIcon;
}

/** Standalone top-level item (Dashboard) */
export const dashboardItem: NavTopLevel = {
  label: "Dashboard",
  path: "/",
  icon: LayoutDashboard,
};

/** Collapsible sections with nested nav items */
export const navSections: NavSection[] = [
  {
    label: "Master Data",
    icon: Database,
    defaultOpen: true,
    items: [
      { label: "Portfolios", path: "/master-data/portfolios", icon: Briefcase },
      { label: "Securities", path: "/master-data/securities", icon: Landmark },
      { label: "Clients", path: "/master-data/clients", icon: Users },
      { label: "Client Onboarding", path: "/master-data/client-onboarding", icon: UserCheck },
      { label: "Counterparties", path: "/master-data/counterparties", icon: Building2 },
      { label: "Brokers", path: "/master-data/brokers", icon: ArrowLeftRight },
      { label: "Users", path: "/master-data/users", icon: UserCog },
      { label: "Model Portfolios", path: "/master-data/model-portfolios", icon: PieChart },
      { label: "Held-Away Assets", path: "/master-data/held-away-assets", icon: ExternalLink },
    ],
  },
  {
    label: "Reference Data",
    icon: BookOpen,
    items: [
      { label: "Countries", path: "/reference-data/countries", icon: Globe },
      { label: "Currencies", path: "/reference-data/currencies", icon: Banknote },
      { label: "Asset Classes", path: "/reference-data/asset-classes", icon: Layers },
      { label: "Branches", path: "/reference-data/branches", icon: GitBranch },
      { label: "Trust Product Types", path: "/reference-data/trust-product-types", icon: Tag },
      { label: "Fee Types", path: "/reference-data/fee-types", icon: Calculator },
      { label: "Tax Codes", path: "/reference-data/tax-codes", icon: DollarSign },
      { label: "Exchanges", path: "/reference-data/exchanges", icon: Landmark },
      { label: "Market Calendar", path: "/reference-data/market-calendar", icon: CalendarDays },
      { label: "Legal Entities", path: "/reference-data/legal-entities", icon: Building },
      { label: "Feed Routing", path: "/reference-data/feed-routing", icon: Router },
      { label: "Data Stewardship", path: "/reference-data/data-stewardship", icon: ClipboardCheck },
    ],
  },
  {
    label: "Risk Profiling",
    icon: Compass,
    items: [
      { label: "Questionnaires", path: "/risk-profiling/questionnaires", icon: ClipboardList },
      { label: "Risk Appetite Mapping", path: "/risk-profiling/risk-appetite", icon: Target },
      { label: "Asset Allocation", path: "/risk-profiling/asset-allocation", icon: PieChart },
      { label: "Risk Assessment", path: "/risk-profiling/assessment", icon: UserSearch },
      { label: "Investment Proposals", path: "/risk-profiling/proposals", icon: FileSpreadsheet },
      { label: "Supervisor Dashboard", path: "/risk-profiling/supervisor", icon: LineChart },
      { label: "Completion Report", path: "/risk-profiling/completion-report", icon: BarChart3 },
    ],
  },
  {
    label: "Fees & Charges",
    icon: Receipt,
    items: [
      { label: "Fee Dashboard", path: "/operations/fee-dashboard", icon: LayoutDashboard },
      { label: "Fee Plans", path: "/operations/fee-plans", icon: FileText },
      { label: "Accrual Workbench", path: "/operations/accrual-workbench", icon: Calculator },
      { label: "Invoice Workbench", path: "/operations/invoice-workbench", icon: FileText },
      { label: "Payment Application", path: "/operations/payment-application", icon: DollarSign },
      { label: "Ad-hoc Fees", path: "/operations/adhoc-fee-capture", icon: PlusCircle },
      { label: "Override Queue", path: "/operations/override-approval-queue", icon: ShieldAlert },
      { label: "Exception Workbench", path: "/operations/exception-workbench", icon: AlertTriangle },
      { label: "Dispute Management", path: "/operations/dispute-management", icon: Scale },
      { label: "Fee Reports", path: "/operations/fee-reports", icon: FileBarChart },
      { label: "Pricing Library", path: "/operations/pricing-library", icon: DollarSign },
      { label: "Eligibility Library", path: "/operations/eligibility-library", icon: Target },
      { label: "Accrual Schedules", path: "/operations/accrual-schedule-library", icon: CalendarClock },
      { label: "Fee Plan Templates", path: "/operations/fee-plan-templates", icon: FileBarChart },
    ],
  },
  {
    label: "General Ledger",
    icon: BookOpen,
    items: [
      { label: "GL Dashboard", path: "/accounting/gl-dashboard", icon: LayoutDashboard },
      { label: "Chart of Accounts", path: "/accounting/chart-of-accounts", icon: BookOpen },
      { label: "Journal Entry", path: "/accounting/journal-entry", icon: PenTool },
      { label: "GL Drilldown", path: "/accounting/gl-drilldown", icon: FileSearch },
      { label: "FX & Revaluation", path: "/accounting/fx-revaluation", icon: RefreshCcw },
      { label: "Year-End", path: "/accounting/year-end", icon: CalendarClock },
      { label: "FRPTI Reporting", path: "/accounting/frpti", icon: FileBarChart },
    ],
  },
  {
    label: "Operations",
    icon: Settings,
    items: [
      { label: "Branch Operations", path: "/operations/branch-dashboard", icon: Building2 },
      { label: "Order Explorer", path: "/operations/order-explorer", icon: FileSearch },
      { label: "Transaction Monitor", path: "/operations/transactions", icon: ArrowLeftRight },
      { label: "NAV Updates", path: "/operations/nav-updates", icon: TrendingUp },
      { label: "Cash & FX", path: "/operations/cash-fx", icon: DollarSign },
      { label: "Corporate Actions", path: "/operations/corporate-actions", icon: Activity },
      { label: "Claims", path: "/operations/claims", icon: FileWarning },
      { label: "Service Requests", path: "/operations/service-requests", icon: ClipboardCheck },
      { label: "Transfers", path: "/operations/transfers", icon: Send },
      { label: "Contributions", path: "/operations/contributions", icon: ArrowDownCircle },
      { label: "Withdrawals", path: "/operations/withdrawals", icon: ArrowUpCircle },
      { label: "Reversals", path: "/operations/reversals", icon: RotateCcw },
      { label: "Portfolio Modeling", path: "/operations/portfolio-modeling", icon: Sliders },
      { label: "Scheduled Plans", path: "/operations/scheduled-plans", icon: CalendarClock },
      { label: "PERA Console", path: "/operations/pera", icon: PiggyBank },
      { label: "Position Recon", path: "/operations/position-recon", icon: BarChart3 },
      { label: "Transaction Recon", path: "/operations/transaction-recon", icon: GitCompare },
      { label: "EOD Processing", path: "/operations/eod", icon: Clock },
      { label: "Feed Monitor", path: "/operations/feed-monitor", icon: Radio },
    ],
  },
  {
    label: "CRM",
    icon: Users,
    defaultOpen: true,
    items: [
      { label: "My Leads", path: "/crm/leads", icon: UserPlus },
      { label: "Prospects", path: "/crm/prospects", icon: UserSearch },
      { label: "Pipeline", path: "/crm/pipeline", icon: TrendingUp },
      { label: "Calendar", path: "/crm/meetings", icon: Calendar },
      { label: "Call Reports", path: "/crm/call-reports", icon: FileText },
      { label: "Tasks", path: "/crm/tasks", icon: CheckSquare },
      { label: "Conversion History", path: "/crm/conversion-history", icon: ArrowRightLeft },
      { label: "CRM Reports", path: "/crm/reports", icon: BarChart3 },
      { label: "Approvals", path: "/crm/approvals", icon: CheckCircle },
      { label: "RM Handovers", path: "/crm/handovers", icon: ArrowRightLeft },
    ],
  },
  {
    label: "Handover & Delegation",
    icon: ArrowLeftRight,
    items: [
      { label: "HAM Dashboard", path: "/crm/ham-dashboard", icon: LayoutDashboard },
      { label: "Handover Requests", path: "/crm/handovers", icon: ArrowRightLeft },
      { label: "Authorization Queue", path: "/crm/handover-authorization", icon: ClipboardCheck },
      { label: "Delegations", path: "/crm/delegations", icon: UserCheck },
      { label: "Delegation Calendar", path: "/crm/delegation-calendar", icon: CalendarDays },
      { label: "Bulk Upload", path: "/crm/bulk-upload", icon: Upload },
      { label: "Handover History", path: "/crm/handover-history", icon: FileSearch },
    ],
  },
  {
    label: "Campaign Management",
    icon: Megaphone,
    items: [
      { label: "Campaign Dashboard", path: "/crm/campaigns", icon: LayoutDashboard },
      { label: "Lead Lists", path: "/crm/lead-lists", icon: ListFilter },
      { label: "Lead Rule Builder", path: "/crm/lead-rules", icon: Target },
      { label: "Campaign Analytics", path: "/crm/analytics", icon: BarChart3 },
      { label: "Interaction Logger", path: "/crm/interactions", icon: MessageCircle },
    ],
  },
  {
    label: "Compliance",
    icon: Shield,
    items: [
      { label: "Pending Approvals", path: "/compliance/approvals", icon: CheckCircle },
      { label: "Compliance Workbench", path: "/compliance/workbench", icon: Shield },
      { label: "Compliance Rules", path: "/compliance/rules", icon: Scale },
      { label: "Compliance Limits", path: "/compliance/compliance-limits", icon: ShieldCheck },
      { label: "Validation Overrides", path: "/compliance/validation-overrides", icon: ShieldAlert },
      { label: "Trade Surveillance", path: "/compliance/surveillance", icon: Eye },
      { label: "Kill-Switch", path: "/compliance/kill-switch", icon: Power },
      { label: "KYC Dashboard", path: "/compliance/kyc", icon: UserCheck },
      { label: "Tax Management", path: "/compliance/tax", icon: DollarSign },
      { label: "TTRA Management", path: "/compliance/ttra", icon: FileText },
      { label: "ORE Case Manager", path: "/compliance/ore", icon: AlertOctagon },
      { label: "Whistleblower", path: "/compliance/whistleblower", icon: MessageSquareWarning },
      { label: "Audit Trail", path: "/compliance/audit", icon: FileText },
      { label: "Audit Explorer", path: "/compliance/audit-explorer", icon: FileSearch },
      { label: "Workflow Definitions", path: "/compliance/workflow-definitions", icon: Settings2 },
      { label: "Privacy Center", path: "/compliance/privacy", icon: Shield },
    ],
  },
  {
    label: "Analytics",
    icon: BarChart3,
    items: [
      { label: "Executive Dashboard", path: "/analytics/executive", icon: Gauge },
      { label: "Control Tower", path: "/analytics/control-tower", icon: Radio },
      { label: "Risk Analytics", path: "/analytics/risk", icon: Target },
      { label: "Reports Hub", path: "/analytics/reports", icon: FileBarChart },
      { label: "Report Builder", path: "/analytics/report-builder", icon: PenTool },
      { label: "Data Quality", path: "/analytics/data-quality", icon: Activity },
    ],
  },
  {
    label: "Regulatory",
    icon: Gavel,
    items: [
      { label: "BSP Examiner Portal", path: "/regulatory/bsp-portal", icon: Shield, roles: ["regulator", "admin", "compliance_officer"] },
    ],
  },
  {
    label: "Tools",
    icon: Wrench,
    items: [
      { label: "Bulk Upload", path: "/tools/bulk-upload", icon: Upload },
      { label: "Integration Hub", path: "/tools/integrations", icon: Plug },
      { label: "AI Shadow Mode", path: "/tools/ai-shadow-mode", icon: Brain },
      { label: "AI & Routing", path: "/tools/ai-costs", icon: Zap },
      { label: "Admin Console", path: "/tools/admin", icon: UserX },
      { label: "Test Data", path: "/tools/test-data", icon: TestTube },
      { label: "Automation", path: "/tools/automation", icon: Cpu },
    ],
  },
];

/** Flat list of all nav items for route generation */
export function getAllNavItems(): NavItem[] {
  return navSections.flatMap((section) => section.items);
}

/** Look up a nav item by path */
export function findNavItemByPath(path: string): NavItem | NavTopLevel | undefined {
  if (dashboardItem.path === path) return dashboardItem;
  for (const section of navSections) {
    const item = section.items.find((i) => i.path === path);
    if (item) return item;
  }
  return undefined;
}
