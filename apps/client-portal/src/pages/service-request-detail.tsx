/**
 * Client Portal - Service Request Detail Page
 *
 * Displays all SR fields with editability depending on status:
 * - APPROVED: remarks editable, Close Request action
 * - READY_FOR_TELLER: remarks editable, Close Request action
 * - INCOMPLETE: remarks editable, Re-send for Verification
 * - COMPLETED/REJECTED/CLOSED: read-only, no actions
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import { Input } from "@ui/components/ui/input";
import { Textarea } from "@ui/components/ui/textarea";
import { Label } from "@ui/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui/components/ui/alert-dialog";
import {
  ArrowLeft,
  Clock,
  FileText,
  Save,
  XCircle,
  Send,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const API = "/api/v1/client-portal";

function getToken(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).token || "";
  } catch {}
  return "";
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders() }).then((r) => r.json());
}

const statusColors: Record<string, string> = {
  NEW: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  READY_FOR_TELLER: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  INCOMPLETE: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  CLOSED: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
};

const priorityColors: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  LOW: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

const statusIcons: Record<string, typeof CheckCircle> = {
  COMPLETED: CheckCircle,
  REJECTED: XCircle,
  CLOSED: XCircle,
  INCOMPLETE: AlertTriangle,
};

interface ServiceRequest {
  id: number;
  request_id: string;
  client_id: string;
  sr_type: string;
  sr_details: string | null;
  priority: string;
  sr_status: string;
  request_date: string;
  closure_date: string | null;
  actual_closure_date: string | null;
  remarks: string | null;
  closure_reason: string | null;
  documents: string[] | null;
  service_branch: string | null;
  resolution_unit: string | null;
  sales_date: string | null;
  appointed_start_date: string | null;
  appointed_end_date: string | null;
  verification_notes: string | null;
  rejection_reason: string | null;
  request_age: number;
  created_at: string;
}

export default function ServiceRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [closureDate, setClosureDate] = useState<string | null>(null);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const { data, isPending } = useQuery<{ data: ServiceRequest }>({
    queryKey: ["service-request-detail", id],
    queryFn: () => fetcher(`${API}/service-requests/detail/${id}`),
    refetchInterval: 10000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["sr-history", id],
    queryFn: () => fetch(`${API}/service-requests/${id}/history`, {
      headers: authHeaders(),
    }).then(r => r.json()),
    enabled: !!id,
  });

  const sr = data?.data;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { remarks };
      if (closureDate !== null) body.closure_date = closureDate;
      const res = await fetch(`${API}/service-requests/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-request-detail", id] });
      toast.success("Changes saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/service-requests/${id}/close`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ reason: closeReason }),
      });
      if (!res.ok) throw new Error("Close failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-request-detail", id] });
      toast.success("Request closed");
      setCloseReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resubmitMutation = useMutation({
    mutationFn: async () => {
      const existingDocs = (sr?.documents as string[]) || [];
      const newDocNames = newFiles.map((f) => f.name);
      const res = await fetch(`${API}/service-requests/${id}/resubmit`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          remarks,
          documents: [...existingDocs, ...newDocNames],
        }),
      });
      if (!res.ok) throw new Error("Resubmit failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-request-detail", id] });
      setNewFiles([]);
      toast.success("Re-submitted for verification");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isPending || !sr) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/service-requests")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEditable = ["APPROVED", "READY_FOR_TELLER", "INCOMPLETE"].includes(sr.sr_status);
  const canClose = ["APPROVED", "READY_FOR_TELLER", "INCOMPLETE"].includes(sr.sr_status);
  const canResubmit = sr.sr_status === "INCOMPLETE";
  const isTerminal = ["COMPLETED", "REJECTED", "CLOSED"].includes(sr.sr_status);
  const StatusIcon = statusIcons[sr.sr_status];

  function formatDate(d: string | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString();
  }

  const effectiveRemarks = remarks !== null ? remarks : sr.remarks || "";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/service-requests")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{sr.request_id}</h1>
            <Badge className={statusColors[sr.sr_status] || ""} variant="secondary">
              {sr.sr_status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {sr.sr_type.replace(/_/g, " ")} &middot; Created {formatDate(sr.created_at)}
          </p>
        </div>
      </div>

      {/* Terminal status banner */}
      {isTerminal && (
        <div
          className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
            sr.sr_status === "COMPLETED"
              ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              : sr.sr_status === "REJECTED"
                ? "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                : "bg-purple-50 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
          }`}
        >
          {StatusIcon && <StatusIcon className="h-5 w-5" />}
          <span className="text-sm font-medium">
            {sr.sr_status === "COMPLETED" && "This request has been completed."}
            {sr.sr_status === "REJECTED" && `This request was rejected. Reason: ${sr.rejection_reason || "N/A"}`}
            {sr.sr_status === "CLOSED" && `This request was closed. Reason: ${sr.closure_reason || "N/A"}`}
          </span>
        </div>
      )}

      {/* Incomplete banner */}
      {sr.sr_status === "INCOMPLETE" && sr.verification_notes && (
        <div className="flex items-center gap-3 rounded-lg px-4 py-3 bg-orange-50 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <span className="text-sm font-medium">Marked Incomplete</span>
            <p className="text-sm">{sr.verification_notes}</p>
          </div>
        </div>
      )}

      {/* Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">Request Type</Label>
              <p className="font-medium">{sr.sr_type.replace(/_/g, " ")}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Priority</Label>
              <Badge className={priorityColors[sr.priority] || ""} variant="secondary">
                {sr.priority}
              </Badge>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Request Date</Label>
              <p>{formatDate(sr.request_date)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">SLA Closure Date</Label>
              {sr.sr_status === "READY_FOR_TELLER" ? (
                <Input
                  type="date"
                  value={closureDate !== null ? closureDate : (sr.closure_date ? sr.closure_date.slice(0, 10) : "")}
                  onChange={(e) => setClosureDate(e.target.value)}
                />
              ) : (
                <p>{formatDate(sr.closure_date)}</p>
              )}
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Request Age</Label>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{sr.request_age} days</span>
              </div>
            </div>
            {sr.actual_closure_date && (
              <div>
                <Label className="text-muted-foreground text-xs">Actual Closure Date</Label>
                <p>{formatDate(sr.actual_closure_date)}</p>
              </div>
            )}
          </div>

          {/* RM-filled fields (G-019) */}
          {(sr.service_branch || sr.resolution_unit || sr.sales_date || sr.appointed_start_date || sr.appointed_end_date) && (
            <div className="pt-2 border-t">
              <Label className="text-sm font-medium">RM Assignment Details</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                {sr.service_branch && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Service Branch</Label>
                    <p>{sr.service_branch}</p>
                  </div>
                )}
                {sr.resolution_unit && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Resolution Unit</Label>
                    <p>{sr.resolution_unit}</p>
                  </div>
                )}
                {sr.sales_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Sales Date</Label>
                    <p>{formatDate(sr.sales_date)}</p>
                  </div>
                )}
                {sr.appointed_start_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Appointed Start Date</Label>
                    <p>{formatDate(sr.appointed_start_date)}</p>
                  </div>
                )}
                {sr.appointed_end_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Appointed End Date</Label>
                    <p>{formatDate(sr.appointed_end_date)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {sr.sr_details && (
            <div>
              <Label className="text-muted-foreground text-xs">Details</Label>
              <p className="whitespace-pre-wrap text-sm">{sr.sr_details}</p>
            </div>
          )}

          {/* Editable remarks */}
          <div>
            <Label className="text-muted-foreground text-xs">Remarks</Label>
            {isEditable ? (
              <Textarea
                value={effectiveRemarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder="Add remarks..."
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm">{sr.remarks || "-"}</p>
            )}
          </div>

          {/* Attached Documents (G-012) */}
          {sr.documents && (sr.documents as string[]).length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Attached Documents</Label>
              <ul className="space-y-1">
                {(sr.documents as string[]).map((doc: string, i: number) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Document re-upload for INCOMPLETE status (G-013) */}
          {sr.sr_status === "INCOMPLETE" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Upload Additional Documents</Label>
              <p className="text-xs text-muted-foreground">PDF files only, max 10MB each</p>
              <Input
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  const accepted: File[] = [];
                  for (const file of selected) {
                    if (file.type !== "application/pdf") {
                      toast.error(`"${file.name}" is not a PDF file`);
                    } else if (file.size > 10 * 1024 * 1024) {
                      toast.error(`"${file.name}" exceeds 10MB limit`);
                    } else {
                      accepted.push(file);
                    }
                  }
                  setNewFiles((prev) => [...prev, ...accepted]);
                  e.target.value = "";
                }}
              />
              {newFiles.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {newFiles.map((file, i) => (
                    <li key={i} className="flex items-center justify-between text-sm bg-muted rounded px-3 py-1.5">
                      <span className="truncate">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {!isTerminal && (
        <div className="flex flex-wrap gap-3 justify-end">
          {isEditable && ((remarks !== null && remarks !== (sr.remarks || "")) || closureDate !== null) && (
            <Button
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          )}

          {canResubmit && (
            <Button
              onClick={() => resubmitMutation.mutate()}
              disabled={resubmitMutation.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              {resubmitMutation.isPending ? "Submitting..." : "Re-send for Verification"}
            </Button>
          )}

          {canClose && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <XCircle className="mr-2 h-4 w-4" /> Close Request
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close Service Request</AlertDialogTitle>
                  <AlertDialogDescription>
                    Please provide a reason for closing this request. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  placeholder="Closure reason..."
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  rows={3}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!closeReason.trim() || closeMutation.isPending}
                    onClick={() => closeMutation.mutate()}
                  >
                    {closeMutation.isPending ? "Closing..." : "Confirm Close"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {/* Status History Timeline */}
      {historyData?.data?.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" /> Status History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-6 space-y-6">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border" />
              {historyData.data.map((entry: any, i: number) => (
                <div key={i} className="relative">
                  <div className="absolute -left-4 top-1 h-3 w-3 rounded-full bg-teal-500 border-2 border-background" />
                  <div>
                    <p className="text-sm font-medium">{entry.action}: {entry.from_status || '\u2014'} \u2192 {entry.to_status}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} by {entry.changed_by}
                    </p>
                    {entry.notes && <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
