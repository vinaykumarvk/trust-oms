/**
 * Front-Office Navigation Configuration
 *
 * Data-driven navigation structure for the TrustOMS front-office sidebar.
 * Tailored for Relationship Managers (RMs), Senior RMs, and Traders.
 * Each section is collapsible and contains navigation items with icons and routes.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FileText,
  ListOrdered,
  CheckCircle,
  Users,
  Target,
  Shield,
  TrendingUp,
  Activity,
  Layers,
  Zap,
  Leaf,
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
  roles?: string[];
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
    label: "Order Management",
    icon: FileText,
    defaultOpen: true,
    items: [
      { label: "New Order", path: "/orders/new", icon: FileText },
      { label: "My Orders", path: "/orders", icon: ListOrdered },
      {
        label: "Approval Queue",
        path: "/orders/approvals",
        icon: CheckCircle,
        roles: ["SRM", "RISK_OFFICER", "COMPLIANCE_OFFICER"],
      },
    ],
  },
  {
    label: "Client Book",
    icon: Users,
    items: [
      { label: "My Clients", path: "/clients", icon: Users },
      { label: "Suitability", path: "/clients/suitability", icon: Target },
    ],
  },
  {
    label: "Trading",
    icon: Activity,
    items: [
      { label: "Trader Cockpit", path: "/trading/cockpit", icon: Activity },
      { label: "Block Builder", path: "/trading/blocks", icon: Layers },
    ],
    roles: ["TRADER", "HEAD_TRADER"],
  },
  {
    label: "Monitoring",
    icon: Shield,
    items: [
      { label: "Mandate Monitor", path: "/monitoring/mandates", icon: Shield },
      { label: "Market Data", path: "/monitoring/market", icon: TrendingUp },
    ],
  },
  {
    label: "Scenario & ESG",
    icon: Zap,
    items: [
      { label: "What-If Analysis", path: "/scenario/what-if", icon: Zap },
      { label: "ESG Screening", path: "/scenario/what-if", icon: Leaf },
    ],
  },
  {
    label: "Collaboration",
    icon: Users,
    items: [
      { label: "Committee Workspace", path: "/committee/default", icon: Users },
    ],
  },
];

/** Flat list of all nav items for route generation */
export function getAllNavItems(): NavItem[] {
  return navSections.flatMap((section) => section.items);
}
