import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Bell,
  CheckCircle,
  Eye,
  Mail,
  MessageSquare,
  Plug,
  Plus,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";

// --- Types ---

interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  channel: string;
  subject: string | null;
  body_template: string;
  language: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface NotificationDelivery {
  id: string;
  template_code: string;
  recipient_id: string;
  recipient_address: string;
  channel: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  attempts: number;
  created_at: string;
}

interface IntegrationAdapter {
  id: string;
  name: string;
  adapter_type: string;
  endpoint_url: string;
  auth_method: string;
  status: string;
  health_status: string;
  last_execution_at: string | null;
  created_at: string;
}

interface IntegrationMessage {
  id: string;
  adapter_id: string;
  adapter_name?: string;
  direction: string;
  status: string;
  payload: string;
  created_at: string;
  acknowledged_at: string | null;
}

// --- Badge helpers ---

function templateStatusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="secondary">DRAFT</Badge>;
    case "PENDING_APPROVAL":
      return <Badge variant="outline">PENDING APPROVAL</Badge>;
    case "ACTIVE":
      return <Badge className="bg-green-600 text-white hover:bg-green-700">ACTIVE</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">REJECTED</Badge>;
    case "RETIRED":
      return <Badge variant="secondary">RETIRED</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function channelBadge(channel: string) {
  const icons: Record<string, React.ReactNode> = {
    SMS: <Smartphone className="h-3 w-3 mr-1" />,
    EMAIL: <Mail className="h-3 w-3 mr-1" />,
    IN_APP: <Bell className="h-3 w-3 mr-1" />,
    PUSH: <Smartphone className="h-3 w-3 mr-1" />,
    WHATSAPP: <MessageSquare className="h-3 w-3 mr-1" />,
  };
  return (
    <Badge variant="outline" className="inline-flex items-center">
      {icons[channel]}
      {channel}
    </Badge>
  );
}

function deliveryStatusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="outline">PENDING</Badge>;
    case "SENT":
      return <Badge>SENT</Badge>;
    case "DELIVERED":
      return <Badge className="bg-green-600 text-white hover:bg-green-700">DELIVERED</Badge>;
    case "FAILED":
      return <Badge variant="destructive">FAILED</Badge>;
    case "RETRYING":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">RETRYING</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function integrationStatusBadge(status: string) {
  switch (status) {
    case "QUEUED":
      return <Badge variant="outline">QUEUED</Badge>;
    case "SENT":
      return <Badge>SENT</Badge>;
    case "ACKNOWLEDGED":
      return <Badge className="bg-green-600 text-white hover:bg-green-700">ACKNOWLEDGED</Badge>;
    case "FAILED":
      return <Badge variant="destructive">FAILED</Badge>;
    case "RETRYING":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">RETRYING</Badge>;
    case "RECONCILED":
      return <Badge variant="secondary">RECONCILED</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function directionBadge(direction: string) {
  return direction === "INBOUND" ? (
    <Badge variant="outline" className="border-blue-500 text-blue-700">INBOUND</Badge>
  ) : (
    <Badge variant="outline" className="border-purple-500 text-purple-700">OUTBOUND</Badge>
  );
}

function healthBadge(health: string) {
  switch (health) {
    case "UP":
      return <Badge className="bg-green-600 text-white hover:bg-green-700">UP</Badge>;
    case "DOWN":
      return <Badge variant="destructive">DOWN</Badge>;
    case "DEGRADED":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">DEGRADED</Badge>;
    default:
      return <Badge variant="secondary">{health}</Badge>;
  }
}

function adapterStatusBadge(status: string) {
  return status === "ACTIVE" ? (
    <Badge className="bg-green-600 text-white hover:bg-green-700">ACTIVE</Badge>
  ) : (
    <Badge variant="secondary">INACTIVE</Badge>
  );
}

// --- Main Component ---

export default function OemsNotificationsIntegrations() {
  const [mainTab, setMainTab] = useState("notifications");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">OEMS Notifications &amp; Integrations</h1>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="notifications" className="gap-1">
            <Bell className="h-4 w-4" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1">
            <Plug className="h-4 w-4" /> Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <NotificationsSection />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== NOTIFICATIONS SECTION ====================

function NotificationsSection() {
  const [subTab, setSubTab] = useState("templates");

  return (
    <Tabs value={subTab} onValueChange={setSubTab} className="mt-4">
      <TabsList>
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
        <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
      </TabsList>

      <TabsContent value="templates">
        <TemplatesSubTab />
      </TabsContent>
      <TabsContent value="dispatch">
        <DispatchSubTab />
      </TabsContent>
      <TabsContent value="deliveries">
        <DeliveriesSubTab />
      </TabsContent>
    </Tabs>
  );
}

// --- Templates Sub-Tab ---

function TemplatesSubTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    code: "",
    name: "",
    channel: "EMAIL",
    subject: "",
    body_template: "",
    language: "en",
  });

  const { data: templates = [], isLoading } = useQuery<NotificationTemplate[]>({
    queryKey: ["oems-notification-templates", statusFilter, channelFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (channelFilter !== "ALL") params.set("channel", channelFilter);
      const res = await apiRequest("GET", `/api/v1/oems/notifications/templates?${params.toString()}`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/oems/notifications/templates", newTemplate);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems-notification-templates"] });
      setCreateOpen(false);
      setNewTemplate({ code: "", name: "", channel: "EMAIL", subject: "", body_template: "", language: "en" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/v1/oems/notifications/templates/${id}/submit`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["oems-notification-templates"] }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/v1/oems/notifications/templates/${id}/approve`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["oems-notification-templates"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/v1/oems/notifications/templates/${id}/reject`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["oems-notification-templates"] }),
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Notification Templates</CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create Template
          </Button>
        </div>
        <div className="flex gap-3 mt-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="RETIRED">Retired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Channels</SelectItem>
              <SelectItem value="SMS">SMS</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
              <SelectItem value="IN_APP">In-App</SelectItem>
              <SelectItem value="PUSH">Push</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Loading templates...</p>
        ) : templates.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No templates found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.code}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{channelBadge(t.channel)}</TableCell>
                  <TableCell>{t.language}</TableCell>
                  <TableCell>{templateStatusBadge(t.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {t.status === "DRAFT" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => submitMutation.mutate(t.id)}
                          disabled={submitMutation.isPending}
                        >
                          <Send className="h-3 w-3 mr-1" /> Submit
                        </Button>
                      )}
                      {t.status === "PENDING_APPROVAL" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveMutation.mutate(t.id)}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rejectMutation.mutate(t.id)}
                            disabled={rejectMutation.isPending}
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create Template Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Notification Template</DialogTitle>
            <DialogDescription>Define a new notification template for OEMS events.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tpl-code">Code</Label>
              <Input
                id="tpl-code"
                value={newTemplate.code}
                onChange={(e) => setNewTemplate({ ...newTemplate, code: e.target.value })}
                placeholder="ORDER_PLACED_CONFIRM"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                placeholder="Order Placed Confirmation"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-channel">Channel</Label>
              <Select
                value={newTemplate.channel}
                onValueChange={(v) => setNewTemplate({ ...newTemplate, channel: v })}
              >
                <SelectTrigger id="tpl-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="IN_APP">In-App</SelectItem>
                  <SelectItem value="PUSH">Push</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-subject">Subject</Label>
              <Input
                id="tpl-subject"
                value={newTemplate.subject}
                onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                placeholder="Your order {{order_no}} has been placed"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-body">Body Template</Label>
              <Textarea
                id="tpl-body"
                rows={4}
                value={newTemplate.body_template}
                onChange={(e) => setNewTemplate({ ...newTemplate, body_template: e.target.value })}
                placeholder="Dear {{customer_name}}, your order {{order_no}} for {{product}} has been successfully placed."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-lang">Language</Label>
              <Input
                id="tpl-lang"
                value={newTemplate.language}
                onChange={(e) => setNewTemplate({ ...newTemplate, language: e.target.value })}
                placeholder="en"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// --- Dispatch Sub-Tab ---

function DispatchSubTab() {
  const [eventCode, setEventCode] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [payload, setPayload] = useState("{}");

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        throw new Error("Invalid JSON in payload");
      }
      await apiRequest("POST", "/api/v1/oems/notifications/events", {
        eventCode,
        recipientId,
        recipientAddress,
        channels,
        payload: parsedPayload,
      });
    },
    onSuccess: () => {
      setEventCode("");
      setRecipientId("");
      setRecipientAddress("");
      setChannels([]);
      setPayload("{}");
    },
  });

  const toggleChannel = (ch: string) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const allChannels = ["SMS", "EMAIL", "IN_APP", "PUSH", "WHATSAPP"];

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Dispatch Notification</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            dispatchMutation.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="dispatch-event">Event Code</Label>
            <Input
              id="dispatch-event"
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value)}
              placeholder="ORDER_PLACED"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dispatch-recipient">Recipient ID</Label>
            <Input
              id="dispatch-recipient"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              placeholder="CUST-001"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dispatch-address">Recipient Address</Label>
            <Input
              id="dispatch-address"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="user@example.com or +639171234567"
            />
          </div>
          <div className="grid gap-2">
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-2">
              {allChannels.map((ch) => (
                <Button
                  type="button"
                  key={ch}
                  variant={channels.includes(ch) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleChannel(ch)}
                >
                  {ch}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dispatch-payload">Payload (JSON)</Label>
            <Textarea
              id="dispatch-payload"
              rows={5}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Button type="submit" disabled={dispatchMutation.isPending || !eventCode || channels.length === 0}>
              <Send className="h-4 w-4 mr-1" /> Send Notification
            </Button>
          </div>
          {dispatchMutation.isError && (
            <p className="text-sm text-destructive">
              {(dispatchMutation.error as Error)?.message || "Failed to dispatch"}
            </p>
          )}
          {dispatchMutation.isSuccess && (
            <p className="text-sm text-green-600">Notification dispatched successfully.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// --- Deliveries Sub-Tab ---

function DeliveriesSubTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [templateCodeFilter, setTemplateCodeFilter] = useState("");

  const { data: deliveries = [], isLoading } = useQuery<NotificationDelivery[]>({
    queryKey: ["oems-notification-deliveries", statusFilter, templateCodeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (templateCodeFilter) params.set("templateCode", templateCodeFilter);
      const res = await apiRequest("GET", `/api/v1/oems/notifications/deliveries?${params.toString()}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/v1/oems/notifications/deliveries/${id}/retry`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["oems-notification-deliveries"] }),
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Notification Deliveries</CardTitle>
        <div className="flex gap-3 mt-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="DELIVERED">Delivered</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="RETRYING">Retrying</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by template code..."
            className="w-[200px]"
            value={templateCodeFilter}
            onChange={(e) => setTemplateCodeFilter(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Loading deliveries...</p>
        ) : deliveries.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No deliveries found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delivery ID</TableHead>
                <TableHead>Template Code</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent At</TableHead>
                <TableHead>Delivered At</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.id.slice(0, 8)}...</TableCell>
                  <TableCell className="font-mono text-xs">{d.template_code}</TableCell>
                  <TableCell className="text-sm">{d.recipient_address || d.recipient_id}</TableCell>
                  <TableCell>{channelBadge(d.channel)}</TableCell>
                  <TableCell>{deliveryStatusBadge(d.status)}</TableCell>
                  <TableCell className="text-xs">
                    {d.sent_at ? new Date(d.sent_at).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.delivered_at ? new Date(d.delivered_at).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell>{d.attempts}</TableCell>
                  <TableCell>
                    {d.status === "FAILED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryMutation.mutate(d.id)}
                        disabled={retryMutation.isPending}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Retry
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== INTEGRATIONS SECTION ====================

function IntegrationsSection() {
  const [subTab, setSubTab] = useState("adapters");

  return (
    <Tabs value={subTab} onValueChange={setSubTab} className="mt-4">
      <TabsList>
        <TabsTrigger value="adapters">Adapters</TabsTrigger>
        <TabsTrigger value="messages">Messages</TabsTrigger>
      </TabsList>

      <TabsContent value="adapters">
        <AdaptersSubTab />
      </TabsContent>
      <TabsContent value="messages">
        <MessagesSubTab />
      </TabsContent>
    </Tabs>
  );
}

// --- Adapters Sub-Tab ---

function AdaptersSubTab() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [selectedAdapter, setSelectedAdapter] = useState<IntegrationAdapter | null>(null);
  const [newAdapter, setNewAdapter] = useState({
    name: "",
    adapter_type: "REST",
    endpoint_url: "",
    auth_method: "API_KEY",
    headers: "{}",
  });
  const [securityForm, setSecurityForm] = useState({
    api_key: "",
    client_id: "",
    client_secret: "",
  });

  const { data: adapters = [], isLoading } = useQuery<IntegrationAdapter[]>({
    queryKey: ["oems-integration-adapters"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/oems/integration-adapters");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(newAdapter.headers);
      } catch {
        throw new Error("Invalid JSON in headers");
      }
      const res = await apiRequest("POST", "/api/v1/oems/integration-adapters", {
        ...newAdapter,
        headers: parsedHeaders,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems-integration-adapters"] });
      setCreateOpen(false);
      setNewAdapter({ name: "", adapter_type: "REST", endpoint_url: "", auth_method: "API_KEY", headers: "{}" });
    },
  });

  const securityMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAdapter) return;
      await apiRequest("PATCH", `/api/v1/oems/integration-adapters/${selectedAdapter.id}/security`, securityForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems-integration-adapters"] });
      setSecurityOpen(false);
      setSecurityForm({ api_key: "", client_id: "", client_secret: "" });
      setSelectedAdapter(null);
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/v1/oems/integration-adapters/${id}/execute`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["oems-integration-adapters"] }),
  });

  const openSecurityDialog = (adapter: IntegrationAdapter) => {
    setSelectedAdapter(adapter);
    setSecurityForm({ api_key: "", client_id: "", client_secret: "" });
    setSecurityOpen(true);
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Integration Adapters</CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create Adapter
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Loading adapters...</p>
        ) : adapters.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No adapters configured.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adapter ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Endpoint URL</TableHead>
                <TableHead>Auth Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Last Execution</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adapters.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.id.slice(0, 8)}...</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{a.adapter_type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate" title={a.endpoint_url}>
                    {a.endpoint_url}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{a.auth_method}</Badge>
                  </TableCell>
                  <TableCell>{adapterStatusBadge(a.status)}</TableCell>
                  <TableCell>{healthBadge(a.health_status)}</TableCell>
                  <TableCell className="text-xs">
                    {a.last_execution_at ? new Date(a.last_execution_at).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSecurityDialog(a)}
                        title="Update Security"
                      >
                        <ShieldCheck className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => executeMutation.mutate(a.id)}
                        disabled={executeMutation.isPending}
                        title="Execute"
                      >
                        <RefreshCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create Adapter Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Integration Adapter</DialogTitle>
            <DialogDescription>Configure a new external integration adapter.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="adp-name">Name</Label>
              <Input
                id="adp-name"
                value={newAdapter.name}
                onChange={(e) => setNewAdapter({ ...newAdapter, name: e.target.value })}
                placeholder="Bloomberg FIX Gateway"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adp-type">Adapter Type</Label>
              <Select
                value={newAdapter.adapter_type}
                onValueChange={(v) => setNewAdapter({ ...newAdapter, adapter_type: v })}
              >
                <SelectTrigger id="adp-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REST">REST</SelectItem>
                  <SelectItem value="FIX">FIX</SelectItem>
                  <SelectItem value="SWIFT">SWIFT</SelectItem>
                  <SelectItem value="MQ">MQ</SelectItem>
                  <SelectItem value="SFTP">SFTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adp-url">Endpoint URL</Label>
              <Input
                id="adp-url"
                value={newAdapter.endpoint_url}
                onChange={(e) => setNewAdapter({ ...newAdapter, endpoint_url: e.target.value })}
                placeholder="https://api.exchange.com/v1/orders"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adp-auth">Auth Method</Label>
              <Select
                value={newAdapter.auth_method}
                onValueChange={(v) => setNewAdapter({ ...newAdapter, auth_method: v })}
              >
                <SelectTrigger id="adp-auth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="API_KEY">API Key</SelectItem>
                  <SelectItem value="OAUTH2">OAuth2</SelectItem>
                  <SelectItem value="MUTUAL_TLS">Mutual TLS</SelectItem>
                  <SelectItem value="BASIC">Basic Auth</SelectItem>
                  <SelectItem value="NONE">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adp-headers">Headers (JSON)</Label>
              <Textarea
                id="adp-headers"
                rows={3}
                value={newAdapter.headers}
                onChange={(e) => setNewAdapter({ ...newAdapter, headers: e.target.value })}
                className="font-mono text-xs"
                placeholder='{"X-Custom-Header": "value"}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Security Dialog */}
      <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Adapter Security</DialogTitle>
            <DialogDescription>
              Update credentials for {selectedAdapter?.name}. Leave fields empty to keep existing values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="sec-apikey">API Key</Label>
              <Input
                id="sec-apikey"
                type="password"
                value={securityForm.api_key}
                onChange={(e) => setSecurityForm({ ...securityForm, api_key: e.target.value })}
                placeholder="********"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sec-clientid">Client ID</Label>
              <Input
                id="sec-clientid"
                type="password"
                value={securityForm.client_id}
                onChange={(e) => setSecurityForm({ ...securityForm, client_id: e.target.value })}
                placeholder="********"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sec-secret">Client Secret</Label>
              <Input
                id="sec-secret"
                type="password"
                value={securityForm.client_secret}
                onChange={(e) => setSecurityForm({ ...securityForm, client_secret: e.target.value })}
                placeholder="********"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecurityOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => securityMutation.mutate()} disabled={securityMutation.isPending}>
              Update Security
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// --- Messages Sub-Tab ---

