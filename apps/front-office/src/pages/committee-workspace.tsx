/**
 * Committee Workspace -- Phase 6D
 *
 * Collaborative workspace for 6-eyes authorization decisions. Combines
 * real-time presence, committee chat, order / suitability / compliance
 * details, and a structured voting panel for APPROVE / REJECT / ABSTAIN.
 *
 * Polls presence, votes, and chat messages every 3 seconds so that all
 * connected committee members see updates near-instantly (will be
 * replaced with Supabase Realtime subscriptions in production).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";

import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Progress } from "@ui/components/ui/progress";
import { Textarea } from "@ui/components/ui/textarea";
import { Input } from "@ui/components/ui/input";
import { ScrollArea } from "@ui/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ui/components/ui/tooltip";
import {
  Users,
  MessageSquare,
  CheckCircle,
  XCircle,
  MinusCircle,
  Send,
  Vote,
  Shield,
  AlertTriangle,
  BarChart3,
  FileText,
  Clock,
  Wifi,
  WifiOff,
  Eye,
  ThumbsUp,
  ThumbsDown,
  CircleDot,
  ArrowRight,
  Briefcase,
  TrendingUp,
  Scale,
  Activity,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PresenceEntry {
  userId: string;
  userName: string;
  joinedAt: string;
  lastSeen: string;
  status: "ONLINE" | "IDLE";
}

interface VoteEntry {
  id: string;
  workspaceId: string;
  userId: string;
  decision: "APPROVE" | "REJECT" | "ABSTAIN";
  comments: string | null;
  votedAt: string;
}

interface VoteSummary {
  total: number;
  approve: number;
  reject: number;
  abstain: number;
}

interface VoteData {
  workspaceId: string;
  votes: VoteEntry[];
  summary: VoteSummary;
  resolution: "PENDING" | "APPROVED" | "REJECTED";
  requiredApprovals: number;
}

interface ChatMessage {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  message: string;
  sentAt: string;
}

// ---------------------------------------------------------------------------
// Stub data — order details, suitability, compliance, risk
// (in production these would be fetched from the real endpoints)
// ---------------------------------------------------------------------------

const STUB_ORDER = {
  orderId: "ORD-2026-0418-001",
  transactionRefNo: "TRN-20260418-00142",
  portfolioId: "UITF-EQ-001",
  portfolioName: "PNB UITF Equity Index Fund",
  clientName: "Reyes, Maria Santos",
  clientId: "CLI-0012",
  side: "BUY",
  securityName: "SM Investments Corp (SM)",
  securityId: "PSE:SM",
  quantity: 50000,
  limitPrice: 920.0,
  estimatedAmount: 46_000_000.0,
  currency: "PHP",
  orderType: "LIMIT",
  authorizationTier: "SIX_EYES",
  orderStatus: "PENDING_AUTH",
  createdAt: "2026-04-18T09:30:00Z",
  createdBy: "RM J. Cruz",
  riskRating: "MODERATE",
  timeHorizon: "LONG_TERM",
};

const STUB_SUITABILITY = {
  overallScore: 82,
  riskProfileMatch: true,
  investmentObjectiveMatch: true,
  timeHorizonMatch: true,
  concentrationCheck: "PASS",
  liquidityCheck: "PASS",
  clientRiskProfile: "MODERATE_AGGRESSIVE",
  productRiskRating: "MODERATE",
  maxAllocationPct: 15.0,
  currentAllocationPct: 8.2,
  postTradeAllocationPct: 12.4,
  recommendation: "SUITABLE",
  flags: [] as string[],
};

const STUB_MANDATE = {
  mandateId: "MND-UITF-EQ-001",
  mandateName: "UITF Equity Fund IMA",
  checks: [
    { rule: "Single issuer limit (10%)", status: "PASS", current: "8.2%", limit: "10.0%", postTrade: "12.4%" },
    { rule: "Sector concentration (25%)", status: "PASS", current: "18.5%", limit: "25.0%", postTrade: "22.1%" },
    { rule: "Minimum credit rating (BBB)", status: "PASS", current: "A", limit: "BBB", postTrade: "A" },
    { rule: "Maximum portfolio duration", status: "PASS", current: "4.2y", limit: "7.0y", postTrade: "4.2y" },
    { rule: "Approved counterparties only", status: "PASS", current: "PSE", limit: "Approved list", postTrade: "PSE" },
    { rule: "Currency exposure limit", status: "PASS", current: "100% PHP", limit: "100% PHP", postTrade: "100% PHP" },
  ],
  overallStatus: "COMPLIANT",
};

const STUB_RISK = {
  portfolioVaR: 2_350_000,
  postTradeVaR: 2_580_000,
  varLimit: 5_000_000,
  portfolioBeta: 1.02,
  postTradeBeta: 1.05,
  trackingError: 1.8,
  postTradeTrackingError: 2.1,
  sharpeRatio: 1.45,
  informationRatio: 0.82,
  maxDrawdown: -8.2,
  stressScenarios: [
    { scenario: "Market crash (-20%)", impact: -9_200_000, postTradeImpact: -10_120_000 },
    { scenario: "Interest rate +200bps", impact: -1_800_000, postTradeImpact: -1_800_000 },
    { scenario: "PHP depreciation 10%", impact: 0, postTradeImpact: 0 },
    { scenario: "Sector rotation", impact: -3_100_000, postTradeImpact: -3_410_000 },
  ],
};

const STUB_PORTFOLIO_IMPACT = {
  currentAum: 372_000_000,
  tradeAmount: 46_000_000,
  postTradeAum: 372_000_000,
  cashBefore: 52_000_000,
  cashAfter: 6_000_000,
  cashPctAfter: 1.6,
  topHoldings: [
    { security: "SM Investments (SM)", weight: 12.4, change: 4.2 },
    { security: "Ayala Corp (AC)", weight: 9.8, change: 0 },
    { security: "BDO Unibank (BDO)", weight: 8.5, change: 0 },
    { security: "JG Summit (JGS)", weight: 7.2, change: 0 },
    { security: "PLDT Inc (TEL)", weight: 6.1, change: 0 },
  ],
  sectorExposure: [
    { sector: "Holding Firms", weight: 38.5, change: 4.2 },
    { sector: "Financials", weight: 22.3, change: 0 },
    { sector: "Industrials", weight: 15.6, change: 0 },
    { sector: "Services", weight: 12.8, change: 0 },
    { sector: "Property", weight: 10.8, change: 0 },
  ],
};

// ---------------------------------------------------------------------------
// Simulated current user (in production comes from auth context)
// ---------------------------------------------------------------------------

const CURRENT_USER = {
  userId: "USR-001",
  userName: "A. Santos (CIO)",
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 3000;
const PH = "en-PH";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat(PH, {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat(PH).format(n);
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(PH, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(PH, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter((p: string) => p.length > 0)
    .map((p: string) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function userColor(userId: string): string {
  const colors = [
    "bg-blue-600",
    "bg-emerald-600",
    "bg-violet-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-teal-600",
    "bg-indigo-600",
    "bg-pink-600",
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const RESOLUTION_BADGE: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-300",
  APPROVED: "bg-green-100 text-green-800 border-green-300",
  REJECTED: "bg-red-100 text-red-800 border-red-300",
};

const DECISION_ICON: Record<string, React.ReactNode> = {
  APPROVE: <ThumbsUp className="h-4 w-4 text-green-600" />,
  REJECT: <ThumbsDown className="h-4 w-4 text-red-600" />,
  ABSTAIN: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

const DECISION_COLOR: Record<string, string> = {
  APPROVE: "text-green-700 bg-green-50 border-green-200",
  REJECT: "text-red-700 bg-red-50 border-red-200",
  ABSTAIN: "text-muted-foreground bg-muted border-border",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_: any, i: any) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function StatusIndicator({ status }: { status: "ONLINE" | "IDLE" }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        status === "ONLINE" ? "bg-green-500 animate-pulse" : "bg-yellow-400"
      }`}
    />
  );
}

function PresenceAvatar({ entry }: { entry: PresenceEntry }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex flex-col items-center gap-0.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${userColor(
                entry.userId
              )}`}
            >
              {getInitials(entry.userName)}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5">
              <StatusIndicator status={entry.status} />
            </div>
            <span className="text-[10px] text-muted-foreground max-w-[60px] truncate">
              {entry.userName.split(" ")[0]}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-medium">{entry.userName}</p>
          <p className="text-xs text-muted-foreground">
            {entry.status === "ONLINE" ? "Online" : "Idle"} -- joined{" "}
            {fmtTime(entry.joinedAt)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {badge}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CommitteeWorkspace() {
  const location = useLocation();
  const queryClient = useQueryClient();

  // Parse workspace ID from query string, default to the stub order
  const params = new URLSearchParams(location.search);
  const workspaceId = params.get("id") || `WS-${STUB_ORDER.orderId}`;

  // -- Local state --
  const [hasJoined, setHasJoined] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [voteDialog, setVoteDialog] = useState<"APPROVE" | "REJECT" | "ABSTAIN" | null>(null);
  const [voteComment, setVoteComment] = useState("");
  const [activeTab, setActiveTab] = useState("order");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // -- Presence query (poll every 3s) --
  const presenceQuery = useQuery<{ data: PresenceEntry[] }>({
    queryKey: ["workspace-presence", workspaceId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/realtime/workspace/${workspaceId}/presence`)),
    refetchInterval: POLL_INTERVAL,
  });

  // -- Votes query (poll every 3s) --
  const votesQuery = useQuery<{ data: VoteData }>({
    queryKey: ["workspace-votes", workspaceId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/realtime/workspace/${workspaceId}/votes`)),
    refetchInterval: POLL_INTERVAL,
  });

  // -- Messages query (poll every 3s) --
  const messagesQuery = useQuery<{ data: ChatMessage[] }>({
    queryKey: ["workspace-messages", workspaceId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/realtime/workspace/${workspaceId}/messages`)),
    refetchInterval: POLL_INTERVAL,
  });

  // -- Join workspace on mount --
  const joinMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl(`/api/v1/realtime/workspace/${workspaceId}/join`), {
        userId: CURRENT_USER.userId,
        userName: CURRENT_USER.userName,
      }),
    onSuccess: () => {
      setHasJoined(true);
      queryClient.invalidateQueries({ queryKey: ["workspace-presence", workspaceId] });
    },
  });

  // -- Leave workspace on unmount --
  const leaveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl(`/api/v1/realtime/workspace/${workspaceId}/leave`), {
        userId: CURRENT_USER.userId,
      }),
  });

  // -- Send chat message --
  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      apiRequest("POST", apiUrl(`/api/v1/realtime/workspace/${workspaceId}/chat`), {
        userId: CURRENT_USER.userId,
        userName: CURRENT_USER.userName,
        message,
      }),
    onSuccess: () => {
      setChatInput("");
      queryClient.invalidateQueries({ queryKey: ["workspace-messages", workspaceId] });
    },
  });

  // -- Cast vote --
  const voteMutation = useMutation({
    mutationFn: ({ decision, comments }: { decision: string; comments?: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/realtime/workspace/${workspaceId}/vote`), {
        userId: CURRENT_USER.userId,
        decision,
        comments,
      }),
    onSuccess: () => {
      setVoteDialog(null);
      setVoteComment("");
      queryClient.invalidateQueries({ queryKey: ["workspace-votes", workspaceId] });
    },
  });

  // -- Auto-join on mount, auto-leave on unmount --
  useEffect(() => {
    if (!hasJoined) {
      joinMutation.mutate();
    }

    return () => {
      leaveMutation.mutate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Auto-scroll chat --
  const messages = messagesQuery.data?.data ?? [];
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // -- Handle chat send --
  const handleChatSend = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    chatMutation.mutate(trimmed);
  }, [chatInput, chatMutation]);

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleChatSend();
      }
    },
    [handleChatSend],
  );

  // -- Handle vote submission --
  const handleVoteSubmit = useCallback(() => {
    if (!voteDialog) return;
    voteMutation.mutate({
      decision: voteDialog,
      comments: voteComment.trim() || undefined,
    });
  }, [voteDialog, voteComment, voteMutation]);

  // -- Derived data --
  const presence = presenceQuery.data?.data ?? [];
  const voteData = votesQuery.data?.data ?? null;
  const onlineCount = presence.filter((p: PresenceEntry) => p.status === "ONLINE").length;
  const totalParticipants = presence.length;

  const myVote = voteData?.votes.find((v: VoteEntry) => v.userId === CURRENT_USER.userId) ?? null;

  const approvalProgress = voteData
    ? Math.round((voteData.summary.approve / voteData.requiredApprovals) * 100)
    : 0;

  // =========================================================================
  // Render
  // =========================================================================

  const queryError = presenceQuery.error || votesQuery.error || messagesQuery.error;
  if (queryError) return <div className="p-6 text-center text-destructive">Failed to load data. Please try again.</div>;

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* ==================================================================
          HEADER
          ================================================================== */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Title & ID */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">
                Committee Workspace
              </h1>
              <p className="text-xs text-muted-foreground">
                {STUB_ORDER.orderId} -- {STUB_ORDER.securityName} --{" "}
                <span className="font-medium">{STUB_ORDER.authorizationTier.replace("_", "-")}</span>
              </p>
            </div>
          </div>

          {/* Center: Status badges */}
          <div className="hidden md:flex items-center gap-2">
            <Badge
              variant="outline"
              className={RESOLUTION_BADGE[voteData?.resolution ?? "PENDING"]}
            >
              {voteData?.resolution ?? "PENDING"}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Wifi className="h-3 w-3 text-green-500" />
              {onlineCount} / {totalParticipants} online
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {fmtDateTime(STUB_ORDER.createdAt)}
            </Badge>
          </div>

          {/* Right: Workspace ID */}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Workspace</p>
            <p className="text-sm font-mono">{workspaceId}</p>
          </div>
        </div>
      </header>

      {/* ==================================================================
          PRESENCE BAR
          ================================================================== */}
      <div className="border-b px-6 py-2 bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Participants
          </div>
          <Separator orientation="vertical" className="h-6" />
          {presenceQuery.isLoading ? (
            <div className="flex gap-3">
              {Array.from({ length: 3 }).map((_: any, i: any) => (
                <Skeleton key={i} className="h-9 w-9 rounded-full" />
              ))}
            </div>
          ) : presence.length === 0 ? (
            <span className="text-xs text-muted-foreground">No participants yet</span>
          ) : (
            <div className="flex items-center gap-4">
              {presence.map((p: PresenceEntry) => (
                <PresenceAvatar key={p.userId} entry={p} />
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {onlineCount} online, {totalParticipants - onlineCount} idle
            </span>
          </div>
        </div>
      </div>

      {/* ==================================================================
          MAIN CONTENT: LEFT PANEL (60%) + RIGHT PANEL (40%)
          ================================================================== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ----------------------------------------------------------------
            LEFT PANEL — Order details, suitability, mandate, risk, impact
            ---------------------------------------------------------------- */}
        <div className="w-3/5 border-r overflow-y-auto p-4 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="order" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Order Details
              </TabsTrigger>
              <TabsTrigger value="suitability" className="gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Suitability
              </TabsTrigger>
              <TabsTrigger value="mandate" className="gap-1.5">
                <Scale className="h-3.5 w-3.5" />
                Mandate
              </TabsTrigger>
              <TabsTrigger value="risk" className="gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Risk
              </TabsTrigger>
              <TabsTrigger value="impact" className="gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Impact
              </TabsTrigger>
            </TabsList>

            {/* -- ORDER DETAILS TAB -- */}
            <TabsContent value="order" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Order Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <InfoField label="Order ID" value={STUB_ORDER.orderId} />
                    <InfoField label="Transaction Ref" value={STUB_ORDER.transactionRefNo} />
                    <InfoField label="Portfolio" value={`${STUB_ORDER.portfolioId} -- ${STUB_ORDER.portfolioName}`} />
                    <InfoField label="Client" value={`${STUB_ORDER.clientName} (${STUB_ORDER.clientId})`} />
                    <InfoField label="Created By" value={STUB_ORDER.createdBy} />
                    <InfoField label="Created At" value={fmtDateTime(STUB_ORDER.createdAt)} />
                    <InfoField
                      label="Side"
                      value={
                        <Badge variant={STUB_ORDER.side === "BUY" ? "default" : "destructive"}>
                          {STUB_ORDER.side}
                        </Badge>
                      }
                    />
                    <InfoField label="Security" value={`${STUB_ORDER.securityName} (${STUB_ORDER.securityId})`} />
                    <InfoField label="Order Type" value={STUB_ORDER.orderType} />
                    <InfoField label="Quantity" value={fmtNumber(STUB_ORDER.quantity)} />
                    <InfoField label="Limit Price" value={fmtCurrency(STUB_ORDER.limitPrice)} />
                    <InfoField label="Estimated Amount" value={fmtCurrency(STUB_ORDER.estimatedAmount)} />
                    <InfoField label="Currency" value={STUB_ORDER.currency} />
                    <InfoField
                      label="Authorization Tier"
                      value={
                        <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                          {STUB_ORDER.authorizationTier.replace("_", "-")}
                        </Badge>
                      }
                    />
                    <InfoField
                      label="Status"
                      value={
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          {STUB_ORDER.orderStatus}
                        </Badge>
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Quick summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard
                  title="Suitability"
                  value={`${STUB_SUITABILITY.overallScore}/100`}
                  description={STUB_SUITABILITY.recommendation}
                  icon={Shield}
                  color="text-green-600"
                  bgColor="bg-green-50"
                />
                <SummaryCard
                  title="Mandate"
                  value={STUB_MANDATE.overallStatus}
                  description={`${STUB_MANDATE.checks.filter((c: any) => c.status === "PASS").length}/${STUB_MANDATE.checks.length} checks passed`}
                  icon={Scale}
                  color="text-blue-600"
                  bgColor="bg-blue-50"
                />
                <SummaryCard
                  title="Risk (VaR)"
                  value={fmtCurrency(STUB_RISK.postTradeVaR)}
                  description={`Limit: ${fmtCurrency(STUB_RISK.varLimit)}`}
                  icon={AlertTriangle}
                  color="text-amber-600"
                  bgColor="bg-amber-50"
                />
              </div>
            </TabsContent>

            {/* -- SUITABILITY TAB -- */}
            <TabsContent value="suitability" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Suitability Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Score bar */}
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium w-28">Overall Score</span>
                    <Progress value={STUB_SUITABILITY.overallScore} className="flex-1" />
                    <span className="text-sm font-bold w-16 text-right">
                      {STUB_SUITABILITY.overallScore}/100
                    </span>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <SuitabilityRow
                      label="Risk Profile Match"
                      pass={STUB_SUITABILITY.riskProfileMatch}
                      detail={`Client: ${STUB_SUITABILITY.clientRiskProfile}, Product: ${STUB_SUITABILITY.productRiskRating}`}
                    />
                    <SuitabilityRow
                      label="Investment Objective"
                      pass={STUB_SUITABILITY.investmentObjectiveMatch}
                      detail="Growth-oriented equity exposure"
                    />
                    <SuitabilityRow
                      label="Time Horizon"
                      pass={STUB_SUITABILITY.timeHorizonMatch}
                      detail={STUB_ORDER.timeHorizon}
                    />
                    <SuitabilityRow
                      label="Concentration Check"
                      pass={STUB_SUITABILITY.concentrationCheck === "PASS"}
                      detail={`Current: ${fmtPct(STUB_SUITABILITY.currentAllocationPct)}, Post-trade: ${fmtPct(STUB_SUITABILITY.postTradeAllocationPct)}, Max: ${fmtPct(STUB_SUITABILITY.maxAllocationPct)}`}
                    />
                    <SuitabilityRow
                      label="Liquidity Check"
                      pass={STUB_SUITABILITY.liquidityCheck === "PASS"}
                      detail="Adequate liquidity for order size"
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Recommendation</span>
                    <Badge
                      className={
                        STUB_SUITABILITY.recommendation === "SUITABLE"
                          ? "bg-green-100 text-green-800 border-green-300"
                          : "bg-red-100 text-red-800 border-red-300"
                      }
                    >
                      {STUB_SUITABILITY.recommendation}
                    </Badge>
                  </div>

                  {STUB_SUITABILITY.flags.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <p className="text-sm font-medium text-yellow-800">Flags:</p>
                      <ul className="text-sm text-yellow-700 list-disc pl-4 mt-1">
                        {STUB_SUITABILITY.flags.map((f: any, i: any) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* -- MANDATE COMPLIANCE TAB -- */}
            <TabsContent value="mandate" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Scale className="h-4 w-4" />
                      Mandate Compliance -- {STUB_MANDATE.mandateName}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={
                        STUB_MANDATE.overallStatus === "COMPLIANT"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }
                    >
                      {STUB_MANDATE.overallStatus}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rule</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-right">Current</TableHead>
                          <TableHead className="text-right">Limit</TableHead>
                          <TableHead className="text-right">Post-Trade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {STUB_MANDATE.checks.map((check: any, idx: any) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{check.rule}</TableCell>
                            <TableCell className="text-center">
                              {check.status === "PASS" ? (
                                <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600 mx-auto" />
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {check.current}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {check.limit}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {check.postTrade}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* -- RISK ANALYSIS TAB -- */}
            <TabsContent value="risk" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Risk Analysis Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Key risk metrics */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <RiskMetricCard
                      label="Portfolio VaR"
                      current={fmtCurrency(STUB_RISK.portfolioVaR)}
                      postTrade={fmtCurrency(STUB_RISK.postTradeVaR)}
                      limit={fmtCurrency(STUB_RISK.varLimit)}
                      withinLimit
                    />
                    <RiskMetricCard
                      label="Beta"
                      current={STUB_RISK.portfolioBeta.toFixed(2)}
                      postTrade={STUB_RISK.postTradeBeta.toFixed(2)}
                    />
                    <RiskMetricCard
                      label="Tracking Error"
                      current={`${STUB_RISK.trackingError.toFixed(1)}%`}
                      postTrade={`${STUB_RISK.postTradeTrackingError.toFixed(1)}%`}
                    />
                    <RiskMetricCard
                      label="Sharpe Ratio"
                      current={STUB_RISK.sharpeRatio.toFixed(2)}
                      postTrade={STUB_RISK.sharpeRatio.toFixed(2)}
                    />
                  </div>

                  <Separator />

                  {/* Stress scenarios */}
                  <SectionHeader icon={Activity} title="Stress Scenarios" />
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scenario</TableHead>
                          <TableHead className="text-right">Current Impact</TableHead>
                          <TableHead className="text-right">Post-Trade Impact</TableHead>
                          <TableHead className="text-right">Delta</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {STUB_RISK.stressScenarios.map((s: any, i: any) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{s.scenario}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-red-600">
                              {fmtCurrency(s.impact)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-red-600">
                              {fmtCurrency(s.postTradeImpact)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {fmtCurrency(s.postTradeImpact - s.impact)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-md border bg-muted/30">
                      <p className="text-muted-foreground">Information Ratio</p>
                      <p className="text-lg font-bold">{STUB_RISK.informationRatio.toFixed(2)}</p>
                    </div>
                    <div className="p-3 rounded-md border bg-muted/30">
                      <p className="text-muted-foreground">Max Drawdown</p>
                      <p className="text-lg font-bold text-red-600">
                        {STUB_RISK.maxDrawdown.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* -- PORTFOLIO IMPACT TAB -- */}
            <TabsContent value="impact" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Portfolio Impact Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* AUM & Cash summary */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <ImpactMetricCard
                      label="Current AUM"
                      value={fmtCurrency(STUB_PORTFOLIO_IMPACT.currentAum)}
                    />
                    <ImpactMetricCard
                      label="Trade Amount"
                      value={fmtCurrency(STUB_PORTFOLIO_IMPACT.tradeAmount)}
                      highlight
                    />
                    <ImpactMetricCard
                      label="Cash After"
                      value={fmtCurrency(STUB_PORTFOLIO_IMPACT.cashAfter)}
                      subtext={`${fmtPct(STUB_PORTFOLIO_IMPACT.cashPctAfter)} of AUM`}
                      warn={STUB_PORTFOLIO_IMPACT.cashPctAfter < 2}
                    />
                    <ImpactMetricCard
                      label="Post-Trade AUM"
                      value={fmtCurrency(STUB_PORTFOLIO_IMPACT.postTradeAum)}
                    />
                  </div>

                  <Separator />

                  {/* Top holdings */}
                  <SectionHeader icon={Briefcase} title="Top Holdings (Post-Trade)" />
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Security</TableHead>
                          <TableHead className="text-right">Weight</TableHead>
                          <TableHead className="text-right">Change</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {STUB_PORTFOLIO_IMPACT.topHoldings.map((h: any, i: any) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{h.security}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {fmtPct(h.weight)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono text-xs ${
                                h.change > 0
                                  ? "text-green-600"
                                  : h.change < 0
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {h.change > 0 ? "+" : ""}
                              {fmtPct(h.change)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <Separator />

                  {/* Sector exposure */}
                  <SectionHeader icon={BarChart3} title="Sector Exposure (Post-Trade)" />
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sector</TableHead>
                          <TableHead className="text-right">Weight</TableHead>
                          <TableHead className="text-right">Change</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {STUB_PORTFOLIO_IMPACT.sectorExposure.map((s: any, i: any) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{s.sector}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {fmtPct(s.weight)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono text-xs ${
                                s.change > 0
                                  ? "text-green-600"
                                  : s.change < 0
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {s.change > 0 ? "+" : ""}
                              {fmtPct(s.change)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ----------------------------------------------------------------
            RIGHT PANEL — Chat messages
            ---------------------------------------------------------------- */}
        <div className="w-2/5 flex flex-col">
          {/* Chat header */}
          <div className="border-b px-4 py-2.5 flex items-center gap-2 bg-muted/20">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Committee Discussion</h3>
            <Badge variant="outline" className="ml-auto text-xs">
              {messages.length} messages
            </Badge>
          </div>

          {/* Chat messages area */}
          <ScrollArea className="flex-1 p-4">
            {messagesQuery.isLoading ? (
              <LoadingSkeleton rows={6} />
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No messages yet.</p>
                <p className="text-xs">Start the committee discussion below.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg: ChatMessage) => {
                  const isMe = msg.userId === CURRENT_USER.userId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}
                    >
                      {/* Avatar */}
                      <div
                        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${userColor(
                          msg.userId
                        )}`}
                      >
                        {getInitials(msg.userName)}
                      </div>

                      {/* Bubble */}
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          isMe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {!isMe && (
                          <p className="text-xs font-semibold mb-0.5 opacity-80">
                            {msg.userName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                        <p
                          className={`text-[10px] mt-1 ${
                            isMe ? "text-primary-foreground/60" : "text-muted-foreground"
                          }`}
                        >
                          {fmtTime(msg.sentAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Chat input */}
          <div className="border-t p-3 bg-background">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e: any) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Type a message..."
                className="flex-1"
                disabled={chatMutation.isPending}
              />
              <Button
                size="sm"
                onClick={handleChatSend}
                disabled={!chatInput.trim() || chatMutation.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================
          VOTE PANEL (bottom)
          ================================================================== */}
      <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4">
        <div className="flex items-start gap-6">
          {/* -- Voting progress -- */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Vote className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Committee Voting</h3>
              <Badge
                variant="outline"
                className={RESOLUTION_BADGE[voteData?.resolution ?? "PENDING"]}
              >
                {voteData?.resolution ?? "PENDING"}
              </Badge>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <Progress value={Math.min(approvalProgress, 100)} className="flex-1 h-2.5" />
              <span className="text-sm font-medium whitespace-nowrap">
                {voteData?.summary.approve ?? 0} of {voteData?.requiredApprovals ?? 3} required
                approvals
              </span>
            </div>

            {/* Individual votes */}
            <div className="flex flex-wrap gap-2 mt-1">
              {votesQuery.isLoading ? (
                <Skeleton className="h-8 w-48" />
              ) : (voteData?.votes ?? []).length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No votes cast yet. Cast your vote to begin the authorization process.
                </span>
              ) : (
                (voteData?.votes ?? []).map((v: VoteEntry) => {
                  const participant = presence.find(
                    (p: PresenceEntry) => p.userId === v.userId
                  );
                  const displayName = participant?.userName ?? v.userId;
                  return (
                    <TooltipProvider key={v.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                              DECISION_COLOR[v.decision]
                            }`}
                          >
                            {DECISION_ICON[v.decision]}
                            <span>{displayName}</span>
                            <span className="opacity-60">({v.decision})</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            <span className="font-medium">{displayName}</span> voted{" "}
                            <span className="font-bold">{v.decision}</span>
                          </p>
                          {v.comments && (
                            <p className="text-xs text-muted-foreground mt-1">
                              &quot;{v.comments}&quot;
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {fmtDateTime(v.votedAt)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })
              )}
            </div>

            {/* Summary counters */}
            {voteData && voteData.votes.length > 0 && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3 text-green-600" />
                  {voteData.summary.approve} approve
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsDown className="h-3 w-3 text-red-600" />
                  {voteData.summary.reject} reject
                </span>
                <span className="flex items-center gap-1">
                  <MinusCircle className="h-3 w-3 text-muted-foreground" />
                  {voteData.summary.abstain} abstain
                </span>
                <span>|</span>
                <span>{voteData.summary.total} total votes</span>
              </div>
            )}
          </div>

          <Separator orientation="vertical" className="h-20" />

          {/* -- Vote actions -- */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {myVote
                ? `You voted: ${myVote.decision}. You may change your vote.`
                : "Cast your vote"}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={() => setVoteDialog("APPROVE")}
                disabled={voteData?.resolution !== "PENDING"}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => setVoteDialog("REJECT")}
                disabled={voteData?.resolution !== "PENDING"}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setVoteDialog("ABSTAIN")}
                disabled={voteData?.resolution !== "PENDING"}
              >
                <MinusCircle className="h-3.5 w-3.5" />
                Abstain
              </Button>
            </div>
            {voteData?.resolution !== "PENDING" && (
              <p className="text-xs text-muted-foreground">
                Voting is closed. Resolution:{" "}
                <span className="font-bold">{voteData?.resolution}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================
          VOTE DIALOG
          ================================================================== */}
      <Dialog open={voteDialog !== null} onOpenChange={() => setVoteDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {voteDialog === "APPROVE" && <ThumbsUp className="h-5 w-5 text-green-600" />}
              {voteDialog === "REJECT" && <ThumbsDown className="h-5 w-5 text-red-600" />}
              {voteDialog === "ABSTAIN" && <MinusCircle className="h-5 w-5 text-muted-foreground" />}
              Confirm Vote: {voteDialog}
            </DialogTitle>
            <DialogDescription>
              You are about to cast a <span className="font-bold">{voteDialog}</span> vote for
              order{" "}
              <span className="font-mono">{STUB_ORDER.orderId}</span>. This action will be
              recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Order summary */}
            <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Security</span>
                <span className="font-medium">{STUB_ORDER.securityName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Side / Qty</span>
                <span className="font-medium">
                  {STUB_ORDER.side} {fmtNumber(STUB_ORDER.quantity)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Amount</span>
                <span className="font-medium">{fmtCurrency(STUB_ORDER.estimatedAmount)}</span>
              </div>
            </div>

            {/* Comments */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Comments {voteDialog === "REJECT" ? "(required)" : "(optional)"}
              </label>
              <Textarea
                value={voteComment}
                onChange={(e: any) => setVoteComment(e.target.value)}
                placeholder={
                  voteDialog === "REJECT"
                    ? "Please provide the reason for rejection..."
                    : "Add any comments or conditions..."
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVoteDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleVoteSubmit}
              disabled={
                voteMutation.isPending ||
                (voteDialog === "REJECT" && !voteComment.trim())
              }
              className={
                voteDialog === "APPROVE"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : voteDialog === "REJECT"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : ""
              }
            >
              {voteMutation.isPending ? "Submitting..." : `Confirm ${voteDialog}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Small Sub-components
// =============================================================================

function InfoField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="font-medium text-sm mt-0.5">{value}</div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  color,
  bgColor,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-md p-2 ${bgColor}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-sm font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SuitabilityRow({
  label,
  pass,
  detail,
}: {
  label: string;
  pass: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md border bg-muted/20">
      {pass ? (
        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function RiskMetricCard({
  label,
  current,
  postTrade,
  limit,
  withinLimit,
}: {
  label: string;
  current: string;
  postTrade: string;
  limit?: string;
  withinLimit?: boolean;
}) {
  return (
    <div className="rounded-md border p-3 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-mono">{current}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="text-sm font-mono font-bold">{postTrade}</span>
      </div>
      {limit && (
        <p className="text-xs text-muted-foreground">
          Limit: {limit}{" "}
          {withinLimit !== undefined && (
            <span className={withinLimit ? "text-green-600" : "text-red-600"}>
              ({withinLimit ? "within limit" : "EXCEEDED"})
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function ImpactMetricCard({
  label,
  value,
  subtext,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight
          ? "bg-blue-50 border-blue-200"
          : warn
          ? "bg-amber-50 border-amber-200"
          : "bg-muted/30"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-bold ${
          warn ? "text-amber-700" : highlight ? "text-blue-700" : ""
        }`}
      >
        {value}
      </p>
      {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}
