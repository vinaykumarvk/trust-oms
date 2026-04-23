/**
 * Client Portal - Service Requests List Page
 *
 * Features:
 * - Header with "+ New Request" button
 * - Search bar (Request ID / Priority)
 * - Status tab filters: All | Approved | In Progress | Rejected
 * - Desktop: table view; Mobile: card-based view
 * - Each row/card: Request ID, SR Type, Priority badge, Request Date, Closure Date, Request Age, Status badge
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import { Input } from "@ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import {
  ClipboardList,
  Plus,
  Search,
  Clock,
  ChevronRight,
} from "lucide-react";

const API = "/api/v1/client-portal";

function getClientId(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).clientId || "CLT-001";
  } catch {}
  return "CLT-001";
}

function getToken(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).token || "";
  } catch {}
  return "";
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders() }).then((r) => r.json());
}

const statusColors: Record<string, string> = {
  NEW: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  READY_FOR_TELLER: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  INCOMPLETE: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  CLOSED: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
};

const priorityColors: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  LOW: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

interface ServiceRequest {
  id: number;
  request_id: string;
  client_id: string;
  sr_type: string;
  sr_details: string | null;
  priority: string;
  sr_status: string;
  request_date: string;
  closure_date: string | null;
  actual_closure_date: string | null;
  request_age: number;
  remarks: string | null;
}

export default function ServiceRequestsPage() {
  const navigate = useNavigate();
  const clientId = getClientId();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const statusFilterMap: Record<string, string> = {
    all: "",
    approved: "APPROVED",
    in_progress: "READY_FOR_TELLER",
    rejected: "REJECTED",
    completed: "COMPLETED",
  };
  const statusParam = statusFilterMap[activeTab] || "";

  const { data: result, isPending } = useQuery<{
    data: ServiceRequest[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["service-requests", clientId, statusParam, searchQuery, page, pageSize],
    queryFn: () =>
      fetcher(
        `${API}/service-requests/${clientId}?status=${statusParam}&search=${encodeURIComponent(searchQuery)}&page=${page}&pageSize=${pageSize}`,
      ),
    refetchInterval: 15000,
  });

  const requests = result?.data ?? [];
  const total = result?.total ?? 0;

  function formatDate(d: string | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString();
  }

  function renderTable(data: ServiceRequest[]) {
    if (isPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Request Date</TableHead>
                <TableHead>SLA Date</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
          <p>No service requests found</p>
          <Button size="sm" onClick={() => navigate("/service-requests/new")}>
            <Plus className="mr-2 h-4 w-4" /> Create Request
          </Button>
        </div>
      );
    }

    return (
      <>
        {/* Desktop table */}
        <div className="hidden md:block rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Request Date</TableHead>
                <TableHead>SLA Date</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((sr) => (
                <TableRow
                  key={sr.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/service-requests/${sr.id}`)}
                >
                  <TableCell className="font-mono text-sm">{sr.request_id}</TableCell>
                  <TableCell>{sr.sr_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <Badge className={priorityColors[sr.priority] || ""} variant="secondary">
                      {sr.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(sr.request_date)}</TableCell>
                  <TableCell>{formatDate(sr.closure_date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {sr.request_age}d
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[sr.sr_status] || ""} variant="secondary">
                      {sr.sr_status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {data.map((sr) => (
            <Card
              key={sr.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/service-requests/${sr.id}`)}
            >
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium">{sr.request_id}</span>
                  <Badge className={statusColors[sr.sr_status] || ""} variant="secondary">
                    {sr.sr_status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {sr.sr_type.replace(/_/g, " ")}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge className={priorityColors[sr.priority] || ""} variant="secondary">
                      {sr.priority}
                    </Badge>
                    <span>{formatDate(sr.request_date)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {sr.request_age}d
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Service Requests</h1>
          <p className="text-muted-foreground">
            Track and manage your service requests
          </p>
        </div>
        <Button onClick={() => navigate("/service-requests/new")}>
          <Plus className="mr-2 h-4 w-4" /> New Request
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by Request ID or type..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
        />
      </div>

      {/* Tabs & List */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="mt-4">
          {renderTable(requests)}
          {total > 0 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-16 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-sm font-medium">Page {page} of {Math.ceil(total / pageSize)}</span>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
