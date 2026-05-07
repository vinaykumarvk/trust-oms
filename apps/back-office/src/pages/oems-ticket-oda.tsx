import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { AlertTriangle, CheckCircle2, FileCheck2, FileClock, Fingerprint, RefreshCcw, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
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

type Finding = {
  ruleCode: string;
  severity: "INFO" | "WARNING" | "BLOCKING";
  source?: string;
  message: string;
  repairHint?: string;
};

type SourceRow = {
  evidenceType: string;
  sourceSystem: string;
  evidenceStatus: string;
  ownerRole: string;
  failureCode?: string;
};

type DocumentRow = {
  documentType: string;
  documentStatus: string;
  verificationBinding: string;
};

const defaultSources: SourceRow[] = [
  { evidenceType: "REFERENCE_RATE", sourceSystem: "TREASURY", evidenceStatus: "AVAILABLE", ownerRole: "TREASURY" },
  { evidenceType: "CIF", sourceSystem: "CORE_BANKING", evidenceStatus: "AVAILABLE", ownerRole: "INTEGRATION_OPS" },
  { evidenceType: "SKU", sourceSystem: "WEALTH_CORE", evidenceStatus: "AVAILABLE", ownerRole: "PRODUCT_GOVERNANCE" },
  { evidenceType: "PFE", sourceSystem: "RBS", evidenceStatus: "AVAILABLE", ownerRole: "COMPLIANCE_RISK" },
  { evidenceType: "BALANCE", sourceSystem: "CORE_BANKING", evidenceStatus: "AVAILABLE", ownerRole: "INTEGRATION_OPS" },
];

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "AVAILABLE" || status === "DEGRADED_APPROVED") return "default";
  if (status === "FAILED" || status === "CONFLICT") return "destructive";
  if (status === "STALE") return "outline";
  return "secondary";
};

