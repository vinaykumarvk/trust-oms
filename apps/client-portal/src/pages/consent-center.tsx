/**
 * Client Portal - Consent Management Center (Phase 6.4)
 *
 * Features:
 * - Consent toggle cards per purpose
 * - Erasure request form
 * - Consent history timeline
 * - DPA compliance info
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Switch } from "@ui/components/ui/switch";
import { Label } from "@ui/components/ui/label";
import { Badge } from "@ui/components/ui/badge";
import { Separator } from "@ui/components/ui/separator";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Shield,
  Eye,
  BarChart3,
  Mail,
  Users,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@ui/components/ui/toast";
import { useNavigate } from "react-router-dom";

// ---- Helpers ----

function getClientId(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).clientId || "CLT-001";
  } catch {}
  return "CLT-001";
}

// ---- Types ----

interface ConsentRecord {
  consent_id: string;
  purpose: string;
  granted: boolean;
  granted_at: string | null;
  withdrawn_at: string | null;
  legal_basis: string;
  channel_scope: string[];
  updated_at: string;
}

// ---- Purpose definitions ----

const CONSENT_PURPOSES = [
  {
    purpose: "PORTFOLIO_MANAGEMENT",
    label: "Portfolio Management",
    description: "Processing your investment data to manage and optimize your portfolio",
    icon: BarChart3,
    required: true,
  },
  {
    purpose: "MARKETING",
    label: "Marketing Communications",
    description: "Sending you information about new products, services, and promotions",
    icon: Mail,
    required: false,
  },
  {
    purpose: "ANALYTICS",
    label: "Analytics & Insights",
    description: "Using your data to generate personalized financial insights and reports",
    icon: Eye,
    required: false,
  },
  {
    purpose: "THIRD_PARTY_SHARING",
    label: "Third-Party Sharing",
    description: "Sharing your data with authorized partners for enhanced services",
    icon: Users,
    required: false,
  },
] as const;

// ---- Component ----

export default function ConsentCenterPage() {
  const clientId = getClientId();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [erasureReason, setErasureReason] = useState("");
  const [showErasureForm, setShowErasureForm] = useState(false);

  // Fetch current consents
  const { data: consents = [], isLoading } = useQuery<ConsentRecord[]>({
    queryKey: ["client-portal", "consents", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/consents/${clientId}`)),
  });

  // Grant consent mutation
  const grantMutation = useMutation({
    mutationFn: (data: { purpose: string }) =>
      apiRequest("POST", apiUrl("/api/v1/client-portal/consents"), {
        clientId,
        purpose: data.purpose,
        channelScope: ["WEB", "EMAIL"],
        legalBasis: "CONSENT",
        dpaRef: "DPA-2012-RA10173",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portal", "consents", clientId] });
      toast({ title: "Consent Updated", description: "Your consent preference has been saved." });
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message || "Failed to update consent.",
        variant: "destructive",
      });
    },
  });

  // Withdraw consent mutation
  const withdrawMutation = useMutation({
    mutationFn: (consentId: string) =>
      apiRequest("POST", apiUrl(`/api/v1/client-portal/consents/${consentId}/withdraw`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portal", "consents", clientId] });
      toast({ title: "Consent Withdrawn", description: "Your consent has been withdrawn." });
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message || "Failed to withdraw consent.",
        variant: "destructive",
      });
    },
  });

  // Request erasure mutation
  const erasureMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl("/api/v1/client-portal/erasure-request"), {
        clientId,
        reason: erasureReason,
      }),
    onSuccess: () => {
      setShowErasureForm(false);
      setErasureReason("");
      toast({
        title: "Erasure Requested",
        description: "Your data erasure request has been submitted. You will be contacted within 30 days.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Erasure Request Failed",
        description: err.message || "Failed to submit erasure request.",
        variant: "destructive",
      });
    },
  });

  const getConsentForPurpose = (purpose: string): ConsentRecord | undefined =>
    consents.find((c) => c.purpose === purpose && c.granted);

  const handleToggle = (purpose: string, isRequired: boolean) => {
    if (isRequired) {
      toast({
        title: "Required Consent",
        description: "This consent is required for service delivery and cannot be withdrawn.",
        variant: "destructive",
      });
      return;
    }

    const existing = getConsentForPurpose(purpose);
    if (existing) {
      withdrawMutation.mutate(existing.consent_id);
    } else {
      grantMutation.mutate({ purpose });
    }
  };

  // Build consent history from all records
  const consentHistory = [...consents]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")} aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-gray-100">Consent Management</h1>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            Manage your data privacy preferences under the Data Privacy Act (RA 10173)
          </p>
        </div>
      </div>

      {/* DPA Info Banner */}
      <div className="flex items-start gap-3 p-3 sm:p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Your Data Rights</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
            Under the Philippine Data Privacy Act (RA 10173), you have the right to be
            informed, to object, to access, to rectify, to erase, and to data portability.
            Toggle your consent preferences below.
          </p>
        </div>
      </div>

      {/* Consent Toggles */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-base text-foreground dark:text-gray-100">Data Processing Consents</CardTitle>
          <CardDescription className="text-muted-foreground dark:text-gray-400">
            Control how your personal data is processed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground dark:text-gray-400">
              Loading your consent preferences...
            </div>
          ) : (
            <div className="space-y-1">
              {CONSENT_PURPOSES.map((cp, idx) => {
                const isGranted = cp.required || !!getConsentForPurpose(cp.purpose);
                return (
                  <div key={cp.purpose}>
                    <div className="flex items-center justify-between py-3 sm:py-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted dark:bg-gray-700 shrink-0 mt-0.5">
                          <cp.icon className="h-4 w-4 text-muted-foreground dark:text-gray-400" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`consent-${cp.purpose}`}
                              className="text-sm font-medium text-foreground dark:text-gray-200 cursor-pointer"
                            >
                              {cp.label}
                            </Label>
                            {cp.required && (
                              <Badge variant="secondary" className="text-xs">
                                Required
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400 mt-0.5">
                            {cp.description}
                          </p>
                        </div>
                      </div>
                      <Switch
                        id={`consent-${cp.purpose}`}
                        checked={isGranted}
                        onCheckedChange={() => handleToggle(cp.purpose, cp.required)}
                        disabled={
                          cp.required ||
                          grantMutation.isPending ||
                          withdrawMutation.isPending
                        }
                        className="data-[state=checked]:bg-teal-600"
                        aria-label={`Toggle ${cp.label}`}
                      />
                    </div>
                    {idx < CONSENT_PURPOSES.length - 1 && <Separator className="bg-muted dark:bg-gray-700" />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consent History */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-base text-foreground dark:text-gray-100">Consent History</CardTitle>
          <CardDescription className="text-muted-foreground dark:text-gray-400">
            Recent changes to your consent preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          {consentHistory.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground dark:text-gray-400">
              No consent history available.
            </div>
          ) : (
            <div className="space-y-3">
              {consentHistory.map((record) => (
                <div
                  key={record.consent_id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 dark:bg-gray-700/50"
                >
                  <div className="mt-0.5">
                    {record.granted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <p className="text-sm font-medium text-foreground dark:text-gray-200 truncate">
                        {record.granted ? "Granted" : "Withdrawn"}: {record.purpose}
                      </p>
                      <span className="text-xs text-muted-foreground dark:text-gray-400 shrink-0">
                        {new Date(record.updated_at).toLocaleDateString("en-PH")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground dark:text-gray-500 mt-0.5">
                      Legal basis: {record.legal_basis} | Channels:{" "}
                      {record.channel_scope?.join(", ") || "N/A"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Erasure Section */}
      <Card className="border-border border-red-200 dark:border-red-900 dark:bg-gray-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            <div>
              <CardTitle className="text-base text-foreground dark:text-gray-100">
                Right to Erasure
              </CardTitle>
              <CardDescription className="text-muted-foreground dark:text-gray-400">
                Request deletion of your personal data
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!showErasureForm ? (
            <div>
              <p className="text-sm text-muted-foreground dark:text-gray-400 mb-4">
                Under the Data Privacy Act, you have the right to request erasure of your
                personal data. Please note that some data may be retained to comply with
                regulatory obligations (BSP 7-year, BIR 10-year retention requirements).
              </p>
              <Button
                variant="outline"
                className="border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => setShowErasureForm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                Request Data Erasure
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 sm:p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Important Notice</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    Submitting an erasure request is irreversible. Your personal data will be
                    anonymized within 30 days, subject to regulatory retention requirements.
                    Active portfolios must be closed before erasure can proceed.
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="erasure-reason" className="text-sm text-foreground dark:text-gray-200">
                  Reason for Erasure (Optional)
                </Label>
                <Textarea
                  id="erasure-reason"
                  value={erasureReason}
                  onChange={(e) => setErasureReason(e.target.value)}
                  placeholder="Please describe your reason for requesting data erasure..."
                  rows={3}
                  className="mt-1 border-border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="border-border dark:border-gray-600"
                  onClick={() => {
                    setShowErasureForm(false);
                    setErasureReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => erasureMutation.mutate()}
                  disabled={erasureMutation.isPending}
                >
                  {erasureMutation.isPending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Confirm Erasure Request
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DPA Reference Footer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground dark:text-gray-400 p-3 sm:p-4 rounded-lg bg-muted dark:bg-gray-800">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Data processing governed by Republic Act No. 10173 (Data Privacy Act of 2012) and
          NPC Circular 2016-01. For questions, contact the Data Protection Officer.
        </span>
      </div>
    </div>
  );
}
