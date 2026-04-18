/**
 * Order Detail — Phase 1B
 * Full order view with timeline, authorization chain, and action buttons.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Separator } from '@ui/components/ui/separator';
import { Skeleton } from '@ui/components/ui/skeleton';
import { ArrowLeft, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { apiUrl } from '@ui/lib/api-url';

interface Order {
  order_id: string;
  order_no: string | null;
  transaction_ref_no: string | null;
  portfolio_id: string | null;
  security_id: number | null;
  side: string | null;
  type: string | null;
  quantity: string | null;
  limit_price: string | null;
  stop_price: string | null;
  currency: string | null;
  value_date: string | null;
  order_status: string | null;
  authorization_tier: string | null;
  time_in_force: string | null;
  payment_mode: string | null;
  disposal_method: string | null;
  trader_id: number | null;
  reason_code: string | null;
  client_reference: string | null;
  created_at: string;
  created_by: string | null;
  suitability_check_result: unknown;
}

interface Authorization {
  id: number;
  approver_id: number | null;
  approver_role: string | null;
  decision: string | null;
  comment: string | null;
  decided_at: string | null;
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const orderQuery = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/v1/orders/${id}`));
      if (!res.ok) throw new Error('Failed to fetch order');
      return res.json();
    },
    enabled: !!id,
  });

  const authsQuery = useQuery<{ data: Authorization[] }>({
    queryKey: ['order-auths', id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/v1/orders/${id}/authorizations`));
      if (!res.ok) throw new Error('Failed to fetch authorizations');
      return res.json();
    },
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl(`/api/v1/orders/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to cancel order');
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['order', id] }); },
  });

  const revertMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl(`/api/v1/orders/${id}/revert`), { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? 'Failed to revert order');
      }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['order', id] }); },
  });

  if (orderQuery.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  const order = orderQuery.data;
  if (!order) return <p className="text-muted-foreground">Order not found</p>;

  const auths = authsQuery.data?.data ?? [];
  const grossAmount = order.quantity && order.limit_price ? parseFloat(order.quantity) * parseFloat(order.limit_price) : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order Detail</h1>
            <p className="text-sm text-muted-foreground font-mono">{order.transaction_ref_no ?? order.order_id}</p>
          </div>
          <Badge className="text-sm">{order.order_status?.replace(/_/g, ' ')}</Badge>
        </div>
        <div className="flex gap-2">
          {['DRAFT', 'PENDING_AUTH'].includes(order.order_status ?? '') && (
            <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              Cancel Order
            </Button>
          )}
          {order.order_status === 'CANCELLED' && (
            <Button variant="outline" size="sm" onClick={() => revertMutation.mutate()} disabled={revertMutation.isPending}>
              <RotateCcw className="h-4 w-4 mr-1" /> Revert
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Order Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Portfolio</span><span>{order.portfolio_id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Security</span><span>{order.security_id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Side</span><Badge variant={order.side === 'BUY' ? 'default' : 'destructive'}>{order.side}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{order.type}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">TIF</span><span>{order.time_in_force ?? 'DAY'}</span></div>
            <Separator />
            <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{order.quantity ? parseFloat(order.quantity).toLocaleString() : '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>{order.limit_price ? `${parseFloat(order.limit_price).toLocaleString()} ${order.currency}` : '-'}</span></div>
            {grossAmount && <div className="flex justify-between font-semibold"><span>Gross Amount</span><span>{grossAmount.toLocaleString()} {order.currency}</span></div>}
            <Separator />
            <div className="flex justify-between"><span className="text-muted-foreground">Payment Mode</span><span>{order.payment_mode?.replace(/_/g, ' ') ?? '-'}</span></div>
            {order.disposal_method && <div className="flex justify-between"><span className="text-muted-foreground">Disposal</span><span>{order.disposal_method}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Trader ID</span><span>{order.trader_id ?? '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Auth Tier</span><span>{order.authorization_tier?.replace(/_/g, ' ')}</span></div>
          </CardContent>
        </Card>

        {/* Authorization Chain */}
        <Card>
          <CardHeader><CardTitle className="text-base">Authorization Chain</CardTitle></CardHeader>
          <CardContent>
            {auths.length === 0 ? (
              <p className="text-sm text-muted-foreground">No authorizations yet.</p>
            ) : (
              <div className="space-y-3">
                {auths.map(auth => (
                  <div key={auth.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className={`mt-0.5 ${auth.decision === 'APPROVED' ? 'text-green-600' : 'text-red-600'}`}>
                      {auth.decision === 'APPROVED' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{auth.decision} by {auth.approver_role}</div>
                      {auth.comment && <p className="text-muted-foreground mt-1">{auth.comment}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {auth.decided_at ? new Date(auth.decided_at).toLocaleString() : '-'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error displays */}
      {revertMutation.isError && (
        <p className="text-sm text-red-600">{revertMutation.error?.message}</p>
      )}
    </div>
  );
}