export default function OemsTicketOda() {
  const [form, setForm] = useState({
    securityId: "",
    customerId: "",
    portfolioId: "",
    currencyPair: "USD/IDR",
    direction: "BUY",
    odaType: "SINGLE",
    effectiveType: "INTRADAY",
    tenorDays: "30",
    nominalAmount: "100000000",
    ratePercent: "6.25",
    valueDate: new Date().toISOString().slice(0, 10),
    referenceRate: "6.1",
    cutoffAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    holdInstruction: "HOLD_ON_SUBMIT",
    workflowCode: "ODA_ORDER_APPROVAL",
  });
  const [sources, setSources] = useState<SourceRow[]>(defaultSources);
  const [documents, setDocuments] = useState<DocumentRow[]>([
    { documentType: "ODA_DEAL_TICKET", documentStatus: "PENDING_UPLOAD", verificationBinding: "TRANSACTION_AUTHORIZATION" },
    { documentType: "CUSTOMER_CONFIRMATION", documentStatus: "PENDING_UPLOAD", verificationBinding: "CUSTOMER_CONFIRMATION" },
  ]);
  const [digitalVerification, setDigitalVerification] = useState({
    verificationStatus: "PENDING",
    provider: "INTERNAL_AUTH_LINK",
    fallbackAllowed: "false",
  });
  const [createdTicketId, setCreatedTicketId] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [persistedChecklist, setPersistedChecklist] = useState<any>(null);
  const [verifications, setVerifications] = useState<any[]>([]);

  const payload = useMemo(() => ({
    ...form,
    tenorDays: Number(form.tenorDays),
    nominalAmount: Number(form.nominalAmount),
    ratePercent: Number(form.ratePercent),
    referenceRate: Number(form.referenceRate),
    availableBalance: Number(form.nominalAmount) * 2,
    cifStatus: sources.find((source) => source.evidenceType === "CIF")?.evidenceStatus,
    skuStatus: sources.find((source) => source.evidenceType === "SKU")?.evidenceStatus,
    pfeStatus: sources.find((source) => source.evidenceType === "PFE")?.evidenceStatus,
    referenceRateStatus: sources.find((source) => source.evidenceType === "REFERENCE_RATE")?.evidenceStatus,
    sourceEvidence: sources.map((source) => ({
      ...source,
      failureCode: source.evidenceStatus === "FAILED" ? source.failureCode || "SOURCE_FAILED" : undefined,
    })),
    productPayload: {
      documentChecklist: documents,
      digitalVerification,
    },
    productionIntent: true,
  }), [form, sources, documents, digitalVerification]);

  const validateCapture = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/oda/tickets/validate-capture", payload),
    onSuccess: (data: any) => setFindings(data.findings ?? []),
  });

  const createTicket = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/oda/tickets", payload),
    onSuccess: (data: any) => {
      setCreatedTicketId(data.ticket_id);
      setFindings(data.validation?.findings ?? []);
    },
  });

  const validateTicket = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/oda/tickets/${createdTicketId}/validate`),
    onSuccess: (data: any) => setFindings(data.findings ?? []),
  });

  const submitTicket = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/oda/tickets/${createdTicketId}/submit`, {
      workflowCode: form.workflowCode,
      reviewerRole: "BO_CHECKER",
    }),
    onSuccess: (data: any) => {
      setCreatedTicketId(data.ticket?.ticket_id ?? createdTicketId);
      setCreatedOrderId(data.order?.order_id ?? "");
      setFindings(data.validation?.findings ?? []);
    },
  });

  const generateChecklist = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${createdOrderId}/documents/checklist/generate`),
    onSuccess: (data: any) => setPersistedChecklist(data),
  });

  const persistDocuments = useMutation({
    mutationFn: async () => {
      const registered = await Promise.all(documents.map((document) => apiRequest("POST", `/api/v1/oems/orders/${createdOrderId}/documents`, {
        documentType: document.documentType,
        documentStatus: document.documentStatus === "PENDING_UPLOAD" ? "UPLOADED" : document.documentStatus,
        required: true,
        requirementType: "REQUIRED",
        blockingStage: "SUBMISSION",
        fileName: `${document.documentType.toLowerCase()}.pdf`,
        fileUrl: `/documents/oems/${createdOrderId}/${document.documentType.toLowerCase()}.pdf`,
        fileHash: `${createdOrderId}-${document.documentType}`,
        expectedFileHash: `${createdOrderId}-${document.documentType}`,
        evidence: {
          verificationBinding: document.verificationBinding,
          source: "ODA_TICKET_SCREEN",
        },
      })));
      const checklist = await apiRequest("GET", `/api/v1/oems/orders/${createdOrderId}/documents/checklist`);
      return { registered, checklist };
    },
    onSuccess: (data: any) => setPersistedChecklist(data.checklist),
  });

  const issueVerification = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/orders/${createdOrderId}/digital-verifications`, {
      provider: digitalVerification.provider,
      verificationType: "TRANSACTION_AUTHORIZATION",
      requestMethod: "OTP",
      boundDocumentTypes: documents.map((document) => document.documentType),
      fallbackAllowed: digitalVerification.fallbackAllowed === "true",
      evidence: {
        documentChecklistBound: true,
        source: "ODA_TICKET_SCREEN",
      },
    }),
    onSuccess: (data: any) => setVerifications((current) => [data, ...current]),
  });

  const confirmVerification = useMutation({
    mutationFn: async () => {
      const verificationId = verifications[0]?.verification_id;
      const attempt = await apiRequest("POST", `/api/v1/oems/orders/${createdOrderId}/digital-verifications/${verificationId}/attempts`, {
        confirmed: true,
        authMethod: "OTP",
        evidence: {
          source: "ODA_TICKET_SCREEN",
          documentChecklistBound: true,
        },
      });
      const refreshed = await apiRequest("GET", `/api/v1/oems/orders/${createdOrderId}/digital-verifications`);
      return { attempt, refreshed };
    },
    onSuccess: (data: any) => setVerifications(data.refreshed ?? verifications),
  });

  const blockingCount = findings.filter((finding) => finding.severity === "BLOCKING").length;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">ODA Ticket</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={blockingCount > 0 ? "destructive" : "default"}>
              {blockingCount > 0 ? `${blockingCount} blockers` : "Ready"}
            </Badge>
            <Badge variant="outline">{createdTicketId || "Unsaved"}</Badge>
            {createdOrderId && <Badge variant="outline">{createdOrderId}</Badge>}
            <Badge variant="secondary">OEMS_ODA_TICKET_V1</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => validateCapture.mutate()} disabled={validateCapture.isPending}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Validate
          </Button>
          <Button onClick={() => createTicket.mutate()} disabled={createTicket.isPending}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Create
          </Button>
          <Button onClick={() => validateTicket.mutate()} disabled={!createdTicketId || validateTicket.isPending}>
            <FileClock className="mr-2 h-4 w-4" />
            Recheck
          </Button>
          <Button onClick={() => submitTicket.mutate()} disabled={!createdTicketId || blockingCount > 0 || submitTicket.isPending}>
            <Send className="mr-2 h-4 w-4" />
            Submit
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Capture</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {[
              ["Security ID", "securityId"],
              ["Customer ID", "customerId"],
              ["Portfolio ID", "portfolioId"],
              ["Nominal", "nominalAmount"],
              ["Rate", "ratePercent"],
              ["Reference Rate", "referenceRate"],
              ["Tenor", "tenorDays"],
              ["Value Date", "valueDate"],
              ["Cutoff", "cutoffAt"],
            ].map(([label, key]) => (
              <div className="space-y-1" key={key}>
                <Label>{label}</Label>
                <Input
                  type={key === "valueDate" ? "date" : "text"}
                  value={form[key as keyof typeof form]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label>Pair</Label>
              <Select value={form.currencyPair} onValueChange={(value) => setForm((current) => ({ ...current, currencyPair: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD/IDR", "EUR/IDR", "SGD/IDR", "AUD/IDR"].map((pair) => <SelectItem key={pair} value={pair}>{pair}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Direction</Label>
              <Select value={form.direction} onValueChange={(value) => setForm((current) => ({ ...current, direction: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">BUY</SelectItem>
                  <SelectItem value="SELL">SELL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Effective</Label>
              <Select value={form.effectiveType} onValueChange={(value) => setForm((current) => ({ ...current, effectiveType: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTRADAY">INTRADAY</SelectItem>
                  <SelectItem value="OVERNIGHT">OVERNIGHT</SelectItem>
                  <SelectItem value="GOOD_TILL_DATE">GOOD_TILL_DATE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {findings.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  No findings
                </div>
              )}
              {findings.map((finding) => (
                <div key={`${finding.ruleCode}-${finding.source}`} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="font-medium">{finding.ruleCode}</span>
                    </div>
                    <Badge variant={finding.severity === "BLOCKING" ? "destructive" : finding.severity === "WARNING" ? "outline" : "secondary"}>
                      {finding.severity}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{finding.message}</p>
                  {finding.repairHint && <p className="mt-1 text-xs text-muted-foreground">{finding.repairHint}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Source Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source, index) => (
                <TableRow key={source.evidenceType}>
                  <TableCell>{source.sourceSystem}</TableCell>
                  <TableCell>{source.evidenceType}</TableCell>
                  <TableCell>
                    <Select
                      value={source.evidenceStatus}
                      onValueChange={(value) => setSources((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, evidenceStatus: value } : row))}
                    >
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["AVAILABLE", "PENDING", "STALE", "FAILED", "CONFLICT", "DEGRADED_APPROVED"].map((status) => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(source.evidenceStatus)}>{source.ownerRole}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4" />
              Document Checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => generateChecklist.mutate()} disabled={!createdOrderId || generateChecklist.isPending}>
                Generate
              </Button>
              <Button onClick={() => persistDocuments.mutate()} disabled={!createdOrderId || persistDocuments.isPending}>
                Persist Documents
              </Button>
              <Badge variant="outline">
                {persistedChecklist?.documents?.length ?? 0} persisted
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Binding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document, index) => (
                  <TableRow key={document.documentType}>
                    <TableCell>{document.documentType}</TableCell>
                    <TableCell>
                      <Select
                        value={document.documentStatus}
                        onValueChange={(value) => setDocuments((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, documentStatus: value } : row))}
                      >
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["PENDING_UPLOAD", "UPLOADED", "VERIFIED", "WAIVED", "REJECTED"].map((status) => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{document.verificationBinding}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(persistedChecklist?.submissionBlockers?.length ?? 0) > 0 && (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                {persistedChecklist.submissionBlockers.length} submission blockers remain after persistence.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4" />
              Digital Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={digitalVerification.verificationStatus}
                onValueChange={(value) => setDigitalVerification((current) => ({ ...current, verificationStatus: value }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["PENDING", "SENT", "CONFIRMED", "MANUAL_VERIFIED", "FAILED", "EXPIRED"].map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Provider</Label>
              <Input
                value={digitalVerification.provider}
                onChange={(event) => setDigitalVerification((current) => ({ ...current, provider: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Fallback</Label>
              <Select
                value={digitalVerification.fallbackAllowed}
                onValueChange={(value) => setDigitalVerification((current) => ({ ...current, fallbackAllowed: value }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">NO</SelectItem>
                  <SelectItem value="true">YES</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 md:col-span-3">
              <Button onClick={() => issueVerification.mutate()} disabled={!createdOrderId || issueVerification.isPending}>
                Issue Verification
              </Button>
              <Button variant="outline" onClick={() => confirmVerification.mutate()} disabled={!createdOrderId || !verifications[0]?.verification_id || confirmVerification.isPending}>
                Confirm
              </Button>
              <Badge variant="outline">{verifications[0]?.verification_status ?? digitalVerification.verificationStatus}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
