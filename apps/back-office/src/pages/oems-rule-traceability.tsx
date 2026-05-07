import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { GitBranch, RefreshCw, ShieldCheck } from "lucide-react";

export default function OemsRuleTraceability() {
  const [form, setForm] = useState({
    ruleCode: "ODA_MINIMUM_TRUSTWORTHY_ORDER",
    ruleVersion: "1",
    securityId: "",
    policyReference: "OEMS-POLICY-001",
    policyOwnerRole: "COMPLIANCE_RISK",
    controlObjective: "Every production order is tied to certified policy rules.",
    testReference: "tests/e2e/danamon-oems.spec.ts",
    certificationStatus: "CERTIFIED",
  });
  const [invalidateReason, setInvalidateReason] = useState("Rule changed in structured editor");
  const query = useQuery({
    queryKey: ["oems-rule-traceability", form.ruleCode],
    queryFn: () => apiRequest("GET", `/api/v1/oems/policy-rule-traceability?ruleCode=${encodeURIComponent(form.ruleCode)}`),
  });
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/policy-rule-traceability", {
      ...form,
      ruleVersion: Number(form.ruleVersion),
      securityId: form.securityId || undefined,
      evidence: {
        structuredRuleEditor: true,
        fields: form,
      },
    }),
    onSuccess: () => query.refetch(),
  });
  const invalidate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/oems/policy-rule-traceability/invalidate", {
      ruleCode: form.ruleCode,
      securityId: form.securityId || undefined,
      reason: invalidateReason,
      evidence: { structuredRuleEditor: true },
    }),
    onSuccess: () => query.refetch(),
  });

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Rule Traceability</h1>
          <div className="mt-2 flex gap-2">
            <Badge>{form.ruleCode}</Badge>
            <Badge variant="outline">Structured Editor</Badge>
          </div>
        </div>
        <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Certification Fields
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {Object.entries(form).map(([key, value]) => (
            <div className="space-y-1" key={key}>
              <Label>{key}</Label>
              <Input value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
            </div>
          ))}
          <div className="space-y-1 md:col-span-2">
            <Label>Invalidation Reason</Label>
            <Input value={invalidateReason} onChange={(event) => setInvalidateReason(event.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Certify
            </Button>
            <Button variant="outline" onClick={() => invalidate.mutate()} disabled={invalidate.isPending}>
              Invalidate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Security</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((query.data as any[]) ?? []).map((item: any) => (
                <TableRow key={item.traceability_id}>
                  <TableCell>{item.rule_code} v{item.rule_version}</TableCell>
                  <TableCell>{item.security_id ?? "ALL"}</TableCell>
                  <TableCell>
                    <Badge variant={item.certification_status === "CERTIFIED" ? "default" : "destructive"}>
                      {item.certification_status}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.recertification_due_at ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
