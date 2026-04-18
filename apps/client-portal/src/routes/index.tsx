/**
 * Client Portal Router Configuration (Phase 5C)
 *
 * Uses createBrowserRouter from react-router-dom with:
 * - ClientPortalLayout wrapping all authenticated routes
 * - Login page without layout
 * - Lazy-loaded page components
 * - ProtectedRoute wrapper checking localStorage auth state
 */

import React, { Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { ClientPortalLayout } from "@/components/layout/ClientPortalLayout";

// ---- Lazy-loaded pages ----
const LoginPage = React.lazy(() => import("@/pages/login"));
const DashboardPage = React.lazy(() => import("@/pages/dashboard"));
const PortfolioPage = React.lazy(() => import("@/pages/portfolio"));
const PerformancePage = React.lazy(() => import("@/pages/performance"));
const StatementsPage = React.lazy(() => import("@/pages/statements"));
const MessagesPage = React.lazy(() => import("@/pages/messages"));
const PreferencesPage = React.lazy(() => import("@/pages/preferences"));
const RequestActionPage = React.lazy(() => import("@/pages/request-action"));

// ---- Loading fallback ----
function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    </div>
  );
}

// ---- Protected Route ----
function ProtectedRoute() {
  const user = localStorage.getItem("trustoms-client-user");
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

  // Protected: All routes under ClientPortalLayout
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <ClientPortalLayout />,
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

          // Portfolio (holdings view)
          {
            path: "/portfolio",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PortfolioPage />
              </Suspense>
            ),
          },

          // Performance
          {
            path: "/performance",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PerformancePage />
              </Suspense>
            ),
          },

          // Statements
          {
            path: "/statements",
            element: (
              <Suspense fallback={<PageLoader />}>
                <StatementsPage />
              </Suspense>
            ),
          },

          // Messages
          {
            path: "/messages",
            element: (
              <Suspense fallback={<PageLoader />}>
                <MessagesPage />
              </Suspense>
            ),
          },

          // Preferences
          {
            path: "/preferences",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PreferencesPage />
              </Suspense>
            ),
          },

          // Request Action
          {
            path: "/request-action",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RequestActionPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
]);
