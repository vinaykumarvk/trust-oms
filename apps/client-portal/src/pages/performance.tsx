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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Performance</h1>
          <p className="text-sm text-slate-500 mt-1">
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
              <SelectTrigger className="w-[200px] border-slate-300">
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
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            type="button"
            key={p.value}
            onClick={() => setSelectedPeriod(p.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedPeriod === p.value
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* TWR */}
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                      TWR
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Time-Weighted Return
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {twr !== null && twr >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-500" />
                      )}
                      <span
                        className={`text-2xl font-bold ${
                          twr !== null && twr >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {twr !== null ? `${twr.toFixed(2)}%` : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                    <TrendingUp className="h-5 w-5 text-teal-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* IRR */}
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                      IRR
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Internal Rate of Return
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {irr !== null && irr >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-500" />
                      )}
                      <span
                        className={`text-2xl font-bold ${
                          irr !== null && irr >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {irr !== null ? `${irr.toFixed(2)}%` : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                    <Activity className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Benchmark */}
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                      Benchmark
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Index Return
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {benchmarkReturn !== null && benchmarkReturn >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-500" />
                      )}
                      <span
                        className={`text-2xl font-bold ${
                          benchmarkReturn !== null && benchmarkReturn >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {benchmarkReturn !== null
                          ? `${benchmarkReturn.toFixed(2)}%`
                          : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                    <Target className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Excess Return */}
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                      Excess Return
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      vs Benchmark
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {excessReturn !== null && excessReturn >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-500" />
                      )}
                      <span
                        className={`text-2xl font-bold ${
                          excessReturn !== null && excessReturn >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {excessReturn !== null
                          ? `${excessReturn >= 0 ? "+" : ""}${excessReturn.toFixed(2)}%`
                          : "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                    <BarChart3 className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Bar */}
          {twr !== null && benchmarkReturn !== null && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-900">
                  Return Comparison - {periodLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Portfolio bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-slate-700 font-medium">
                        Your Portfolio
                      </span>
                      <span className="text-sm font-semibold text-teal-700">
                        {twr.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-slate-100 overflow-hidden">
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
                      <span className="text-sm text-slate-700 font-medium">
                        Benchmark
                      </span>
                      <span className="text-sm font-semibold text-purple-700">
                        {benchmarkReturn.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-slate-100 overflow-hidden">
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
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <CardTitle className="text-base text-slate-900">
                    Portfolio Value Over Time
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {/* Simple visual bar chart using divs */}
                <div className="space-y-2 mb-6">
                  {dataPoints.map((dp, idx) => {
                    const maxVal = Math.max(...dataPoints.map((d) => d.value));
                    const pct = maxVal > 0 ? (dp.value / maxVal) * 100 : 0;
                    const isLast = idx === dataPoints.length - 1;
                    return (
                      <div key={dp.date} className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 font-mono w-24 shrink-0">
                          {new Date(dp.date).toLocaleDateString("en-PH", {
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded transition-all duration-300 ${
                              isLast ? "bg-teal-500" : "bg-teal-300"
                            }`}
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-700 w-28 text-right shrink-0">
                          {formatCurrency(dp.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Table fallback */}
                <details className="group">
                  <summary className="cursor-pointer text-sm text-teal-700 font-medium hover:text-teal-800">
                    View data table
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 text-xs font-semibold text-slate-500">
                            Date
                          </th>
                          <th className="text-right py-2 text-xs font-semibold text-slate-500">
                            Portfolio Value
                          </th>
                          <th className="text-right py-2 text-xs font-semibold text-slate-500">
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
                              className="border-b border-slate-50 last:border-0"
                            >
                              <td className="py-2 text-slate-700">
                                {new Date(dp.date).toLocaleDateString("en-PH", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </td>
                              <td className="text-right py-2 text-slate-900 font-medium tabular-nums">
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
                                  <span className="text-xs text-slate-400">
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
