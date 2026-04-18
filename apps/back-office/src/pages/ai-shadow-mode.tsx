/**
 * AI Suitability -- Shadow Mode Dashboard (Phase 6C)
 *
 * Provides a comprehensive view of the AI-based suitability engine running
 * in shadow mode alongside the traditional questionnaire-based assessment.
 * Supports BSP Circular 1108 compliance validation for AI model governance.
 *
 * Tabs:
 *   1. Shadow Results — agreement/divergence overview between AI and questionnaire
 *   2. Predict — manual prediction form with feature inputs
 *   3. History — paginated prediction history with client filter
 *
 * Includes model metrics cards, prediction detail dialog, and explanation panel.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  Brain, ShieldCheck, AlertTriangle, TrendingUp,
  Activity, Search, RefreshCw, Eye, BarChart3,
  CheckCircle, XCircle, ChevronLeft, ChevronRight,
  Sparkles, Target, Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalPredictions: number;
  agreements: number;
  divergences: number;
  lastTrainedAt: string;
}

interface ShadowResult {
  clientId: string;
  result: {
    questionnaireResult: string;
    aiPrediction: string;
    agreement: boolean;
    divergenceReason: string | null;
    recommendation: string;
  };
  timestamp: string;
}

interface FeatureContribution {
  feature: string;
  weight: number;
  contribution: string;
}

interface Prediction {
  predictionId: string;
  clientId: string | null;
  predictedRiskLevel: string;
  confidence: number;
  features: FeatureContribution[];
  modelVersion: string;
  createdAt: string;
  inputFeatures: {
    age: number;
    income: number;
    netWorth: number;
    investmentExperience: string;
    employmentStatus: string;
    dependents: number;
    investmentHorizon: string;
    existingPortfolioValue: number;
  };
}

interface PredictionExplanation {
  explanation: string;
  topFactors: { factor: string; impact: string; direction: string }[];
  comparisons: { group: string; riskLevel: string; similarity: number }[];
}

interface PredictionHistory {
  data: Prediction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<string, string> = {
  CONSERVATIVE: "bg-blue-100 text-blue-800 border-blue-200",
  MODERATE: "bg-green-100 text-green-800 border-green-200",
  AGGRESSIVE: "bg-orange-100 text-orange-800 border-orange-200",
  SPECULATIVE: "bg-red-100 text-red-800 border-red-200",
};

const EXPERIENCE_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "EXPERT", label: "Expert" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "UNEMPLOYED", label: "Unemployed" },
  { value: "STUDENT", label: "Student" },
  { value: "PART_TIME", label: "Part-Time" },
  { value: "SELF_EMPLOYED", label: "Self-Employed" },
  { value: "EMPLOYED", label: "Employed" },
  { value: "EXECUTIVE", label: "Executive" },
  { value: "RETIRED", label: "Retired" },
  { value: "BUSINESS_OWNER", label: "Business Owner" },
];

const HORIZON_OPTIONS = [
  { value: "SHORT", label: "Short (< 3 years)" },
  { value: "MEDIUM", label: "Medium (3-7 years)" },
  { value: "LONG", label: "Long (7-15 years)" },
  { value: "VERY_LONG", label: "Very Long (15+ years)" },
];

const IMPACT_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW: "bg-green-100 text-green-700 border-green-200",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d ?? "-";
  }
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  icon: Icon,
  accent,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_: any, i: number) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_: any, j: number) => (
            <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-center py-8 text-muted-foreground">
        {msg}
      </TableCell>
    </TableRow>
  );
}

function FeatureWeightBar({ feature, weight }: { feature: string; weight: number }) {
  const pct = Math.round(weight * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 font-medium">{feature}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AiShadowModePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("shadow");
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyClientFilter, setHistoryClientFilter] = useState("");

  // Predict form state
  const [predictForm, setPredictForm] = useState({
    age: "35",
    income: "1200000",
    netWorth: "5000000",
    investmentExperience: "INTERMEDIATE",
    employmentStatus: "EMPLOYED",
    dependents: "1",
    investmentHorizon: "MEDIUM",
    existingPortfolioValue: "2000000",
    clientId: "",
  });
  const [predictionResult, setPredictionResult] = useState<Prediction | null>(null);
  const [explanationResult, setExplanationResult] = useState<PredictionExplanation | null>(null);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const metricsQuery = useQuery<ModelMetrics>({
    queryKey: ["/api/v1/ai/suitability/metrics"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/ai/suitability/metrics")).then((r: any) => r.json()),
    refetchInterval: 30000,
  });

  const shadowQuery = useQuery<{ data: ShadowResult[]; total: number }>({
    queryKey: ["/api/v1/ai/suitability/shadow-results"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/ai/suitability/shadow-results")).then((r: any) => r.json()),
  });

  const historyQuery = useQuery<PredictionHistory>({
    queryKey: ["/api/v1/ai/suitability/history", historyPage, historyClientFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(historyPage), pageSize: "15" });
      if (historyClientFilter) params.set("clientId", historyClientFilter);
      return apiRequest("GET", apiUrl(`/api/v1/ai/suitability/history?${params}`)).then((r: any) => r.json());
    },
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const predictMutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      apiRequest("POST", apiUrl("/api/v1/ai/suitability/predict"), body).then((r: any) => r.json()),
    onSuccess: (data: any) => {
      setPredictionResult(data);
      // Fetch explanation
      apiRequest("GET", apiUrl(`/api/v1/ai/suitability/explain/${data.predictionId}`))
        .then((r: any) => r.json())
        .then((exp: any) => setExplanationResult(exp));
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/suitability/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/suitability/metrics"] });
    },
  });

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const metrics = metricsQuery.data;
  const shadowData = shadowQuery.data?.data ?? [];
  const agreementCount = shadowData.filter((s: any) => s.result.agreement).length;
  const divergenceCount = shadowData.filter((s: any) => !s.result.agreement).length;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handlePredict() {
    const body = {
      age: Number(predictForm.age),
      income: Number(predictForm.income),
      netWorth: Number(predictForm.netWorth),
      investmentExperience: predictForm.investmentExperience,
      employmentStatus: predictForm.employmentStatus,
      dependents: Number(predictForm.dependents),
      investmentHorizon: predictForm.investmentHorizon,
      existingPortfolioValue: Number(predictForm.existingPortfolioValue),
      clientId: predictForm.clientId || undefined,
    };
    predictMutation.mutate(body);
  }

  function handleOpenDetail(prediction: Prediction) {
    setSelectedPrediction(prediction);
    setDetailDialogOpen(true);
  }

  function handleRefreshAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/suitability/metrics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/suitability/shadow-results"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/suitability/history"] });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-indigo-600" />
            AI Suitability — Shadow Mode
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            BSP Circular 1108 compliant AI model validation. The AI suitability engine runs in parallel
            with the traditional questionnaire-based assessment, comparing predictions to identify
            divergences and validate model accuracy before production deployment.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Separator />

      {/* Model Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Model Accuracy"
          value={metrics ? formatPct(metrics.accuracy) : "-"}
          icon={Target}
          accent="bg-indigo-600"
          subtitle={metrics ? `v${metrics.lastTrainedAt.slice(0, 10)}` : undefined}
        />
        <MetricCard
          title="Precision"
          value={metrics ? formatPct(metrics.precision) : "-"}
          icon={ShieldCheck}
          accent="bg-green-600"
          subtitle="Positive predictive value"
        />
        <MetricCard
          title="Recall"
          value={metrics ? formatPct(metrics.recall) : "-"}
          icon={Activity}
          accent="bg-amber-600"
          subtitle="Sensitivity / True positive rate"
        />
        <MetricCard
          title="F1 Score"
          value={metrics ? formatPct(metrics.f1Score) : "-"}
          icon={BarChart3}
          accent="bg-purple-600"
          subtitle="Harmonic mean of precision & recall"
        />
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Predictions"
          value={metrics?.totalPredictions ?? "-"}
          icon={Sparkles}
          accent="bg-sky-600"
        />
        <MetricCard
          title="Agreements"
          value={metrics?.agreements ?? "-"}
          icon={CheckCircle}
          accent="bg-emerald-600"
          subtitle="AI matches questionnaire"
        />
        <MetricCard
          title="Divergences"
          value={metrics?.divergences ?? "-"}
          icon={AlertTriangle}
          accent="bg-red-600"
          subtitle="Requires manual review"
        />
      </div>

      {/* Main Tab Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="shadow">Shadow Results</TabsTrigger>
          <TabsTrigger value="predict">Run Prediction</TabsTrigger>
          <TabsTrigger value="history">Prediction History</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------
            Tab 1: Shadow Mode Results
        --------------------------------------------------------------- */}
        <TabsContent value="shadow" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Shadow Mode Comparison — AI vs. Questionnaire
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-4 text-sm">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle className="h-3 w-3 mr-1" /> {agreementCount} Agreements
                </Badge>
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <XCircle className="h-3 w-3 mr-1" /> {divergenceCount} Divergences
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Client ID</TableHead>
                      <TableHead>Questionnaire</TableHead>
                      <TableHead>AI Prediction</TableHead>
                      <TableHead>Agreement</TableHead>
                      <TableHead className="w-80">Divergence Reason</TableHead>
                      <TableHead className="w-36">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shadowQuery.isLoading && <SkeletonRows cols={6} />}
                    {!shadowQuery.isLoading && shadowData.length === 0 && (
                      <EmptyRow cols={6} msg="No shadow mode results yet. Run shadow comparisons to populate." />
                    )}
                    {shadowData.map((sr: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-muted/50 cursor-pointer">
                        <TableCell className="font-mono text-xs">{sr.clientId}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={RISK_COLORS[sr.result.questionnaireResult] ?? "bg-gray-100"}>
                            {sr.result.questionnaireResult}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={RISK_COLORS[sr.result.aiPrediction] ?? "bg-gray-100"}>
                            {sr.result.aiPrediction}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {sr.result.agreement ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle className="h-3 w-3 mr-1" /> Match
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              <XCircle className="h-3 w-3 mr-1" /> Diverged
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {sr.result.divergenceReason ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(sr.timestamp)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Recommendation Section */}
          {divergenceCount > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-900">Divergence Alert</p>
                    <p className="text-sm text-amber-800 mt-1">
                      {divergenceCount} client{divergenceCount > 1 ? "s" : ""} show disagreement between the AI model
                      and the questionnaire-based assessment. Per BSP 1108 Section 4.2.3, these cases require
                      manual review by a licensed relationship manager before the AI prediction can be applied.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------------------------------------------------------
            Tab 2: Run Prediction
        --------------------------------------------------------------- */}
        <TabsContent value="predict" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Prediction Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Risk Profile Prediction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pred-client">Client ID (optional)</Label>
                    <Input
                      id="pred-client"
                      value={predictForm.clientId}
                      onChange={(e: any) => setPredictForm({ ...predictForm, clientId: e.target.value })}
                      placeholder="CLT-XXX"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pred-age">Age</Label>
                    <Input
                      id="pred-age"
                      type="number"
                      value={predictForm.age}
                      onChange={(e: any) => setPredictForm({ ...predictForm, age: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pred-income">Annual Income (PHP)</Label>
                    <Input
                      id="pred-income"
                      type="number"
                      value={predictForm.income}
                      onChange={(e: any) => setPredictForm({ ...predictForm, income: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pred-nw">Net Worth (PHP)</Label>
                    <Input
                      id="pred-nw"
                      type="number"
                      value={predictForm.netWorth}
                      onChange={(e: any) => setPredictForm({ ...predictForm, netWorth: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Investment Experience</Label>
                    <Select
                      value={predictForm.investmentExperience}
                      onValueChange={(v: any) => setPredictForm({ ...predictForm, investmentExperience: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPERIENCE_OPTIONS.map((o: any) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employment Status</Label>
                    <Select
                      value={predictForm.employmentStatus}
                      onValueChange={(v: any) => setPredictForm({ ...predictForm, employmentStatus: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_OPTIONS.map((o: any) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pred-dep">Dependents</Label>
                    <Input
                      id="pred-dep"
                      type="number"
                      value={predictForm.dependents}
                      onChange={(e: any) => setPredictForm({ ...predictForm, dependents: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Investment Horizon</Label>
                    <Select
                      value={predictForm.investmentHorizon}
                      onValueChange={(v: any) => setPredictForm({ ...predictForm, investmentHorizon: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HORIZON_OPTIONS.map((o: any) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="pred-portfolio">Existing Portfolio Value (PHP)</Label>
                    <Input
                      id="pred-portfolio"
                      type="number"
                      value={predictForm.existingPortfolioValue}
                      onChange={(e: any) => setPredictForm({ ...predictForm, existingPortfolioValue: e.target.value })}
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handlePredict}
                  disabled={predictMutation.isPending}
                >
                  {predictMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Predicting...</>
                  ) : (
                    <><Brain className="h-4 w-4 mr-2" /> Run AI Prediction</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Prediction Result */}
            <div className="space-y-4">
              {predictionResult && (
                <Card className="border-indigo-200">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-indigo-600" />
                      Prediction Result
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Predicted Risk Level</p>
                        <Badge
                          variant="outline"
                          className={`text-lg px-3 py-1 mt-1 ${RISK_COLORS[predictionResult.predictedRiskLevel] ?? "bg-gray-100"}`}
                        >
                          {predictionResult.predictedRiskLevel}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Confidence</p>
                        <p className="text-2xl font-bold text-indigo-700">
                          {formatPct(predictionResult.confidence)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Model</p>
                        <p className="text-sm font-mono">{predictionResult.modelVersion}</p>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <p className="text-sm font-semibold mb-2">Feature Contributions</p>
                      <div className="space-y-2">
                        {predictionResult.features.map((f: any, i: number) => (
                          <FeatureWeightBar key={i} feature={f.feature} weight={f.weight} />
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <p className="text-sm font-semibold mb-1">Feature Details</p>
                      <div className="space-y-1.5">
                        {predictionResult.features.map((f: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <Info className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">
                              <span className="font-medium text-foreground">{f.feature}:</span> {f.contribution}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {explanationResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      AI Explanation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {explanationResult.explanation}
                    </p>

                    <div>
                      <p className="text-sm font-semibold mb-2">Top Factors</p>
                      <div className="flex flex-wrap gap-2">
                        {explanationResult.topFactors.map((tf: any, i: number) => (
                          <Badge key={i} variant="outline" className={IMPACT_COLORS[tf.impact] ?? "bg-gray-100"}>
                            {tf.factor} ({tf.impact})
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold mb-2">Peer Group Comparisons</p>
                      <div className="space-y-1.5">
                        {explanationResult.comparisons.slice(0, 4).map((c: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span>{c.group}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={RISK_COLORS[c.riskLevel] ?? "bg-gray-100"}>
                                {c.riskLevel}
                              </Badge>
                              <span className="text-muted-foreground w-14 text-right">
                                {formatPct(c.similarity, 0)} match
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!predictionResult && (
                <Card className="border-dashed">
                  <CardContent className="pt-10 pb-10 text-center">
                    <Brain className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">
                      Fill in client features and run the AI prediction to see results here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------
            Tab 3: Prediction History
        --------------------------------------------------------------- */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Prediction History
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8 w-52"
                      placeholder="Filter by Client ID"
                      value={historyClientFilter}
                      onChange={(e: any) => {
                        setHistoryClientFilter(e.target.value);
                        setHistoryPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Prediction ID</TableHead>
                      <TableHead className="w-24">Client</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Key Features</TableHead>
                      <TableHead className="w-36">Created</TableHead>
                      <TableHead className="w-16">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyQuery.isLoading && <SkeletonRows cols={8} />}
                    {!historyQuery.isLoading && (historyQuery.data?.data ?? []).length === 0 && (
                      <EmptyRow cols={8} msg="No predictions found." />
                    )}
                    {(historyQuery.data?.data ?? []).map((pred: any) => (
                      <TableRow key={pred.predictionId} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs truncate max-w-[120px]">
                          {pred.predictionId.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {pred.clientId ?? "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={RISK_COLORS[pred.predictedRiskLevel] ?? "bg-gray-100"}>
                            {pred.predictedRiskLevel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatPct(pred.confidence)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {pred.modelVersion}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          Age: {pred.inputFeatures?.age}, Income: {formatCurrency(pred.inputFeatures?.income ?? 0)}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(pred.createdAt)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetail(pred)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {historyQuery.data && historyQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {historyQuery.data.page} of {historyQuery.data.totalPages}
                    {" "}({historyQuery.data.total} total)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage((p: number) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage >= (historyQuery.data?.totalPages ?? 1)}
                      onClick={() => setHistoryPage((p: number) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------------------------------------------------------------
          Prediction Detail Dialog
      --------------------------------------------------------------- */}
      <PredictionDetailDialog
        prediction={selectedPrediction}
        open={detailDialogOpen}
        onClose={() => {
          setDetailDialogOpen(false);
          setSelectedPrediction(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction Detail Dialog Component
// ---------------------------------------------------------------------------

function PredictionDetailDialog({
  prediction,
  open,
  onClose,
}: {
  prediction: Prediction | null;
  open: boolean;
  onClose: () => void;
}) {
  const explanationQuery = useQuery<PredictionExplanation>({
    queryKey: ["/api/v1/ai/suitability/explain", prediction?.predictionId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/ai/suitability/explain/${prediction!.predictionId}`)).then((r: any) => r.json()),
    enabled: !!prediction?.predictionId && open,
  });

  if (!prediction) return null;

  const explanation = explanationQuery.data;

  return (
    <Dialog open={open} onOpenChange={(v: any) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-600" />
            Prediction Detail
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Risk Level</p>
              <Badge
                variant="outline"
                className={`mt-1 ${RISK_COLORS[prediction.predictedRiskLevel] ?? "bg-gray-100"}`}
              >
                {prediction.predictedRiskLevel}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Confidence</p>
              <p className="text-xl font-bold text-indigo-700 mt-1">
                {formatPct(prediction.confidence)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Client</p>
              <p className="font-mono text-sm mt-1">{prediction.clientId ?? "N/A"}</p>
            </div>
          </div>

          <Separator />

          {/* Input Features */}
          <div>
            <p className="text-sm font-semibold mb-2">Input Features</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between border rounded px-3 py-1.5">
                <span className="text-muted-foreground">Age</span>
                <span className="font-medium">{prediction.inputFeatures?.age}</span>
              </div>
              <div className="flex justify-between border rounded px-3 py-1.5">
                <span className="text-muted-foreground">Income</span>
                <span className="font-medium">{formatCurrency(prediction.inputFeatures?.income ?? 0)}</span>
              </div>
              <div className="flex justify-between border rounded px-3 py-1.5">
                <span className="text-muted-foreground">Net Worth</span>
                <span className="font-medium">{formatCurrency(prediction.inputFeatures?.netWorth ?? 0)}</span>
              </div>
              <div className="flex justify-between border rounded px-3 py-1.5">
                <span className="text-muted-foreground">Experience</span>
                <span className="font-medium">{prediction.inputFeatures?.investmentExperience}</span>
              </div>
              <div className="flex justify-between border rounded px-3 py-1.5">
                <span className="text-muted-foreground">Employment</span>
                <span className="font-medium">{prediction.inputFeatures?.employmentStatus}</span>
              </div>
              <div className="flex justify-between border rounded px-3 py-1.5">
                <span className="text-muted-foreground">Dependents</span>
                <span className="font-medium">{prediction.inputFeatures?.dependents}</span>
              </div>
              <div className="flex justify-between border rounded px-3 py-1.5">
                <span className="text-muted-foreground">Horizon</span>
                <span className="font-medium">{prediction.inputFeatures?.investmentHorizon}</span>
              </div>
              <div className="flex justify-between border rounded px-3 py-1.5">
                <span className="text-muted-foreground">Portfolio Value</span>
                <span className="font-medium">{formatCurrency(prediction.inputFeatures?.existingPortfolioValue ?? 0)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Feature Weights */}
          <div>
            <p className="text-sm font-semibold mb-2">Feature Contributions</p>
            <div className="space-y-2">
              {prediction.features.map((f: any, i: number) => (
                <div key={i} className="space-y-1">
                  <FeatureWeightBar feature={f.feature} weight={f.weight} />
                  <p className="text-xs text-muted-foreground pl-[172px]">{f.contribution}</p>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* AI Explanation */}
          {explanationQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          )}

          {explanation && (
            <>
              <div>
                <p className="text-sm font-semibold mb-2">Model Explanation</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {explanation.explanation}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Top Impact Factors</p>
                <div className="space-y-1.5">
                  {explanation.topFactors.map((tf: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                      <span className="font-medium">{tf.factor}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={IMPACT_COLORS[tf.impact] ?? "bg-gray-100"}>
                          {tf.impact}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {tf.direction.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Peer Group Similarity</p>
                <div className="space-y-1.5">
                  {explanation.comparisons.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>{c.group}</span>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={RISK_COLORS[c.riskLevel] ?? "bg-gray-100"}>
                          {c.riskLevel}
                        </Badge>
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${c.similarity * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {formatPct(c.similarity, 0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted-foreground font-mono">
              ID: {prediction.predictionId.slice(0, 12)}... | Model: {prediction.modelVersion}
            </span>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
