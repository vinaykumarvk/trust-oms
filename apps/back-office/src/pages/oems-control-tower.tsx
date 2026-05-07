import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { AlertTriangle, Gauge, RefreshCw, ShieldCheck } from "lucide-react";

const roles = ["BO_CHECKER", "BO_HEAD", "INTEGRATION_OPS", "COMPLIANCE_RISK", "TREASURY"];

export default function OemsControlTower() {
  const [role, setRole] = useState("BO_CHECKER");
  const [reassign, setReassign] = useState({ queueItemId: "", assignedRole: "BO_HEAD", reason: "SLA escalation" });
  const [incidentLink, setIncidentLink] = useState({
    controlId: "",
    incidentId: "",
    incidentType: "OPERATIONS_EXCEPTION",
    severity: "HIGH",
    remediationOwner: "INTEGRATION_OPS",
  });
  const query = useQuery({
    queryKey: ["oems-control-tower", role],
    queryFn: () => apiRequest("GET", `/api/v1/oems/control-tower?role=${role}`),
  });
  const data: any = query.data ?? {};
  const buckets = useMemo(() => data.summary?.slaBuckets ?? {}, [data]);
  const reassignMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/approval-queue/${reassign.queueItemId}/reassign`, {
      assignedRole: reassign.assignedRole,
      reason: reassign.reason,
    }),
    onSuccess: () => query.refetch(),
  });
  const incidentMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/oems/control-ownership/${incidentLink.controlId}/incidents`, {
      incidentId: incidentLink.incidentId,
      incidentType: incidentLink.incidentType,
      severity: incidentLink.severity,
      remediationOwner: incidentLink.remediationOwner,
      evidence: {
        source: "OEMS_CONTROL_TOWER",
        linkedByRole: role,
      },
    }),
  });

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">OEMS Control Tower</h1>
          <div className="mt-2 flex gap-2">
            <Badge>{role}</Badge>
            <Badge variant="outline">{data.summary?.queueCount ?? 0} queue</Badge>
            <Badge variant={(data.summary?.reconciliationOpenCount ?? 0) > 0 ? "destructive" : "default"}>
              {data.summary?.reconciliationOpenCount ?? 0} blockers
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {roles.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {["BREACHED", "DUE_1H", "DUE_4H", "ON_TRACK"].map((bucket) => (
          <Card key={bucket}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gauge className="h-4 w-4" />
                {bucket}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{buckets[bucket] ?? 0}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reassignment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_220px_1fr_auto]">
          <div className="space-y-1">
            <Label>Queue Item</Label>
            <Input value={reassign.queueItemId} onChange={(event) => setReassign((current) => ({ ...current, queueItemId: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={reassign.assignedRole} onValueChange={(value) => setReassign((current) => ({ ...current, assignedRole: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Input value={reassign.reason} onChange={(event) => setReassign((current) => ({ ...current, reason: event.target.value }))} />
          </div>
          <Button className="self-end" onClick={() => reassignMutation.mutate()} disabled={!reassign.queueItemId || reassignMutation.isPending}>
            Reassign
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incident Link</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_180px_180px_auto]">
          <div className="space-y-1">
            <Label>Control ID</Label>
            <Input value={incidentLink.controlId} onChange={(event) => setIncidentLink((current) => ({ ...current, controlId: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Incident ID</Label>
            <Input value={incidentLink.incidentId} onChange={(event) => setIncidentLink((current) => ({ ...current, incidentId: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Severity</Label>
            <Select value={incidentLink.severity} onValueChange={(value) => setIncidentLink((current) => ({ ...current, severity: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Owner</Label>
            <Input value={incidentLink.remediationOwner} onChange={(event) => setIncidentLink((current) => ({ ...current, remediationOwner: event.target.value }))} />
          </div>
          <Button className="self-end" onClick={() => incidentMutation.mutate()} disabled={!incidentLink.controlId || !incidentLink.incidentId || incidentMutation.isPending}>
            Link
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Blockers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.blockers ?? []).map((item: any) => (
                  <TableRow key={item.obligationId}>
                    <TableCell>{item.obligationId}</TableCell>
                    <TableCell>{item.sourceSystem}</TableCell>
                    <TableCell>{String(item.dueAt ?? "")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.queueItems ?? []).map((item: any) => (
                  <TableRow key={item.queueItemId}>
                    <TableCell>{item.queueItemId}</TableCell>
                    <TableCell>{item.approvalStatus}</TableCell>
                    <TableCell><Badge variant={item.slaBucket === "BREACHED" ? "destructive" : "outline"}>{item.slaBucket}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
