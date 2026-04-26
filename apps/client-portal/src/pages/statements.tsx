/**
 * Client Portal - Statements Page (Phase 3C — Statement Download)
 *
 * Features:
 * - Period filter (year/quarter)
 * - Statement type filter
 * - Statements list: Period, Type, Status badge, Generated Date, Download button
 * - Real download via GET /statements/:clientId/:id/download
 * - Download button disabled when delivery_status !== 'AVAILABLE'
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
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import {
  FileText,
  Download,
  Calendar,
  Filter,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@ui/components/ui/toast";

// ---- Helpers ----

function getClientId(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).clientId || "CLT-001";
  } catch {}
  return "CLT-001";
}

// ---- Types ----

type DeliveryStatus = "PENDING" | "GENERATING" | "AVAILABLE" | "FAILED";

interface Statement {
  id: number;
  client_id: string;
  portfolio_id: string | null;
  period: string;
  statement_type: string;
  file_reference: string | null;
  file_size_bytes: number | null;
  delivery_status: DeliveryStatus;
  delivery_error: string | null;
  download_count: number;
  last_downloaded_at: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Year/Period Options ----

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [
  { value: "all", label: "All Periods" },
  { value: String(currentYear), label: String(currentYear) },
  { value: String(currentYear - 1), label: String(currentYear - 1) },
  { value: String(currentYear - 2), label: String(currentYear - 2) },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "MONTHLY", label: "Monthly Statement" },
  { value: "QUARTERLY", label: "Quarterly Report" },
  { value: "ANNUAL", label: "Annual Report" },
  { value: "TAX_CERTIFICATE", label: "Tax Certificate" },
];

// ---- Label helpers ----

function getTypeLabel(type: string): string {
  switch (type) {
    case "MONTHLY": return "Monthly Statement";
    case "QUARTERLY": return "Quarterly Report";
    case "ANNUAL": return "Annual Report";
    case "TAX_CERTIFICATE": return "Tax Certificate";
    default: return type;
  }
}

// ---- Badge colors by type ----

function getTypeBadgeClass(type: string): string {
  switch (type) {
    case "QUARTERLY": return "border-blue-200 text-blue-700 bg-blue-50";
    case "ANNUAL": return "border-indigo-200 text-indigo-700 bg-indigo-50";
    case "TAX_CERTIFICATE": return "border-purple-200 text-purple-700 bg-purple-50";
    default: return "border-teal-200 text-teal-700 bg-teal-50";
  }
}

// ---- Delivery status badge ----

function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  switch (status) {
    case "AVAILABLE":
      return (
        <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
          Available
        </Badge>
      );
    case "GENERATING":
      return (
        <Badge variant="outline" className="text-xs border-amber-200 text-amber-700 bg-amber-50">
          Generating
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="outline" className="text-xs border-red-200 text-red-700 bg-red-50">
          Failed
        </Badge>
      );
    case "PENDING":
    default:
      return (
        <Badge variant="outline" className="text-xs border-gray-200 text-gray-600 bg-gray-50">
          Pending
        </Badge>
      );
  }
}

// ---- Component ----

export default function StatementsPage() {
  const clientId = getClientId();
  const { toast } = useToast();
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Fetch statements
  const { data, isLoading, isError } = useQuery<{ data: Statement[] }>({
    queryKey: ["client-portal", "statements", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/statements/${clientId}`)),
  });

  const allStatements: Statement[] = data?.data ?? [];

  // Apply filters
  const filteredStatements = allStatements.filter((s) => {
    if (yearFilter !== "all" && !s.period.startsWith(yearFilter)) return false;
    if (typeFilter !== "all" && s.statement_type !== typeFilter) return false;
    return true;
  });

  const handleDownload = async (statement: Statement) => {
    if (statement.delivery_status !== "AVAILABLE") return;
    setDownloadingId(statement.id);
    try {
      const response = await apiRequest(
        "GET",
        apiUrl(`/api/v1/client-portal/statements/${clientId}/${statement.id}/download`),
      );

      // 202 — statement not yet ready
      if (response && response.status === "NOT_AVAILABLE") {
        toast({
          title: "Statement Not Ready",
          description: "Statement is being prepared. You will be notified when it is ready.",
        });
        return;
      }

      // Success — trigger browser download
      const blob = new Blob([response], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement-${statement.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: `Downloading ${getTypeLabel(statement.statement_type)} for ${statement.period}.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Download Failed",
        description: "Unable to download statement. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-white">Statements</h1>
        <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 mt-1">
          View and download your account statements and reports
        </p>
      </div>

      {/* Filters */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
              <Filter className="h-4 w-4" />
              <span className="font-medium">Filters:</span>
            </div>

            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[160px] border-border" aria-label="Filter by period">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[200px] border-border" aria-label="Filter by statement type">
                <FileText className="h-4 w-4 mr-2 text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="text-xs text-muted-foreground ml-auto">
              {filteredStatements.length} statement
              {filteredStatements.length !== 1 ? "s" : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Statements List */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
            <CardTitle className="text-sm sm:text-base text-foreground dark:text-gray-100">
              Available Statements
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-destructive">
              <AlertCircle className="h-6 w-6" />
              <p className="text-sm">Failed to load statements. Please try again later.</p>
            </div>
          ) : filteredStatements.length > 0 ? (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border dark:border-gray-600 bg-muted/80 dark:bg-gray-700/50">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Period
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Generated
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStatements.map((stmt) => {
                      const canDownload = stmt.delivery_status === "AVAILABLE";
                      const isDownloading = downloadingId === stmt.id;
                      return (
                        <tr
                          key={stmt.id}
                          className="border-b border-border dark:border-gray-700 last:border-0 hover:bg-muted/50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span className="font-medium text-foreground dark:text-gray-100">
                              {stmt.period}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getTypeBadgeClass(stmt.statement_type)}`}
                            >
                              {getTypeLabel(stmt.statement_type)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <DeliveryStatusBadge status={stmt.delivery_status} />
                          </td>
                          <td className="py-3 px-4 text-muted-foreground dark:text-gray-400">
                            {stmt.generated_at
                              ? new Date(stmt.generated_at).toLocaleDateString("en-PH", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!canDownload || isDownloading}
                              aria-label={`Download ${getTypeLabel(stmt.statement_type)} for ${stmt.period}`}
                              className="text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => handleDownload(stmt)}
                            >
                              <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                              {isDownloading ? "Downloading…" : "Download"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border dark:divide-gray-700">
                {filteredStatements.map((stmt) => {
                  const canDownload = stmt.delivery_status === "AVAILABLE";
                  const isDownloading = downloadingId === stmt.id;
                  return (
                    <div key={stmt.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-4 w-4 text-muted-foreground dark:text-gray-400 shrink-0" />
                            <span className="font-medium text-foreground dark:text-gray-100">
                              {stmt.period}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getTypeBadgeClass(stmt.statement_type)}`}
                            >
                              {getTypeLabel(stmt.statement_type)}
                            </Badge>
                            <DeliveryStatusBadge status={stmt.delivery_status} />
                          </div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400">
                            {stmt.generated_at
                              ? `Generated ${new Date(stmt.generated_at).toLocaleDateString("en-PH", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}`
                              : "Not yet generated"}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canDownload || isDownloading}
                          aria-label={`Download ${getTypeLabel(stmt.statement_type)} for ${stmt.period}`}
                          className="shrink-0 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleDownload(stmt)}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No statements found matching your filters
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
