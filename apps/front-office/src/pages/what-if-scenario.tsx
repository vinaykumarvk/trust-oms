/**
 * What-If Scenario Engine & ESG Dashboard — Phase 6B
 *
 * Full-page pre-trade impact analysis tool for RMs and portfolio managers.
 *
 * Features:
 *   1. Order Simulation Form — portfolio selector, security search, side, qty, price
 *   2. Impact Dashboard — allocation comparison, mandate compliance, concentration,
 *      sector exposure, performance estimate, tax impact
 *   3. ESG Panel — portfolio ESG scores with E/S/G breakdown, screening flags,
 *      carbon intensity
 *   4. History Sidebar — recent simulations list
 *
 * Data sources:
 *   POST /api/v1/scenario/analyze
 *   GET  /api/v1/scenario/history/:portfolioId
 *   GET  /api/v1/scenario/esg/portfolio/:portfolioId
 *   GET  /api/v1/scenario/esg/breakdown/:portfolioId
 *   GET  /api/v1/scenario/esg/screening/:portfolioId
 *   GET  /api/v1/scenario/esg/security/:securityId
 */

import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import { Progress } from "@ui/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@ui/components/ui/tooltip";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  ChevronRight,
  Clock,
  Flame,
  Globe,
  Leaf,
  LineChart,
  Loader2,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  DollarSign,
  PieChart,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AllocationEntry {
  assetClass: string;
  weight: number;
  marketValue: number;
}

interface MandateCompliance {
  status: "PASS" | "WARN" | "BREACH";
  details: string[];
}

interface ConcentrationImpact {
  currentConcentration: number;
  postTradeConcentration: number;
  limit: number;
  status: string;
}

interface SectorExposureChange {
  sector: string;
  currentWeight: number;
  postTradeWeight: number;
}

interface PerformanceEstimate {
  estimatedReturn: number;
  riskImpact: number;
}

interface TaxImpact {
  estimatedTax: number;
  shortTermGains: number;
  longTermGains: number;
}

interface ScenarioResult {
  id: string;
  portfolioId: string;
  proposedOrder: {
    securityId: number;
    side: string;
    quantity: number;
    price: number;
  };
  currentAllocation: AllocationEntry[];
  postTradeAllocation: AllocationEntry[];
  mandateCompliance: MandateCompliance;
  concentrationImpact: ConcentrationImpact;
  sectorExposureChange: SectorExposureChange[];
  performanceEstimate: PerformanceEstimate;
  taxImpact: TaxImpact;
  timestamp: string;
}

interface PortfolioListItem {
  portfolio_id: string;
  client_id: string | null;
  type: string | null;
  base_currency: string | null;
  aum: string | null;
  portfolio_status: string | null;
}

interface SecurityListItem {
  id: number;
  name: string | null;
  bloomberg_ticker: string | null;
  asset_class: string | null;
  isin: string | null;
  currency: string | null;
}

interface PortfolioESG {
  portfolioId: string;
  overall: number;
  environmental: number;
  social: number;
  governance: number;
  carbonIntensity: number;
  averageControversyScore: number;
  totalPositions: number;
  scoredPositions: number;
  totalMarketValue: number;
}

interface ESGBreakdownEntry {
  securityId: number;
  securityName: string;
  assetClass: string;
  weight: number;
  marketValue: number;
  overall: number;
  environmental: number;
  social: number;
  governance: number;
  carbonIntensity: number;
  controversyScore: number;
  controversyFlag: boolean;
}

interface ESGBreakdown {
  portfolioId: string;
  holdings: ESGBreakdownEntry[];
  aggregated: {
    environmental: number;
    social: number;
    governance: number;
    overall: number;
    carbonIntensity: number;
    highControversyCount: number;
  };
  environmentalComponents: { label: string; score: number }[];
  socialComponents: { label: string; score: number }[];
  governanceComponents: { label: string; score: number }[];
}

interface ScreeningFlag {
  securityId: number;
  securityName: string;
  assetClass: string;
  weight: number;
  marketValue: number;
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
}

interface ESGScreeningResult {
  portfolioId: string;
  totalPositions: number;
  flaggedCount: number;
  flaggedWeight: number;
  flaggedMarketValue: number;
  flags: ScreeningFlag[];
}

interface HistoryResponse {
  data: ScenarioResult[];
  total: number;
}

// ---------------------------------------------------------------------------
// Formatters & constants
// ---------------------------------------------------------------------------

