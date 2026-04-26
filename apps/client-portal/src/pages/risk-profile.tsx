/**
 * Client Portal - Risk Profile Page
 *
 * Features:
 * - View current risk profile (category, score, assessment date)
 * - View recommended asset allocation for the category
 * - View assessment history
 * - Deviation status with supervisor approval indicator
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
import {
  Compass,
  ShieldCheck,
  AlertTriangle,
  Clock,
  PieChart,
} from "lucide-react";

// ---- Helpers ----

function getClientId(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).clientId || "CLT-001";
  } catch {}
  return "CLT-001";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  CONSERVATIVE:
    "border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30",
  MODERATELY_CONSERVATIVE:
    "border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30",
  MODERATE:
    "border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30",
  MODERATELY_AGGRESSIVE:
    "border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30",
  AGGRESSIVE:
    "border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30",
};

function categoryBadgeClass(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.MODERATE;
}

const ALLOCATION_COLORS = [
  "bg-teal-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-emerald-500",
  "bg-indigo-500",
];

// ---- Types ----

interface RiskProfile {
  id: number;
  customer_id: string;
  questionnaire_id: number;
  raw_score: number;
  normalized_score: number | null;
  risk_category: string;
  is_deviated: boolean;
  overridden_category: string | null;
  deviation_reason: string | null;
  supervisor_approved: boolean;
  supervisor_approved_at: string | null;
  assessed_by: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
}

interface AssessmentHistory {
  id: number;
  risk_category: string;
  raw_score: number;
  is_active: boolean;
  is_deviated: boolean;
  created_at: string;
  valid_from: string;
  valid_until: string | null;
}

interface AllocationLine {
  asset_class: string;
  target_pct: number;
  min_pct: number;
  max_pct: number;
}

// ---- Component ----

export default function RiskProfilePage() {
  const clientId = getClientId();

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["client-portal", "risk-profile", clientId],
    queryFn: () =>
      apiRequest(
        "GET",
        apiUrl(`/api/v1/client-portal/risk-profile/${clientId}`),
      ),
  });

  const profile: RiskProfile | null = profileData?.profile ?? null;
  const allocation: AllocationLine[] = profileData?.allocation ?? [];
  const history: AssessmentHistory[] = profileData?.history ?? [];

  const displayCategory =
    profile?.overridden_category || profile?.risk_category || "—";

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-white">
          Risk Profile
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 mt-1">
          View your investment risk profile and recommended asset allocation
        </p>
      </div>

      {profileLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        </div>
      ) : !profile ? (
        <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
          <CardContent className="py-12 text-center">
            <Compass className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No risk profile found. Please contact your Relationship Manager to
              schedule a risk assessment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Current Profile Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs text-muted-foreground dark:text-gray-400 font-medium">
                  Risk Category
                </p>
                <div className="mt-2">
                  <Badge
                    variant="outline"
                    className={`text-sm font-semibold ${categoryBadgeClass(displayCategory)}`}
                  >
                    {displayCategory.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs text-muted-foreground dark:text-gray-400 font-medium">
                  Risk Score
                </p>
                <p className="text-lg sm:text-xl font-bold text-foreground dark:text-white mt-1">
                  {profile.normalized_score ?? profile.raw_score}
                </p>
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  Raw: {profile.raw_score}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs text-muted-foreground dark:text-gray-400 font-medium">
                  Assessment Date
                </p>
                <p className="text-lg sm:text-xl font-bold text-foreground dark:text-white mt-1">
                  {formatDate(profile.valid_from)}
                </p>
                {profile.valid_until && (
                  <p className="text-xs text-muted-foreground dark:text-gray-400">
                    Valid until {formatDate(profile.valid_until)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Deviation Notice */}
          {profile.is_deviated && (
            <Card
              className={`border ${
                profile.supervisor_approved
                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20"
                  : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20"
              }`}
            >
              <CardContent className="p-3 sm:p-4 flex items-start gap-3">
                {profile.supervisor_approved ? (
                  <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground dark:text-gray-100">
                    Profile Deviation
                    {profile.supervisor_approved ? " — Approved" : " — Pending Approval"}
                  </p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                    Your risk category was overridden from{" "}
                    <span className="font-medium">
                      {profile.risk_category.replace(/_/g, " ")}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium">
                      {(profile.overridden_category || "").replace(/_/g, " ")}
                    </span>
                    .
                    {profile.deviation_reason &&
                      ` Reason: ${profile.deviation_reason}`}
                  </p>
                  {profile.supervisor_approved && profile.supervisor_approved_at && (
                    <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                      Approved on {formatDate(profile.supervisor_approved_at)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommended Asset Allocation */}
          {allocation.length > 0 && (
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardHeader className="pb-3 px-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                  <CardTitle className="text-sm sm:text-base text-foreground dark:text-gray-100">
                    Recommended Asset Allocation
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {/* Visual bar */}
                <div className="flex h-8 rounded-full overflow-hidden mb-4">
                  {allocation.map((a, i) => (
                    <div
                      key={a.asset_class}
                      className={`${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} transition-all`}
                      style={{ width: `${Math.max(a.target_pct, 2)}%` }}
                      title={`${a.asset_class}: ${a.target_pct}%`}
                    />
                  ))}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border dark:border-gray-600">
                        <th className="text-left py-2 text-xs font-medium text-muted-foreground dark:text-gray-400">
                          Asset Class
                        </th>
                        <th className="text-right py-2 text-xs font-medium text-muted-foreground dark:text-gray-400">
                          Target %
                        </th>
                        <th className="text-right py-2 text-xs font-medium text-muted-foreground dark:text-gray-400">
                          Min %
                        </th>
                        <th className="text-right py-2 text-xs font-medium text-muted-foreground dark:text-gray-400">
                          Max %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocation.map((a, i) => (
                        <tr
                          key={a.asset_class}
                          className="border-b border-border/50 dark:border-gray-700/50 last:border-0"
                        >
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-3 w-3 rounded-sm shrink-0 ${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]}`}
                              />
                              <span className="text-foreground dark:text-gray-200">
                                {a.asset_class}
                              </span>
                            </div>
                          </td>
                          <td className="text-right py-2.5 text-foreground dark:text-gray-200 font-medium">
                            {a.target_pct.toFixed(1)}%
                          </td>
                          <td className="text-right py-2.5 text-muted-foreground dark:text-gray-400">
                            {a.min_pct.toFixed(1)}%
                          </td>
                          <td className="text-right py-2.5 text-muted-foreground dark:text-gray-400">
                            {a.max_pct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assessment History */}
          {history.length > 1 && (
            <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
              <CardHeader className="pb-3 px-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                  <CardTitle className="text-sm sm:text-base text-foreground dark:text-gray-100">
                    Assessment History
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-0 sm:px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b border-border dark:border-gray-600 bg-muted/80 dark:bg-gray-700/50">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Date
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Category
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Score
                        </th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr
                          key={h.id}
                          className="border-b border-border dark:border-gray-700 last:border-0 hover:bg-muted/50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="py-3 px-4 text-foreground dark:text-gray-200">
                            {formatDate(h.valid_from)}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant="outline"
                              className={`text-xs ${categoryBadgeClass(h.risk_category)}`}
                            >
                              {h.risk_category.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-4 text-foreground dark:text-gray-200 tabular-nums">
                            {h.raw_score}
                          </td>
                          <td className="text-center py-3 px-4">
                            {h.is_active ? (
                              <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs">
                                Active
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs text-muted-foreground"
                              >
                                Expired
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
