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
const MFASettings = React.lazy(() => import("@/pages/mfa-settings"));
const IntegrationHub = React.lazy(() => import("@/pages/integration-hub"));
const AiShadowMode = React.lazy(() => import("@/pages/ai-shadow-mode"));
const AiCosts = React.lazy(() => import("@/pages/ai-costs"));
const TTRADashboard = React.lazy(() => import("@/pages/ttra-dashboard"));
const ClaimsWorkbench = React.lazy(() => import("@/pages/claims-workbench"));
const ServiceRequestWorkbench = React.lazy(() => import("@/pages/service-request-workbench"));
const ConsentPrivacyCenter = React.lazy(() => import("@/pages/consent-privacy-center"));
const DegradedModeMonitor = React.lazy(() => import("@/pages/degraded-mode-monitor"));

// Regulator Portal (Phase 10C)
const RegulatorPortal = React.lazy(() => import("@/pages/regulator-portal"));

// TrustFees Pro pages
const PricingLibrary = React.lazy(() => import("@/pages/trustfees/pricing-library"));
const EligibilityLibrary = React.lazy(() => import("@/pages/trustfees/eligibility-library"));
const AccrualScheduleLibrary = React.lazy(() => import("@/pages/trustfees/accrual-schedule-library"));
const FeePlanTemplates = React.lazy(() => import("@/pages/trustfees/fee-plan-templates"));
const FeePlanList = React.lazy(() => import("@/pages/trustfees/fee-plan-list"));
const FeePlanWizard = React.lazy(() => import("@/pages/trustfees/fee-plan-wizard"));
const FeePlanDetail = React.lazy(() => import("@/pages/trustfees/fee-plan-detail"));
const AccrualWorkbench = React.lazy(() => import("@/pages/trustfees/accrual-workbench"));
const InvoiceWorkbench = React.lazy(() => import("@/pages/trustfees/invoice-workbench"));
const PaymentApplication = React.lazy(() => import("@/pages/trustfees/payment-application"));
const AdhocFeeCapture = React.lazy(() => import("@/pages/trustfees/adhoc-fee-capture"));
const OverrideApprovalQueue = React.lazy(() => import("@/pages/trustfees/override-approval-queue"));
const ExceptionWorkbench = React.lazy(() => import("@/pages/trustfees/exception-workbench"));
const AuditExplorer = React.lazy(() => import("@/pages/trustfees/audit-explorer"));
const DisputeManagement = React.lazy(() => import("@/pages/trustfees/dispute-management"));
const FeeDashboard = React.lazy(() => import("@/pages/trustfees/fee-dashboard"));
const FeeReports = React.lazy(() => import("@/pages/trustfees/fee-reports"));
const ContentPackAdmin = React.lazy(() => import("@/pages/trustfees/content-pack-admin"));
const DsarConsole = React.lazy(() => import("@/pages/trustfees/dsar-console"));
const ReconciliationReport = React.lazy(() => import("@/pages/trustfees/reconciliation-report"));

// Corporate Trust / Loan Management pages
const LoanDashboard = React.lazy(() => import("@/pages/loan-dashboard"));
const LoanDetail = React.lazy(() => import("@/pages/loan-detail"));

// Employee Benefit Trust (EBT) pages
const EbtDashboard = React.lazy(() => import("@/pages/ebt-dashboard"));
const EbtPlanDetail = React.lazy(() => import("@/pages/ebt-plan-detail"));

// Securities Services pages
const SecuritiesDashboard = React.lazy(() => import("@/pages/securities-dashboard"));

