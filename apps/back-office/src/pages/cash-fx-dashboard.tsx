/**
 * Cash & FX Dashboard — Phase 3A (BRD Screen #20)
 *
 * Liquidity heat-map, account register (Nostro/Vostro/Trust),
 * FX booking stub, and FX hedge linkage overview.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Progress } from "@ui/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Banknote,
  TrendingUp,
  ArrowRightLeft,
  Shield,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiquidityRow {
  currency: string;
  t0_balance: number;
  t1_projected: number;
  t2_projected: number;
}

interface AccountRow {
  account_id: string;
  currency: string;
  balance: number;
  available: number;
  last_updated: string;
}

interface HedgeLinkage {
  portfolio: string;
  security: string;
  fx_exposure: string;
  hedge_pct: number;
  hedge_instrument: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(value: number, currency = "PHP"): string {
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

const NOSTRO_ACCOUNTS: AccountRow[] = [
  { account_id: "NOSTRO-USD-001", currency: "USD", balance: 2_450_000, available: 2_100_000, last_updated: "2026-04-18T08:30:00Z" },
  { account_id: "NOSTRO-EUR-001", currency: "EUR", balance: 1_200_000, available: 1_050_000, last_updated: "2026-04-18T08:15:00Z" },
  { account_id: "NOSTRO-PHP-001", currency: "PHP", balance: 85_000_000, available: 78_000_000, last_updated: "2026-04-18T09:00:00Z" },
];

const VOSTRO_ACCOUNTS: AccountRow[] = [
  { account_id: "VOSTRO-USD-001", currency: "USD", balance: 500_000, available: 450_000, last_updated: "2026-04-18T07:45:00Z" },
  { account_id: "VOSTRO-PHP-001", currency: "PHP", balance: 12_000_000, available: 11_500_000, last_updated: "2026-04-18T08:00:00Z" },
];

const TRUST_ACCOUNTS: AccountRow[] = [
  { account_id: "TRUST-SETTLE-001", currency: "PHP", balance: 150_000_000, available: 140_000_000, last_updated: "2026-04-18T09:10:00Z" },
  { account_id: "TRUST-SETTLE-002", currency: "USD", balance: 5_000_000, available: 4_800_000, last_updated: "2026-04-18T08:55:00Z" },
];

const FX_RATES = [
  { pair: "USD/PHP", rate: 56.50, change: "+0.12" },
  { pair: "EUR/PHP", rate: 61.20, change: "-0.05" },
  { pair: "GBP/PHP", rate: 71.85, change: "+0.22" },
  { pair: "JPY/PHP", rate: 0.3745, change: "-0.002" },
];

const HEDGE_LINKAGES: HedgeLinkage[] = [
  { portfolio: "UITF-EQ-GLOBAL", security: "MSCI World ETF", fx_exposure: "USD 2.5M", hedge_pct: 75, hedge_instrument: "USD/PHP NDF 3M" },
  { portfolio: "UITF-BOND-USD", security: "US Treasury 10Y", fx_exposure: "USD 5.0M", hedge_pct: 50, hedge_instrument: "USD/PHP FWD 6M" },
  { portfolio: "IMA-BALANCED-01", security: "EUR Corp Bond", fx_exposure: "EUR 1.2M", hedge_pct: 100, hedge_instrument: "EUR/PHP NDF 3M" },
  { portfolio: "UITF-EQ-ASEAN", security: "ASEAN Index Fund", fx_exposure: "USD 800K", hedge_pct: 0, hedge_instrument: "Unhedged" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccountTable({ rows }: { rows: AccountRow[] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account ID</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead>Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.account_id}>
              <TableCell className="font-mono text-xs">{r.account_id}</TableCell>
              <TableCell>
                <Badge variant="outline">{r.currency}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatAmount(r.balance, r.currency)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatAmount(r.available, r.currency)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(r.last_updated)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CashFxDashboard() {
  const heatmapQuery = useQuery<LiquidityRow[]>({
    queryKey: ["liquidity-heatmap"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/settlements/cash-ledger/liquidity-heatmap")),
    refetchInterval: 30_000,
  });
  const heatmapData = heatmapQuery.data ?? [];

  // Find the max absolute value across all heatmap data for normalising bars
  const maxAbs = heatmapData.reduce((mx, row) => {
    return Math.max(
      mx,
      Math.abs(row.t0_balance),
      Math.abs(row.t1_projected),
      Math.abs(row.t2_projected),
    );
  }, 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Banknote className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cash & FX Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Liquidity monitoring, account registers, and FX management
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => heatmapQuery.refetch()}
          disabled={heatmapQuery.isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${heatmapQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Liquidity Heat-map */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Liquidity Heat-map</CardTitle>
          </div>
          <CardDescription>
            Projected cash positions across settlement horizons
          </CardDescription>
        </CardHeader>
        <CardContent>
          {heatmapQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : heatmapData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No liquidity data available
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Currency</TableHead>
                    <TableHead>T+0 Balance</TableHead>
                    <TableHead>T+1 Projected</TableHead>
                    <TableHead>T+2 Projected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {heatmapData.map((row) => (
                    <TableRow key={row.currency}>
                      <TableCell className="font-semibold">{row.currency}</TableCell>
                      {[row.t0_balance, row.t1_projected, row.t2_projected].map((val, idx) => {
                        const pct = Math.min(100, (Math.abs(val) / maxAbs) * 100);
                        const positive = val >= 0;
                        return (
                          <TableCell key={idx}>
                            <div className="space-y-1">
                              <span className={`font-mono text-sm ${positive ? "text-green-700" : "text-red-700"}`}>
                                {val.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                              </span>
                              <div className="h-2 w-full rounded-full bg-gray-100">
                                <div
                                  className={`h-full rounded-full transition-all ${positive ? "bg-green-500" : "bg-red-500"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Account Register */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account Register</CardTitle>
          <CardDescription>Nostro, Vostro, and Trust settlement accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="nostro">
            <TabsList>
              <TabsTrigger value="nostro">Nostro</TabsTrigger>
              <TabsTrigger value="vostro">Vostro</TabsTrigger>
              <TabsTrigger value="trust">Trust Settlement</TabsTrigger>
            </TabsList>
            <TabsContent value="nostro" className="mt-4">
              <AccountTable rows={NOSTRO_ACCOUNTS} />
            </TabsContent>
            <TabsContent value="vostro" className="mt-4">
              <AccountTable rows={VOSTRO_ACCOUNTS} />
            </TabsContent>
            <TabsContent value="trust" className="mt-4">
              <AccountTable rows={TRUST_ACCOUNTS} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Separator />

      {/* FX Booking (stub) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">FX Booking</CardTitle>
          </div>
          <CardDescription>Book foreign exchange transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Booking Form */}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Buy Currency</label>
                  <Input placeholder="USD" disabled />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Sell Currency</label>
                  <Input placeholder="PHP" disabled />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Amount</label>
                  <Input placeholder="1,000,000" disabled />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Spot Rate</label>
                  <Input placeholder="56.50" disabled />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium">Value Date</label>
                  <Input type="date" disabled />
                </div>
              </div>
              <Button disabled className="w-full">
                Book FX — Coming in Phase 4
              </Button>
            </div>

            {/* Current FX Rates */}
            <div>
              <h4 className="text-sm font-medium mb-3">Current FX Rates (indicative)</h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pair</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {FX_RATES.map((fx) => (
                      <TableRow key={fx.pair}>
                        <TableCell className="font-medium">{fx.pair}</TableCell>
                        <TableCell className="text-right font-mono">{fx.rate}</TableCell>
                        <TableCell className="text-right">
                          <span className={fx.change.startsWith("+") ? "text-green-600" : "text-red-600"}>
                            {fx.change}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* FX Hedge Linkage */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">FX Hedge Linkage</CardTitle>
          </div>
          <CardDescription>Portfolio-level FX exposure and hedge coverage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>FX Exposure</TableHead>
                  <TableHead>Hedge %</TableHead>
                  <TableHead>Hedge Instrument</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {HEDGE_LINKAGES.map((h) => (
                  <TableRow key={h.portfolio}>
                    <TableCell className="font-medium">{h.portfolio}</TableCell>
                    <TableCell>{h.security}</TableCell>
                    <TableCell className="font-mono text-sm">{h.fx_exposure}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={h.hedge_pct}
                          className="h-2 w-16"
                        />
                        <span className="text-sm">{h.hedge_pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={h.hedge_pct === 0 ? "destructive" : "outline"}>
                        {h.hedge_instrument}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
