/**
 * Client Portal - Corporate Action Election Wizard (Phase 6.3)
 *
 * Features:
 * - Step wizard: Review Event -> Select Option -> Confirm -> Submit
 * - Uses ca_options + client_elections schema
 * - Quantity input with position validation
 * - Summary confirmation before submission
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Badge } from "@ui/components/ui/badge";
import { Separator } from "@ui/components/ui/separator";
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Send,
  FileText,
  ListChecks,
  Eye,
  Clock,
} from "lucide-react";
import { useToast } from "@ui/components/ui/toast";
import { useNavigate, useSearchParams } from "react-router-dom";

// ---- Helpers ----

function getClientId(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored).clientId || "CLT-001";
  } catch {}
  return "CLT-001";
}

// ---- Types ----

interface CAEvent {
  event_id: string;
  event_type: string;
  issuer_name: string;
  security_id: string;
  ex_date: string;
  record_date: string;
  payment_date: string;
  description: string;
  status: string;
}

interface CAOption {
  option_id: string;
  option_type: string;
  description: string;
  default_flag: boolean;
  deadline: string;
  ratio?: string;
  cash_amount?: number;
  currency?: string;
}

interface HoldingPosition {
  security_id: string;
  quantity: number;
  portfolio_id: string;
  portfolio_name: string;
}

// ---- Steps ----

const STEPS = [
  { key: "review", label: "Review Event", icon: Eye },
  { key: "select", label: "Select Option", icon: ListChecks },
  { key: "confirm", label: "Confirm", icon: FileText },
  { key: "submitted", label: "Submitted", icon: CheckCircle2 },
] as const;

// ---- Component ----

export default function ElectionWizardPage() {
  const clientId = getClientId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const eventId = searchParams.get("eventId") || "";

  const [step, setStep] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [submittedRef, setSubmittedRef] = useState<string>("");

  // Fetch event details
  const { data: event, isLoading: loadingEvent } = useQuery<CAEvent>({
    queryKey: ["client-portal", "ca-event", eventId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/corporate-actions/${eventId}`)),
    enabled: !!eventId,
  });

  // Fetch available options
  const { data: options = [] } = useQuery<CAOption[]>({
    queryKey: ["client-portal", "ca-options", eventId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/corporate-actions/${eventId}/options`)),
    enabled: !!eventId,
  });

  // Fetch client's position
  const { data: position } = useQuery<HoldingPosition>({
    queryKey: ["client-portal", "position", clientId, event?.security_id],
    queryFn: () =>
      apiRequest(
        "GET",
        apiUrl(`/api/v1/client-portal/positions/${clientId}/${event?.security_id}`),
      ),
    enabled: !!event?.security_id,
  });

  // Submit election
  const submitMutation = useMutation({
    mutationFn: (data: {
      clientId: string;
      eventId: string;
      optionId: string;
      quantity: number;
    }) =>
      apiRequest("POST", apiUrl("/api/v1/client-portal/elections"), data),
    onSuccess: (data: { electionId: string }) => {
      setSubmittedRef(data.electionId);
      setStep(3);
    },
    onError: (err: Error) => {
      toast({
        title: "Election Failed",
        description: err.message || "Failed to submit election. Please try again.",
        variant: "destructive",
      });
    },
  });

  const selectedOption = options.find((o) => o.option_id === selectedOptionId);
  const maxQuantity = position?.quantity ?? 0;
  const parsedQty = parseFloat(quantity) || 0;

  const handleNext = () => {
    if (step === 1 && !selectedOptionId) {
      toast({ title: "Error", description: "Please select an option.", variant: "destructive" });
      return;
    }
    if (step === 1 && parsedQty <= 0) {
      toast({ title: "Error", description: "Please enter a valid quantity.", variant: "destructive" });
      return;
    }
    if (step === 1 && parsedQty > maxQuantity) {
      toast({
        title: "Error",
        description: `Quantity exceeds your position of ${maxQuantity.toLocaleString()} units.`,
        variant: "destructive",
      });
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = () => {
    submitMutation.mutate({
      clientId,
      eventId,
      optionId: selectedOptionId,
      quantity: parsedQty,
    });
  };

  // No event selected
  if (!eventId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Corporate Action Election</h1>
        </div>
        <Card className="border-border">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No corporate action event specified. Please select an event from your notifications.
            </p>
            <Button
              className="mt-4 bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => navigate("/")}
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")} aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-gray-100">Corporate Action Election</h1>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            Review the event and submit your election
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                i === step
                  ? "bg-teal-600 text-white"
                  : i < step
                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                    : "bg-muted dark:bg-gray-700 text-muted-foreground dark:text-gray-400"
              }`}
              aria-current={i === step ? "step" : undefined}
            >
              <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-4 sm:w-6 ${i < step ? "bg-teal-400" : "bg-border dark:bg-gray-600"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Review Event */}
      {step === 0 && (
        <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-base text-foreground dark:text-gray-100">Event Details</CardTitle>
            <CardDescription className="text-muted-foreground dark:text-gray-400">
              Review the corporate action before making your election
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingEvent ? (
              <div className="py-8 text-center text-sm text-muted-foreground dark:text-gray-400">
                Loading event details...
              </div>
            ) : event ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400">Event Type</p>
                    <p className="text-sm font-medium text-foreground dark:text-gray-200">{event.event_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400">Status</p>
                    <Badge variant="outline">{event.status}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400">Issuer</p>
                    <p className="text-sm font-medium text-foreground dark:text-gray-200">{event.issuer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400">Security</p>
                    <p className="text-sm font-medium text-foreground dark:text-gray-200">{event.security_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400">Ex-Date</p>
                    <p className="text-sm text-foreground dark:text-gray-200">{event.ex_date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400">Record Date</p>
                    <p className="text-sm text-foreground dark:text-gray-200">{event.record_date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400">Payment Date</p>
                    <p className="text-sm text-foreground dark:text-gray-200">{event.payment_date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-gray-400">Your Position</p>
                    <p className="text-sm font-medium text-foreground dark:text-gray-200">
                      {position ? `${position.quantity.toLocaleString()} units` : "Loading..."}
                    </p>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground dark:text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-foreground dark:text-gray-200">{event.description}</p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-red-600">
                Event not found. Please check the event ID.
              </div>
            )}

            <div className="flex justify-end mt-6">
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={handleNext}
                disabled={!event}
              >
                Next: Select Option
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Select Option + Quantity */}
      {step === 1 && (
        <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-base text-foreground dark:text-gray-100">Select Your Option</CardTitle>
            <CardDescription className="text-muted-foreground dark:text-gray-400">
              Choose how you want to participate in this corporate action
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-6">
              {options.map((opt) => (
                <button
                  type="button"
                  key={opt.option_id}
                  onClick={() => setSelectedOptionId(opt.option_id)}
                  className={`w-full p-3 sm:p-4 rounded-lg border-2 text-left transition-all ${
                    selectedOptionId === opt.option_id
                      ? "border-teal-500 bg-teal-50/50 dark:bg-teal-900/20"
                      : "border-border dark:border-gray-600 hover:border-muted-foreground/30 dark:hover:border-gray-500"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground dark:text-gray-200">
                          {opt.option_type}
                        </p>
                        {opt.default_flag && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {opt.description}
                      </p>
                      {opt.ratio && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Ratio: {opt.ratio}
                        </p>
                      )}
                      {opt.cash_amount != null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Cash: {opt.currency || "PHP"} {opt.cash_amount.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Deadline: {new Date(opt.deadline).toLocaleDateString()}</span>
                    </div>
                  </div>
                </button>
              ))}

              {options.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No options available for this event.
                </div>
              )}
            </div>

            <Separator className="mb-4" />

            <div className="max-w-xs">
              <Label htmlFor="election-qty" className="text-sm text-foreground dark:text-gray-200">
                Quantity (max: {maxQuantity.toLocaleString()})
              </Label>
              <Input
                id="election-qty"
                type="number"
                min="1"
                max={maxQuantity}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity..."
                className="mt-1 border-border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              {parsedQty > maxQuantity && (
                <p className="text-xs text-red-600 mt-1">
                  Exceeds your position of {maxQuantity.toLocaleString()} units
                </p>
              )}
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" className="border-border" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={handleNext}
              >
                Next: Confirm
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && (
        <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-base text-foreground dark:text-gray-100">Confirm Your Election</CardTitle>
            <CardDescription className="text-muted-foreground dark:text-gray-400">
              Please review and confirm the details below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted dark:bg-gray-700 border border-border dark:border-gray-600 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Event</p>
                  <p className="text-sm font-medium text-foreground dark:text-gray-200">
                    {event?.event_type} — {event?.issuer_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Security</p>
                  <p className="text-sm text-foreground dark:text-gray-200">{event?.security_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Selected Option</p>
                  <p className="text-sm font-medium text-foreground dark:text-gray-200">
                    {selectedOption?.option_type}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Quantity</p>
                  <p className="text-sm font-medium text-foreground dark:text-gray-200">
                    {parsedQty.toLocaleString()} units
                  </p>
                </div>
              </div>
              {selectedOption?.cash_amount != null && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Proceeds</p>
                    <p className="text-sm font-bold text-teal-700 dark:text-teal-400">
                      {selectedOption.currency || "PHP"}{" "}
                      {(selectedOption.cash_amount * parsedQty).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-start gap-3 p-3 sm:p-4 mt-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Irrevocable Submission</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Once submitted, this election cannot be changed. Please ensure all details
                  are correct before proceeding.
                </p>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" className="border-border" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white px-6"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Election
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Submitted */}
      {step === 3 && (
        <Card className="border-border dark:border-gray-700 dark:bg-gray-800 max-w-lg mx-auto">
          <CardContent className="p-6 sm:p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-foreground dark:text-gray-100 mb-2">Election Submitted</h2>
            <p className="text-sm text-muted-foreground dark:text-gray-400 mb-6">
              Your election for the {event?.event_type?.toLowerCase()} event has been
              recorded. You will be notified when it is processed.
            </p>

            <div className="rounded-lg bg-muted dark:bg-gray-700 border border-border dark:border-gray-600 p-4 mb-6">
              <p className="text-xs text-muted-foreground dark:text-gray-400 uppercase tracking-wider font-medium mb-1">
                Election Reference
              </p>
              <span className="text-lg font-mono font-bold text-teal-700 dark:text-teal-400">
                {submittedRef}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                className="border-border"
                onClick={() => navigate("/")}
              >
                Return to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