// Campaign Management / CRM pages
const CampaignDashboard = React.lazy(() => import("@/pages/crm/campaign-dashboard"));
const LeadListManager = React.lazy(() => import("@/pages/crm/lead-list-manager"));
const ProspectManager = React.lazy(() => import("@/pages/crm/prospect-manager"));
const MeetingsCalendar = React.lazy(() => import("@/pages/crm/meetings-calendar"));
const InteractionLogger = React.lazy(() => import("@/pages/crm/interaction-logger"));
const CampaignAnalytics = React.lazy(() => import("@/pages/crm/campaign-analytics"));
const RMHandover = React.lazy(() => import("@/pages/crm/rm-handover"));
const HandoverList = React.lazy(() => import("@/pages/crm/handover-list"));
const HandoverAuthorization = React.lazy(() => import("@/pages/crm/handover-authorization"));
const HandoverDetail = React.lazy(() => import("@/pages/crm/handover-detail"));
const DelegationPage = React.lazy(() => import("@/pages/crm/delegation-page"));
const HandoverDashboard = React.lazy(() => import("@/pages/crm/handover-dashboard"));
const DelegationCalendar = React.lazy(() => import("@/pages/crm/delegation-calendar"));
const HandoverHistory = React.lazy(() => import("@/pages/crm/handover-history"));
const BulkUploadPage = React.lazy(() => import("@/pages/crm/bulk-upload-page"));
const CampaignDetailPage = React.lazy(() => import("@/pages/crm/campaign-detail"));
const ProspectDetailPage = React.lazy(() => import("@/pages/crm/prospect-detail"));
const CallReportForm = React.lazy(() => import("@/pages/crm/call-report-form"));
const CallReportList = React.lazy(() => import("@/pages/crm/call-report-list"));
const ApprovalWorkspace = React.lazy(() => import("@/pages/crm/approval-workspace"));
const CampaignForm = React.lazy(() => import("@/pages/crm/campaign-form"));
const LeadRuleBuilder = React.lazy(() => import("@/pages/crm/lead-rule-builder"));
const ConversionHistory = React.lazy(() => import("@/pages/crm/conversion-history"));
const OpportunityPipeline = React.lazy(() => import("@/pages/crm/opportunity-pipeline"));
const TaskManager = React.lazy(() => import("@/pages/crm/task-manager"));
const LeadForm = React.lazy(() => import("@/pages/crm/lead-form"));
const LeadDashboard = React.lazy(() => import("@/pages/crm/lead-dashboard"));
const ProspectForm = React.lazy(() => import("@/pages/crm/prospect-form"));
const RmWorkspace = React.lazy(() => import("@/pages/crm/rm-workspace"));
const CrmReports = React.lazy(() => import("@/pages/crm/crm-reports"));

// Risk Profiling & Proposal Generation pages (RP-PGM Module)
const QuestionnaireMaintenance = React.lazy(() => import("@/pages/questionnaire-maintenance"));
const RiskAppetiteMapping = React.lazy(() => import("@/pages/risk-appetite-mapping"));
const AssetAllocationConfig = React.lazy(() => import("@/pages/asset-allocation-config"));
const RiskAssessmentWizard = React.lazy(() => import("@/pages/risk-assessment-wizard"));
const InvestmentProposals = React.lazy(() => import("@/pages/investment-proposals"));
const SupervisorDashboardRP = React.lazy(() => import("@/pages/supervisor-dashboard-rp"));
const RiskProfilingCompletionReport = React.lazy(() => import("@/pages/risk-profiling-completion-report"));

// GL & Accounting pages
const GLDashboard = React.lazy(() => import("@/pages/gl-dashboard"));

// Branch Operations
const BranchDashboard = React.lazy(() => import("@/pages/branch-dashboard"));

