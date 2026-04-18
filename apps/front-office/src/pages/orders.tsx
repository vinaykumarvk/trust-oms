/**
 * Orders List — Phase 1B
 * Filterable order table showing all orders by status, portfolio, date.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/components/ui/table';
import { Skeleton } from '@ui/components/ui/skeleton';
import { ListOrdered, Search, Plus, Eye } from 'lucide-react';
import { apiUrl } from '@ui/lib/api-url';

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
  created_at: string;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PENDING_AUTH: 'bg-yellow-100 text-yellow-800',
  AUTHORIZED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  AGGREGATED: 'bg-purple-100 text-purple-800',
  PLACED: 'bg-indigo-100 text-indigo-800',
  PARTIALLY_FILLED: 'bg-orange-100 text-orange-800',
  FILLED: 'bg-teal-100 text-teal-800',
  CONFIRMED: 'bg-cyan-100 text-cyan-800',
  SETTLED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REVERSED: 'bg-red-100 text-red-500',
};

export default function Orders() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const ordersQuery = useQuery<{ data: Order[]; total: number }>({
    queryKey: ['orders', { search, status: statusFilter, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '25');
      if (search) params.set('search', search);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(apiUrl(`/api/v1/orders?${params}`));
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
  });

  const orders = ordersQuery.data?.data ?? [];
  const total = ordersQuery.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ListOrdered className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
            <p className="text-sm text-muted-foreground">{total} total orders</p>
          </div>
        </div>
        <Button onClick={() => navigate('/orders/new')}>
          <Plus className="h-4 w-4 mr-2" /> New Order
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search orders..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PENDING_AUTH">Pending Auth</SelectItem>
            <SelectItem value="AUTHORIZED">Authorized</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="SETTLED">Settled</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TRN</TableHead>
              <TableHead>Portfolio</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>TIF</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordersQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">No orders found</TableCell>
              </TableRow>
            ) : (
              orders.map(order => (
                <TableRow key={order.order_id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/orders/${order.order_id}`)}>
                  <TableCell className="font-mono text-xs">{order.transaction_ref_no ?? order.order_id.slice(0, 12)}</TableCell>
                  <TableCell>{order.portfolio_id}</TableCell>
                  <TableCell><Badge variant={order.side === 'BUY' ? 'default' : 'destructive'}>{order.side}</Badge></TableCell>
                  <TableCell>{order.type}</TableCell>
                  <TableCell>{order.quantity ? parseFloat(order.quantity).toLocaleString() : '-'}</TableCell>
                  <TableCell>{order.limit_price ? `${parseFloat(order.limit_price).toLocaleString()} ${order.currency}` : '-'}</TableCell>
                  <TableCell>{order.time_in_force ?? 'DAY'}</TableCell>
                  <TableCell><Badge className={statusColors[order.order_status ?? ''] ?? 'bg-gray-100'}>{order.order_status?.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="text-xs">{order.authorization_tier?.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-xs">{new Date(order.created_at).toLocaleDateString()}</TableCell>
                  <TableCell><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 25 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 25)}</span>
          <Button variant="outline" size="sm" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
