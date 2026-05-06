/**
 * Mid-Office Router Configuration
 *
 * Uses createBrowserRouter from react-router-dom with:
 * - MidOfficeLayout wrapping all routes
 * - Lazy-loaded page components
 * - SuspenseWrapper for shared loading state
 */

import React, { Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from "react-router-dom";
import MidOfficeLayout from "../components/layout/MidOfficeLayout";
import { Skeleton } from "@ui/components/ui/skeleton";

// ---- Lazy-loaded pages ----
const LoginPage = React.lazy(() => import("@/pages/login"));
const MODashboard = React.lazy(() => import("@/pages/mo-dashboard"));
const Confirmations = React.lazy(() => import("@/pages/confirmations"));
const Exceptions = React.lazy(() => import("@/pages/exceptions"));
const FundAccounting = React.lazy(() => import("@/pages/fund-accounting"));
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

function ProtectedRoute() {
  const location = useLocation();
  const user = localStorage.getItem("trustoms-user");

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}

// ---- Router ----

const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full" />
          </div>
        }
      >
        <LoginPage />
      </Suspense>
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MidOfficeLayout />,
        children: [
          {
            element: <SuspenseWrapper />,
            children: [
              // Dashboard
              { index: true, element: <MODashboard /> },

              // Trading Operations
              { path: "confirmations", element: <Confirmations /> },
              { path: "settlement", element: <Placeholder /> },

              // Risk & Compliance
              { path: "mandates", element: <Placeholder /> },
              { path: "compliance", element: <Placeholder /> },

              // Fund Accounting
              { path: "nav", element: <FundAccounting /> },
              { path: "valuation", element: <FundAccounting /> },

              // Exceptions
              { path: "exceptions", element: <Exceptions /> },
              { path: "unmatched", element: <Placeholder /> },

              // Catch-all
              { path: "*", element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
    ],
  },
]);

export default function MidOfficeRouter() {
  return <RouterProvider router={router} />;
}