// Custom entity pages
const ClientOnboarding = React.lazy(() => import("@/pages/client-onboarding"));
const ClientsPage = React.lazy(() => import("@/pages/clients"));
const ClientDetailPage = React.lazy(() => import("@/pages/client-detail"));
const TrustAccountsPage = React.lazy(() => import("@/pages/trust-accounts"));
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

          {
            path: "/master-data/trust-accounts",
            element: (
              <Suspense fallback={<PageLoader />}>
                <TrustAccountsPage />
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

          // ---- Risk Profiling & Proposal Generation (RP-PGM) ----
          {
            path: "/risk-profiling/questionnaires",
            element: (
              <Suspense fallback={<PageLoader />}>
                <QuestionnaireMaintenance />
              </Suspense>
            ),
          },
          {
            path: "/risk-profiling/risk-appetite",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RiskAppetiteMapping />
              </Suspense>
            ),
          },
          {
            path: "/risk-profiling/asset-allocation",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AssetAllocationConfig />
              </Suspense>
            ),
          },
          {
            path: "/risk-profiling/assessment",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RiskAssessmentWizard />
              </Suspense>
            ),
          },
          {
            path: "/risk-profiling/proposals",
            element: (
              <Suspense fallback={<PageLoader />}>
                <InvestmentProposals />
              </Suspense>
            ),
          },
          {
            path: "/risk-profiling/supervisor",
            element: (
              <Suspense fallback={<PageLoader />}>
                <SupervisorDashboardRP />
              </Suspense>
            ),
          },
          {
            path: "/risk-profiling/completion-report",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RiskProfilingCompletionReport />
              </Suspense>
            ),
          },

          // ---- Corporate Trust / Loan Management ----
          {
            path: "/corporate-trust/loans",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LoanDashboard />
              </Suspense>
            ),
          },
          {
            path: "/corporate-trust/loans/:facilityId",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LoanDetail />
              </Suspense>
            ),
          },
          {
            path: "/corporate-trust/collateral",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LoanDashboard />
              </Suspense>
            ),
          },
          {
            path: "/corporate-trust/mpc",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LoanDashboard />
              </Suspense>
            ),
          },
          {
            path: "/corporate-trust/amortization",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LoanDashboard />
              </Suspense>
            ),
          },

          // ---- Employee Benefit Trust (EBT) ----
          {
            path: "/ebt/dashboard",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EbtDashboard />
              </Suspense>
            ),
          },
          {
            path: "/ebt/plans",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EbtDashboard />
              </Suspense>
            ),
          },
          {
            path: "/ebt/plans/:planId",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EbtPlanDetail />
              </Suspense>
            ),
          },
          {
            path: "/ebt/claims",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EbtDashboard />
              </Suspense>
            ),
          },
          {
            path: "/ebt/separations",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EbtDashboard />
              </Suspense>
            ),
          },

          // ---- Securities Services ----
          {
            path: "/securities/transfers",
            element: (<Suspense fallback={<PageLoader />}><SecuritiesDashboard /></Suspense>),
          },
          {
            path: "/securities/rights",
            element: (<Suspense fallback={<PageLoader />}><SecuritiesDashboard /></Suspense>),
          },
          {
            path: "/securities/unclaimed",
            element: (<Suspense fallback={<PageLoader />}><SecuritiesDashboard /></Suspense>),
          },
          {
            path: "/securities/meetings",
            element: (<Suspense fallback={<PageLoader />}><SecuritiesDashboard /></Suspense>),
          },

          // ---- CRM / Campaign Management ----

          // CRM — RM Workspace (Phase 4 Lead & Prospect)
          {
            path: "/crm/workspace",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RmWorkspace />
              </Suspense>
            ),
          },

          // CRM — Campaign Dashboard
          {
            path: "/crm/campaigns",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CampaignDashboard />
              </Suspense>
            ),
          },

          // CRM — Campaign Form (new) — must come before :id route
          {
            path: "/crm/campaigns/new",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CampaignForm />
              </Suspense>
            ),
          },

          // CRM — Campaign Form (edit) — must come before :id route
          {
            path: "/crm/campaigns/:id/edit",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CampaignForm />
              </Suspense>
            ),
          },

          // CRM — Campaign Detail (tabbed)
          {
            path: "/crm/campaigns/:id",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CampaignDetailPage />
              </Suspense>
            ),
          },

          // CRM — Lead List Manager
          {
            path: "/crm/lead-lists",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LeadListManager />
              </Suspense>
            ),
          },

          // CRM — Prospect Pipeline
          {
            path: "/crm/prospects",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ProspectManager />
              </Suspense>
            ),
          },

          // CRM — Prospect Form (new) — must come before :id route
          {
            path: "/crm/prospects/new",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ProspectForm />
              </Suspense>
            ),
          },

          // CRM — Prospect Form (edit)
          {
            path: "/crm/prospects/:id/edit",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ProspectForm />
              </Suspense>
            ),
          },

          // CRM — Prospect Detail (tabbed)
          {
            path: "/crm/prospects/:id",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ProspectDetailPage />
              </Suspense>
            ),
          },

          // CRM — Meetings & Call Reports
          {
            path: "/crm/meetings",
            element: (
              <Suspense fallback={<PageLoader />}>
                <MeetingsCalendar />
              </Suspense>
            ),
          },

          // CRM — Interaction Logger (Unified Response + Action Item + Meeting)
          {
            path: "/crm/interactions",
            element: (
              <Suspense fallback={<PageLoader />}>
                <InteractionLogger />
              </Suspense>
            ),
          },

          // CRM — Campaign Analytics
          {
            path: "/crm/analytics",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CampaignAnalytics />
              </Suspense>
            ),
          },

          // CRM — RM Handover & Delegation (legacy)
          {
            path: "/crm/handovers-legacy",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RMHandover />
              </Suspense>
            ),
          },

          // CRM — Handover & Assignment Management (HAM)
          {
            path: "/crm/handovers",
            element: (
              <Suspense fallback={<PageLoader />}>
                <HandoverList />
              </Suspense>
            ),
          },
          {
            path: "/crm/handover-authorization",
            element: (
              <Suspense fallback={<PageLoader />}>
                <HandoverAuthorization />
              </Suspense>
            ),
          },
          {
            path: "/crm/handovers/:id",
            element: (
              <Suspense fallback={<PageLoader />}>
                <HandoverDetail />
              </Suspense>
            ),
          },
          {
            path: "/crm/ham-dashboard",
            element: (
              <Suspense fallback={<PageLoader />}>
                <HandoverDashboard />
              </Suspense>
            ),
          },
          {
            path: "/crm/delegations",
            element: (
              <Suspense fallback={<PageLoader />}>
                <DelegationPage />
              </Suspense>
            ),
          },
          {
            path: "/crm/delegation-calendar",
            element: (
              <Suspense fallback={<PageLoader />}>
                <DelegationCalendar />
              </Suspense>
            ),
          },
          {
            path: "/crm/handover-history",
            element: (
              <Suspense fallback={<PageLoader />}>
                <HandoverHistory />
              </Suspense>
            ),
          },
          {
            path: "/crm/bulk-upload",
            element: (
              <Suspense fallback={<PageLoader />}>
                <BulkUploadPage />
              </Suspense>
            ),
          },

          // CRM — Call Report List
          {
            path: "/crm/call-reports",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CallReportList />
              </Suspense>
            ),
          },

          // CRM — Call Report Form (new)
          {
            path: "/crm/call-reports/new",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CallReportForm />
              </Suspense>
            ),
          },

          // CRM — Call Report Form (view)
          {
            path: "/crm/call-reports/:id",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CallReportForm />
              </Suspense>
            ),
          },

          // CRM — Call Report Form (edit)
          {
            path: "/crm/call-reports/:id/edit",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CallReportForm />
              </Suspense>
            ),
          },

          // CRM — Lead Rule Builder (Phase 6)
          {
            path: "/crm/lead-rules",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LeadRuleBuilder />
              </Suspense>
            ),
          },

          // CRM — Conversion History (Phase 6)
          {
            path: "/crm/conversion-history",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ConversionHistory />
              </Suspense>
            ),
          },

          // CRM — Approval Workspace
          {
            path: "/crm/approvals",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ApprovalWorkspace />
              </Suspense>
            ),
          },

          // CRM — Lead Dashboard (My Leads)
          {
            path: "/crm/leads",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LeadDashboard />
              </Suspense>
            ),
          },

          // CRM — Lead Form (new)
          {
            path: "/crm/leads/new",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LeadForm />
              </Suspense>
            ),
          },

          // CRM — Lead Form (edit)
          {
            path: "/crm/leads/:id/edit",
            element: (
              <Suspense fallback={<PageLoader />}>
                <LeadForm />
              </Suspense>
            ),
          },

          // CRM — CRM Reports Dashboard
          {
            path: "/crm/reports",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CrmReports />
              </Suspense>
            ),
          },

          // CRM — Opportunity Pipeline (Phase 7/8)
          {
            path: "/crm/pipeline",
            element: (
              <Suspense fallback={<PageLoader />}>
                <OpportunityPipeline />
              </Suspense>
            ),
          },

          // CRM — Task Manager (Phase 7/8)
          {
            path: "/crm/tasks",
            element: (
              <Suspense fallback={<PageLoader />}>
                <TaskManager />
              </Suspense>
            ),
          },

          // Accounting — GL Dashboard (all GL tabs)
          {
            path: "/accounting/gl-dashboard",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GLDashboard />
              </Suspense>
            ),
          },
          {
            path: "/accounting/chart-of-accounts",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GLDashboard />
              </Suspense>
            ),
          },
          {
            path: "/accounting/journal-entry",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GLDashboard />
              </Suspense>
            ),
          },
          {
            path: "/accounting/gl-drilldown",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GLDashboard />
              </Suspense>
            ),
          },
          {
            path: "/accounting/fx-revaluation",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GLDashboard />
              </Suspense>
            ),
          },
          {
            path: "/accounting/year-end",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GLDashboard />
              </Suspense>
            ),
          },
          {
            path: "/accounting/frpti",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GLDashboard />
              </Suspense>
            ),
          },
          {
            path: "/accounting/*",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GLDashboard />
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

          // Operations — Claims & Compensation (TRUST-CA 360 Phase 6)
          {
            path: "/operations/claims",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ClaimsWorkbench />
              </Suspense>
            ),
          },

          // Operations — Service Request Workbench
          {
            path: "/operations/service-requests",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ServiceRequestWorkbench />
              </Suspense>
            ),
          },

          // Operations — Fee Dashboard (TrustFees Pro Phase 10)
          {
            path: "/operations/fee-dashboard",
            element: (
              <Suspense fallback={<PageLoader />}>
                <FeeDashboard />
              </Suspense>
            ),
          },

          // Operations — Fee Reports (TrustFees Pro Phase 10)
          {
            path: "/operations/fee-reports",
            element: (
              <Suspense fallback={<PageLoader />}>
                <FeeReports />
              </Suspense>
            ),
          },

          // Operations — Fee & Billing Desk (redirect to Fee Dashboard)
          {
            path: "/operations/fee-billing",
            element: <Navigate to="/operations/fee-dashboard" replace />,
          },

          // Operations — Pricing Definition Library (TrustFees Pro Phase 2)
          {
            path: "/operations/pricing-library",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PricingLibrary />
              </Suspense>
            ),
          },

          // Operations — Eligibility Expression Library (TrustFees Pro Phase 3)
          {
            path: "/operations/eligibility-library",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EligibilityLibrary />
              </Suspense>
            ),
          },

          // Operations — Accrual Schedule Library (TrustFees Pro Phase 4)
          {
            path: "/operations/accrual-schedule-library",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AccrualScheduleLibrary />
              </Suspense>
            ),
          },

          // Operations — Fee Plan Templates (TrustFees Pro Phase 4)
          {
            path: "/operations/fee-plan-templates",
            element: (
              <Suspense fallback={<PageLoader />}>
                <FeePlanTemplates />
              </Suspense>
            ),
          },

          // Operations — Fee Plans (TrustFees Pro Phase 5)
          {
            path: "/operations/fee-plans",
            element: (
              <Suspense fallback={<PageLoader />}>
                <FeePlanList />
              </Suspense>
            ),
          },
          {
            path: "/operations/fee-plans/new",
            element: (
              <Suspense fallback={<PageLoader />}>
                <FeePlanWizard />
              </Suspense>
            ),
          },
          {
            path: "/operations/fee-plans/:id",
            element: (
              <Suspense fallback={<PageLoader />}>
                <FeePlanDetail />
              </Suspense>
            ),
          },
          {
            path: "/operations/fee-plans/:id/edit",
            element: (
              <Suspense fallback={<PageLoader />}>
                <FeePlanWizard />
              </Suspense>
            ),
          },

          // Operations — Accrual Workbench (TrustFees Pro Phase 6)
          {
            path: "/operations/accrual-workbench",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AccrualWorkbench />
              </Suspense>
            ),
          },

          // Operations — Invoice Workbench (TrustFees Pro Phase 7)
          {
            path: "/operations/invoice-workbench",
            element: (
              <Suspense fallback={<PageLoader />}>
                <InvoiceWorkbench />
              </Suspense>
            ),
          },

          // Operations — Payment Application (TrustFees Pro Phase 7)
          {
            path: "/operations/payment-application",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PaymentApplication />
              </Suspense>
            ),
          },

          // Operations — Ad-hoc Fee Capture (TrustFees Pro Phase 7)
          {
            path: "/operations/adhoc-fee-capture",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AdhocFeeCapture />
              </Suspense>
            ),
          },

          // Operations — Override Approval Queue (TrustFees Pro Phase 8)
          {
            path: "/operations/override-approval-queue",
            element: (
              <Suspense fallback={<PageLoader />}>
                <OverrideApprovalQueue />
              </Suspense>
            ),
          },

          // Operations — Exception Workbench (TrustFees Pro Phase 8)
          {
            path: "/operations/exception-workbench",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ExceptionWorkbench />
              </Suspense>
            ),
          },

          // Operations — Dispute Management (TrustFees Pro Phase 9)
          {
            path: "/operations/dispute-management",
            element: (
              <Suspense fallback={<PageLoader />}>
                <DisputeManagement />
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

          // Operations — Feed & Degraded Mode Monitor (Phase 8)
          {
            path: "/operations/feed-monitor",
            element: (
              <Suspense fallback={<PageLoader />}>
                <DegradedModeMonitor />
              </Suspense>
            ),
          },

          // Operations — Content Pack Admin (TrustFees Pro Phase 5 GAP-A14/B04)
          {
            path: "/operations/content-pack-admin",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ContentPackAdmin />
              </Suspense>
            ),
          },

          // Operations — DSAR Console (TrustFees Pro Phase 5 GAP-A15/B05/B06/B07)
          {
            path: "/operations/dsar-console",
            element: (
              <Suspense fallback={<PageLoader />}>
                <DsarConsole />
              </Suspense>
            ),
          },

          // Operations — Reconciliation Report (TrustFees Pro Phase 5 GAP-A17)
          {
            path: "/operations/reconciliation-report",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ReconciliationReport />
              </Suspense>
            ),
          },

          // Operations — Branch Operations Dashboard (Phase 10B)
          {
            path: "/operations/branch-dashboard",
            element: (
              <Suspense fallback={<PageLoader />}>
                <BranchDashboard />
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
          // Compliance — TTRA Management (TRUST-CA 360 Phase 4)
          {
            path: "/compliance/ttra",
            element: (
              <Suspense fallback={<PageLoader />}>
                <TTRADashboard />
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
          // Compliance — Audit Explorer (TrustFees Pro Phase 9)
          {
            path: "/compliance/audit-explorer",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AuditExplorer />
              </Suspense>
            ),
          },
          // Compliance — Privacy & Consent Center (Phase 8)
          {
            path: "/compliance/privacy",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ConsentPrivacyCenter />
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

          // Tools — MFA Settings (TOTP enrollment)
          {
            path: "/tools/mfa-settings",
            element: (
              <Suspense fallback={<PageLoader />}>
                <MFASettings />
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

          // Regulatory — BSP Examiner Portal (Phase 10C)
          {
            path: "/regulatory/bsp-portal",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RegulatorPortal />
              </Suspense>
            ),
          },

          // Regulatory — placeholder pages
          {
            path: "/regulatory/*",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PlaceholderPage />
              </Suspense>
            ),
          },

          // 404 catch-all — must be last
          {
            path: "*",
            element: (
              <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <p className="text-6xl font-bold text-muted-foreground">404</p>
                <h1 className="text-xl font-semibold">Page Not Found</h1>
                <p className="text-muted-foreground">
                  The page you are looking for does not exist or has been moved.
                </p>
                <a
                  href="/"
                  className="mt-2 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Go to Dashboard
                </a>
              </div>
            ),
          },
        ],
      },
    ],
  },
]);
