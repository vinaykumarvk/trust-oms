/**
 * Client Portal - Create Service Request Page
 *
 * Features:
 * - SR Type dropdown, SR Details textarea, Priority toggle (Low/Medium/High)
 * - Auto-computed Closure Date (read-only display based on priority)
 * - Remarks textarea, Document Upload
 * - Submit → success confirmation with Request ID
 */

import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Textarea } from "@ui/components/ui/textarea";
import { Label } from "@ui/components/ui/label";
import { Badge } from "@ui/components/ui/badge";
import {
  CheckCircle2,
  ArrowLeft,
  Send,
  Copy,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

function getClientId(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).clientId || "CLT-001";
  } catch {}
  return "CLT-001";
}

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

const SR_TYPES = [
  { value: "REVIEW_PORTFOLIO", label: "Review Portfolio" },
  { value: "MULTIPLE_MANDATE_REGISTRATION", label: "Multiple Mandate Registration" },
  { value: "NOMINEE_UPDATION", label: "Nominee Update" },
  { value: "ACCOUNT_CLOSURE", label: "Account Closure" },
  { value: "STATEMENT_REQUEST", label: "Statement Request" },
  { value: "ADDRESS_CHANGE", label: "Address Change" },
  { value: "BENEFICIARY_UPDATE", label: "Beneficiary Update" },
  { value: "GENERAL_INQUIRY", label: "General Inquiry" },
] as const;

const SLA_DAYS: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 5,
  LOW: 7,
};

export default function ServiceRequestCreatePage() {
  const navigate = useNavigate();
  const clientId = getClientId();

  const [srType, setSrType] = useState("");
  const [srDetails, setSrDetails] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [requestId, setRequestId] = useState("");

  const closureDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (SLA_DAYS[priority] || 5));
    return d.toLocaleDateString();
  }, [priority]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/client-portal/service-requests", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          client_id: clientId,
          sr_type: srType,
          sr_details: srDetails,
          priority,
          remarks,
          documents: files.map((f) => f.name),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to create service request");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRequestId(data.data?.request_id || "");
      setSubmitted(true);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">Request Submitted</h2>
            <p className="text-muted-foreground">
              Your service request has been created successfully.
            </p>
            <div className="flex items-center justify-center gap-2 bg-muted rounded-lg px-4 py-3">
              <span className="font-mono text-lg font-semibold">{requestId}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(requestId);
                  toast.success("Copied to clipboard");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate("/service-requests")}>
                <ClipboardList className="mr-2 h-4 w-4" /> View All Requests
              </Button>
              <Button
                onClick={() => {
                  setSubmitted(false);
                  setSrType("");
                  setSrDetails("");
                  setPriority("MEDIUM");
                  setRemarks("");
                  setFiles([]);
                }}
              >
                Create Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/service-requests")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Service Request</h1>
          <p className="text-muted-foreground">Submit a new request to your relationship manager</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
          <CardDescription>
            Fill in the details below. Your request will be reviewed by your RM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* SR Type */}
          <div className="space-y-2">
            <Label>Request Type *</Label>
            <Select value={srType} onValueChange={setSrType}>
              <SelectTrigger>
                <SelectValue placeholder="Select request type" />
              </SelectTrigger>
              <SelectContent>
                {SR_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Details */}
          <div className="space-y-2">
            <Label>Details</Label>
            <Textarea
              placeholder="Describe your request in detail..."
              value={srDetails}
              onChange={(e) => setSrDetails(e.target.value)}
              rows={4}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <div className="flex gap-2">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={priority === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPriority(p)}
                  className={
                    priority === p
                      ? p === "HIGH"
                        ? "bg-red-600 hover:bg-red-700"
                        : p === "MEDIUM"
                          ? "bg-yellow-600 hover:bg-yellow-700"
                          : "bg-green-600 hover:bg-green-700"
                      : ""
                  }
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>

          {/* Closure Date (computed) */}
          <div className="space-y-2">
            <Label>Expected Closure Date (SLA)</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
              <Badge variant="outline">{SLA_DAYS[priority]}d SLA</Badge>
              <span>{closureDate}</span>
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <Label>Remarks (optional)</Label>
            <Textarea
              placeholder="Any additional remarks..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
            />
          </div>

          {/* Document Upload */}
          <div className="space-y-2">
            <Label>Documents (Optional)</Label>
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
                setFiles((prev) => [...prev, ...accepted]);
                e.target.value = "";
              }}
            />
            {files.length > 0 && (
              <ul className="space-y-1 pt-1">
                {files.map((file, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-muted rounded px-3 py-1.5">
                    <span className="truncate">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate("/service-requests")}>
              Cancel
            </Button>
            <Button
              disabled={!srType || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Send className="mr-2 h-4 w-4" />
              {createMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
