/**
 * Back-Office Router Configuration
 *
 * Uses createBrowserRouter from react-router-dom with:
 * - BackOfficeLayout wrapping all authenticated routes
 * - Login page without layout
 * - Lazy-loaded page components
 * - ProtectedRoute wrapper checking localStorage auth state
 */

import React, { Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { BackOfficeLayout } from "@/components/layout/BackOfficeLayout";

// ---- Lazy-loaded pages ----
const LoginPage = React.lazy(() => import("@/pages/login"));
const DashboardPage = React.lazy(() => import("@/pages/dashboard"));
const EntityGenericPage = React.lazy(() => import("@/pages/entity-generic"));
const PlaceholderPage = React.lazy(() => import("@/pages/placeholder"));
const ApprovalsPage = React.lazy(() => import("@/pages/approvals"));
const AuditDashboardPage = React.lazy(() => import("@/pages/audit-dashboard"));
const WorkflowDefinitionsPage = React.lazy(() => import("@/pages/workflow-definitions"));
const KycDashboard = React.lazy(() => import("@/pages/kyc-dashboard"));
const OrderExplorer = React.lazy(() => import("@/pages/order-explorer"));
const NavUpdates = React.lazy(() => import("@/pages/nav-updates"));
const SettlementDesk = React.lazy(() => import("@/pages/settlement-desk"));
const CashFxDashboard = React.lazy(() => import("@/pages/cash-fx-dashboard"));
const EodDashboard = React.lazy(() => import("@/pages/eod-dashboard"));
const Reconciliation = React.lazy(() => import("@/pages/reconciliation"));
const PositionReconciliation = React.lazy(() => import("@/pages/position-reconciliation"));
const CorporateActions = React.lazy(() => import("@/pages/corporate-actions"));
const FeeBillingDesk = React.lazy(() => import("@/pages/fee-billing-desk"));
const TaxManagement = React.lazy(() => import("@/pages/tax-management"));
const Reversals = React.lazy(() => import("@/pages/reversals"));
const UploadDesk = React.lazy(() => import("@/pages/upload-desk"));
const TransfersPage = React.lazy(() => import("@/pages/transfers"));
const ContributionsPage = React.lazy(() => import("@/pages/contributions"));
const WithdrawalsPage = React.lazy(() => import("@/pages/withdrawals"));
const PortfolioModeling = React.lazy(() => import("@/pages/portfolio-modeling"));
const ComplianceLimits = React.lazy(() => import("@/pages/compliance-limits"));
const ValidationOverrides = React.lazy(() => import("@/pages/validation-overrides"));
const ScheduledPlans = React.lazy(() => import("@/pages/scheduled-plans"));
const PeraConsole = React.lazy(() => import("@/pages/pera-console"));
const RiskAnalytics = React.lazy(() => import("@/pages/risk-analytics"));
const ComplianceWorkbench = React.lazy(() => import("@/pages/compliance-workbench"));
const ComplianceRules = React.lazy(() => import("@/pages/compliance-rules"));
const TradeSurveillance = React.lazy(() => import("@/pages/trade-surveillance"));
const KillSwitchConsole = React.lazy(() => import("@/pages/kill-switch-console"));
const OreCaseManager = React.lazy(() => import("@/pages/ore-case-manager"));
const Whistleblower = React.lazy(() => import("@/pages/whistleblower"));
const Reports = React.lazy(() => import("@/pages/reports"));
const ReportBuilder = React.lazy(() => import("@/pages/report-builder"));
const DataQuality = React.lazy(() => import("@/pages/data-quality"));
const ExecutiveDashboard = React.lazy(() => import("@/pages/executive-dashboard"));
const OperationsControlTower = React.lazy(() => import("@/pages/operations-control-tower"));
const AdminConsole = React.lazy(() => import("@/pages/admin-console"));
const IntegrationHub = React.lazy(() => import("@/pages/integration-hub"));
const AiShadowMode = React.lazy(() => import("@/pages/ai-shadow-mode"));
const AiCosts = React.lazy(() => import("@/pages/ai-costs"));

// Custom entity pages
const ClientOnboarding = React.lazy(() => import("@/pages/client-onboarding"));
const ClientsPage = React.lazy(() => import("@/pages/clients"));
const ClientDetailPage = React.lazy(() => import("@/pages/client-detail"));
const SecurityMasterPage = React.lazy(() => import("@/pages/security-master"));
const PortfoliosPage = React.lazy(() => import("@/pages/portfolios"));

// ---- Loading fallback ----
function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// ---- Protected Route ----
function ProtectedRoute() {
  const user = localStorage.getItem("trustoms-user");
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

// ---- Router ----
export const router = createBrowserRouter([
  // Public: Login
  {
    path: "/login",
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },

  // Protected: All routes under BackOfficeLayout
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <BackOfficeLayout />,
        children: [
          // Dashboard
          {
            path: "/",
            element: (
              <Suspense fallback={<PageLoader />}>
                <DashboardPage />
              </Suspense>
            ),
          },

          // ---- Custom Master Data pages (must come before generic :entityKey) ----

          // Client Onboarding Wizard
          {
            path: "/master-data/client-onboarding",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ClientOnboarding />
              </Suspense>
            ),
          },

          // Clients — enhanced with detail sheet and sub-entity tabs
          {
            path: "/master-data/clients",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ClientsPage />
              </Suspense>
            ),
          },

          // Client detail — full page with sub-entity tabs
          {
            path: "/master-data/clients/:clientId",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ClientDetailPage />
              </Suspense>
            ),
          },

          // Securities — enhanced with ISIN/CUSIP/SEDOL search and detail sheet
          {
            path: "/master-data/securities",
            element: (
              <Suspense fallback={<PageLoader />}>
                <SecurityMasterPage />
              </Suspense>
            ),
          },

          // Portfolios — enhanced with mandates/positions/fees tabs
          {
            path: "/master-data/portfolios",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PortfoliosPage />
              </Suspense>
            ),
          },

          // Master Data — generic entity pages (fallback for others)
          {
            path: "/master-data/:entityKey",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EntityGenericPage />
              </Suspense>
            ),
          },

          // Reference Data — generic entity pages
          {
            path: "/reference-data/:entityKey",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EntityGenericPage />
              </Suspense>
            ),
          },

          // Operations — dedicated pages
          {
            path: "/operations/order-explorer",
            element: (
              <Suspense fallback={<PageLoader />}>
                <OrderExplorer />
              </Suspense>
            ),
          },

          // Operations — NAV Updates
          {
            path: "/operations/nav-updates",
            element: (
              <Suspense fallback={<PageLoader />}>
                <NavUpdates />
              </Suspense>
            ),
          },

          // Operations — Settlement Desk
          {
            path: "/operations/transactions",
            element: (
              <Suspense fallback={<PageLoader />}>
                <SettlementDesk />
              </Suspense>
            ),
          },

          // Operations — Cash & FX Dashboard
          {
            path: "/operations/cash-fx",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CashFxDashboard />
              </Suspense>
            ),
          },

          // Operations — EOD Dashboard
          {
            path: "/operations/eod",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EodDashboard />
              </Suspense>
            ),
          },

          // Operations — Transaction Reconciliation
          {
            path: "/operations/transaction-recon",
            element: (
              <Suspense fallback={<PageLoader />}>
                <Reconciliation />
              </Suspense>
            ),
          },

          // Operations — Position Reconciliation
          {
            path: "/operations/position-recon",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PositionReconciliation />
              </Suspense>
            ),
          },

          // Operations — Corporate Actions Desk
          {
            path: "/operations/corporate-actions",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CorporateActions />
              </Suspense>
            ),
          },

          // Operations — Fee & Billing Desk
          {
            path: "/operations/fee-billing",
            element: (
              <Suspense fallback={<PageLoader />}>
                <FeeBillingDesk />
              </Suspense>
            ),
          },

          // Operations — Reversals (Phase 3E)
          {
            path: "/operations/reversals",
            element: (
              <Suspense fallback={<PageLoader />}>
                <Reversals />
              </Suspense>
            ),
          },

          // Operations — Transfers (Phase 3F)
          {
            path: "/operations/transfers",
            element: (
              <Suspense fallback={<PageLoader />}>
                <TransfersPage />
              </Suspense>
            ),
          },

          // Operations — Contributions (Phase 3F)
          {
            path: "/operations/contributions",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ContributionsPage />
              </Suspense>
            ),
          },

          // Operations — Withdrawals (Phase 3F)
          {
            path: "/operations/withdrawals",
            element: (
              <Suspense fallback={<PageLoader />}>
                <WithdrawalsPage />
              </Suspense>
            ),
          },

          // Operations — Portfolio Modeling & Rebalancing (Phase 3H)
          {
            path: "/operations/portfolio-modeling",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PortfolioModeling />
              </Suspense>
            ),
          },

          // Operations — Scheduled Plans EIP/ERP (Phase 3I)
          {
            path: "/operations/scheduled-plans",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ScheduledPlans />
              </Suspense>
            ),
          },

          // Operations — PERA Console (Phase 3I)
          {
            path: "/operations/pera",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PeraConsole />
              </Suspense>
            ),
          },

          // Operations — placeholder pages (fallback for others)
          {
            path: "/operations/*",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PlaceholderPage />
              </Suspense>
            ),
          },

          // Compliance — dedicated pages
          {
            path: "/compliance/approvals",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ApprovalsPage />
              </Suspense>
            ),
          },
          {
            path: "/compliance/audit",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AuditDashboardPage />
              </Suspense>
            ),
          },
          {
            path: "/compliance/workflow-definitions",
            element: (
              <Suspense fallback={<PageLoader />}>
                <WorkflowDefinitionsPage />
              </Suspense>
            ),
          },
          {
            path: "/compliance/kyc",
            element: (
              <Suspense fallback={<PageLoader />}>
                <KycDashboard />
              </Suspense>
            ),
          },
          // Compliance — Tax Management (Phase 3D)
          {
            path: "/compliance/tax",
            element: (
              <Suspense fallback={<PageLoader />}>
                <TaxManagement />
              </Suspense>
            ),
          },
          // Compliance — Compliance Limits (Phase 3G)
          {
            path: "/compliance/compliance-limits",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ComplianceLimits />
              </Suspense>
            ),
          },
          // Compliance — Validation Overrides (Phase 3G)
          {
            path: "/compliance/validation-overrides",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ValidationOverrides />
              </Suspense>
            ),
          },
          // Compliance — Workbench (Phase 4A)
          {
            path: "/compliance/workbench",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ComplianceWorkbench />
              </Suspense>
            ),
          },
          // Compliance — Rules Engine (Phase 4A)
          {
            path: "/compliance/rules",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ComplianceRules />
              </Suspense>
            ),
          },
          // Compliance — Trade Surveillance (Phase 4B)
          {
            path: "/compliance/surveillance",
            element: (
              <Suspense fallback={<PageLoader />}>
                <TradeSurveillance />
              </Suspense>
            ),
          },
          // Compliance — Kill-Switch Console (Phase 4B)
          {
            path: "/compliance/kill-switch",
            element: (
              <Suspense fallback={<PageLoader />}>
                <KillSwitchConsole />
              </Suspense>
            ),
          },
          // Compliance — ORE Case Manager (Phase 4C)
          {
            path: "/compliance/ore",
            element: (
              <Suspense fallback={<PageLoader />}>
                <OreCaseManager />
              </Suspense>
            ),
          },
          // Compliance — Whistleblower (Phase 4C)
          {
            path: "/compliance/whistleblower",
            element: (
              <Suspense fallback={<PageLoader />}>
                <Whistleblower />
              </Suspense>
            ),
          },
          // Compliance — remaining placeholder pages
          {
            path: "/compliance/*",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PlaceholderPage />
              </Suspense>
            ),
          },

          // Analytics — Risk Analytics (Phase 3J)
          {
            path: "/analytics/risk",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RiskAnalytics />
              </Suspense>
            ),
          },

          // Analytics — Executive Dashboard (Phase 5B)
          {
            path: "/analytics/executive",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ExecutiveDashboard />
              </Suspense>
            ),
          },
          // Analytics — Operations Control Tower (Phase 5B)
          {
            path: "/analytics/control-tower",
            element: (
              <Suspense fallback={<PageLoader />}>
                <OperationsControlTower />
              </Suspense>
            ),
          },
          // Analytics — Reports Hub (Phase 5A)
          {
            path: "/analytics/reports",
            element: (
              <Suspense fallback={<PageLoader />}>
                <Reports />
              </Suspense>
            ),
          },
          // Analytics — Report Builder (Phase 5A)
          {
            path: "/analytics/report-builder",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ReportBuilder />
              </Suspense>
            ),
          },
          // Analytics — Data Quality (Phase 5A)
          {
            path: "/analytics/data-quality",
            element: (
              <Suspense fallback={<PageLoader />}>
                <DataQuality />
              </Suspense>
            ),
          },

          // Analytics — placeholder pages
          {
            path: "/analytics/*",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PlaceholderPage />
              </Suspense>
            ),
          },

          // Tools — Bulk Upload (Phase 3E)
          {
            path: "/tools/bulk-upload",
            element: (
              <Suspense fallback={<PageLoader />}>
                <UploadDesk />
              </Suspense>
            ),
          },

          // Tools — Integration Hub (Phase 6A)
          {
            path: "/tools/integrations",
            element: (
              <Suspense fallback={<PageLoader />}>
                <IntegrationHub />
              </Suspense>
            ),
          },

          // Tools — AI Shadow Mode (Phase 6C)
          {
            path: "/tools/ai-shadow-mode",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AiShadowMode />
              </Suspense>
            ),
          },

          // Tools — AI & Routing Analytics (Phase 6C)
          {
            path: "/tools/ai-costs",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AiCosts />
              </Suspense>
            ),
          },

          // Tools — Admin Console (Phase 5B)
          {
            path: "/tools/admin",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AdminConsole />
              </Suspense>
            ),
          },

          // Tools — placeholder pages
          {
            path: "/tools/*",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PlaceholderPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
]);
