import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
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
import { ClipboardCheck, FileCheck2, RefreshCw, Send, ShieldCheck } from "lucide-react";

type ProductFamily = "MLD" | "MUTUAL_FUND" | "BOND" | "FX_TODAY" | "WEALTH_LENDING";

type Finding = {
  ruleCode: string;
  severity: "INFO" | "WARNING" | "BLOCKING";
  source?: string;
  message: string;
  repairHint?: string;
};

const familyFields: Record<ProductFamily, Array<{ key: string; label: string; value: string }>> = {
  MLD: [
    { key: "trancheId", label: "Tranche ID", value: "TRN-001" },
    { key: "valueDate", label: "Value Date", value: new Date().toISOString().slice(0, 10) },
    { key: "maturityDate", label: "Maturity Date", value: "2027-05-07" },
    { key: "ncbsHoldStatus", label: "NCBS Hold", value: "AVAILABLE" },
    { key: "callbackStatus", label: "Callback", value: "CONFIRMED" },
  ],
  MUTUAL_FUND: [
    { key: "fundCode", label: "Fund Code", value: "MF-DANAMON-01" },
    { key: "orderMode", label: "Order Mode", value: "SUBSCRIPTION" },
    { key: "sidStatus", label: "SID", value: "AVAILABLE" },
    { key: "riskProfileStatus", label: "Risk Profile", value: "AVAILABLE" },
    { key: "pfeStatus", label: "PFE", value: "AVAILABLE" },
  ],
  BOND: [
    { key: "bondIsin", label: "Bond ISIN", value: "IDBOND000001" },
    { key: "price", label: "Price", value: "100.25" },
    { key: "yieldPercent", label: "Yield", value: "6.2" },
    { key: "settlementDate", label: "Settlement Date", value: new Date().toISOString().slice(0, 10) },
    { key: "sidStatus", label: "SID", value: "AVAILABLE" },
  ],
  FX_TODAY: [
    { key: "currencyPair", label: "Pair", value: "USD/IDR" },
    { key: "direction", label: "Direction", value: "BUY" },
    { key: "specialRate", label: "Special Rate", value: "16100" },
    { key: "customerConfirmationStatus", label: "Confirmation", value: "CONFIRMED" },
    { key: "underlyingDocumentStatus", label: "Underlying Doc", value: "VERIFIED" },
  ],
  WEALTH_LENDING: [
    { key: "facilityId", label: "Facility ID", value: "WL-FAC-001" },
    { key: "collateralSnapshotStatus", label: "Collateral", value: "AVAILABLE" },
    { key: "marketPriceStatus", label: "Market Price", value: "AVAILABLE" },
    { key: "outstandingStatus", label: "Outstanding", value: "AVAILABLE" },
    { key: "ltv", label: "LTV", value: "0.5" },
  ],
};

const familyDocs: Record<ProductFamily, string[]> = {
  MLD: ["MLD_APPLICATION", "CUSTOMER_CALLBACK", "NCBS_HOLD_EVIDENCE"],
  MUTUAL_FUND: ["FUND_ORDER_FORM", "RISK_PROFILE", "SID_REGISTRATION"],
  BOND: ["BOND_ORDER_FORM", "PRICE_LOCK_EVIDENCE", "SID_REGISTRATION"],
  FX_TODAY: ["FX_CONFIRMATION", "UNDERLYING_DOCUMENT", "TREASURY_RATE_EVIDENCE"],
  WEALTH_LENDING: ["FACILITY_AGREEMENT", "COLLATERAL_SNAPSHOT", "M2M_EVIDENCE"],
};

const sourceEvidence = (family: ProductFamily) => {
  const sources: Record<ProductFamily, string[]> = {
    MLD: ["NCBS_HOLD", "WEALTH_CORE_TRANCHE", "SALES_CALLBACK"],
    MUTUAL_FUND: ["AVANTRADE_STATIC", "WEALTH_CORE_SID", "OEMS_RISK"],
    BOND: ["WEALTH_CORE_BOND", "TREASURY_PRICE", "SID"],
    FX_TODAY: ["TREASURY_RATE", "CUSTOMER_CONFIRMATION", "DOCUMENT_CHECK"],
    WEALTH_LENDING: ["WEALTH_CORE_FACILITY", "MARKET_DATA", "CORE_BANKING_OUTSTANDING"],
  };
  return sources[family].map((evidenceType) => ({
    evidenceType,
    sourceSystem: evidenceType.split("_")[0],
    evidenceStatus: "AVAILABLE",
    ownerRole: "INTEGRATION_OPS",
  }));
};

