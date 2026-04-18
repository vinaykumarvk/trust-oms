/**
 * Client Portal - Statements Page (Phase 5C)
 *
 * Features:
 * - Period filter (year/quarter)
 * - Statements list: Period, Type, Generated Date, Download button
 * - Download button is a stub (shows alert)
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

interface Statement {
  id: string;
  period: string;
  type: string;
  generatedAt: string;
  downloadUrl: string;
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
  { value: "Monthly Statement", label: "Monthly Statement" },
  { value: "Quarterly Report", label: "Quarterly Report" },
  { value: "Tax Certificate", label: "Tax Certificate" },
];

// ---- Badge colors by type ----

function getTypeBadgeClass(type: string): string {
  switch (type) {
    case "Quarterly Report":
      return "border-blue-200 text-blue-700 bg-blue-50";
    case "Tax Certificate":
      return "border-purple-200 text-purple-700 bg-purple-50";
    default:
      return "border-teal-200 text-teal-700 bg-teal-50";
  }
}

// ---- Component ----

export default function StatementsPage() {
  const clientId = getClientId();
  const { toast } = useToast();
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Fetch statements
  const { data, isLoading } = useQuery({
    queryKey: ["client-portal", "statements", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/statements/${clientId}`)),
  });

  const allStatements: Statement[] = data?.statements ?? [];

  // Apply filters
  const filteredStatements = allStatements.filter((s) => {
    if (yearFilter !== "all" && !s.period.startsWith(yearFilter)) return false;
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    return true;
  });

  const handleDownload = (statement: Statement) => {
    toast({
      title: "Download Started",
      description: `Downloading ${statement.type} for ${statement.period}. This feature will be available in a future release.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Statements</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and download your account statements and reports
        </p>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span className="font-medium">Filters:</span>
            </div>

            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[160px] border-border">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
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
              <SelectTrigger className="w-[200px] border-border">
                <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
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
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base text-foreground">
              Available Statements
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            </div>
          ) : filteredStatements.length > 0 ? (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto -mx-6">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/80">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Period
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Type
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
                    {filteredStatements.map((stmt) => (
                      <tr
                        key={stmt.id}
                        className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="font-medium text-foreground">
                            {stmt.period}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`text-xs ${getTypeBadgeClass(stmt.type)}`}
                          >
                            {stmt.type}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(stmt.generatedAt).toLocaleDateString(
                            "en-PH",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-teal-700 border-teal-200 hover:bg-teal-50"
                            onClick={() => handleDownload(stmt)}
                          >
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border">
                {filteredStatements.map((stmt) => (
                  <div key={stmt.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground">
                            {stmt.period}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs mb-1 ${getTypeBadgeClass(stmt.type)}`}
                        >
                          {stmt.type}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          Generated{" "}
                          {new Date(stmt.generatedAt).toLocaleDateString(
                            "en-PH",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-teal-700 border-teal-200 hover:bg-teal-50"
                        onClick={() => handleDownload(stmt)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
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
