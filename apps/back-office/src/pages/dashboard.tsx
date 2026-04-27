/**
 * Dashboard Page
 *
 * RM landing page with:
 *  - Static summary KPI cards (always visible)
 *  - Morning Briefing widget (from Platform Intelligence Service)
 *  - Next Best Actions panel
 *  - Proactive Alerts strip
 *
 * All platform widgets degrade gracefully when
 * PLATFORM_INTELLIGENCE_SERVICE_URL is not configured.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  Briefcase,
  CheckCircle,
  ArrowLeftRight,
  TrendingUp,
  Zap,
  BellRing,
  BookOpen,
  AlertTriangle,
  Info,
  WifiOff,
} from "lucide-react";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { cn } from "@ui/lib/utils";
import { EntityFeaturePanel } from "@/components/features/EntityFeaturePanel";

// ─── Types (mirror server-side DTOs) ─────────────────────────────────────────

interface NBAction {
  action_id:   string;
  action_type: string;
  entity_type: string;
  entity_id:   string;
  priority:    number;
  title:       string;
  description: string;
  due_date:    string | null;
}

interface BriefingAlert {
  alert_id:    string;
  severity:    "critical" | "warning" | "info";
  entity_type: string;
  entity_id:   string;
  message:     string;
}

interface MorningBriefing {
  rm_id:        number;
  generated_at: string;
  summary:      string;
  top_actions:  NBAction[];
  alerts:       BriefingAlert[];
}

// ─── Static summary cards ─────────────────────────────────────────────────────

const summaryCards = [
  {
    title: "Total Portfolios",
    value: "1,248",
    description: "Active trust portfolios",
    icon: Briefcase,
    color: "text-blue-600",
  },
  {
    title: "Pending Approvals",
    value: "23",
    description: "Awaiting review",
    icon: CheckCircle,
    color: "text-amber-600",
  },
  {
    title: "Today's Orders",
    value: "156",
    description: "Buy/sell transactions",
    icon: ArrowLeftRight,
    color: "text-green-600",
  },
  {
    title: "AUM",
    value: "PHP 84.5B",
    description: "Assets under management",
    icon: TrendingUp,
    color: "text-purple-600",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function alertSeverityMeta(severity: BriefingAlert["severity"]) {
  switch (severity) {
    case "critical":
      return { icon: AlertTriangle, className: "text-red-600",    badge: "destructive" as const };
    case "warning":
      return { icon: AlertTriangle, className: "text-amber-600",  badge: "secondary"   as const };
    default:
      return { icon: Info,          className: "text-blue-600",   badge: "outline"     as const };
  }
}

function actionTypeBadge(type: string) {
  const map: Record<string, string> = {
    call_client:       "Call",
    review_portfolio:  "Review",
    file_report:       "File",
    schedule_meeting:  "Meeting",
    send_document:     "Docs",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlatformOfflineBadge() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <WifiOff className="h-3.5 w-3.5" />
      Platform intelligence offline
    </div>
  );
}

function AlertsStrip({ alerts }: { alerts: BriefingAlert[] }) {
  if (!alerts.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => {
        const { icon: Icon, className, badge } = alertSeverityMeta(alert.severity);
        return (
          <div
            key={alert.alert_id}
            className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm">{alert.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {alert.entity_type}: {alert.entity_id}
              </p>
            </div>
            <Badge variant={badge} className="shrink-0 text-xs">
              {alert.severity}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function NBAPanel({ actions }: { actions: NBAction[] }) {
  if (!actions.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No recommended actions at this time.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.slice(0, 5).map((action) => (
        <div
          key={action.action_id}
          className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2.5"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {action.priority}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{action.title}</p>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {action.description}
            </p>
            {action.due_date && (
              <p className="text-xs text-amber-600 mt-0.5">
                Due {new Date(action.due_date).toLocaleDateString("en-PH")}
              </p>
            )}
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            {actionTypeBadge(action.action_type)}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let userName = "Operator";
  let userId: string | number = 1;
  try {
    const stored = localStorage.getItem("trustoms-user");
    if (stored) {
      const user = JSON.parse(stored);
      userName = user.name || user.email || "Operator";
      userId = user.id ?? user.userId ?? user.user_id ?? 1;
    }
  } catch { /* ignore */ }

  // ── Platform intelligence queries ──────────────────────────────────────────

  const briefingQuery = useQuery<MorningBriefing | null>({
    queryKey: ["/api/v1/intelligence/morning-briefing"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", apiUrl("/api/v1/intelligence/morning-briefing"));
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // re-use for 5 min
    retry: false,
  });

  const nbaQuery = useQuery<{ actions: NBAction[] } | null>({
    queryKey: ["/api/v1/intelligence/nba"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", apiUrl("/api/v1/intelligence/nba?limit=5"));
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const alertsQuery = useQuery<{ alerts: BriefingAlert[] } | null>({
    queryKey: ["/api/v1/intelligence/alerts"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", apiUrl("/api/v1/intelligence/alerts"));
      } catch {
        return null;
      }
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const platformOnline =
    briefingQuery.data !== null ||
    nbaQuery.data !== null ||
    alertsQuery.data !== null;

  const alerts  = alertsQuery.data?.alerts   ?? briefingQuery.data?.alerts      ?? [];
  const actions = nbaQuery.data?.actions     ?? briefingQuery.data?.top_actions ?? [];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome back, {userName}
        </h1>
        <p className="text-sm text-muted-foreground">{today}</p>
      </div>

      {/* Summary KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <EntityFeaturePanel
        entityType="user"
        entityId={userId}
        title="RM Feature Signals"
        description="Computed activity, book, and risk features from the shared platform service"
        featureIds={[
          "rm.book_aum_php",
          "rm.client_count",
          "rm.portfolio_count",
          "rm.overdue_call_reports",
          "rm.service_requests_open",
          "rm.next_best_action_score",
        ]}
      />

      {/* Proactive alerts strip */}
      {alertsQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : alerts.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BellRing className="h-4 w-4 text-amber-600" />
                Alerts
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {alerts.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <AlertsStrip alerts={alerts} />
          </CardContent>
        </Card>
      ) : null}

      {/* Two-column: Morning Briefing + NBA */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Morning Briefing */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Morning Briefing
              </CardTitle>
              {!platformOnline && !briefingQuery.isLoading && (
                <PlatformOfflineBadge />
              )}
            </div>
            {briefingQuery.data && (
              <CardDescription className="text-xs">
                Generated{" "}
                {new Date(briefingQuery.data.generated_at).toLocaleTimeString(
                  "en-PH",
                  { hour: "2-digit", minute: "2-digit" }
                )}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {briefingQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            ) : briefingQuery.data ? (
              <p className="text-sm leading-relaxed text-foreground">
                {briefingQuery.data.summary}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Morning briefing unavailable. The platform intelligence service
                will populate this when configured.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Next Best Actions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Recommended Actions
              </CardTitle>
              {!platformOnline && !nbaQuery.isLoading && (
                <PlatformOfflineBadge />
              )}
            </div>
            <CardDescription className="text-xs">
              AI-ranked actions for today
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nbaQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <NBAPanel actions={actions} />
            )}
            {!nbaQuery.isLoading && !platformOnline && (
              <p className="mt-3 text-xs text-muted-foreground">
                Connect the Platform Intelligence Service to receive personalized
                action recommendations.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
