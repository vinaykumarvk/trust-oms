/**
 * Order Explorer — Phase 1B (BRD Screen #29, Gap #2)
 *
 * Back-office read-only view of all orders, filterable by
 * Client, Account/Portfolio, Account Officer, Branch, and Trader ID.
 * Chronological TRN display with date-time stamps.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { Card, CardContent } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/ui/table';
import { Skeleton } from '@ui/components/ui/skeleton';
import { FileSearch, Search, Download } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Order {
  order_id: string;
  order_no: string | null;
  transaction_ref_no: string | null;
  portfolio_id: string | null;
  side: string | null;
  type: string | null;
  quantity: string | null;
  limit_price: string | null;
  currency: string | null;
  order_status: string | null;
  authorization_tier: string | null;
  time_in_force: string | null;
  trader_id: number | null;
  payment_mode: string | null;
  disposal_method: string | null;
  created_at: string;
  created_by: string | null;
}

interface OrderListResponse {
  data: Order[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusColors: Record<string, string> = {
  DRAFT: 'bg-muted text-foreground',
  PENDING_AUTH: 'bg-yellow-100 text-yellow-800',
  AUTHORIZED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  SETTLED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-muted text-muted-foreground',
};

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OrderExplorer() {
  const [search, setSearch] = useState('');
  const [portfolioFilter, setPortfolioFilter] = useState('');
  const [traderFilter, setTraderFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const ordersQuery = useQuery<OrderListResponse>({
    queryKey: ['order-explorer', { search, portfolioFilter, traderFilter, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search) params.set('search', search);
      if (portfolioFilter) params.set('portfolio_id', portfolioFilter);
      if (traderFilter) params.set('trader_id', traderFilter);
      return apiRequest('GET', `/api/v1/orders?${params.toString()}`);
    },
  });

  const orders = ordersQuery.data?.data ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileSearch className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order Explorer</h1>
            <p className="text-sm text-muted-foreground">
              {total} order{total !== 1 ? 's' : ''} found
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filter Panel */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Search (TRN / Order ID)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Portfolio ID</Label>
              <Input
                placeholder="Filter by portfolio"
                value={portfolioFilter}
                onChange={(e) => {
                  setPortfolioFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trader ID</Label>
              <Input
                placeholder="Filter by trader"
                value={traderFilter}
                onChange={(e) => {
                  setTraderFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setPortfolioFilter('');
                  setTraderFilter('');
                  setPage(1);
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TRN</TableHead>
              <TableHead>Date/Time</TableHead>
              <TableHead>Portfolio</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>TIF</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Trader</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordersQuery.isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="text-center text-muted-foreground py-8"
                >
                  No orders match your filters
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.order_id}>
                  <TableCell className="font-mono text-xs">
                    {order.transaction_ref_no ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(order.created_at)}
                  </TableCell>
                  <TableCell>{order.portfolio_id ?? '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={order.side === 'BUY' ? 'default' : 'destructive'}
                    >
                      {order.side ?? '-'}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.type ?? '-'}</TableCell>
                  <TableCell>
                    {order.quantity
                      ? parseFloat(order.quantity).toLocaleString()
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {order.limit_price
                      ? `${parseFloat(order.limit_price).toLocaleString()} ${order.currency ?? ''}`
                      : '-'}
                  </TableCell>
                  <TableCell>{order.time_in_force ?? 'DAY'}</TableCell>
                  <TableCell className="text-xs">
                    {order.payment_mode?.replace(/_/g, ' ') ?? '-'}
                  </TableCell>
                  <TableCell>{order.trader_id ?? '-'}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        statusColors[order.order_status ?? ''] ?? 'bg-muted'
                      }
                    >
                      {order.order_status?.replace(/_/g, ' ') ?? '-'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
