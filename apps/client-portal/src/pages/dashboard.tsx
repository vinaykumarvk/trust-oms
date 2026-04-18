/**
 * Client Portal Dashboard (Phase 5C)
 *
 * Overview page for client self-service portal:
 * - Welcome message with client name
 * - Portfolio snapshot cards (total AUM, portfolio count)
 * - Allocation breakdown (colored div segments)
 * - Recent transactions (last 5)
 * - Performance summary (1M, 3M, YTD, 1Y returns)
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import {
  Briefcase,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  Clock,
  Plus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ---- Helpers ----

function getClientId(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) {
      const user = JSON.parse(stored);
      return user.clientId || "CLT-001";
    }
  } catch {
    // ignore
  }
  return "CLT-001";
}

function getClientName(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) {
      const user = JSON.parse(stored);
      return user.name || "Client";
    }
  } catch {
    // ignore
  }
  return "Client";
}

function formatCurrency(value: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `PHP ${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `PHP ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `PHP ${(value / 1_000).toFixed(1)}K`;
  return `PHP ${value.toFixed(2)}`;
}

// Allocation colors
const ALLOCATION_COLORS = [
  "bg-teal-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-emerald-500",
  "bg-indigo-500",
  "bg-orange-500",
];

// ---- Component ----

export default function DashboardPage() {
  const clientId = getClientId();
  const clientName = getClientName();
  const navigate = useNavigate();

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Portfolio summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["client-portal", "portfolio-summary", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/portfolio-summary/${clientId}`)),
  });

  // Allocation (use first portfolio if available)
  const firstPortfolioId = summary?.portfolios?.[0]?.id;

  const { data: allocation } = useQuery({
    queryKey: ["client-portal", "allocation", firstPortfolioId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/allocation/${firstPortfolioId}`)),
    enabled: !!firstPortfolioId,
  });

  // Recent transactions (first portfolio)
  const { data: txData } = useQuery({
    queryKey: ["client-portal", "transactions", firstPortfolioId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/transactions/${firstPortfolioId}?limit=5`)),
    enabled: !!firstPortfolioId,
  });

  // Performance summary (multiple periods)
  const { data: perf1M } = useQuery({
    queryKey: ["client-portal", "performance", firstPortfolioId, "1M"],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/performance/${firstPortfolioId}?period=1M`)),
    enabled: !!firstPortfolioId,
  });

  const { data: perf3M } = useQuery({
    queryKey: ["client-portal", "performance", firstPortfolioId, "3M"],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/performance/${firstPortfolioId}?period=3M`)),
    enabled: !!firstPortfolioId,
  });

  const { data: perfYTD } = useQuery({
    queryKey: ["client-portal", "performance", firstPortfolioId, "YTD"],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/performance/${firstPortfolioId}?period=YTD`)),
    enabled: !!firstPortfolioId,
  });

  const { data: perf1Y } = useQuery({
    queryKey: ["client-portal", "performance", firstPortfolioId, "1Y"],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/performance/${firstPortfolioId}?period=1Y`)),
    enabled: !!firstPortfolioId,
  });

  const perfPeriods = [
    { label: "1M", data: perf1M },
    { label: "3M", data: perf3M },
    { label: "YTD", data: perfYTD },
    { label: "1Y", data: perf1Y },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {clientName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{today}</p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white"
          onClick={() => navigate("/request-action")}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Snapshot Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total AUM */}
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Total Value</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {summaryLoading ? "..." : formatCompact(summary?.totalAum ?? 0)}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                <DollarSign className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Count */}
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Portfolios</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {summaryLoading ? "..." : summary?.portfolioCount ?? 0}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 1Y Performance */}
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">1Y Return</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {perf1Y ? `${perf1Y.twr.toFixed(2)}%` : "..."}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column: Allocation + Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Allocation Breakdown */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base text-slate-900">Asset Allocation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {allocation?.allocations && allocation.allocations.length > 0 ? (
              <div className="space-y-4">
                {/* Bar chart visualization */}
                <div className="flex h-6 rounded-full overflow-hidden">
                  {allocation.allocations.map(
                    (a: { assetClass: string; weight: number }, i: number) => (
                      <div
                        key={a.assetClass}
                        className={`${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} transition-all`}
                        style={{ width: `${Math.max(a.weight, 2)}%` }}
                        title={`${a.assetClass}: ${a.weight.toFixed(1)}%`}
                      />
                    ),
                  )}
                </div>

                {/* Legend */}
                <div className="grid grid-cols-2 gap-2">
                  {allocation.allocations.map(
                    (a: { assetClass: string; weight: number; marketValue: number }, i: number) => (
                      <div key={a.assetClass} className="flex items-center gap-2">
                        <div
                          className={`h-3 w-3 rounded-sm shrink-0 ${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]}`}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">
                            {a.assetClass}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {a.weight.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">
                No allocation data available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Performance Summary */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base text-slate-900">Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {perfPeriods.map((p) => {
                const twr = p.data?.twr ?? null;
                const isPositive = twr !== null && twr >= 0;
                return (
                  <div
                    key={p.label}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                  >
                    <p className="text-xs text-slate-500 font-medium">{p.label}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {twr !== null ? (
                        <>
                          {isPositive ? (
                            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                          )}
                          <span
                            className={`text-lg font-semibold ${
                              isPositive ? "text-emerald-700" : "text-red-600"
                            }`}
                          >
                            {twr.toFixed(2)}%
                          </span>
                        </>
                      ) : (
                        <span className="text-lg font-semibold text-slate-300">--</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-teal-700 border-teal-200 hover:bg-teal-50"
                onClick={() => navigate("/performance")}
              >
                View Full Performance
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base text-slate-900">
                Recent Transactions
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-teal-700 hover:text-teal-800"
              onClick={() => navigate("/portfolio")}
            >
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {txData?.transactions && txData.transactions.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {txData.transactions.map(
                (tx: {
                  orderId: string;
                  orderNo: string;
                  side: string;
                  securityName: string;
                  quantity: number;
                  price: number;
                  currency: string;
                  status: string;
                  createdAt: string;
                }) => (
                  <div
                    key={tx.orderId}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                          tx.side === "BUY"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-500"
                        }`}
                      >
                        {tx.side === "BUY" ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {tx.side} {tx.securityName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {tx.quantity} units &middot;{" "}
                          {tx.createdAt
                            ? new Date(tx.createdAt).toLocaleDateString("en-PH")
                            : "--"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-medium text-slate-900">
                        {formatCurrency(tx.quantity * tx.price, tx.currency)}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          tx.status === "FILLED"
                            ? "border-emerald-200 text-emerald-700"
                            : tx.status === "PENDING"
                              ? "border-amber-200 text-amber-700"
                              : "border-slate-200 text-slate-600"
                        }`}
                      >
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center">
              No recent transactions
            </p>
          )}
        </CardContent>
      </Card>

      {/* Portfolio List */}
      {summary?.portfolios && summary.portfolios.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base text-slate-900">Your Portfolios</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {summary.portfolios.map(
                (p: {
                  id: string;
                  name: string;
                  productType: string;
                  marketValue: number;
                  currency: string;
                  status: string;
                }) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.productType ?? "Portfolio"} &middot; {p.currency}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(p.marketValue, p.currency)}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          p.status === "active"
                            ? "border-emerald-200 text-emerald-700"
                            : "border-slate-200 text-slate-600"
                        }`}
                      >
                        {p.status ?? "Active"}
                      </Badge>
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