export default function OemsProductTicketWorkbench() {
  const [family, setFamily] = useState<ProductFamily>("MLD");
  const [base, setBase] = useState({
    securityId: "SEC-MLD-001",
    customerId: "CUST-001",
    portfolioId: "PORT-001",
    transactionType: "MLD_SUBSCRIPTION",
    amount: "250000000",
    currency: "IDR",
    workflowCode: "MLD_ORDER_APPROVAL",
  });
  const [fields, setFields] = useState<Record<string, string>>(
    Object.fromEntries(familyFields.MLD.map((field) => [field.key, field.value])),
  );
  const [findings, setFindings] = useState<Finding[]>([]);
  const [ticketId, setTicketId] = useState("");

  const switchFamily = (next: ProductFamily) => {
    setFamily(next);
    setFields(Object.fromEntries(familyFields[next].map((field) => [field.key, field.value])));
    setBase((current) => ({
      ...current,
      securityId: `SEC-${next}-001`,
      transactionType: `${next}_ORDER`,
      workflowCode: `${next}_ORDER_APPROVAL`,
    }));
    setFindings([]);
    setTicketId("");
  };

  const payload = useMemo(() => ({
    productFamily: family,
    ...base,
    ...fields,
    amount: Number(base.amount),
    sourceEvidence: sourceEvidence(family),
    productPayload: {
      documentChecklist: familyDocs[family].map((documentType) => ({
        documentType,
        documentStatus: "PENDING_UPLOAD",
        blockingStage: "SUBMISSION",
      })),
      digitalVerification: {
        verificationStatus: "PENDING",
        binding: "TRANSACTION_AUTHORIZATION",
      },
      familySpecificCapture: fields,
    },
    productionIntent: true,
  }), [base, family, fields]);

  const validate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/product-tickets/validate-capture", payload),
    onSuccess: (data: any) => setFindings(data.findings ?? []),
  });

  const createTicket = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/product-tickets", payload),
    onSuccess: (data: any) => {
      setTicketId(data.ticket_id);
      setFindings(data.validation?.findings ?? []);
    },
  });

  const submit = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/product-tickets/${ticketId}/submit`, {
      workflowCode: base.workflowCode,
      reviewerRole: "BO_CHECKER",
    }),
  });

  const blockers = findings.filter((finding) => finding.severity === "BLOCKING").length;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Product Ticket Workbench</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{family}</Badge>
            <Badge variant={blockers > 0 ? "destructive" : "default"}>{blockers > 0 ? `${blockers} blockers` : "Ready"}</Badge>
            <Badge variant="outline">{ticketId || "Unsaved"}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => validate.mutate()} disabled={validate.isPending}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Validate
          </Button>
          <Button onClick={() => createTicket.mutate()} disabled={createTicket.isPending || blockers > 0}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Create
          </Button>
          <Button onClick={() => submit.mutate()} disabled={!ticketId || submit.isPending}>
            <Send className="mr-2 h-4 w-4" />
            Submit
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Capture</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Family</Label>
            <Select value={family} onValueChange={(value) => switchFamily(value as ProductFamily)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(familyFields).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {Object.entries(base).map(([key, value]) => (
            <div className="space-y-1" key={key}>
              <Label>{key}</Label>
              <Input value={value} onChange={(event) => setBase((current) => ({ ...current, [key]: event.target.value }))} />
            </div>
          ))}
          {familyFields[family].map((field) => (
            <div className="space-y-1" key={field.key}>
              <Label>{field.label}</Label>
              <Input value={fields[field.key] ?? ""} onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4" />
              Family Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {familyDocs[family].map((documentType) => (
                  <TableRow key={documentType}>
                    <TableCell>{documentType}</TableCell>
                    <TableCell><Badge variant="outline">SUBMISSION</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Validation Findings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {findings.length === 0 && <div className="text-sm text-muted-foreground">No findings</div>}
            {findings.map((finding) => (
              <div key={`${finding.ruleCode}-${finding.source}`} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{finding.ruleCode}</span>
                  <Badge variant={finding.severity === "BLOCKING" ? "destructive" : "outline"}>{finding.severity}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{finding.message}</p>
                {finding.repairHint && <p className="mt-1 text-xs text-muted-foreground">{finding.repairHint}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
