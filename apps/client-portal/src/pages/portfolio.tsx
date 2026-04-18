/**
 * Client Portal - Portfolio / Holdings Page (Phase 5C)
 *
 * Features:
 * - Portfolio selector (if multiple)
 * - Holdings table: Security, Quantity, Price, Market Value, Weight %, P&L, P&L %
 * - Summary row with totals
 * - Asset allocation visual breakdown
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
  Briefcase,
  TrendingUp,
  TrendingDown,
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

function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

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

// ---- Types ----

interface Holding {
  positionId: number;
  securityId: number;
  securityName: string;
  assetClass: string;
  isin: string | null;
  currency: string;
  quantity: number;
  price: number;
  costBasis: number;
  marketValue: number;
  weight: number;
  pnl: number;
  pnlPct: number;
  asOfDate: string | null;
}

interface Allocation {
  assetClass: string;
  weight: number;
  marketValue: number;
}

interface Portfolio {
  id: string;
  name: string;
  productType: string;
  marketValue: number;
  currency: string;
}

// ---- Component ----

export default function PortfolioPage() {
  const clientId = getClientId();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("");

  // Portfolio summary (to get list)
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["client-portal", "portfolio-summary", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/portfolio-summary/${clientId}`)),
  });

  // Determine active portfolio
  const portfolios: Portfolio[] = summary?.portfolios ?? [];
  const activePortfolioId = selectedPortfolioId || portfolios[0]?.id || "";

  // Holdings
  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({
    queryKey: ["client-portal", "holdings", activePortfolioId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/holdings/${activePortfolioId}`)),
    enabled: !!activePortfolioId,
  });

  // Allocation
  const { data: allocationData } = useQuery({
    queryKey: ["client-portal", "allocation", activePortfolioId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/allocation/${activePortfolioId}`)),
    enabled: !!activePortfolioId,
  });

  const holdings: Holding[] = holdingsData?.holdings ?? [];
  const totalMarketValue: number = holdingsData?.totalMarketValue ?? 0;
  const allocations: Allocation[] = allocationData?.allocations ?? [];

  const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const totalPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);
  const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Portfolio</h1>
          <p className="text-sm text-slate-500 mt-1">
            View your holdings and asset allocation
          </p>
        </div>

        {/* Portfolio selector */}
        {portfolios.length > 1 && (
          <Select
            value={activePortfolioId}
            onValueChange={setSelectedPortfolioId}
          >
            <SelectTrigger className="w-[260px] border-slate-300">
              <SelectValue placeholder="Select portfolio" />
            </SelectTrigger>
            <SelectContent>
              {portfolios.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-medium">Market Value</p>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {formatCurrency(totalMarketValue)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-medium">Total P&L</p>
            <div className="flex items-center gap-2 mt-1">
              {totalPnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <p
                className={`text-xl font-bold ${
                  totalPnl >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {formatCurrency(totalPnl)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-medium">Holdings</p>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {holdings.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Asset Allocation Visual */}
      {allocations.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900">
              Asset Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stacked bar */}
            <div className="flex h-8 rounded-full overflow-hidden mb-4">
              {allocations.map((a, i) => (
                <div
                  key={a.assetClass}
                  className={`${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} transition-all`}
                  style={{ width: `${Math.max(a.weight, 2)}%` }}
                  title={`${a.assetClass}: ${a.weight.toFixed(1)}%`}
                />
              ))}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-xs font-medium text-slate-500">
                      Asset Class
                    </th>
                    <th className="text-right py-2 text-xs font-medium text-slate-500">
                      Weight
                    </th>
                    <th className="text-right py-2 text-xs font-medium text-slate-500">
                      Market Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a, i) => (
                    <tr
                      key={a.assetClass}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-3 w-3 rounded-sm shrink-0 ${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]}`}
                          />
                          <span className="text-slate-700">{a.assetClass}</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 text-slate-700 font-medium">
                        {a.weight.toFixed(1)}%
                      </td>
                      <td className="text-right py-2.5 text-slate-700">
                        {formatCurrency(a.marketValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Holdings Table */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-slate-400" />
            <CardTitle className="text-base text-slate-900">
              Holdings
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {holdingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            </div>
          ) : holdings.length > 0 ? (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Security
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Market Value
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Weight %
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      P&L
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      P&L %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr
                      key={h.positionId}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-slate-900">
                            {h.securityName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {h.assetClass}
                            {h.isin ? ` | ${h.isin}` : ""}
                          </p>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 text-slate-700 tabular-nums">
                        {formatNumber(h.quantity, 0)}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-700 tabular-nums">
                        {formatNumber(h.price, 4)}
                      </td>
                      <td className="text-right py-3 px-4 font-medium text-slate-900 tabular-nums">
                        {formatCurrency(h.marketValue, h.currency)}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-700 tabular-nums">
                        {h.weight.toFixed(2)}%
                      </td>
                      <td
                        className={`text-right py-3 px-4 font-medium tabular-nums ${
                          h.pnl >= 0 ? "text-emerald-700" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(h.pnl, h.currency)}
                      </td>
                      <td className="text-right py-3 px-4">
                        <Badge
                          variant="outline"
                          className={`text-xs font-medium ${
                            h.pnlPct >= 0
                              ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                              : "border-red-200 text-red-700 bg-red-50"
                          }`}
                        >
                          {h.pnlPct >= 0 ? "+" : ""}
                          {h.pnlPct.toFixed(2)}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Summary Row */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      Total
                    </td>
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4" />
                    <td className="text-right py-3 px-4 font-bold text-slate-900 tabular-nums">
                      {formatCurrency(totalMarketValue)}
                    </td>
                    <td className="text-right py-3 px-4 font-semibold text-slate-700 tabular-nums">
                      100.00%
                    </td>
                    <td
                      className={`text-right py-3 px-4 font-bold tabular-nums ${
                        totalPnl >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(totalPnl)}
                    </td>
                    <td className="text-right py-3 px-4">
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${
                          totalPnlPct >= 0
                            ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                            : "border-red-200 text-red-700 bg-red-50"
                        }`}
                      >
                        {totalPnlPct >= 0 ? "+" : ""}
                        {totalPnlPct.toFixed(2)}%
                      </Badge>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">
              No holdings found for this portfolio
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
