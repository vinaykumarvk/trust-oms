/**
 * Integration Hub — Phase 6A (BRD Screen #14)
 *
 * External system connectors and routing configuration panel.
 * Four tabs:
 *   1. Connectors — Card grid showing connector health, latency, success rate
 *   2. Routing Rules — Table with add/edit/delete for order routing config
 *   3. Activity Log — Auto-refreshing filterable table of integration events
 *   4. Simulation — Order routing simulator with result preview
 *
 * Auto-refreshes connector status every 30 seconds and activity log every 30 seconds.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { useToast } from "@ui/components/ui/toast";

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
import { Label } from "@ui/components/ui/label";
import { Switch } from "@ui/components/ui/switch";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Network,
  RefreshCw,
  Loader2,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Clock,
  Plus,
  Pencil,
  Trash2,
  Play,
  ArrowRight,
  ArrowDownUp,
  Shield,
  PlugZap,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  Send,
  Globe,
  Server,
  Route,
  Timer,
  TrendingUp,
  Eye,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Connector {
  id: string;
  name: string;
  type: "EXCHANGE" | "CUSTODIAN" | "BROKER" | "MARKET_DATA" | "SWIFT" | "REGISTRY";
  protocol: "FIX" | "REST" | "SWIFT" | "SFTP" | "WEBSOCKET" | "AMQP";
  status: "CONNECTED" | "DEGRADED" | "DISCONNECTED";
  success_rate: number;
  avg_latency_ms: number;
  last_checked: string;
  host: string;
  port: number;
  description: string;
  version: string;
  messages_today: number;
  errors_today: number;
}

interface ConnectorMetrics {
  connector_id: string;
  uptime_pct: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  throughput_per_min: number;
  error_rate: number;
  last_error: string | null;
  last_error_time: string | null;
}

interface RoutingRule {
  id: string;
  security_type: string;
  primary_connector_id: string;
  primary_connector_name: string;
  fallback_connector_id: string | null;
  fallback_connector_name: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  connector_id: string;
  connector_name: string;
  event_type: "ORDER_SENT" | "ORDER_ACK" | "EXECUTION" | "REJECTION" | "HEARTBEAT" | "ERROR" | "RECONNECT";
  status: "SUCCESS" | "FAILURE" | "TIMEOUT" | "PENDING";
  latency_ms: number;
  details: string;
  reference_id: string | null;
}

interface SimulationResult {
  primary_connector: string;
  primary_connector_id: string;
  primary_latency_ms: number;
  fallback_connector: string | null;
  fallback_connector_id: string | null;
  fallback_latency_ms: number | null;
  route_reason: string;
  estimated_fill_time_ms: number;
  compliance_check: "PASSED" | "FAILED";
  compliance_notes: string[];
}

interface RoutingRuleForm {
  security_type: string;
  primary_connector_id: string;
  fallback_connector_id: string;
  priority: number;
  is_active: boolean;
}

interface TestConnectionResult {
  connector_id: string;
  status: "SUCCESS" | "FAILURE";
  latency_ms: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 30_000;

const CONNECTOR_STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  CONNECTED: {
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-800 border-green-300",
    label: "Connected",
  },
  DEGRADED: {
    dot: "bg-yellow-500",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    label: "Degraded",
  },
  DISCONNECTED: {
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-800 border-red-300",
    label: "Disconnected",
  },
};

const CONNECTOR_TYPE_COLORS: Record<string, string> = {
  EXCHANGE: "bg-blue-100 text-blue-800",
  CUSTODIAN: "bg-purple-100 text-purple-800",
  BROKER: "bg-indigo-100 text-indigo-800",
  MARKET_DATA: "bg-teal-100 text-teal-800",
  SWIFT: "bg-amber-100 text-amber-800",
  REGISTRY: "bg-pink-100 text-pink-800",
};

const PROTOCOL_COLORS: Record<string, string> = {
  FIX: "bg-cyan-100 text-cyan-800",
  REST: "bg-emerald-100 text-emerald-800",
  SWIFT: "bg-orange-100 text-orange-800",
  SFTP: "bg-muted text-foreground",
  WEBSOCKET: "bg-violet-100 text-violet-800",
  AMQP: "bg-rose-100 text-rose-800",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  ORDER_SENT: "bg-blue-100 text-blue-800",
  ORDER_ACK: "bg-green-100 text-green-800",
  EXECUTION: "bg-emerald-100 text-emerald-800",
  REJECTION: "bg-red-100 text-red-800",
  HEARTBEAT: "bg-muted text-foreground",
  ERROR: "bg-red-100 text-red-800",
  RECONNECT: "bg-yellow-100 text-yellow-800",
};

const LOG_STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800",
  FAILURE: "bg-red-100 text-red-800",
  TIMEOUT: "bg-yellow-100 text-yellow-800",
  PENDING: "bg-muted text-foreground",
};

const SECURITY_TYPES = [
  "Equity",
  "Government Bond",
  "Corporate Bond",
  "UITF",
  "Money Market",
  "Preferred Shares",
  "REITs",
  "Treasury Bill",
  "Time Deposit",
  "Commercial Paper",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatTimestamp(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatLatency(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function latencyColor(ms: number): string {
  if (ms < 100) return "text-green-600";
  if (ms < 500) return "text-yellow-600";
  return "text-red-600";
}

function successRateColor(rate: number): string {
  if (rate >= 0.99) return "text-green-600";
  if (rate >= 0.95) return "text-yellow-600";
  return "text-red-600";
}

// ---------------------------------------------------------------------------
// Sub-components: Connector Cards
// ---------------------------------------------------------------------------

interface ConnectorCardProps {
  connector: Connector;
  isExpanded: boolean;
  onToggle: () => void;
  onTestConnection: (id: string) => void;
  isTesting: boolean;
}

function ConnectorCard({
  connector,
  isExpanded,
  onToggle,
  onTestConnection,
  isTesting,
}: ConnectorCardProps) {
  const statusConfig = CONNECTOR_STATUS_CONFIG[connector.status] ?? CONNECTOR_STATUS_CONFIG.DISCONNECTED;
  const typeColor = CONNECTOR_TYPE_COLORS[connector.type] ?? "bg-muted text-foreground";
  const protocolColor = PROTOCOL_COLORS[connector.protocol] ?? "bg-muted text-foreground";

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              {connector.status === "CONNECTED" ? (
                <Wifi className="h-5 w-5 text-primary" />
              ) : connector.status === "DEGRADED" ? (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">{connector.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connector.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${statusConfig.dot} animate-pulse`} />
            <Badge variant="outline" className={`text-[10px] ${statusConfig.badge}`}>
              {statusConfig.label}
            </Badge>
          </div>
        </div>

        {/* Type and Protocol badges */}
        <div className="flex items-center gap-2 mt-2">
          <Badge className={`text-[10px] ${typeColor}`}>
            {connector.type.replace(/_/g, " ")}
          </Badge>
          <Badge className={`text-[10px] ${protocolColor}`}>
            {connector.protocol}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            v{connector.version}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Success Rate
            </p>
            <p className={`text-lg font-bold tabular-nums ${successRateColor(connector.success_rate)}`}>
              {formatPct(connector.success_rate)}
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Avg Latency
            </p>
            <p className={`text-lg font-bold tabular-nums ${latencyColor(connector.avg_latency_ms)}`}>
              {formatLatency(connector.avg_latency_ms)}
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Msgs Today
            </p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {connector.messages_today.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Last checked */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last checked: {formatTimestamp(connector.last_checked)}
          </span>
          {connector.errors_today > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3" />
              {connector.errors_today} errors today
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onTestConnection(connector.id);
            }}
            disabled={isTesting}
          >
            {isTesting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <PlugZap className="h-3.5 w-3.5 mr-1.5" />
            )}
            Test Connection
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Expanded detail panel */}
        {isExpanded && (
          <ConnectorDetailPanel connectorId={connector.id} connector={connector} />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Connector Detail Panel (expanded)
// ---------------------------------------------------------------------------

function ConnectorDetailPanel({
  connectorId,
  connector,
}: {
  connectorId: string;
  connector: Connector;
}) {
  const metricsQuery = useQuery<ConnectorMetrics>({
    queryKey: ["connector-metrics", connectorId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/integrations/${connectorId}/metrics`)),
    staleTime: 30_000,
  });

  const metrics = metricsQuery.data;

  return (
    <div className="mt-3 pt-3 border-t space-y-3">
      <div className="text-sm font-medium text-foreground">Connection Details</div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between p-2 rounded bg-muted/30">
          <span className="text-muted-foreground">Host</span>
          <span className="font-mono font-medium">{connector.host}:{connector.port}</span>
        </div>
        <div className="flex justify-between p-2 rounded bg-muted/30">
          <span className="text-muted-foreground">Protocol</span>
          <span className="font-medium">{connector.protocol}</span>
        </div>
      </div>

      {metricsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : metrics ? (
        <>
          <div className="text-sm font-medium text-foreground">Performance Metrics</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Uptime</span>
              <span className={`font-bold ${metrics.uptime_pct >= 99.9 ? "text-green-600" : "text-yellow-600"}`}>
                {metrics.uptime_pct.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Error Rate</span>
              <span className={`font-bold ${metrics.error_rate < 0.01 ? "text-green-600" : "text-red-600"}`}>
                {(metrics.error_rate * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">P50 Latency</span>
              <span className="font-mono font-medium">{formatLatency(metrics.p50_latency_ms)}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">P95 Latency</span>
              <span className="font-mono font-medium">{formatLatency(metrics.p95_latency_ms)}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">P99 Latency</span>
              <span className="font-mono font-medium">{formatLatency(metrics.p99_latency_ms)}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Throughput</span>
              <span className="font-medium">{metrics.throughput_per_min.toFixed(1)} msg/min</span>
            </div>
          </div>

          {metrics.last_error && (
            <div className="p-2 rounded bg-red-50 border border-red-200 text-xs">
              <span className="font-medium text-red-800">Last Error: </span>
              <span className="text-red-700">{metrics.last_error}</span>
              {metrics.last_error_time && (
                <span className="text-red-500 ml-2">
                  ({formatTimestamp(metrics.last_error_time)})
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No metrics available</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Connectors Tab
// ---------------------------------------------------------------------------

function ConnectorsTab() {
  const { toast } = useToast();
  const [expandedConnectors, setExpandedConnectors] = useState<Set<string>>(new Set());
  const [testingId, setTestingId] = useState<string | null>(null);

  const connectorsQuery = useQuery<Connector[]>({
    queryKey: ["integrations"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/integrations")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const connectors = connectorsQuery.data?.data ?? [];

  const testMutation = useMutation<TestConnectionResult, Error, string>({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl(`/api/v1/integrations/${id}/test`)),
    onMutate: (id) => setTestingId(id),
    onSuccess: (result) => {
      toast({
        title:
          result.status === "SUCCESS"
            ? "Connection Successful"
            : "Connection Failed",
        description: `${result.message} (${formatLatency(result.latency_ms)})`,
        variant: result.status === "SUCCESS" ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Test Failed",
        description: err.message,
        variant: "destructive",
      });
    },
    onSettled: () => setTestingId(null),
  });

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedConnectors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Summary counts
  const statusCounts = useMemo(() => {
    const counts = { CONNECTED: 0, DEGRADED: 0, DISCONNECTED: 0 };
    for (const c of connectors) {
      if (c.status in counts) {
        counts[c.status as keyof typeof counts] += 1;
      }
    }
    return counts;
  }, [connectors]);

  if (connectorsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-12 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-56 mt-1" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-16 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (connectorsQuery.isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8">
          <div className="text-center">
            <XCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm font-medium text-destructive">
              Failed to load connectors
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {connectorsQuery.error?.message ?? "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => connectorsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Connected</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {statusCounts.CONNECTED}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Degraded</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">
                  {statusCounts.DEGRADED}
                </p>
              </div>
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Disconnected</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {statusCounts.DISCONNECTED}
                </p>
              </div>
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connector cards grid */}
      {connectors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No connectors configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              isExpanded={expandedConnectors.has(connector.id)}
              onToggle={() => handleToggleExpand(connector.id)}
              onTestConnection={(id) => testMutation.mutate(id)}
              isTesting={testingId === connector.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Routing Rules Tab
// ---------------------------------------------------------------------------

const EMPTY_RULE_FORM: RoutingRuleForm = {
  security_type: "",
  primary_connector_id: "",
  fallback_connector_id: "",
  priority: 1,
  is_active: true,
};

function RoutingRulesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RoutingRuleForm>(EMPTY_RULE_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Fetch routing rules
  const rulesQuery = useQuery<RoutingRule[]>({
    queryKey: ["routing-rules"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/integrations/routing-rules")),
  });

  // Fetch connectors for dropdown
  const connectorsQuery = useQuery<Connector[]>({
    queryKey: ["integrations"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/integrations")),
  });

  const rules = rulesQuery.data?.data ?? [];
  const connectors = connectorsQuery.data?.data ?? [];

  // Create rule mutation
  const createRuleMut = useMutation({
    mutationFn: (body: RoutingRuleForm) =>
      apiRequest("POST", apiUrl("/api/v1/integrations/routing-rules"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routing-rules"] });
      setRuleDialogOpen(false);
      setRuleForm(EMPTY_RULE_FORM);
      toast({
        title: "Routing Rule Created",
        description: "The new routing rule has been added successfully.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to create rule",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Update rule mutation
  const updateRuleMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoutingRuleForm }) =>
      apiRequest("PUT", apiUrl(`/api/v1/integrations/routing-rules/${id}`), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routing-rules"] });
      setRuleDialogOpen(false);
      setEditingRuleId(null);
      setRuleForm(EMPTY_RULE_FORM);
      toast({
        title: "Routing Rule Updated",
        description: "The routing rule has been updated successfully.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update rule",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Delete rule mutation
  const deleteRuleMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", apiUrl(`/api/v1/integrations/routing-rules/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routing-rules"] });
      setDeleteConfirmId(null);
      toast({
        title: "Routing Rule Deleted",
        description: "The routing rule has been removed.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to delete rule",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenCreate = useCallback(() => {
    setEditingRuleId(null);
    setRuleForm(EMPTY_RULE_FORM);
    setRuleDialogOpen(true);
  }, []);

  const handleOpenEdit = useCallback(
    (rule: RoutingRule) => {
      setEditingRuleId(rule.id);
      setRuleForm({
        security_type: rule.security_type,
        primary_connector_id: rule.primary_connector_id,
        fallback_connector_id: rule.fallback_connector_id ?? "",
        priority: rule.priority,
        is_active: rule.is_active,
      });
      setRuleDialogOpen(true);
    },
    []
  );

  const handleSaveRule = useCallback(() => {
    if (editingRuleId) {
      updateRuleMut.mutate({ id: editingRuleId, body: ruleForm });
    } else {
      createRuleMut.mutate(ruleForm);
    }
  }, [editingRuleId, ruleForm, updateRuleMut, createRuleMut]);

  const isSaving = createRuleMut.isPending || updateRuleMut.isPending;

  if (rulesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableHead key={i}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {rules.length} routing rule{rules.length !== 1 ? "s" : ""} configured
        </div>
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Rule
        </Button>
      </div>

      {/* Rules table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Security Type</TableHead>
              <TableHead>Primary Connector</TableHead>
              <TableHead>Fallback Connector</TableHead>
              <TableHead className="text-center">Priority</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  <Route className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  No routing rules configured. Click "Add Rule" to create one.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id} className={!rule.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{rule.security_type}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      {rule.primary_connector_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {rule.fallback_connector_name ? (
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-yellow-500" />
                        {rule.fallback_connector_name}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">
                      {rule.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {rule.is_active ? (
                      <Badge className="bg-green-100 text-green-800 text-[10px]">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(rule)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmId(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Rule Create/Edit Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRuleId ? "Edit Routing Rule" : "Create Routing Rule"}
            </DialogTitle>
            <DialogDescription>
              Configure how orders for a specific security type are routed to connectors.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-security-type">Security Type</Label>
              <Select
                value={ruleForm.security_type}
                onValueChange={(v) => setRuleForm((f) => ({ ...f, security_type: v }))}
              >
                <SelectTrigger id="rule-security-type">
                  <SelectValue placeholder="Select security type" />
                </SelectTrigger>
                <SelectContent>
                  {SECURITY_TYPES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-primary">Primary Connector</Label>
              <Select
                value={ruleForm.primary_connector_id}
                onValueChange={(v) => setRuleForm((f) => ({ ...f, primary_connector_id: v }))}
              >
                <SelectTrigger id="rule-primary">
                  <SelectValue placeholder="Select primary connector" />
                </SelectTrigger>
                <SelectContent>
                  {connectors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.protocol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-fallback">Fallback Connector</Label>
              <Select
                value={ruleForm.fallback_connector_id}
                onValueChange={(v) => setRuleForm((f) => ({ ...f, fallback_connector_id: v }))}
              >
                <SelectTrigger id="rule-fallback">
                  <SelectValue placeholder="None (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {connectors
                    .filter((c) => c.id !== ruleForm.primary_connector_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.protocol})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-priority">Priority (1 = highest)</Label>
              <Input
                id="rule-priority"
                type="number"
                min={1}
                max={100}
                value={ruleForm.priority}
                onChange={(e) =>
                  setRuleForm((f) => ({
                    ...f,
                    priority: parseInt(e.target.value, 10) || 1,
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="rule-active"
                checked={ruleForm.is_active}
                onCheckedChange={(checked) =>
                  setRuleForm((f) => ({ ...f, is_active: checked }))
                }
              />
              <Label htmlFor="rule-active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRuleDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRule}
              disabled={
                isSaving ||
                !ruleForm.security_type ||
                !ruleForm.primary_connector_id
              }
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              {editingRuleId ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Routing Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this routing rule? This action cannot be undone.
              Orders matching this rule will no longer be routed automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteRuleMut.mutate(deleteConfirmId)}
              disabled={deleteRuleMut.isPending}
            >
              {deleteRuleMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Activity Log Tab
// ---------------------------------------------------------------------------

function ActivityLogTab() {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [connectorFilter, setConnectorFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const logQuery = useQuery<ActivityLogEntry[]>({
    queryKey: ["integration-activity-log"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/integrations/activity-log")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const connectorsQuery = useQuery<Connector[]>({
    queryKey: ["integrations"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/integrations")),
  });

  const entries = logQuery.data?.data ?? [];
  const connectors = connectorsQuery.data?.data ?? [];

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (eventTypeFilter !== "ALL" && entry.event_type !== eventTypeFilter) return false;
      if (statusFilter !== "ALL" && entry.status !== statusFilter) return false;
      if (connectorFilter !== "ALL" && entry.connector_id !== connectorFilter) return false;
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        return (
          entry.details.toLowerCase().includes(lower) ||
          entry.connector_name.toLowerCase().includes(lower) ||
          (entry.reference_id ?? "").toLowerCase().includes(lower)
        );
      }
      return true;
    });
  }, [entries, eventTypeFilter, statusFilter, connectorFilter, searchTerm]);

  if (logQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-36" />
          ))}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 7 }).map((_, i) => (
                  <TableHead key={i}>
                    <Skeleton className="h-4 w-16" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (logQuery.isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8">
          <div className="text-center">
            <XCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm font-medium text-destructive">
              Failed to load activity log
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {logQuery.error?.message ?? "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => logQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search details, connector, reference..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={connectorFilter} onValueChange={setConnectorFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Connector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Connectors</SelectItem>
            {connectors.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Event Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Events</SelectItem>
            <SelectItem value="ORDER_SENT">Order Sent</SelectItem>
            <SelectItem value="ORDER_ACK">Order Ack</SelectItem>
            <SelectItem value="EXECUTION">Execution</SelectItem>
            <SelectItem value="REJECTION">Rejection</SelectItem>
            <SelectItem value="HEARTBEAT">Heartbeat</SelectItem>
            <SelectItem value="ERROR">Error</SelectItem>
            <SelectItem value="RECONNECT">Reconnect</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="SUCCESS">Success</SelectItem>
            <SelectItem value="FAILURE">Failure</SelectItem>
            <SelectItem value="TIMEOUT">Timeout</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
          <RefreshCw
            className={`h-3 w-3 ${logQuery.isFetching ? "animate-spin" : ""}`}
          />
          Auto-refresh every 30s
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredEntries.length} of {entries.length} events
      </div>

      {/* Activity log table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Timestamp</TableHead>
              <TableHead>Connector</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead className="w-64">Details</TableHead>
              <TableHead>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  No activity log entries match your filters
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                    {formatTimestamp(entry.timestamp)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {entry.connector_name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] ${EVENT_TYPE_COLORS[entry.event_type] ?? "bg-muted text-foreground"}`}
                    >
                      {entry.event_type.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] ${LOG_STATUS_COLORS[entry.status] ?? "bg-muted text-foreground"}`}
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-mono text-xs ${latencyColor(entry.latency_ms)}`}>
                    {formatLatency(entry.latency_ms)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[256px] truncate">
                    {entry.details}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {entry.reference_id ?? "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Simulation Tab
// ---------------------------------------------------------------------------

function SimulationTab() {
  const { toast } = useToast();

  const [securityType, setSecurityType] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState<string>("1000");
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

  const simulateMut = useMutation<SimulationResult, Error, { security_type: string; side: string; quantity: number }>({
    mutationFn: (body) =>
      apiRequest("POST", apiUrl("/api/v1/integrations/simulate"), body),
    onSuccess: (result) => {
      setSimulationResult(result);
      toast({
        title: "Simulation Complete",
        description: `Routed to ${result.primary_connector} via ${result.route_reason}`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Simulation Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSimulate = useCallback(() => {
    if (!securityType || !quantity) return;
    simulateMut.mutate({
      security_type: securityType,
      side,
      quantity: parseInt(quantity, 10) || 0,
    });
  }, [securityType, side, quantity, simulateMut]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Simulation form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Order Routing Simulation
          </CardTitle>
          <CardDescription>
            Test how an order would be routed through configured connectors
            without actually sending it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sim-security-type">Security Type</Label>
            <Select value={securityType} onValueChange={setSecurityType}>
              <SelectTrigger id="sim-security-type">
                <SelectValue placeholder="Select security type" />
              </SelectTrigger>
              <SelectContent>
                {SECURITY_TYPES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sim-side">Side</Label>
            <Select
              value={side}
              onValueChange={(v) => setSide(v as "BUY" | "SELL")}
            >
              <SelectTrigger id="sim-side">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUY">BUY</SelectItem>
                <SelectItem value="SELL">SELL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sim-quantity">Quantity</Label>
            <Input
              id="sim-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
            />
          </div>

          <Separator />

          <Button
            className="w-full"
            onClick={handleSimulate}
            disabled={simulateMut.isPending || !securityType || !quantity}
          >
            {simulateMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Simulate Routing
          </Button>
        </CardContent>
      </Card>

      {/* Simulation result */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            Routing Result
          </CardTitle>
          <CardDescription>
            Preview of how the order would be routed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!simulationResult && !simulateMut.isPending ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ArrowDownUp className="h-12 w-12 mb-4 text-muted-foreground/30" />
              <p className="text-sm">No simulation run yet</p>
              <p className="text-xs mt-1">
                Fill in the form and click "Simulate Routing" to see results
              </p>
            </div>
          ) : simulateMut.isPending ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Running simulation...</p>
            </div>
          ) : simulationResult ? (
            <div className="space-y-4">
              {/* Compliance check */}
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border ${
                  simulationResult.compliance_check === "PASSED"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                {simulationResult.compliance_check === "PASSED" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <div>
                  <span
                    className={`text-sm font-medium ${
                      simulationResult.compliance_check === "PASSED"
                        ? "text-green-800"
                        : "text-red-800"
                    }`}
                  >
                    Compliance: {simulationResult.compliance_check}
                  </span>
                  {simulationResult.compliance_notes.length > 0 && (
                    <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                      {simulationResult.compliance_notes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Primary route */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Primary Route</p>
                    <p className="text-xs text-muted-foreground">
                      {simulationResult.route_reason}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between p-2 rounded bg-background">
                    <span className="text-muted-foreground">Connector</span>
                    <span className="font-medium">{simulationResult.primary_connector}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-background">
                    <span className="text-muted-foreground">Est. Latency</span>
                    <span className={`font-mono font-medium ${latencyColor(simulationResult.primary_latency_ms)}`}>
                      {formatLatency(simulationResult.primary_latency_ms)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fallback route */}
              {simulationResult.fallback_connector && (
                <div className="p-4 rounded-lg border bg-muted/20">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100">
                      <Shield className="h-4 w-4 text-yellow-700" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Fallback Route</p>
                      <p className="text-xs text-muted-foreground">
                        Used if primary connector is unavailable
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between p-2 rounded bg-background">
                      <span className="text-muted-foreground">Connector</span>
                      <span className="font-medium">{simulationResult.fallback_connector}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-background">
                      <span className="text-muted-foreground">Est. Latency</span>
                      <span
                        className={`font-mono font-medium ${latencyColor(simulationResult.fallback_latency_ms ?? 0)}`}
                      >
                        {simulationResult.fallback_latency_ms
                          ? formatLatency(simulationResult.fallback_latency_ms)
                          : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Estimated fill time */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Estimated Fill Time</span>
                </div>
                <span className="text-sm font-bold font-mono">
                  {formatLatency(simulationResult.estimated_fill_time_ms)}
                </span>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function IntegrationHub() {
  const [activeTab, setActiveTab] = useState("connectors");

  const connectorsQuery = useQuery<Connector[]>({
    queryKey: ["integrations"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/integrations")),
    refetchInterval: REFRESH_INTERVAL,
  });

  // Quick stats for header
  const connectors = connectorsQuery.data?.data ?? [];
  const connectedCount = connectors.filter((c) => c.status === "CONNECTED").length;
  const totalCount = connectors.length;
  const avgLatency = connectors.length > 0
    ? connectors.reduce((sum, c) => sum + c.avg_latency_ms, 0) / connectors.length
    : 0;
  const overallSuccessRate = connectors.length > 0
    ? connectors.reduce((sum, c) => sum + c.success_rate, 0) / connectors.length
    : 0;

  return (
    <div className="space-y-6 p-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Network className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Integration Hub</h1>
            <p className="text-sm text-muted-foreground">
              External system connectors and routing configuration
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw
            className={`h-3 w-3 ${connectorsQuery.isFetching ? "animate-spin" : ""}`}
          />
          Auto-refresh every 30s
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Connectors</p>
                <p className="text-2xl font-bold mt-1">{totalCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Globe className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Connected</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {connectedCount}/{totalCount}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Avg Success Rate</p>
                <p className={`text-2xl font-bold mt-1 ${successRateColor(overallSuccessRate)}`}>
                  {connectorsQuery.isLoading ? "--" : formatPct(overallSuccessRate)}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Avg Latency</p>
                <p className={`text-2xl font-bold mt-1 ${latencyColor(avgLatency)}`}>
                  {connectorsQuery.isLoading ? "--" : formatLatency(avgLatency)}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <Timer className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="connectors" className="flex items-center gap-1.5">
            <PlugZap className="h-4 w-4" />
            <span className="hidden sm:inline">Connectors</span>
          </TabsTrigger>
          <TabsTrigger value="routing" className="flex items-center gap-1.5">
            <Route className="h-4 w-4" />
            <span className="hidden sm:inline">Routing Rules</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Activity Log</span>
          </TabsTrigger>
          <TabsTrigger value="simulation" className="flex items-center gap-1.5">
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">Simulation</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connectors" className="mt-6">
          <ConnectorsTab />
        </TabsContent>

        <TabsContent value="routing" className="mt-6">
          <RoutingRulesTab />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivityLogTab />
        </TabsContent>

        <TabsContent value="simulation" className="mt-6">
          <SimulationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
