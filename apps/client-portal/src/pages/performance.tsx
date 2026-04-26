/**
 * Client Portal - Performance Page (Phase 5C)
 *
 * Features:
 * - Period selector (1M, 3M, 6M, 1Y, YTD, Since Inception)
 * - TWR and IRR display cards
 * - Benchmark comparison
 * - Performance data points table
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Badge } from "@ui/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Target,
  Activity,
  Calendar,
} from "lucide-react";

// ---- Helpers ----

function getClientId(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).clientId || "CLT-001";
  } catch {}
  return "CLT-001";
}

function formatCurrency(value: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ---- Period Options ----

const PERIODS = [
  { value: "1M", label: "1 Month" },
  { value: "3M", label: "3 Months" },
  { value: "6M", label: "6 Months" },
  { value: "1Y", label: "1 Year" },
  { value: "YTD", label: "Year to Date" },
  { value: "SI", label: "Since Inception" },
];

// ---- Component ----

export default function PerformancePage() {
  const clientId = getClientId();
  const [selectedPeriod, setSelectedPeriod] = useState("1Y");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("");

  // Portfolio summary
  const { data: summary } = useQuery({
    queryKey: ["client-portal", "portfolio-summary", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/portfolio-summary/${clientId}`)),
  });

  const portfolios = summary?.portfolios ?? [];
  const activePortfolioId = selectedPortfolioId || portfolios[0]?.id || "";

  // Performance data
  const { data: perfData, isLoading } = useQuery({
    queryKey: ["client-portal", "performance", activePortfolioId, selectedPeriod],
    queryFn: () =>
      apiRequest(
        "GET",
        apiUrl(
          `/api/v1/client-portal/performance/${activePortfolioId}?period=${selectedPeriod}`,
        ),
      ),
    enabled: !!activePortfolioId,
  });

  const twr = perfData?.twr ?? null;
  const irr = perfData?.irr ?? null;
  const benchmarkReturn = perfData?.benchmarkReturn ?? null;
  const periodLabel = perfData?.periodLabel ?? selectedPeriod;
  const dataPoints: Array<{ date: string; value: number }> =
    perfData?.dataPoints ?? [];

  const excessReturn =
    twr !== null && benchmarkReturn !== null ? twr - benchmarkReturn : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-white">Performance</h1>
          <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 mt-1">
            Track your portfolio returns and benchmark comparison
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Portfolio selector */}
          {portfolios.length > 1 && (
            <Select
              value={activePortfolioId}
              onValueChange={setSelectedPortfolioId}
            >
              <SelectTrigger className="w-[200px] border-border">
                <SelectValue placeholder="Select portfolio" />
              </SelectTrigger>
              <SelectContent>
                {portfolios.map((p: { id: string; name: string }) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {PERIODS.map((p) => (
          <button
            type="button"
            key={p.value}
            onClick={() => setSelectedPeriod(p.value)}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              selectedPeriod === p.value
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-card dark:bg-gray-800 text-muted-foreground dark:text-gray-400 border border-border dark:border-gray-600 hover:bg-muted dark:hover:bg-gray-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Performance Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* TWR */}
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400 font-medium uppercase tracking-wider">
                      TWR
                    </p>
                    <p className="text-xs text-muted-foreground dark:text-gray-500 mt-0.5">
                      Time-Weighted Return
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {twr !== null && twr >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-500 dark:text-red-400" />
                      )}
                      <span
                        className={`text-xl sm:text-2xl font-bold ${
                          twr !== null && twr >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {twr !== null ? `${twr.toFixed(2)}%` : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-900/30">
                    <TrendingUp className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* IRR */}
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400 font-medium uppercase tracking-wider">
                      IRR
                    </p>
                    <p className="text-xs text-muted-foreground dark:text-gray-500 mt-0.5">
                      Internal Rate of Return
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {irr !== null && irr >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-500 dark:text-red-400" />
                      )}
                      <span
                        className={`text-xl sm:text-2xl font-bold ${
                          irr !== null && irr >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {irr !== null ? `${irr.toFixed(2)}%` : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                    <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Benchmark */}
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400 font-medium uppercase tracking-wider">
                      Benchmark
                    </p>
                    <p className="text-xs text-muted-foreground dark:text-gray-500 mt-0.5">
                      Index Return
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {benchmarkReturn !== null && benchmarkReturn >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-500 dark:text-red-400" />
                      )}
                      <span
                        className={`text-xl sm:text-2xl font-bold ${
                          benchmarkReturn !== null && benchmarkReturn >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {benchmarkReturn !== null
                          ? `${benchmarkReturn.toFixed(2)}%`
                          : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30">
                    <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Excess Return */}
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400 font-medium uppercase tracking-wider">
                      Excess Return
                    </p>
                    <p className="text-xs text-muted-foreground dark:text-gray-500 mt-0.5">
                      vs Benchmark
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {excessReturn !== null && excessReturn >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-500 dark:text-red-400" />
                      )}
                      <span
                        className={`text-xl sm:text-2xl font-bold ${
                          excessReturn !== null && excessReturn >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {excessReturn !== null
                          ? `${excessReturn >= 0 ? "+" : ""}${excessReturn.toFixed(2)}%`
                          : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                    <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Bar */}
          {twr !== null && benchmarkReturn !== null && (
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardHeader className="pb-3 px-3 sm:px-6">
                <CardTitle className="text-sm sm:text-base text-foreground dark:text-gray-100">
                  Return Comparison - {periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="space-y-4">
                  {/* Portfolio bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-foreground dark:text-gray-200 font-medium">
                        Your Portfolio
                      </span>
                      <span className="text-sm font-semibold text-teal-700 dark:text-teal-400">
                        {twr.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-muted dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-500 transition-all duration-500"
                        style={{
                          width: `${Math.min(Math.max(twr * 5, 5), 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Benchmark bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-foreground dark:text-gray-200 font-medium">
                        Benchmark
                      </span>
                      <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">
                        {benchmarkReturn.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-muted dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500 transition-all duration-500"
                        style={{
                          width: `${Math.min(Math.max(benchmarkReturn * 5, 5), 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Data Points Table */}
          {dataPoints.length > 0 && (
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardHeader className="pb-3 px-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                  <CardTitle className="text-sm sm:text-base text-foreground dark:text-gray-100">
                    Portfolio Value Over Time
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                {/* Simple visual bar chart using divs */}
                <div className="space-y-2 mb-6">
                  {dataPoints.map((dp, idx) => {
                    const maxVal = Math.max(...dataPoints.map((d) => d.value));
                    const pct = maxVal > 0 ? (dp.value / maxVal) * 100 : 0;
                    const isLast = idx === dataPoints.length - 1;
                    return (
                      <div key={dp.date} className="flex items-center gap-2 sm:gap-3">
                        <span className="text-xs text-muted-foreground dark:text-gray-400 font-mono w-20 sm:w-24 shrink-0">
                          {new Date(dp.date).toLocaleDateString("en-PH", {
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <div className="flex-1 h-5 rounded bg-muted dark:bg-gray-700 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all duration-300 ${
                              isLast ? "bg-teal-500" : "bg-teal-300"
                            }`}
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-foreground dark:text-gray-200 w-24 sm:w-28 text-right shrink-0">
                          {formatCurrency(dp.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Table fallback */}
                <details className="group">
                  <summary className="cursor-pointer text-sm text-teal-700 dark:text-teal-400 font-medium hover:text-teal-800 dark:hover:text-teal-300">
                    View data table
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border dark:border-gray-600">
                          <th className="text-left py-2 text-xs font-semibold text-muted-foreground dark:text-gray-400">
                            Date
                          </th>
                          <th className="text-right py-2 text-xs font-semibold text-muted-foreground dark:text-gray-400">
                            Portfolio Value
                          </th>
                          <th className="text-right py-2 text-xs font-semibold text-muted-foreground dark:text-gray-400">
                            Change
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataPoints.map((dp, idx) => {
                          const prevValue =
                            idx > 0 ? dataPoints[idx - 1].value : dp.value;
                          const change = dp.value - prevValue;
                          const changePct =
                            prevValue > 0
                              ? ((dp.value - prevValue) / prevValue) * 100
                              : 0;
                          return (
                            <tr
                              key={dp.date}
                              className="border-b border-border/50 dark:border-gray-700/50 last:border-0"
                            >
                              <td className="py-2 text-foreground dark:text-gray-200">
                                {new Date(dp.date).toLocaleDateString("en-PH", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </td>
                              <td className="text-right py-2 text-foreground dark:text-gray-200 font-medium tabular-nums">
                                {formatCurrency(dp.value)}
                              </td>
                              <td className="text-right py-2">
                                {idx > 0 ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${
                                      change >= 0
                                        ? "border-emerald-200 text-emerald-700"
                                        : "border-red-200 text-red-700"
                                    }`}
                                  >
                                    {change >= 0 ? "+" : ""}
                                    {changePct.toFixed(2)}%
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    --
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
