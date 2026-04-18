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
    ],
  },
  {
    label: "Operations",
    icon: Settings,
    items: [
      { label: "Order Explorer", path: "/operations/order-explorer", icon: FileSearch },
      { label: "Transaction Monitor", path: "/operations/transactions", icon: ArrowLeftRight },
      { label: "NAV Updates", path: "/operations/nav-updates", icon: TrendingUp },
      { label: "Cash & FX", path: "/operations/cash-fx", icon: DollarSign },
      { label: "Fee & Billing", path: "/operations/fee-billing", icon: Receipt },
      { label: "Corporate Actions", path: "/operations/corporate-actions", icon: Activity },
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
      { label: "ORE Case Manager", path: "/compliance/ore", icon: AlertOctagon },
      { label: "Whistleblower", path: "/compliance/whistleblower", icon: MessageSquareWarning },
      { label: "Audit Trail", path: "/compliance/audit", icon: FileText },
      { label: "Workflow Definitions", path: "/compliance/workflow-definitions", icon: Settings2 },
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
