/**
 * securities-dashboard.tsx — Securities Services Dashboard
 * Stock transfers, rights, unclaimed certificates, stockholder meetings
 */

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Input } from "@ui/components/ui/input";
import { Search, ArrowRightLeft, FileText } from "lucide-react";

const API = "/api/v1/operations";

function fmt(n: string | number | null | undefined): string {
  const val = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default function SecuritiesDashboard() {
  const location = useLocation();
  const [search, setSearch] = useState("");

  const activeTab = location.pathname.includes("/rights")
    ? "rights"
    : location.pathname.includes("/unclaimed")
    ? "unclaimed"
    : location.pathname.includes("/meetings")
    ? "meetings"
    : "transfers";

  const { data: transfers = [] } = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: async () => {
      const res = await fetch(API + "/stock-transfers", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "transfers",
  });

  const { data: rights = [] } = useQuery({
    queryKey: ["stock-rights"],
    queryFn: async () => {
      const res = await fetch(API + "/stock-rights", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "rights",
  });

  const { data: unclaimed = [] } = useQuery({
    queryKey: ["unclaimed-certs"],
    queryFn: async () => {
      const res = await fetch(API + "/unclaimed-certificates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "unclaimed",
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["stockholder-meetings"],
    queryFn: async () => {
      const res = await fetch(API + "/stockholder-meetings", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "meetings",
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Securities Services
        </h1>
        <p className="text-muted-foreground">
          Stock transfers, rights processing, certificates, and stockholder meetings
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search..." value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>

      {activeTab === "transfers" && (
        <Card>
          <CardHeader><CardTitle>Stock Transfers</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer ID</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No transfers</TableCell></TableRow>
                ) : transfers.map((t: any) => (
                  <TableRow key={t.transfer_id}>
                    <TableCell className="font-mono text-sm">{t.transfer_id}</TableCell>
                    <TableCell>{t.security_id}</TableCell>
                    <TableCell>{t.transfer_type}</TableCell>
                    <TableCell>{t.transferor_name}</TableCell>
                    <TableCell>{t.transferee_name}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(t.quantity)}</TableCell>
                    <TableCell><Badge className={statusColors[t.transfer_status] ?? ""}>{t.transfer_status}</Badge></TableCell>
                    <TableCell>{t.transfer_date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "rights" && (
        <Card>
          <CardHeader><CardTitle>Stock Rights</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Right ID</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Record Date</TableHead>
                  <TableHead>Ex Date</TableHead>
                  <TableHead>Ratio</TableHead>
                  <TableHead className="text-right">Exercise Price</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rights.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No stock rights</TableCell></TableRow>
                ) : rights.map((r: any) => (
                  <TableRow key={r.right_id}>
                    <TableCell className="font-mono text-sm">{r.right_id}</TableCell>
                    <TableCell>{r.security_id}</TableCell>
                    <TableCell>{r.right_type}</TableCell>
                    <TableCell>{r.record_date}</TableCell>
                    <TableCell>{r.ex_date}</TableCell>
                    <TableCell>{r.ratio_from}:{r.ratio_to}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.exercise_price)}</TableCell>
                    <TableCell>{r.expiry_date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "unclaimed" && (
        <Card>
          <CardHeader><CardTitle>Unclaimed Certificates</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Vault Ref</TableHead>
                  <TableHead>Escheat Eligible</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unclaimed.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No unclaimed certificates</TableCell></TableRow>
                ) : unclaimed.map((c: any) => (
                  <TableRow key={c.certificate_id}>
                    <TableCell className="font-mono text-sm">{c.certificate_number}</TableCell>
                    <TableCell>{c.security_id}</TableCell>
                    <TableCell>{c.holder_name}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(c.quantity)}</TableCell>
                    <TableCell>{c.storage_location}</TableCell>
                    <TableCell>{c.vault_reference}</TableCell>
                    <TableCell>{c.escheat_eligible_date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "meetings" && (
        <Card>
          <CardHeader><CardTitle>Stockholder Meetings</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Meeting</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead className="text-right">Shares Voted</TableHead>
                  <TableHead>Quorum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meetings.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No stockholder meetings</TableCell></TableRow>
                ) : meetings.map((m: any) => (
                  <TableRow key={m.meeting_id}>
                    <TableCell className="font-mono text-sm">{m.meeting_id}</TableCell>
                    <TableCell>{m.security_id}</TableCell>
                    <TableCell>{m.meeting_type}</TableCell>
                    <TableCell>{m.meeting_date}</TableCell>
                    <TableCell>{m.venue}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(m.total_voted_shares)}</TableCell>
                    <TableCell>
                      <Badge className={m.quorum_reached ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {m.quorum_reached ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
