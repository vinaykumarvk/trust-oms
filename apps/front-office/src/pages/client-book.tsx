/**
 * Client Book — Phase 1C
 *
 * Shows the RM's book of business with searchable, sortable client list.
 *
 * Features:
 *   - Search bar for filtering clients by name/ID
 *   - Sortable columns
 *   - KYC status badges (green=VERIFIED, yellow=PENDING, red=EXPIRED)
 *   - Risk profile badges (color-coded)
 *   - Pagination
 *   - Click row to view client detail (placeholder)
 *
 * Data source: GET /api/v1/clients?search=&page=&pageSize=
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Users, Search, ArrowUpDown } from "lucide-react";
import { apiUrl } from "@ui/lib/api-url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Client {
  client_id: string;
  legal_name: string | null;
  type: string | null;
  tin: string | null;
  risk_profile: string | null;
  client_status: string | null;
  created_at: string;
  updated_at: string;
}

interface ClientListResponse {
  data: Client[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

const kycStatusColors: Record<string, string> = {
  VERIFIED: "bg-green-100 text-green-800",
  ACTIVE: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  EXPIRED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-red-100 text-red-800",
};

const riskProfileColors: Record<string, string> = {
  CONSERVATIVE: "bg-blue-100 text-blue-800",
  MODERATELY_CONSERVATIVE: "bg-cyan-100 text-cyan-800",
  MODERATE: "bg-yellow-100 text-yellow-800",
  MODERATELY_AGGRESSIVE: "bg-orange-100 text-orange-800",
  AGGRESSIVE: "bg-red-100 text-red-800",
};

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// ---------------------------------------------------------------------------
// Sortable Column Header
// ---------------------------------------------------------------------------

interface SortableHeaderProps {
  label: string;
  field: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: SortableHeaderProps) {
  const isActive = sortBy === field;
  return (
    <TableHead>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(field)}
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}
        />
        {isActive && (
          <span className="text-xs text-muted-foreground">
            {sortOrder === "asc" ? "asc" : "desc"}
          </span>
        )}
      </button>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ClientBook() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("legal_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const clientsQuery = useQuery<ClientListResponse>({
    queryKey: ["clients", { search, page, sortBy, sortOrder }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (search) params.set("search", search);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortOrder) params.set("sortOrder", sortOrder);
      const res = await fetch(apiUrl(`/api/v1/clients?${params}`));
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const clients = clientsQuery.data?.data ?? [];
  const total = clientsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleRowClick = (client: Client) => {
    console.log("Client selected:", client.client_id, client.legal_name);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Book</h1>
          <p className="text-sm text-muted-foreground">
            {total} client{total !== 1 ? "s" : ""} in your book
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by client name, ID, or type..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* Client Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    label="Client ID"
                    field="client_id"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Legal Name"
                    field="legal_name"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Type"
                    field="type"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Risk Profile"
                    field="risk_profile"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <TableHead>KYC Status</TableHead>
                  <TableHead>Status</TableHead>
                  <SortableHeader
                    label="Last Updated"
                    field="updated_at"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientsQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : clients.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-8"
                    >
                      {search
                        ? "No clients found matching your search"
                        : "No clients in your book"}
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow
                      key={client.client_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(client)}
                    >
                      <TableCell className="font-mono text-xs">
                        {client.client_id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {client.legal_name ?? "-"}
                      </TableCell>
                      <TableCell>{client.type ?? "-"}</TableCell>
                      <TableCell>
                        {client.risk_profile ? (
                          <Badge
                            className={
                              riskProfileColors[client.risk_profile] ??
                              "bg-muted text-foreground"
                            }
                          >
                            {client.risk_profile.replace(/_/g, " ")}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.client_status ? (
                          <Badge
                            className={
                              kycStatusColors[client.client_status] ??
                              "bg-muted text-foreground"
                            }
                          >
                            {client.client_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.client_status ? (
                          <Badge
                            variant={
                              client.client_status === "ACTIVE"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {client.client_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {client.updated_at
                          ? new Date(client.updated_at).toLocaleDateString(
                              "en-PH",
                            )
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
