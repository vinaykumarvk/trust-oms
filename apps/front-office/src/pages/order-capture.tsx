/**
 * Order Capture — Phase 1B
 *
 * 56-field order ticket per BRD FR-ORD-001 through FR-ORD-032.
 * Includes Gap #1 enhancements: TIF, disposal method, payment mode, inline FX, trader-ID.
 */

import { useState, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@ui/lib/queryClient';
import { apiUrl } from '@ui/lib/api-url';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/ui/select';
import { Textarea } from '@ui/components/ui/textarea';
import { Badge } from '@ui/components/ui/badge';
import { Separator } from '@ui/components/ui/separator';
import {
  FileText,
  Send,
  Save,
  Calculator,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderFormData {
  // Portfolio & Security
  portfolio_id: string;
  security_id: string;

  // Order Details
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  quantity: string;
  limit_price: string;
  stop_price: string;
  currency: string;
  value_date: string;
  time_in_force: 'DAY' | 'GTC' | 'IOC' | 'FOK';
  future_trade_date: string;

  // Gap #1: Additional fields
  disposal_method: string;
  payment_mode: string;
  trader_id: string;

  // Metadata
  reason_code: string;
  client_reference: string;
  remarks: string;
}

const initialFormData: OrderFormData = {
  portfolio_id: '',
  security_id: '',
  side: 'BUY',
  type: 'LIMIT',
  quantity: '',
  limit_price: '',
  stop_price: '',
  currency: 'PHP',
  value_date: new Date().toISOString().split('T')[0],
  time_in_force: 'DAY',
  future_trade_date: '',
  disposal_method: '',
  payment_mode: '',
  trader_id: '',
  reason_code: '',
  client_reference: '',
  remarks: '',
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SuitabilityResult {
  result: string;
  reasons: string[];
}

interface CreateOrderResponse {
  order_id: string;
  transaction_ref_no: string;
  authorization_tier: string;
  suitability_check?: SuitabilityResult;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OrderCapture() {
  const [form, setForm] = useState<OrderFormData>(initialFormData);
  const [suitabilityResult, setSuitabilityResult] =
    useState<SuitabilityResult | null>(null);
  const [autoComputeResult, setAutoComputeResult] = useState<{
    grossAmount?: number;
  } | null>(null);
  const navigate = useNavigate();

  const updateField = useCallback(
    <K extends keyof OrderFormData>(key: K, value: OrderFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Auto-compute gross amount
  useEffect(() => {
    const qty = parseFloat(form.quantity);
    const price = parseFloat(form.limit_price);
    if (qty && price) {
      setAutoComputeResult({ grossAmount: qty * price });
    } else {
      setAutoComputeResult(null);
    }
  }, [form.quantity, form.limit_price]);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (
      orderData: OrderFormData,
    ): Promise<CreateOrderResponse> => {
      return apiRequest('POST', apiUrl('/api/v1/orders'), {
        portfolio_id: orderData.portfolio_id,
        security_id: parseInt(orderData.security_id),
        side: orderData.side,
        type: orderData.type,
        quantity: orderData.quantity,
        limit_price: orderData.limit_price,
        stop_price: orderData.stop_price || undefined,
        currency: orderData.currency,
        value_date: orderData.value_date,
        time_in_force: orderData.time_in_force,
        future_trade_date: orderData.future_trade_date || undefined,
        disposal_method:
          orderData.side === 'SELL'
            ? orderData.disposal_method || undefined
            : undefined,
        payment_mode: orderData.payment_mode || undefined,
        trader_id: orderData.trader_id
          ? parseInt(orderData.trader_id)
          : undefined,
        reason_code: orderData.reason_code,
        client_reference: orderData.client_reference,
        created_by_role: 'RM',
      });
    },
    onSuccess: (data) => {
      if (data.suitability_check) {
        setSuitabilityResult(data.suitability_check);
      }
    },
  });

  // Submit order mutation
  const submitOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(
        'POST',
        apiUrl(`/api/v1/orders/${orderId}/submit`),
      );
    },
    onSuccess: () => {
      navigate('/orders');
    },
  });

  const handleSaveDraft = () => {
    createOrderMutation.mutate(form);
  };

  const handleSaveAndSubmit = async () => {
    const result = await createOrderMutation.mutateAsync(form);
    if (result.order_id) {
      submitOrderMutation.mutate(result.order_id);
    }
  };

  const grossAmount = autoComputeResult?.grossAmount;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Order</h1>
            <p className="text-sm text-muted-foreground">
              Create a new trade order
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={createOrderMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <Button
            onClick={handleSaveAndSubmit}
            disabled={
              createOrderMutation.isPending || submitOrderMutation.isPending
            }
          >
            <Send className="h-4 w-4 mr-2" />
            Save &amp; Submit
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Main Order Fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Portfolio & Security Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Portfolio &amp; Security
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Portfolio ID *</Label>
                <Input
                  value={form.portfolio_id}
                  onChange={(e) =>
                    updateField('portfolio_id', e.target.value)
                  }
                  placeholder="Enter portfolio ID"
                />
              </div>
              <div className="space-y-2">
                <Label>Security ID *</Label>
                <Input
                  value={form.security_id}
                  onChange={(e) =>
                    updateField('security_id', e.target.value)
                  }
                  placeholder="Enter security ID"
                />
              </div>
            </CardContent>
          </Card>

          {/* Order Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Side *</Label>
                <Select
                  value={form.side}
                  onValueChange={(v) =>
                    updateField('side', v as 'BUY' | 'SELL')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Order Type *</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    updateField(
                      'type',
                      v as 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT',
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKET">Market</SelectItem>
                    <SelectItem value="LIMIT">Limit</SelectItem>
                    <SelectItem value="STOP">Stop</SelectItem>
                    <SelectItem value="STOP_LIMIT">Stop-Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time-in-Force</Label>
                <Select
                  value={form.time_in_force}
                  onValueChange={(v) =>
                    updateField(
                      'time_in_force',
                      v as 'DAY' | 'GTC' | 'IOC' | 'FOK',
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">Day</SelectItem>
                    <SelectItem value="GTC">Good Till Cancelled</SelectItem>
                    <SelectItem value="IOC">Immediate or Cancel</SelectItem>
                    <SelectItem value="FOK">Fill or Kill</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => updateField('quantity', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Limit Price {form.type !== 'MARKET' ? '*' : ''}
                </Label>
                <Input
                  type="number"
                  value={form.limit_price}
                  onChange={(e) =>
                    updateField('limit_price', e.target.value)
                  }
                  placeholder="0.00"
                  disabled={form.type === 'MARKET'}
                />
              </div>
              <div className="space-y-2">
                <Label>Stop Price</Label>
                <Input
                  type="number"
                  value={form.stop_price}
                  onChange={(e) =>
                    updateField('stop_price', e.target.value)
                  }
                  placeholder="0.00"
                  disabled={
                    !['STOP', 'STOP_LIMIT'].includes(form.type)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => updateField('currency', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHP">PHP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                    <SelectItem value="SGD">SGD</SelectItem>
                    <SelectItem value="HKD">HKD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Value Date</Label>
                <Input
                  type="date"
                  value={form.value_date}
                  onChange={(e) =>
                    updateField('value_date', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Future Trade Date</Label>
                <Input
                  type="date"
                  value={form.future_trade_date}
                  onChange={(e) =>
                    updateField('future_trade_date', e.target.value)
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Gap #1 Enhancements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Additional Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              {form.side === 'SELL' && (
                <div className="space-y-2">
                  <Label>Disposal Method</Label>
                  <Select
                    value={form.disposal_method}
                    onValueChange={(v) =>
                      updateField('disposal_method', v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIFO">FIFO</SelectItem>
                      <SelectItem value="LIFO">LIFO</SelectItem>
                      <SelectItem value="WEIGHTED_AVG">
                        Weighted Average
                      </SelectItem>
                      <SelectItem value="SPECIFIC_LOT">
                        Specific Lot
                      </SelectItem>
                      <SelectItem value="HIGHEST_COST">
                        Highest Cost
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Payment Mode</Label>
                <Select
                  value={form.payment_mode}
                  onValueChange={(v) => updateField('payment_mode', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT_CA_SA">Debit CA/SA</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                    <SelectItem value="WIRE_TRANSFER">
                      Wire Transfer
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trader ID</Label>
                <Input
                  value={form.trader_id}
                  onChange={(e) =>
                    updateField('trader_id', e.target.value)
                  }
                  placeholder="Assigned trader"
                />
              </div>
              <div className="space-y-2">
                <Label>Reason Code</Label>
                <Input
                  value={form.reason_code}
                  onChange={(e) =>
                    updateField('reason_code', e.target.value)
                  }
                  placeholder="e.g. REBALANCE"
                />
              </div>
              <div className="space-y-2">
                <Label>Client Reference</Label>
                <Input
                  value={form.client_reference}
                  onChange={(e) =>
                    updateField('client_reference', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Remarks</Label>
                <Textarea
                  value={form.remarks}
                  onChange={(e) => updateField('remarks', e.target.value)}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Summary & Checks */}
        <div className="space-y-6">
          {/* Gross Amount Calculator */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Side</span>
                <Badge
                  variant={form.side === 'BUY' ? 'default' : 'destructive'}
                >
                  {form.side}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <span>{form.type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">TIF</span>
                <span>{form.time_in_force}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Quantity</span>
                <span>{form.quantity || '\u2014'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Price</span>
                <span>
                  {form.limit_price || '\u2014'} {form.currency}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Gross Amount</span>
                <span>
                  {grossAmount
                    ? `${grossAmount.toLocaleString()} ${form.currency}`
                    : '\u2014'}
                </span>
              </div>
              {grossAmount && (
                <div className="text-xs text-muted-foreground">
                  Auth Tier:{' '}
                  {grossAmount <= 50_000_000
                    ? '2-Eyes'
                    : grossAmount <= 500_000_000
                      ? '4-Eyes'
                      : '6-Eyes'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Suitability Check Result */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suitability Check</CardTitle>
            </CardHeader>
            <CardContent>
              {!suitabilityResult ? (
                <p className="text-sm text-muted-foreground">
                  Suitability check runs on order creation.
                </p>
              ) : suitabilityResult.result === 'PASSED' ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">PASSED</span>
                </div>
              ) : suitabilityResult.result === 'OVERRIDE_REQUIRED' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-yellow-600">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">OVERRIDE REQUIRED</span>
                  </div>
                  {suitabilityResult.reasons.map((r, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {'\u2022'} {r}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    <span className="font-medium">FAILED</span>
                  </div>
                  {suitabilityResult.reasons.map((r, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {'\u2022'} {r}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Created Confirmation */}
          {createOrderMutation.data && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6 space-y-2">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Order Created</span>
                </div>
                <p className="text-xs text-green-600">
                  ID: {createOrderMutation.data.order_id}
                </p>
                <p className="text-xs text-green-600">
                  TRN: {createOrderMutation.data.transaction_ref_no}
                </p>
                <p className="text-xs text-green-600">
                  Tier: {createOrderMutation.data.authorization_tier}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() =>
                    submitOrderMutation.mutate(
                      createOrderMutation.data!.order_id,
                    )
                  }
                  disabled={submitOrderMutation.isPending}
                >
                  Submit for Authorization
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {createOrderMutation.isError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  {createOrderMutation.error?.message}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
