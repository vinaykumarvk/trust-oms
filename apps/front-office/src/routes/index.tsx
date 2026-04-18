/**
 * Front-Office Router Configuration
 *
 * Uses createBrowserRouter from react-router-dom with:
 * - FrontOfficeLayout wrapping all routes
 * - Lazy-loaded page components
 * - SuspenseWrapper for shared loading state
 */

import React, { Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom";
import FrontOfficeLayout from "../components/layout/FrontOfficeLayout";
import { Skeleton } from "@ui/components/ui/skeleton";

// ---- Lazy-loaded pages ----
const RMDashboard = React.lazy(() => import("@/pages/rm-dashboard"));
const OrderCapture = React.lazy(() => import("@/pages/order-capture"));
const Orders = React.lazy(() => import("@/pages/orders"));
const OrderDetail = React.lazy(() => import("@/pages/order-detail"));
const SRMApprovalQueue = React.lazy(() => import("@/pages/srm-approval-queue"));
const TraderCockpit = React.lazy(() => import("@/pages/trader-cockpit"));
const ClientBook = React.lazy(() => import("@/pages/client-book"));
const MandateMonitor = React.lazy(() => import("@/pages/mandate-monitor"));
const WhatIfScenario = React.lazy(() => import("@/pages/what-if-scenario"));
const CommitteeWorkspace = React.lazy(() => import("@/pages/committee-workspace"));
const Placeholder = React.lazy(() => import("@/pages/placeholder"));

// ---- Suspense Wrapper ----

function SuspenseWrapper() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
}

// ---- Router ----

const router = createBrowserRouter([
  {
    element: <FrontOfficeLayout />,
    children: [
      {
        element: <SuspenseWrapper />,
        children: [
          // Dashboard
          { index: true, element: <RMDashboard /> },

          // Order Management
          { path: "orders/new", element: <OrderCapture /> },
          { path: "orders/approvals", element: <SRMApprovalQueue /> },
          { path: "orders/:id", element: <OrderDetail /> },
          { path: "orders", element: <Orders /> },

          // Client Book
          { path: "clients", element: <ClientBook /> },
          { path: "clients/suitability", element: <Placeholder /> },

          // Trading
          { path: "trading/cockpit", element: <TraderCockpit /> },
          { path: "trading/blocks", element: <TraderCockpit /> },

          // Monitoring
          { path: "monitoring/mandates", element: <MandateMonitor /> },
          { path: "monitoring/market", element: <Placeholder /> },

          // Scenario & ESG (Phase 6B)
          { path: "scenario/what-if", element: <WhatIfScenario /> },

          // Committee Workspace (Phase 6D)
          { path: "committee/:workspaceId", element: <CommitteeWorkspace /> },

          // Catch-all
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export default function FrontOfficeRouter() {
  return <RouterProvider router={router} />;
}