const PH = "en-PH";
const fmtCcy = (n: number) =>
  new Intl.NumberFormat(PH, {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat(PH, { maximumFractionDigits: 2 }).format(n);

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(PH, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const ALLOC_COLORS: Record<string, string> = {
  EQUITY: "bg-blue-500",
  STOCK: "bg-blue-500",
  COMMON_STOCK: "bg-blue-500",
  PREFERRED_STOCK: "bg-blue-400",
  BOND: "bg-emerald-500",
  FIXED_INCOME: "bg-emerald-500",
  GOVERNMENT_BOND: "bg-emerald-400",
  CORPORATE_BOND: "bg-teal-500",
  CASH: "bg-amber-400",
  MONEY_MARKET: "bg-amber-400",
  REAL_ESTATE: "bg-purple-500",
  ALTERNATIVES: "bg-pink-500",
  UNKNOWN: "bg-gray-400",
};

function getAllocColor(assetClass: string): string {
  const upper = (assetClass ?? "").toUpperCase().replace(/[\s-]/g, "_");
  return ALLOC_COLORS[upper] ?? "bg-gray-400";
}

const COMPLIANCE_BADGE: Record<string, { cls: string; icon: typeof CheckCircle }> = {
  PASS: { cls: "bg-green-100 text-green-800", icon: CheckCircle },
  WARN: { cls: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
  BREACH: { cls: "bg-red-100 text-red-800", icon: XCircle },
};

const SEVERITY_BADGE: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-blue-100 text-blue-800",
};

function esgScoreColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function esgScoreBg(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function esgScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 60) return "Average";
  if (score >= 50) return "Below Average";
  return "Poor";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WhatIfScenarioPage() {
  const queryClient = useQueryClient();

  // --- Form state ---
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");
  const [securitySearch, setSecuritySearch] = useState("");
  const [selectedSecurityId, setSelectedSecurityId] = useState<number | null>(null);
  const [selectedSecurityLabel, setSelectedSecurityLabel] = useState("");
  const [side, setSide] = useState<string>("BUY");
  const [quantity, setQuantity] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [showSecurityDropdown, setShowSecurityDropdown] = useState(false);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState("impact");
  const [esgTab, setEsgTab] = useState("overview");

  // --- Last analysis result ---
  const [analysisResult, setAnalysisResult] = useState<ScenarioResult | null>(null);

  // --- Data queries ---

  // Portfolios list
  const portfoliosQuery = useQuery<{ data: PortfolioListItem[] }>({
    queryKey: ["portfolios-for-scenario"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/portfolios?pageSize=200")),
  });

  // Securities search
  const securitiesQuery = useQuery<{ data: SecurityListItem[] }>({
    queryKey: ["securities-search", securitySearch],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/securities?search=${encodeURIComponent(securitySearch)}&pageSize=20`)),
    enabled: securitySearch.length >= 2,
  });

  // Scenario history
  const historyQuery = useQuery<HistoryResponse>({
    queryKey: ["scenario-history", selectedPortfolio],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/scenario/history/${selectedPortfolio}`)),
    enabled: !!selectedPortfolio,
  });

  // Portfolio ESG
  const esgQuery = useQuery<PortfolioESG>({
    queryKey: ["portfolio-esg", selectedPortfolio],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/scenario/esg/portfolio/${selectedPortfolio}`)),
    enabled: !!selectedPortfolio,
  });

  // ESG Breakdown
  const esgBreakdownQuery = useQuery<ESGBreakdown>({
    queryKey: ["esg-breakdown", selectedPortfolio],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/scenario/esg/breakdown/${selectedPortfolio}`)),
    enabled: !!selectedPortfolio && esgTab === "breakdown",
  });

  // ESG Screening
  const esgScreeningQuery = useQuery<ESGScreeningResult>({
    queryKey: ["esg-screening", selectedPortfolio],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/scenario/esg/screening/${selectedPortfolio}`)),
    enabled: !!selectedPortfolio && esgTab === "screening",
  });

  // --- Analyze mutation ---
  const analyzeMutation = useMutation({
    mutationFn: (payload: {
      portfolioId: string;
      proposedOrder: {
        securityId: number;
        side: string;
        quantity: number;
        price: number;
      };
    }) => apiRequest("POST", apiUrl("/api/v1/scenario/analyze"), payload),
    onSuccess: (data: any) => {
      setAnalysisResult(data);
      queryClient.invalidateQueries({ queryKey: ["scenario-history", selectedPortfolio] });
    },
  });

  // --- Handlers ---

  function handleAnalyze() {
    if (!selectedPortfolio || !selectedSecurityId || !quantity || !price) return;
    analyzeMutation.mutate({
      portfolioId: selectedPortfolio,
      proposedOrder: {
        securityId: selectedSecurityId,
        side,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
      },
    });
  }

  function handleSelectSecurity(sec: SecurityListItem) {
    setSelectedSecurityId(sec.id);
    setSelectedSecurityLabel(`${sec.bloomberg_ticker ?? sec.name ?? `#${sec.id}`}`);
    setSecuritySearch(sec.bloomberg_ticker ?? sec.name ?? `#${sec.id}`);
    setShowSecurityDropdown(false);
  }

  function handleLoadScenario(scenario: ScenarioResult) {
    setSelectedPortfolio(scenario.portfolioId);
    setSelectedSecurityId(scenario.proposedOrder.securityId);
    setSide(scenario.proposedOrder.side);
    setQuantity(String(scenario.proposedOrder.quantity));
    setPrice(String(scenario.proposedOrder.price));
    setAnalysisResult(scenario);
  }

  const canSubmit =
    !!selectedPortfolio &&
    !!selectedSecurityId &&
    !!quantity &&
    !!price &&
    parseFloat(quantity) > 0 &&
    parseFloat(price) > 0;

  const tradeNotional =
    quantity && price ? parseFloat(quantity) * parseFloat(price) : 0;

  const portfolios = portfoliosQuery.data?.data ?? [];
  const securities = securitiesQuery.data?.data ?? [];
  const history = historyQuery.data?.data ?? [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full">
      {/* ================================================================= */}
      {/* MAIN CONTENT */}
      {/* ================================================================= */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Zap className="h-6 w-6 text-indigo-600" />
              What-If Scenario Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pre-trade impact analysis with ESG scoring and mandate compliance checks
            </p>
          </div>
          {analysisResult && (
            <Badge
              className={
                analysisResult.mandateCompliance.status === "PASS"
                  ? "bg-green-100 text-green-800"
                  : analysisResult.mandateCompliance.status === "WARN"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-red-100 text-red-800"
              }
            >
              {analysisResult.mandateCompliance.status === "PASS" && "Compliant"}
              {analysisResult.mandateCompliance.status === "WARN" && "Warning"}
              {analysisResult.mandateCompliance.status === "BREACH" && "Breach"}
            </Badge>
          )}
        </div>

        {/* =============================================================== */}
        {/* ORDER SIMULATION FORM */}
        {/* =============================================================== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Order Simulation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* Portfolio Selector */}
              <div className="lg:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Portfolio
                </Label>
                <Select value={selectedPortfolio} onValueChange={setSelectedPortfolio}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select portfolio..." />
                  </SelectTrigger>
                  <SelectContent>
                    {portfolios.map((p: PortfolioListItem) => (
                      <SelectItem key={p.portfolio_id} value={p.portfolio_id}>
                        {p.portfolio_id}{" "}
                        {p.aum ? `(${fmtCcy(parseFloat(p.aum))})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Security Search */}
              <div className="lg:col-span-2 relative">
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Security
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search by ticker or name..."
                    value={securitySearch}
                    onChange={(e: any) => {
                      setSecuritySearch(e.target.value);
                      setShowSecurityDropdown(true);
                      if (e.target.value.length < 2) {
                        setSelectedSecurityId(null);
                        setSelectedSecurityLabel("");
                      }
                    }}
                    onFocus={() => setShowSecurityDropdown(true)}
                  />
                </div>
                {showSecurityDropdown && securities.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {securities.map((sec: SecurityListItem) => (
                      <button
                        key={sec.id}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between"
                        onClick={() => handleSelectSecurity(sec)}
                      >
                        <span className="font-medium">
                          {sec.bloomberg_ticker ?? sec.name ?? `#${sec.id}`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {sec.asset_class} | {sec.currency}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedSecurityId && (
                  <p className="text-xs text-green-600 mt-0.5">
                    Selected: {selectedSecurityLabel} (ID: {selectedSecurityId})
                  </p>
                )}
              </div>

              {/* Side */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Side
                </Label>
                <Select value={side} onValueChange={setSide}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Quantity
                </Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={quantity}
                  onChange={(e: any) => setQuantity(e.target.value)}
                  min={0}
                />
              </div>
            </div>

            {/* Second row: Price + Notional + Button */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Price (PHP)
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={price}
                  onChange={(e: any) => setPrice(e.target.value)}
                  min={0}
                  step={0.01}
                />
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Notional Value
                </Label>
                <div className="h-9 flex items-center px-3 bg-gray-50 border rounded-md text-sm font-medium">
                  {tradeNotional > 0 ? fmtCcy(tradeNotional) : "--"}
                </div>
              </div>

              <div className="md:col-span-2 flex items-end">
                <Button
                  className="w-full"
                  onClick={handleAnalyze}
                  disabled={!canSubmit || analyzeMutation.isPending}
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Analyze Impact
                    </>
                  )}
                </Button>
              </div>
            </div>

            {analyzeMutation.isError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {(analyzeMutation.error as any)?.message ?? "Analysis failed. Please try again."}
              </div>
            )}
          </CardContent>
        </Card>

        {/* =============================================================== */}
        {/* MAIN TABS: Impact | ESG */}
        {/* =============================================================== */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="impact" className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Impact Analysis
            </TabsTrigger>
            <TabsTrigger value="esg" className="flex items-center gap-1">
              <Leaf className="h-3.5 w-3.5" />
              ESG Scoring
            </TabsTrigger>
          </TabsList>

          {/* ============================================================= */}
          {/* IMPACT TAB */}
          {/* ============================================================= */}
          <TabsContent value="impact" className="space-y-6 mt-4">
            {!analysisResult ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Zap className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">No Analysis Yet</p>
                  <p className="text-sm mt-1">
                    Configure a proposed order above and click "Analyze Impact" to see
                    the what-if simulation results.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Row 1: Allocation Comparison */}
                <AllocationComparisonPanel result={analysisResult} />

                {/* Row 2: Mandate + Concentration */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <MandateCompliancePanel result={analysisResult} />
                  <ConcentrationImpactPanel result={analysisResult} />
                </div>

                {/* Row 3: Sector Exposure */}
                <SectorExposurePanel result={analysisResult} />

                {/* Row 4: Performance + Tax */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <PerformanceEstimatePanel result={analysisResult} />
                  <TaxImpactPanel result={analysisResult} />
                </div>
              </>
            )}
          </TabsContent>

          {/* ============================================================= */}
          {/* ESG TAB */}
          {/* ============================================================= */}
          <TabsContent value="esg" className="space-y-6 mt-4">
            {!selectedPortfolio ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Leaf className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">Select a Portfolio</p>
                  <p className="text-sm mt-1">
                    Choose a portfolio above to view its ESG scores and screening results.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* ESG Sub-tabs */}
                <Tabs value={esgTab} onValueChange={setEsgTab}>
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="breakdown">Holdings Breakdown</TabsTrigger>
                    <TabsTrigger value="screening">Exclusion Screening</TabsTrigger>
                  </TabsList>

                  {/* ESG Overview */}
                  <TabsContent value="overview" className="mt-4 space-y-6">
                    <ESGOverviewPanel esg={esgQuery.data ?? null} isLoading={esgQuery.isLoading} />
                  </TabsContent>

                  {/* ESG Breakdown */}
                  <TabsContent value="breakdown" className="mt-4 space-y-6">
                    <ESGBreakdownPanel
                      breakdown={esgBreakdownQuery.data ?? null}
                      isLoading={esgBreakdownQuery.isLoading}
                    />
                  </TabsContent>

                  {/* ESG Screening */}
                  <TabsContent value="screening" className="mt-4 space-y-6">
                    <ESGScreeningPanel
                      screening={esgScreeningQuery.data ?? null}
                      isLoading={esgScreeningQuery.isLoading}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ================================================================= */}
      {/* HISTORY SIDEBAR */}
      {/* ================================================================= */}
      <div className="w-80 border-l bg-gray-50/50 overflow-y-auto hidden xl:block">
        <div className="p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4" />
            Recent Simulations
          </h2>

          {!selectedPortfolio ? (
            <p className="text-xs text-muted-foreground">
              Select a portfolio to see simulation history.
            </p>
          ) : historyQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i: number) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No simulations yet for this portfolio. Run an analysis to see results here.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((scenario: ScenarioResult) => (
                <button
                  key={scenario.id}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-colors ${
                    analysisResult?.id === scenario.id
                      ? "bg-indigo-50 border-indigo-300"
                      : "bg-white hover:bg-gray-100 border-gray-200"
                  }`}
                  onClick={() => handleLoadScenario(scenario)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge
                      variant="outline"
                      className={
                        scenario.proposedOrder.side === "BUY"
                          ? "text-green-700 border-green-300"
                          : "text-red-700 border-red-300"
                      }
                    >
                      {scenario.proposedOrder.side}
                    </Badge>
                    <span className="text-muted-foreground">
                      {fmtDate(scenario.timestamp)}
                    </span>
                  </div>
                  <div className="font-medium">
                    Security #{scenario.proposedOrder.securityId}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {fmtNum(scenario.proposedOrder.quantity)} @{" "}
                    {fmtCcy(scenario.proposedOrder.price)}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <ComplianceBadgeSmall status={scenario.mandateCompliance.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-Components
// =============================================================================

// --- Compliance badge (small) ------------------------------------------------

function ComplianceBadgeSmall({ status }: { status: "PASS" | "WARN" | "BREACH" }) {
  const config = COMPLIANCE_BADGE[status] ?? COMPLIANCE_BADGE.PASS;
  const Icon = config.icon;
  return (
    <Badge className={`text-[10px] ${config.cls}`}>
      <Icon className="h-3 w-3 mr-0.5" />
      {status}
    </Badge>
  );
}

// --- Allocation Comparison ---------------------------------------------------

function AllocationComparisonPanel({ result }: { result: ScenarioResult }) {
  const allClasses = useMemo(() => {
    const set = new Set<string>();
    result.currentAllocation.forEach((a: AllocationEntry) => set.add(a.assetClass));
    result.postTradeAllocation.forEach((a: AllocationEntry) => set.add(a.assetClass));
    return Array.from(set);
  }, [result]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PieChart className="h-4 w-4" />
          Allocation Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Current */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
              Current Allocation
            </h3>
            <div className="space-y-2">
              {result.currentAllocation.map((a: AllocationEntry) => (
                <div key={a.assetClass} className="flex items-center gap-3">
                  <div className="w-28 text-xs font-medium truncate">{a.assetClass}</div>
                  <div className="flex-1">
                    <div className="h-5 bg-gray-100 rounded overflow-hidden relative">
                      <div
                        className={`h-full ${getAllocColor(a.assetClass)} rounded opacity-70 transition-all`}
                        style={{ width: `${Math.min(a.weight, 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
                        {fmtPct(a.weight)}
                      </span>
                    </div>
                  </div>
                  <div className="w-24 text-right text-xs text-muted-foreground">
                    {fmtCcy(a.marketValue)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Post-Trade */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
              Post-Trade Allocation
            </h3>
            <div className="space-y-2">
              {result.postTradeAllocation.map((a: AllocationEntry) => {
                const current = result.currentAllocation.find(
                  (c: AllocationEntry) => c.assetClass === a.assetClass,
                );
                const delta = a.weight - (current?.weight ?? 0);
                return (
                  <div key={a.assetClass} className="flex items-center gap-3">
                    <div className="w-28 text-xs font-medium truncate">{a.assetClass}</div>
                    <div className="flex-1">
                      <div className="h-5 bg-gray-100 rounded overflow-hidden relative">
                        <div
                          className={`h-full ${getAllocColor(a.assetClass)} rounded transition-all`}
                          style={{ width: `${Math.min(a.weight, 100)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
                          {fmtPct(a.weight)}
                        </span>
                      </div>
                    </div>
                    <div className="w-24 text-right text-xs">
                      {delta > 0 ? (
                        <span className="text-green-600 flex items-center justify-end gap-0.5">
                          <ArrowUp className="h-3 w-3" />+{fmtPct(delta)}
                        </span>
                      ) : delta < 0 ? (
                        <span className="text-red-600 flex items-center justify-end gap-0.5">
                          <ArrowDown className="h-3 w-3" />{fmtPct(delta)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t flex flex-wrap gap-3">
          {allClasses.map((cls: string) => (
            <div key={cls} className="flex items-center gap-1 text-[10px]">
              <span className={`w-2.5 h-2.5 rounded-sm ${getAllocColor(cls)}`} />
              {cls}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Mandate Compliance Panel ------------------------------------------------

function MandateCompliancePanel({ result }: { result: ScenarioResult }) {
  const { mandateCompliance } = result;
  const config = COMPLIANCE_BADGE[mandateCompliance.status] ?? COMPLIANCE_BADGE.PASS;
  const Icon = config.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Mandate Compliance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`p-3 rounded-full ${
              mandateCompliance.status === "PASS"
                ? "bg-green-100"
                : mandateCompliance.status === "WARN"
                ? "bg-yellow-100"
                : "bg-red-100"
            }`}
          >
            <Icon
              className={`h-6 w-6 ${
                mandateCompliance.status === "PASS"
                  ? "text-green-600"
                  : mandateCompliance.status === "WARN"
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            />
          </div>
          <div>
            <div className="font-semibold text-lg">
              {mandateCompliance.status === "PASS" && "All Clear"}
              {mandateCompliance.status === "WARN" && "Warning"}
              {mandateCompliance.status === "BREACH" && "Mandate Breach"}
            </div>
            <p className="text-xs text-muted-foreground">
              {mandateCompliance.details.length} check{mandateCompliance.details.length !== 1 ? "s" : ""} reported
            </p>
          </div>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {mandateCompliance.details.map((detail: string, idx: number) => (
            <div
              key={idx}
              className={`text-xs p-2 rounded border ${
                detail.includes("exceed") || detail.includes("restricted")
                  ? "bg-red-50 border-red-200 text-red-700"
                  : detail.includes("approaching") || detail.includes("below")
                  ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                  : "bg-green-50 border-green-200 text-green-700"
              }`}
            >
              {detail}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Concentration Impact Panel -----------------------------------------------

function ConcentrationImpactPanel({ result }: { result: ScenarioResult }) {
  const { concentrationImpact } = result;
  const postPct = Math.min(concentrationImpact.postTradeConcentration, 100);
  const limitPct = Math.min(concentrationImpact.limit, 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          Concentration Impact
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Gauge visualization */}
        <div className="relative mb-6">
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden relative">
            {/* Limit line */}
            <div
              className="absolute top-0 h-full w-0.5 bg-red-500 z-10"
              style={{ left: `${limitPct}%` }}
            />
            {/* Current bar */}
            <div
              className="h-full bg-blue-300 absolute top-0 left-0"
              style={{ width: `${Math.min(concentrationImpact.currentConcentration, 100)}%` }}
            />
            {/* Post-trade bar (overlaid) */}
            <div
              className={`h-full absolute top-0 left-0 transition-all ${
                concentrationImpact.status === "BREACH"
                  ? "bg-red-500"
                  : concentrationImpact.status === "WARNING"
                  ? "bg-yellow-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${postPct}%`, opacity: 0.7 }}
            />
          </div>
          {/* Limit label */}
          <div
            className="absolute -top-5 text-[10px] text-red-600 font-medium"
            style={{ left: `${limitPct}%`, transform: "translateX(-50%)" }}
          >
            Limit {concentrationImpact.limit}%
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-muted-foreground">Current</div>
            <div className="text-lg font-bold text-blue-600">
              {fmtPct(concentrationImpact.currentConcentration)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Post-Trade</div>
            <div
              className={`text-lg font-bold ${
                concentrationImpact.status === "BREACH"
                  ? "text-red-600"
                  : concentrationImpact.status === "WARNING"
                  ? "text-yellow-600"
                  : "text-green-600"
              }`}
            >
              {fmtPct(concentrationImpact.postTradeConcentration)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Limit</div>
            <div className="text-lg font-bold text-gray-700">
              {fmtPct(concentrationImpact.limit)}
            </div>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Badge
            className={
              concentrationImpact.status === "BREACH"
                ? "bg-red-100 text-red-800"
                : concentrationImpact.status === "WARNING"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-green-100 text-green-800"
            }
          >
            {concentrationImpact.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Sector Exposure Panel ---------------------------------------------------

function SectorExposurePanel({ result }: { result: ScenarioResult }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Sector Exposure Changes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sector</TableHead>
              <TableHead className="text-right">Current Weight</TableHead>
              <TableHead className="text-center">Direction</TableHead>
              <TableHead className="text-right">Post-Trade Weight</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.sectorExposureChange.map((sec: SectorExposureChange) => {
              const change = sec.postTradeWeight - sec.currentWeight;
              return (
                <TableRow key={sec.sector}>
                  <TableCell className="font-medium text-sm">{sec.sector}</TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtPct(sec.currentWeight)}
                  </TableCell>
                  <TableCell className="text-center">
                    {change > 0.01 ? (
                      <ArrowUp className="h-4 w-4 text-green-600 mx-auto" />
                    ) : change < -0.01 ? (
                      <ArrowDown className="h-4 w-4 text-red-600 mx-auto" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-gray-400 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtPct(sec.postTradeWeight)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span
                      className={
                        change > 0.01
                          ? "text-green-600"
                          : change < -0.01
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }
                    >
                      {change > 0 ? "+" : ""}
                      {fmtPct(change)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// --- Performance Estimate Panel -----------------------------------------------

function PerformanceEstimatePanel({ result }: { result: ScenarioResult }) {
  const { performanceEstimate } = result;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LineChart className="h-4 w-4" />
          Performance Estimate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <TrendingUp className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <div className="text-xs text-muted-foreground mb-1">Estimated Return Impact</div>
            <div className="text-2xl font-bold text-green-700">
              {performanceEstimate.estimatedReturn > 0 ? "+" : ""}
              {fmtPct(performanceEstimate.estimatedReturn)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Annualized contribution from this trade
            </p>
          </div>

          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <Activity className="h-6 w-6 text-orange-600 mx-auto mb-2" />
            <div className="text-xs text-muted-foreground mb-1">Risk Impact</div>
            <div className="text-2xl font-bold text-orange-700">
              {performanceEstimate.riskImpact > 0 ? "+" : ""}
              {fmtPct(performanceEstimate.riskImpact)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Incremental portfolio volatility
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Risk-Return Assessment</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  performanceEstimate.estimatedReturn > performanceEstimate.riskImpact
                    ? "bg-green-500"
                    : "bg-orange-500"
                }`}
                style={{
                  width: `${
                    performanceEstimate.riskImpact > 0
                      ? Math.min(
                          (performanceEstimate.estimatedReturn /
                            performanceEstimate.riskImpact) *
                            50,
                          100,
                        )
                      : 100
                  }%`,
                }}
              />
            </div>
            <span className="text-xs font-medium">
              {performanceEstimate.riskImpact > 0
                ? `${(performanceEstimate.estimatedReturn / performanceEstimate.riskImpact).toFixed(2)}x`
                : "N/A"}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Return-to-risk ratio (higher is better)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Tax Impact Panel --------------------------------------------------------

function TaxImpactPanel({ result }: { result: ScenarioResult }) {
  const { taxImpact } = result;
  const hasGains = taxImpact.shortTermGains > 0 || taxImpact.longTermGains > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Tax Impact (Philippine Tax)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasGains ? (
          <div className="text-center py-6 text-muted-foreground">
            <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No taxable gains estimated for this trade</p>
            <p className="text-xs mt-1">
              {result.proposedOrder.side === "BUY"
                ? "Buy orders do not trigger capital gains tax"
                : "No realized gains from this position"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Total estimated tax */}
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">
                Estimated Tax Liability
              </div>
              <div className="text-2xl font-bold text-red-700">
                {fmtCcy(taxImpact.estimatedTax)}
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-[10px] text-muted-foreground mb-1">
                  Short-Term Gains (&lt;1yr)
                </div>
                <div className="text-lg font-semibold">
                  {fmtCcy(taxImpact.shortTermGains)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  30% corporate rate
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-[10px] text-muted-foreground mb-1">
                  Long-Term Gains (&gt;1yr)
                </div>
                <div className="text-lg font-semibold">
                  {fmtCcy(taxImpact.longTermGains)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  0.6% STT / 20% interest
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// ESG Sub-Panels
// =============================================================================

// --- ESG Overview Panel ------------------------------------------------------

function ESGOverviewPanel({
  esg,
  isLoading,
}: {
  esg: PortfolioESG | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i: number) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (!esg) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No ESG data available for this portfolio.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Overall Score Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Overall */}
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-2 font-medium">
                Overall ESG Score
              </div>
              <div
                className={`text-5xl font-bold ${esgScoreColor(esg.overall)}`}
              >
                {esg.overall}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {esgScoreLabel(esg.overall)}
              </div>
              <div className="mt-2">
                <Progress
                  value={esg.overall}
                  className="h-2"
                />
              </div>
            </div>

            {/* Environmental */}
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center justify-center gap-1">
                <Leaf className="h-3 w-3 text-green-600" />
                Environmental
              </div>
              <div className={`text-3xl font-bold ${esgScoreColor(esg.environmental)}`}>
                {esg.environmental}
              </div>
              <div className="mt-2">
                <Progress value={esg.environmental} className="h-2" />
              </div>
            </div>

            {/* Social */}
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center justify-center gap-1">
                <Users className="h-3 w-3 text-blue-600" />
                Social
              </div>
              <div className={`text-3xl font-bold ${esgScoreColor(esg.social)}`}>
                {esg.social}
              </div>
              <div className="mt-2">
                <Progress value={esg.social} className="h-2" />
              </div>
            </div>

            {/* Governance */}
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center justify-center gap-1">
                <Scale className="h-3 w-3 text-purple-600" />
                Governance
              </div>
              <div className={`text-3xl font-bold ${esgScoreColor(esg.governance)}`}>
                {esg.governance}
              </div>
              <div className="mt-2">
                <Progress value={esg.governance} className="h-2" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Flame className="h-5 w-5 text-orange-500 mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Carbon Intensity</div>
            <div className="text-xl font-bold">{fmtNum(esg.carbonIntensity)}</div>
            <div className="text-[10px] text-muted-foreground">tCO2e / $M revenue</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Controversy Score</div>
            <div className="text-xl font-bold">{esg.averageControversyScore}/10</div>
            <div className="text-[10px] text-muted-foreground">Portfolio average</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <BarChart3 className="h-5 w-5 text-indigo-500 mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Positions Scored</div>
            <div className="text-xl font-bold">
              {esg.scoredPositions}/{esg.totalPositions}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {esg.totalPositions > 0
                ? fmtPct((esg.scoredPositions / esg.totalPositions) * 100)
                : "0%"}{" "}
              coverage
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <DollarSign className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Total Market Value</div>
            <div className="text-xl font-bold">{fmtCcy(esg.totalMarketValue)}</div>
            <div className="text-[10px] text-muted-foreground">Scored AUM</div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// --- ESG Breakdown Panel -----------------------------------------------------

function ESGBreakdownPanel({
  breakdown,
  isLoading,
}: {
  breakdown: ESGBreakdown | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (!breakdown) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No ESG breakdown data available.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Component Scores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Environmental components */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <Leaf className="h-3.5 w-3.5 text-green-600" />
              Environmental ({breakdown.aggregated.environmental})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {breakdown.environmentalComponents.map(
                (comp: { label: string; score: number }) => (
                  <div key={comp.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{comp.label}</span>
                      <span className={`font-medium ${esgScoreColor(comp.score)}`}>
                        {comp.score}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${esgScoreBg(comp.score)}`}
                        style={{ width: `${comp.score}%` }}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>

        {/* Social components */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-blue-600" />
              Social ({breakdown.aggregated.social})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {breakdown.socialComponents.map(
                (comp: { label: string; score: number }) => (
                  <div key={comp.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{comp.label}</span>
                      <span className={`font-medium ${esgScoreColor(comp.score)}`}>
                        {comp.score}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${esgScoreBg(comp.score)}`}
                        style={{ width: `${comp.score}%` }}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>

        {/* Governance components */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <Scale className="h-3.5 w-3.5 text-purple-600" />
              Governance ({breakdown.aggregated.governance})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {breakdown.governanceComponents.map(
                (comp: { label: string; score: number }) => (
                  <div key={comp.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{comp.label}</span>
                      <span className={`font-medium ${esgScoreColor(comp.score)}`}>
                        {comp.score}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${esgScoreBg(comp.score)}`}
                        style={{ width: `${comp.score}%` }}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Holdings Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Holdings ESG Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Security</TableHead>
                  <TableHead>Asset Class</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Overall</TableHead>
                  <TableHead className="text-right">E</TableHead>
                  <TableHead className="text-right">S</TableHead>
                  <TableHead className="text-right">G</TableHead>
                  <TableHead className="text-right">Carbon</TableHead>
                  <TableHead className="text-right">Controversy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.holdings.map((h: ESGBreakdownEntry) => (
                  <TableRow key={h.securityId}>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">
                      {h.securityName}
                    </TableCell>
                    <TableCell className="text-xs">{h.assetClass}</TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtPct(h.weight)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-semibold text-sm ${esgScoreColor(h.overall)}`}>
                        {h.overall}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className={esgScoreColor(h.environmental)}>
                        {h.environmental}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className={esgScoreColor(h.social)}>{h.social}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className={esgScoreColor(h.governance)}>
                        {h.governance}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtNum(h.carbonIntensity)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm">{h.controversyScore}</span>
                        {h.controversyFlag && (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Summary footer */}
          <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {breakdown.holdings.length} holdings analyzed
            </span>
            <span>
              {breakdown.aggregated.highControversyCount > 0 && (
                <Badge className="bg-red-100 text-red-800 text-[10px]">
                  {breakdown.aggregated.highControversyCount} high controversy
                </Badge>
              )}
            </span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// --- ESG Screening Panel -----------------------------------------------------

function ESGScreeningPanel({
  screening,
  isLoading,
}: {
  screening: ESGScreeningResult | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (!screening) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No screening data available.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-muted-foreground">Total Positions</div>
            <div className="text-2xl font-bold">{screening.totalPositions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-muted-foreground">Flagged Holdings</div>
            <div
              className={`text-2xl font-bold ${
                screening.flaggedCount > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {screening.flaggedCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-muted-foreground">Flagged Weight</div>
            <div
              className={`text-2xl font-bold ${
                screening.flaggedWeight > 5 ? "text-red-600" : "text-yellow-600"
              }`}
            >
              {fmtPct(screening.flaggedWeight)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-muted-foreground">Flagged MV</div>
            <div className="text-2xl font-bold text-gray-700">
              {fmtCcy(screening.flaggedMarketValue)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Banner */}
      {screening.flaggedCount === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ShieldCheck className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-green-700">
              No Exclusion Flags
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              All portfolio holdings pass the ESG exclusion screening criteria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              Flagged Holdings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Security</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Market Value</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {screening.flags.map((flag: ScreeningFlag, idx: number) => (
                  <TableRow key={`${flag.securityId}-${idx}`}>
                    <TableCell className="font-medium text-sm max-w-[180px] truncate">
                      {flag.securityName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {flag.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs ${SEVERITY_BADGE[flag.severity] ?? ""}`}
                      >
                        {flag.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtPct(flag.weight)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCcy(flag.marketValue)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">
                      {flag.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Category Summary */}
      {screening.flaggedCount > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Exclusion Category Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(() => {
                const categoryMap = new Map<string, { count: number; weight: number }>();
                screening.flags.forEach((f: ScreeningFlag) => {
                  const existing = categoryMap.get(f.category) ?? { count: 0, weight: 0 };
                  existing.count += 1;
                  existing.weight += f.weight;
                  categoryMap.set(f.category, existing);
                });

                return Array.from(categoryMap.entries()).map(
                  ([category, data]: [string, { count: number; weight: number }]) => (
                    <div
                      key={category}
                      className="p-3 bg-gray-50 rounded-lg text-center"
                    >
                      <div className="text-xs font-medium">{category}</div>
                      <div className="text-lg font-bold text-red-600">
                        {data.count}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtPct(data.weight)} of portfolio
                      </div>
                    </div>
                  ),
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
