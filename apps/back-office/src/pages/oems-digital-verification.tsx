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
  CheckCircle,
  FileText,
  FilePlus2,
  KeyRound,
  ListChecks,
  Plus,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DigitalVerification {
  id: number;
  verification_id: string;
  order_id: string;
  verification_type: "OTP" | "BIOMETRIC" | "PIN" | "MANUAL";
  channel: string;
  verification_status: string;
  max_attempts: number;
  failed_attempts: number;
  sent_at: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
  fallback_allowed: boolean;
  created_at: string;
}

interface DocumentRule {
  id: number;
  rule_code: string;
  product_family: string;
  document_type: string;
  condition: string | null;
  requirement_type: string;
  is_active: boolean;
  created_at: string;
}

interface OrderDocument {
  id: number;
  document_id: string;
  order_id: string;
  document_type: string;
  document_status: string;
  file_reference: string | null;
  signed_at: string | null;
  registered_at: string | null;
  created_at: string;
}

interface RiskQuestionnaire {
  id: number;
  questionnaire_code: string;
  version_no: number;
  questionnaire_name: string;
  language: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  sections_count: number;
  created_at: string;
}

interface ProductRiskMapping {
  id: number;
  product_id: string;
  risk_profile_required: boolean;
  min_score: number;
  max_score: number;
  created_at: string;
}

interface RiskAssessment {
  id: number;
  assessment_id: string;
  customer_id: string;
  profile_result: string;
  score: number;
  assessed_at: string;
  valid_until: string | null;
}

// ─── Status Badge Helpers ────────────────────────────────────────────────────────