function MessagesSubTab() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [viewPayloadOpen, setViewPayloadOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<IntegrationMessage | null>(null);

  const { data: messages = [], isLoading } = useQuery<IntegrationMessage[]>({
    queryKey: ["oems-integration-messages", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await apiRequest("GET", `/api/v1/oems/integrations?${params.toString()}`);
      return res.json();
    },
  });

  const openPayload = (msg: IntegrationMessage) => {
    setSelectedMessage(msg);
    setViewPayloadOpen(true);
  };

  const formattedPayload = useMemo(() => {
    if (!selectedMessage?.payload) return "";
    try {
      return JSON.stringify(JSON.parse(selectedMessage.payload), null, 2);
    } catch {
      return selectedMessage.payload;
    }
  }, [selectedMessage]);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Integration Messages</CardTitle>
        <div className="flex gap-3 mt-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="QUEUED">Queued</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="RETRYING">Retrying</SelectItem>
              <SelectItem value="RECONCILED">Reconciled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No messages found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Message ID</TableHead>
                <TableHead>Adapter</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payload</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Acknowledged At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-sm">{m.adapter_name || m.adapter_id.slice(0, 8)}</TableCell>
                  <TableCell>{directionBadge(m.direction)}</TableCell>
                  <TableCell>{integrationStatusBadge(m.status)}</TableCell>
                  <TableCell className="text-xs max-w-[160px] truncate" title={m.payload}>
                    {m.payload?.slice(0, 40)}{m.payload?.length > 40 ? "..." : ""}
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(m.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.acknowledged_at ? new Date(m.acknowledged_at).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openPayload(m)}
                      title="View Full Payload"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* View Payload Dialog */}
      <Dialog open={viewPayloadOpen} onOpenChange={setViewPayloadOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Message Payload</DialogTitle>
            <DialogDescription>
              Message {selectedMessage?.id} - {selectedMessage?.direction} via {selectedMessage?.adapter_name || selectedMessage?.adapter_id}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <pre className="bg-muted rounded-md p-4 text-xs overflow-auto max-h-[400px] whitespace-pre-wrap">
              {formattedPayload}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewPayloadOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
