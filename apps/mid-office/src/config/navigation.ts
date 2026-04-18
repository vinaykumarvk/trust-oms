/**
 * Mid-Office Navigation Configuration
 *
 * Data-driven navigation structure for the TrustOMS mid-office sidebar.
 * Tailored for the Dealing Desk, Fund Accounting, and Risk & Compliance teams.
 * Each section is collapsible and contains navigation items with icons and routes.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CheckSquare,
  Landmark,
  Shield,
  Scale,
  Calculator,
  PieChart,
  AlertTriangle,
  GitCompare,
  Activity,
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
    label: "Trading Operations",
    icon: Activity,
    defaultOpen: true,
    items: [
      { label: "Confirmations", path: "/confirmations", icon: CheckSquare },
      { label: "Settlement Queue", path: "/settlement", icon: Landmark },
    ],
  },
  {
    label: "Risk & Compliance",
    icon: Shield,
    items: [
      { label: "Mandate Monitor", path: "/mandates", icon: Scale },
      { label: "Compliance Checks", path: "/compliance", icon: Shield },
    ],
  },
  {
    label: "Fund Accounting",
    icon: Calculator,
    items: [
      { label: "NAV Computation", path: "/nav", icon: Calculator },
      { label: "Fund Valuation", path: "/valuation", icon: PieChart },
    ],
  },
  {
    label: "Exceptions",
    icon: AlertTriangle,
    items: [
      { label: "Breaks & Exceptions", path: "/exceptions", icon: AlertTriangle },
      { label: "Unmatched Trades", path: "/unmatched", icon: GitCompare },
    ],
  },
];

/** Flat list of all nav items for route generation */
export function getAllNavItems(): NavItem[] {
  return navSections.flatMap((section) => section.items);
}