function verificationStatusBadge(status: string) {
  switch (status) {
    case "NOT_REQUIRED":
      return <Badge variant="secondary">{status}</Badge>;
    case "PENDING":
    case "SENT":
      return <Badge variant="outline">{status}</Badge>;
    case "CONFIRMED":
      return <Badge className="bg-green-600 text-white">{status}</Badge>;
    case "FAILED":
    case "CANCELLED":
    case "LOCKED":
    case "INVALIDATED":
      return <Badge variant="destructive">{status}</Badge>;
    case "MANUAL_VERIFIED":
      return <Badge className="bg-green-600 text-white">{status}</Badge>;
    case "EXPIRED":
      return <Badge variant="secondary">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function documentStatusBadge(status: string) {
  switch (status) {
    case "REQUIRED":
      return <Badge variant="outline">{status}</Badge>;
    case "MISSING":
    case "REJECTED":
    case "QUARANTINED":
      return <Badge variant="destructive">{status}</Badge>;
    case "PENDING_UPLOAD":
      return <Badge variant="outline">{status}</Badge>;
    case "GENERATED":
    case "WAIVED":
    case "EXPIRED":
      return <Badge variant="secondary">{status}</Badge>;
    case "UPLOADED":
    case "REGISTERED_NCBS":
    case "REGISTERED_DMS":
      return <Badge>{status}</Badge>;
    case "SIGNED":
    case "VERIFIED":
      return <Badge className="bg-green-600 text-white">{status}</Badge>;
    case "NCBS_RETRY_PENDING":
    case "DMS_RETRY_PENDING":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function questionnaireStatusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="outline">{status}</Badge>;
    case "PENDING_APPROVAL":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">{status}</Badge>;
    case "APPROVED":
    case "ACTIVE":
      return <Badge className="bg-green-600 text-white">{status}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{status}</Badge>;
    case "RETIRED":
      return <Badge variant="secondary">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function profileResultBadge(result: string) {
  switch (result) {
    case "CONSERVATIVE":
      return <Badge variant="secondary">{result}</Badge>;
    case "MODERATE":
      return <Badge variant="outline">{result}</Badge>;
    case "BALANCED":
      return <Badge>{result}</Badge>;
    case "GROWTH":
      return <Badge className="bg-green-600 text-white">{result}</Badge>;
    case "AGGRESSIVE":
      return <Badge variant="destructive">{result}</Badge>;
    default:
      return <Badge variant="outline">{result}</Badge>;
  }
}

// ─── Digital Verification Tab ────────────────────────────────────────────────────

function DigitalVerificationTab() {
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState("");
  const [searchOrderId, setSearchOrderId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [attemptOpen, setAttemptOpen] = useState(false);
  const [selectedVerification, setSelectedVerification] = useState<DigitalVerification | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({
    order_id: "",
    verification_type: "OTP" as string,
    channel: "OEMS_DIRECT" as string,
    expires_in_minutes: 5,
  });

  // Attempt form
  const [attemptForm, setAttemptForm] = useState({
    result: "SUCCESS" as string,
    notes: "",
  });

  const { data: verifications = [], isLoading } = useQuery<DigitalVerification[]>({
    queryKey: ["/api/v1/oems/orders", searchOrderId, "digital-verifications"],
    queryFn: () => apiRequest("GET", `/api/v1/oems/orders/${searchOrderId}/digital-verifications`).then((r) => r.json()),
    enabled: !!searchOrderId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/v1/oems/orders/${createForm.order_id}/digital-verifications`, createForm).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchOrderId, "digital-verifications"] });
      setCreateOpen(false);
    },
  });

  const attemptMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        "POST",
        `/api/v1/oems/orders/${selectedVerification?.order_id}/digital-verifications/${selectedVerification?.id}/attempts`,
        attemptForm
      ).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchOrderId, "digital-verifications"] });
      setAttemptOpen(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (v: DigitalVerification) =>
      apiRequest("POST", `/api/v1/oems/orders/${v.order_id}/digital-verifications/${v.id}/complete`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchOrderId, "digital-verifications"] });
    },
  });

  const expireMutation = useMutation({
    mutationFn: (v: DigitalVerification) =>
      apiRequest("POST", `/api/v1/oems/orders/${v.order_id}/digital-verifications/${v.id}/expire`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchOrderId, "digital-verifications"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (v: DigitalVerification) =>
      apiRequest("POST", `/api/v1/oems/orders/${v.order_id}/digital-verifications/${v.id}/cancel`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchOrderId, "digital-verifications"] });
    },
  });

  const fallbackMutation = useMutation({
    mutationFn: (v: DigitalVerification) =>
      apiRequest("POST", `/api/v1/oems/orders/${v.order_id}/digital-verifications/${v.id}/approve-fallback`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchOrderId, "digital-verifications"] });
    },
  });

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="dv-order-id">Order ID</Label>
              <Input
                id="dv-order-id"
                placeholder="Enter Order ID to look up verifications"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSearchOrderId(orderId)}
              />
            </div>
            <Button onClick={() => setSearchOrderId(orderId)}>
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Verification
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Verifications table */}
      {searchOrderId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verifications for Order: {searchOrderId}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : verifications.length === 0 ? (
              <p className="text-muted-foreground text-sm">No verifications found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Verification ID</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verifications.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.verification_id}</TableCell>
                      <TableCell className="font-mono text-xs">{v.order_id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{v.verification_type}</Badge>
                      </TableCell>
                      <TableCell>{verificationStatusBadge(v.verification_status)}</TableCell>
                      <TableCell className="text-xs">{v.channel}</TableCell>
                      <TableCell className="text-xs">{new Date(v.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        {v.expires_at ? new Date(v.expires_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-center">{v.failed_attempts}/{v.max_attempts}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {(v.verification_status === "SENT" || v.verification_status === "PENDING") && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedVerification(v);
                                  setAttemptOpen(true);
                                }}
                              >
                                Attempt
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => completeMutation.mutate(v)}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => expireMutation.mutate(v)}
                              >
                                Expire
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => cancelMutation.mutate(v)}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Cancel
                              </Button>
                            </>
                          )}
                          {(v.verification_status === "FAILED" || v.verification_status === "EXPIRED") &&
                            v.fallback_allowed && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => fallbackMutation.mutate(v)}
                              >
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Manual Fallback Approve
                              </Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Verification Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Digital Verification</DialogTitle>
            <DialogDescription>Request a new digital verification for an order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Order ID</Label>
              <Input
                value={createForm.order_id}
                onChange={(e) => setCreateForm({ ...createForm, order_id: e.target.value })}
                placeholder="Order ID"
              />
            </div>
            <div>
              <Label>Verification Type</Label>
              <Select
                value={createForm.verification_type}
                onValueChange={(v) => setCreateForm({ ...createForm, verification_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OTP">OTP</SelectItem>
                  <SelectItem value="BIOMETRIC">BIOMETRIC</SelectItem>
                  <SelectItem value="PIN">PIN</SelectItem>
                  <SelectItem value="MANUAL">MANUAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Channel</Label>
              <Select
                value={createForm.channel}
                onValueChange={(v) => setCreateForm({ ...createForm, channel: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OEMS_DIRECT">OEMS_DIRECT</SelectItem>
                  <SelectItem value="CRM_MICROSITE">CRM_MICROSITE</SelectItem>
                  <SelectItem value="DBANK_PRO_MICROSITE">DBANK_PRO_MICROSITE</SelectItem>
                  <SelectItem value="BRANCH">BRANCH</SelectItem>
                  <SelectItem value="RM_MOBILE">RM_MOBILE</SelectItem>
                  <SelectItem value="SECURE_MICROSITE">SECURE_MICROSITE</SelectItem>
                  <SelectItem value="BACK_OFFICE">BACK_OFFICE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expires In (minutes)</Label>
              <Input
                type="number"
                value={createForm.expires_in_minutes}
                onChange={(e) => setCreateForm({ ...createForm, expires_in_minutes: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Attempt Dialog */}
      <Dialog open={attemptOpen} onOpenChange={setAttemptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Verification Attempt</DialogTitle>
            <DialogDescription>
              Recording attempt for verification: {selectedVerification?.verification_id}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Result</Label>
              <Select
                value={attemptForm.result}
                onValueChange={(v) => setAttemptForm({ ...attemptForm, result: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUCCESS">SUCCESS</SelectItem>
                  <SelectItem value="FAILURE">FAILURE</SelectItem>
                  <SelectItem value="TIMEOUT">TIMEOUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={attemptForm.notes}
                onChange={(e) => setAttemptForm({ ...attemptForm, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttemptOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => attemptMutation.mutate()} disabled={attemptMutation.isPending}>
              Submit Attempt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Document Management Tab ─────────────────────────────────────────────────────

function DocumentManagementTab() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState("rules");

  // Rules state
  const [productFamilyFilter, setProductFamilyFilter] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    product_family: "",
    document_type: "",
    condition: "",
    requirement_type: "MANDATORY",
    is_active: true,
  });

  // Documents state
  const [docOrderId, setDocOrderId] = useState("");
  const [searchDocOrderId, setSearchDocOrderId] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    document_type: "",
    file_reference: "",
  });
  const [signDocId, setSignDocId] = useState<string | null>(null);

  // Queries
  const rulesQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (productFamilyFilter) params.set("productFamily", productFamilyFilter);
    if (docTypeFilter) params.set("documentType", docTypeFilter);
    return params.toString();
  }, [productFamilyFilter, docTypeFilter]);

  const { data: rules = [], isLoading: rulesLoading } = useQuery<DocumentRule[]>({
    queryKey: ["/api/v1/oems/document-rules", rulesQueryParams],
    queryFn: () =>
      apiRequest("GET", `/api/v1/oems/document-rules?${rulesQueryParams}`).then((r) => r.json()),
  });

  const { data: documents = [], isLoading: docsLoading } = useQuery<OrderDocument[]>({
    queryKey: ["/api/v1/oems/orders", searchDocOrderId, "documents"],
    queryFn: () =>
      apiRequest("GET", `/api/v1/oems/orders/${searchDocOrderId}/documents`).then((r) => r.json()),
    enabled: !!searchDocOrderId,
  });

  const createRuleMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/v1/oems/document-rules", ruleForm).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/document-rules"] });
      setCreateRuleOpen(false);
    },
  });

  const generateChecklistMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/v1/oems/orders/${searchDocOrderId}/documents/generate-checklist`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchDocOrderId, "documents"] });
    },
  });

  const registerDocMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/v1/oems/orders/${searchDocOrderId}/documents/register`, registerForm).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchDocOrderId, "documents"] });
      setRegisterOpen(false);
    },
  });

  const signDocMutation = useMutation({
    mutationFn: (docId: string) =>
      apiRequest("POST", `/api/v1/oems/orders/${searchDocOrderId}/documents/${docId}/sign`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders", searchDocOrderId, "documents"] });
    },
  });

  return (
    <Tabs value={subTab} onValueChange={setSubTab}>
      <TabsList>
        <TabsTrigger value="rules">
          <ListChecks className="mr-2 h-4 w-4" />
          Checklist Rules
        </TabsTrigger>
        <TabsTrigger value="documents">
          <FileText className="mr-2 h-4 w-4" />
          Order Documents
        </TabsTrigger>
      </TabsList>

      {/* Checklist Rules Sub-Tab */}
      <TabsContent value="rules" className="space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-end gap-4">
              <div>
                <Label>Product Family</Label>
                <Input
                  placeholder="Filter by product family"
                  value={productFamilyFilter}
                  onChange={(e) => setProductFamilyFilter(e.target.value)}
                />
              </div>
              <div>
                <Label>Document Type</Label>
                <Input
                  placeholder="Filter by document type"
                  value={docTypeFilter}
                  onChange={(e) => setDocTypeFilter(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={() => setCreateRuleOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Rule
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            {rulesLoading ? (
              <p className="text-muted-foreground text-sm">Loading rules...</p>
            ) : rules.length === 0 ? (
              <p className="text-muted-foreground text-sm">No rules found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule ID</TableHead>
                    <TableHead>Product Family</TableHead>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-mono text-xs">{rule.rule_code}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{rule.product_family}</Badge>
                      </TableCell>
                      <TableCell>{rule.document_type}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {rule.condition || "-"}
                      </TableCell>
                      <TableCell>
                        {rule.requirement_type === "MANDATORY" ? (
                          <Badge className="bg-green-600 text-white">Required</Badge>
                        ) : (
                          <Badge variant="secondary">Optional</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Rule Dialog */}
        <Dialog open={createRuleOpen} onOpenChange={setCreateRuleOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Document Rule</DialogTitle>
              <DialogDescription>Define a document checklist rule for a product family.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Product Family</Label>
                <Input
                  value={ruleForm.product_family}
                  onChange={(e) => setRuleForm({ ...ruleForm, product_family: e.target.value })}
                  placeholder="e.g. ODA, MLD, MUTUAL_FUND"
                />
              </div>
              <div>
                <Label>Document Type</Label>
                <Input
                  value={ruleForm.document_type}
                  onChange={(e) => setRuleForm({ ...ruleForm, document_type: e.target.value })}
                  placeholder="e.g. KTP, NPWP, SID"
                />
              </div>
              <div>
                <Label>Condition (JSON expression)</Label>
                <Textarea
                  value={ruleForm.condition}
                  onChange={(e) => setRuleForm({ ...ruleForm, condition: e.target.value })}
                  placeholder='e.g. {"min_amount": 500000000}'
                />
              </div>
              <div>
                <Label>Requirement Type</Label>
                <Select
                  value={ruleForm.requirement_type}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, requirement_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANDATORY">MANDATORY</SelectItem>
                    <SelectItem value="OPTIONAL">OPTIONAL</SelectItem>
                    <SelectItem value="CONDITIONAL">CONDITIONAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateRuleOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createRuleMutation.mutate()} disabled={createRuleMutation.isPending}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* Order Documents Sub-Tab */}
      <TabsContent value="documents" className="space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label htmlFor="doc-order-id">Order ID</Label>
                <Input
                  id="doc-order-id"
                  placeholder="Enter Order ID"
                  value={docOrderId}
                  onChange={(e) => setDocOrderId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setSearchDocOrderId(docOrderId)}
                />
              </div>
              <Button onClick={() => setSearchDocOrderId(docOrderId)}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
              {searchDocOrderId && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => generateChecklistMutation.mutate()}
                    disabled={generateChecklistMutation.isPending}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Generate Checklist
                  </Button>
                  <Button variant="outline" onClick={() => setRegisterOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Register Document
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {searchDocOrderId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents for Order: {searchDocOrderId}</CardTitle>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : documents.length === 0 ? (
                <p className="text-muted-foreground text-sm">No documents found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Doc ID</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>File Reference</TableHead>
                      <TableHead>Signed At</TableHead>
                      <TableHead>Registered At</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-xs">{doc.document_id}</TableCell>
                        <TableCell>{doc.document_type}</TableCell>
                        <TableCell>{documentStatusBadge(doc.document_status)}</TableCell>
                        <TableCell className="font-mono text-xs max-w-[150px] truncate">
                          {doc.file_reference || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {doc.signed_at ? new Date(doc.signed_at).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {doc.registered_at ? new Date(doc.registered_at).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(doc.document_status === "UPLOADED" || doc.document_status === "VERIFIED") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => signDocMutation.mutate(doc.document_id)}
                                disabled={signDocMutation.isPending}
                              >
                                <KeyRound className="h-3 w-3 mr-1" />
                                Sign
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Register Document Dialog */}
        <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Document</DialogTitle>
              <DialogDescription>Register a document for order: {searchDocOrderId}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Document Type</Label>
                <Input
                  value={registerForm.document_type}
                  onChange={(e) => setRegisterForm({ ...registerForm, document_type: e.target.value })}
                  placeholder="e.g. KTP, NPWP, SID"
                />
              </div>
              <div>
                <Label>File Reference</Label>
                <Input
                  value={registerForm.file_reference}
                  onChange={(e) => setRegisterForm({ ...registerForm, file_reference: e.target.value })}
                  placeholder="File path or DMS reference"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRegisterOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => registerDocMutation.mutate()} disabled={registerDocMutation.isPending}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>
    </Tabs>
  );
}

// ─── Risk Profiling Tab ──────────────────────────────────────────────────────────

function RiskProfilingTab() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState("questionnaires");

  // Questionnaire state
  const [qStatusFilter, setQStatusFilter] = useState("");
  const [createQOpen, setCreateQOpen] = useState(false);
  const [qForm, setQForm] = useState({
    questionnaire_name: "",
    language: "EN",
    sections: [] as { title: string; questions: string[] }[],
  });

  // Mapping state
  const [createMappingOpen, setCreateMappingOpen] = useState(false);
  const [mappingForm, setMappingForm] = useState({
    product_id: "",
    risk_profile_required: true,
    min_score: 0,
    max_score: 100,
  });

  // Assessment state
  const [createAssessOpen, setCreateAssessOpen] = useState(false);
  const [assessForm, setAssessForm] = useState({
    customer_id: "",
    questionnaire_id: 0,
    answers: {} as Record<string, string>,
  });

  // Queries
  const { data: questionnaires = [], isLoading: qLoading } = useQuery<RiskQuestionnaire[]>({
    queryKey: ["/api/v1/oems/risk/questionnaires", qStatusFilter],
    queryFn: () => {
      const params = qStatusFilter ? `?status=${qStatusFilter}` : "";
      return apiRequest("GET", `/api/v1/oems/risk/questionnaires${params}`).then((r) => r.json());
    },
  });

  const { data: mappings = [] } = useQuery<ProductRiskMapping[]>({
    queryKey: ["/api/v1/oems/risk/product-mappings"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/risk/product-mappings").then((r) => r.json()),
  });

  const { data: assessments = [] } = useQuery<RiskAssessment[]>({
    queryKey: ["/api/v1/oems/risk/assessments"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/risk/assessments").then((r) => r.json()),
  });

  const createQMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/v1/oems/risk/questionnaires", qForm).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/risk/questionnaires"] });
      setCreateQOpen(false);
    },
  });

  const submitQMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/v1/oems/risk/questionnaires/${id}/submit`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/risk/questionnaires"] });
    },
  });

  const approveQMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/v1/oems/risk/questionnaires/${id}/approve`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/risk/questionnaires"] });
    },
  });

  const createMappingMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/v1/oems/risk/product-mappings", mappingForm).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/risk/product-mappings"] });
      setCreateMappingOpen(false);
    },
  });

  const createAssessMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/v1/oems/risk/assessments", assessForm).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/risk/assessments"] });
      setCreateAssessOpen(false);
    },
  });

  return (
    <Tabs value={subTab} onValueChange={setSubTab}>
      <TabsList>
        <TabsTrigger value="questionnaires">Questionnaires</TabsTrigger>
        <TabsTrigger value="mappings">Product-Risk Mappings</TabsTrigger>
        <TabsTrigger value="assessments">Assessments</TabsTrigger>
      </TabsList>

      {/* Questionnaires Sub-Tab */}
      <TabsContent value="questionnaires" className="space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-end gap-4">
              <div>
                <Label>Status Filter</Label>
                <Select value={qStatusFilter} onValueChange={setQStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="DRAFT">DRAFT</SelectItem>
                    <SelectItem value="PENDING_APPROVAL">PENDING_APPROVAL</SelectItem>
                    <SelectItem value="APPROVED">APPROVED</SelectItem>
                    <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                    <SelectItem value="RETIRED">RETIRED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => setCreateQOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Version
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            {qLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : questionnaires.length === 0 ? (
              <p className="text-muted-foreground text-sm">No questionnaires found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Effective From</TableHead>
                    <TableHead>Effective To</TableHead>
                    <TableHead>Sections</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questionnaires.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>{q.id}</TableCell>
                      <TableCell>v{q.version_no}</TableCell>
                      <TableCell>{questionnaireStatusBadge(q.status)}</TableCell>
                      <TableCell>{q.language}</TableCell>
                      <TableCell className="text-xs">
                        {q.effective_from ? new Date(q.effective_from).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {q.effective_to ? new Date(q.effective_to).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-center">{q.sections_count}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {q.status === "DRAFT" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => submitQMutation.mutate(q.id)}
                              disabled={submitQMutation.isPending}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              Submit
                            </Button>
                          )}
                          {q.status === "PENDING_APPROVAL" && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => approveQMutation.mutate(q.id)}
                              disabled={approveQMutation.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Questionnaire Version Dialog */}
        <Dialog open={createQOpen} onOpenChange={setCreateQOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Questionnaire Version</DialogTitle>
              <DialogDescription>Create a new risk questionnaire version.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={qForm.questionnaire_name}
                  onChange={(e) => setQForm({ ...qForm, questionnaire_name: e.target.value })}
                  placeholder="Questionnaire name"
                />
              </div>
              <div>
                <Label>Language</Label>
                <Select
                  value={qForm.language}
                  onValueChange={(v) => setQForm({ ...qForm, language: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EN">English</SelectItem>
                    <SelectItem value="ID">Indonesian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateQOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createQMutation.mutate()} disabled={createQMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* Product-Risk Mappings Sub-Tab */}
      <TabsContent value="mappings" className="space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setCreateMappingOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Mapping
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            {mappings.length === 0 ? (
              <p className="text-muted-foreground text-sm">No product-risk mappings found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product ID</TableHead>
                    <TableHead>Risk Profile Required</TableHead>
                    <TableHead>Min Score</TableHead>
                    <TableHead>Max Score</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.product_id}</TableCell>
                      <TableCell>
                        {m.risk_profile_required ? (
                          <Badge className="bg-green-600 text-white">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>{m.min_score}</TableCell>
                      <TableCell>{m.max_score}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(m.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Mapping Dialog */}
        <Dialog open={createMappingOpen} onOpenChange={setCreateMappingOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Product-Risk Mapping</DialogTitle>
              <DialogDescription>Map a product to risk profile requirements.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Product ID</Label>
                <Input
                  value={mappingForm.product_id}
                  onChange={(e) => setMappingForm({ ...mappingForm, product_id: e.target.value })}
                  placeholder="Product ID"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="risk-required"
                  checked={mappingForm.risk_profile_required}
                  onChange={(e) => setMappingForm({ ...mappingForm, risk_profile_required: e.target.checked })}
                />
                <Label htmlFor="risk-required">Risk Profile Required</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Score</Label>
                  <Input
                    type="number"
                    value={mappingForm.min_score}
                    onChange={(e) => setMappingForm({ ...mappingForm, min_score: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Max Score</Label>
                  <Input
                    type="number"
                    value={mappingForm.max_score}
                    onChange={(e) => setMappingForm({ ...mappingForm, max_score: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateMappingOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createMappingMutation.mutate()} disabled={createMappingMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* Assessments Sub-Tab */}
      <TabsContent value="assessments" className="space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setCreateAssessOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Assessment
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            {assessments.length === 0 ? (
              <p className="text-muted-foreground text-sm">No assessments found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Profile Result</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Assessed At</TableHead>
                    <TableHead>Valid Until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.assessment_id}</TableCell>
                      <TableCell className="font-mono text-xs">{a.customer_id}</TableCell>
                      <TableCell>{profileResultBadge(a.profile_result)}</TableCell>
                      <TableCell className="text-center font-semibold">{a.score}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(a.assessed_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {a.valid_until ? new Date(a.valid_until).toLocaleDateString() : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Assessment Dialog */}
        <Dialog open={createAssessOpen} onOpenChange={setCreateAssessOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Risk Assessment</DialogTitle>
              <DialogDescription>Assess a customer's risk profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Customer ID</Label>
                <Input
                  value={assessForm.customer_id}
                  onChange={(e) => setAssessForm({ ...assessForm, customer_id: e.target.value })}
                  placeholder="Customer ID"
                />
              </div>
              <div>
                <Label>Questionnaire ID</Label>
                <Input
                  type="number"
                  value={assessForm.questionnaire_id || ""}
                  onChange={(e) => setAssessForm({ ...assessForm, questionnaire_id: Number(e.target.value) })}
                  placeholder="Questionnaire ID"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateAssessOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createAssessMutation.mutate()} disabled={createAssessMutation.isPending}>
                Create Assessment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>
    </Tabs>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────────

export default function OemsDigitalVerificationPage() {
  const [mainTab, setMainTab] = useState("verification");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">OEMS Verification, Documents & Risk</h1>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="verification">
            <KeyRound className="mr-2 h-4 w-4" />
            Digital Verification
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="mr-2 h-4 w-4" />
            Document Management
          </TabsTrigger>
          <TabsTrigger value="risk">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Risk Profiling
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verification">
          <DigitalVerificationTab />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentManagementTab />
        </TabsContent>

        <TabsContent value="risk">
          <RiskProfilingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
