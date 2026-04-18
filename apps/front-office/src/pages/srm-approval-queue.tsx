/**
 * SRM Approval Queue — Phase 1B
 * Shows orders pending authorization grouped by tier.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/components/ui/table';
import { Textarea } from '@ui/components/ui/textarea';
import { Skeleton } from '@ui/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/components/ui/dialog';
import { CheckCircle, XCircle, Shield, Eye } from 'lucide-react';
import { apiUrl } from '@ui/lib/api-url';

interface PendingOrder {
  order_id: string;
  transaction_ref_no: string | null;
  portfolio_id: string | null;
  side: string | null;
  type: string | null;
  quantity: string | null;
  limit_price: string | null;
  currency: string | null;
  authorization_tier: string | null;
  created_at: string;
  created_by: string | null;
}

export default function SRMApprovalQueue() {
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [comment, setComment] = useState('');
  const [dialogAction, setDialogAction] = useState<'approve' | 'reject' | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const pendingQuery = useQuery<{ data: PendingOrder[] }>({
    queryKey: ['orders', 'pending-auth'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/v1/orders?status=PENDING_AUTH&pageSize=100'));
      if (!res.ok) throw new Error('Failed to fetch pending orders');
      return res.json();
    },
  });

  const authorizeMutation = useMutation({
    mutationFn: async ({ orderId, decision }: { orderId: string; decision: 'APPROVED' | 'REJECTED' }) => {
      const res = await fetch(apiUrl(`/api/v1/orders/${orderId}/authorize`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approver_id: 1, // TODO: get from auth context
          approver_role: 'SRM',
          decision,
          comment,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? 'Authorization failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setDialogAction(null);
      setSelectedOrder(null);
      setComment('');
    },
  });

  const orders = pendingQuery.data?.data ?? [];
  const twoEye = orders.filter(o => o.authorization_tier === 'TWO_EYES');
  const fourEye = orders.filter(o => o.authorization_tier === 'FOUR_EYES');
  const sixEye = orders.filter(o => o.authorization_tier === 'SIX_EYES');

  const renderOrderTable = (orderList: PendingOrder[]) => (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>TRN</TableHead>
            <TableHead>Portfolio</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orderList.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No orders pending</TableCell></TableRow>
          ) : (
            orderList.map(order => {
              const amount = order.quantity && order.limit_price ? parseFloat(order.quantity) * parseFloat(order.limit_price) : 0;
              return (
                <TableRow key={order.order_id}>
                  <TableCell className="font-mono text-xs">{order.transaction_ref_no ?? order.order_id.slice(0, 12)}</TableCell>
                  <TableCell>{order.portfolio_id}</TableCell>
                  <TableCell><Badge variant={order.side === 'BUY' ? 'default' : 'destructive'}>{order.side}</Badge></TableCell>
                  <TableCell>{order.quantity ? parseFloat(order.quantity).toLocaleString() : '-'}</TableCell>
                  <TableCell>{order.limit_price ? `${parseFloat(order.limit_price).toLocaleString()}` : '-'}</TableCell>
                  <TableCell className="font-medium">{amount > 0 ? `${amount.toLocaleString()} ${order.currency}` : '-'}</TableCell>
                  <TableCell className="text-xs">{new Date(order.created_at).toLocaleString()}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/orders/${order.order_id}`)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-green-600" onClick={() => { setSelectedOrder(order); setDialogAction('approve'); }}>
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { setSelectedOrder(order); setDialogAction('reject'); }}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approval Queue</h1>
          <p className="text-sm text-muted-foreground">{orders.length} orders pending authorization</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">2-Eyes (&#8804; PHP 50M)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{twoEye.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">4-Eyes (50M-500M)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{fourEye.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">6-Eyes (&gt; 500M)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{sixEye.length}</div></CardContent>
        </Card>
      </div>

      {/* Tabs by tier */}
      <Tabs defaultValue="two-eyes">
        <TabsList>
          <TabsTrigger value="two-eyes">2-Eyes ({twoEye.length})</TabsTrigger>
          <TabsTrigger value="four-eyes">4-Eyes ({fourEye.length})</TabsTrigger>
          <TabsTrigger value="six-eyes">6-Eyes ({sixEye.length})</TabsTrigger>
          <TabsTrigger value="all">All ({orders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="two-eyes">{renderOrderTable(twoEye)}</TabsContent>
        <TabsContent value="four-eyes">{renderOrderTable(fourEye)}</TabsContent>
        <TabsContent value="six-eyes">{renderOrderTable(sixEye)}</TabsContent>
        <TabsContent value="all">{renderOrderTable(orders)}</TabsContent>
      </Tabs>

      {/* Approve/Reject Dialog */}
      <Dialog open={dialogAction !== null} onOpenChange={() => { setDialogAction(null); setSelectedOrder(null); setComment(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogAction === 'approve' ? 'Approve Order' : 'Reject Order'}</DialogTitle>
            <DialogDescription>
              {selectedOrder?.transaction_ref_no ?? selectedOrder?.order_id}
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Review comment (optional)" value={comment} onChange={e => setComment(e.target.value)} />
          {authorizeMutation.isError && <p className="text-sm text-red-600">{authorizeMutation.error?.message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>Cancel</Button>
            <Button
              variant={dialogAction === 'approve' ? 'default' : 'destructive'}
              disabled={authorizeMutation.isPending}
              onClick={() => {
                if (selectedOrder && dialogAction) {
                  authorizeMutation.mutate({
                    orderId: selectedOrder.order_id,
                    decision: dialogAction === 'approve' ? 'APPROVED' : 'REJECTED',
                  });
                }
              }}
            >
              {authorizeMutation.isPending ? 'Processing...' : dialogAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
