/**
 * Client Portal - Request Action Page (Phase 5C)
 *
 * Features:
 * - Action type selector: Contribution, Withdrawal, Transfer, Redemption
 * - Dynamic form fields based on type
 * - Submit button -> POST /api/v1/client-portal/request-action
 * - Success confirmation with reference number
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Textarea } from "@ui/components/ui/textarea";
import { Badge } from "@ui/components/ui/badge";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  AlertCircle,
  Send,
  ArrowLeft,
  Copy,
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

// ---- Action Types ----

const ACTION_TYPES = [
  {
    value: "CONTRIBUTION",
    label: "Contribution",
    description: "Add funds to your portfolio",
    icon: ArrowDownCircle,
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    value: "WITHDRAWAL",
    label: "Withdrawal",
    description: "Withdraw funds from your portfolio",
    icon: ArrowUpCircle,
    color: "text-red-600 bg-red-50",
  },
  {
    value: "TRANSFER",
    label: "Transfer",
    description: "Transfer between your portfolios",
    icon: ArrowLeftRight,
    color: "text-blue-600 bg-blue-50",
  },
  {
    value: "REDEMPTION",
    label: "Redemption",
    description: "Redeem units from your portfolio",
    icon: Banknote,
    color: "text-amber-600 bg-amber-50",
  },
];

// ---- Component ----

export default function RequestActionPage() {
  const clientId = getClientId();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [actionType, setActionType] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [sourceAccount, setSourceAccount] = useState("");
  const [destinationAccount, setDestinationAccount] = useState("");
  const [fromPortfolio, setFromPortfolio] = useState("");
  const [toPortfolio, setToPortfolio] = useState("");
  const [portfolioId, setPortfolioId] = useState("");
  const [units, setUnits] = useState("");
  const [notes, setNotes] = useState("");
  const [successResult, setSuccessResult] = useState<{
    referenceNumber: string;
    actionType: string;
    submittedAt: string;
  } | null>(null);

  // Portfolio summary for selectors
  const { data: summary } = useQuery({
    queryKey: ["client-portal", "portfolio-summary", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/client-portal/portfolio-summary/${clientId}`)),
  });

  const portfolios: Array<{ id: string; name: string }> = summary?.portfolios ?? [];

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: (data: { clientId: string; actionType: string; details: Record<string, unknown> }) =>
      apiRequest("POST", apiUrl("/api/v1/client-portal/request-action"), data),
    onSuccess: (data) => {
      setSuccessResult({
        referenceNumber: data.referenceNumber,
        actionType: data.actionType,
        submittedAt: data.submittedAt,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Request Failed",
        description: err.message || "Failed to submit action request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!actionType) {
      toast({
        title: "Error",
        description: "Please select an action type.",
        variant: "destructive",
      });
      return;
    }

    let details: Record<string, unknown> = { notes };

    switch (actionType) {
      case "CONTRIBUTION":
        if (!amount || parseFloat(amount) <= 0) {
          toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
          return;
        }
        details = { ...details, amount: parseFloat(amount), sourceAccount, portfolioId: portfolioId || portfolios[0]?.id };
        break;

      case "WITHDRAWAL":
        if (!amount || parseFloat(amount) <= 0) {
          toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
          return;
        }
        details = { ...details, amount: parseFloat(amount), destinationAccount, portfolioId: portfolioId || portfolios[0]?.id };
        break;

      case "TRANSFER":
        if (!amount || parseFloat(amount) <= 0) {
          toast({ title: "Error", description: "Please enter a valid amount.", variant: "destructive" });
          return;
        }
        if (!fromPortfolio || !toPortfolio) {
          toast({ title: "Error", description: "Please select source and destination portfolios.", variant: "destructive" });
          return;
        }
        if (fromPortfolio === toPortfolio) {
          toast({ title: "Error", description: "Source and destination portfolios must be different.", variant: "destructive" });
          return;
        }
        details = { ...details, amount: parseFloat(amount), fromPortfolio, toPortfolio };
        break;

      case "REDEMPTION":
        if (!units || parseFloat(units) <= 0) {
          toast({ title: "Error", description: "Please enter valid units/amount.", variant: "destructive" });
          return;
        }
        details = { ...details, units: parseFloat(units), portfolioId: portfolioId || portfolios[0]?.id };
        break;
    }

    submitMutation.mutate({ clientId, actionType, details });
  };

  const handleReset = () => {
    setActionType("");
    setAmount("");
    setSourceAccount("");
    setDestinationAccount("");
    setFromPortfolio("");
    setToPortfolio("");
    setPortfolioId("");
    setUnits("");
    setNotes("");
    setSuccessResult(null);
  };

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    toast({ title: "Copied", description: "Reference number copied to clipboard." });
  };

  // Success screen
  if (successResult) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Request Submitted</h1>
        </div>

        <Card className="border-slate-200 max-w-lg mx-auto">
          <CardContent className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Request Received
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Your {successResult.actionType.toLowerCase()} request has been submitted
              for review. Our team will process it within 1-2 business days.
            </p>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 mb-6">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">
                Reference Number
              </p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-mono font-bold text-teal-700">
                  {successResult.referenceNumber}
                </span>
                <button
                  onClick={() => copyRef(successResult.referenceNumber)}
                  className="p-1 rounded hover:bg-slate-200 transition-colors"
                  aria-label="Copy reference number"
                >
                  <Copy className="h-4 w-4 text-slate-400" />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Submitted{" "}
                {new Date(successResult.submittedAt).toLocaleString("en-PH")}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                className="border-slate-300"
                onClick={handleReset}
              >
                Submit Another Request
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => navigate("/")}
              >
                Return to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Submit a Request
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Request an action on your portfolio. All requests require back-office
            approval.
          </p>
        </div>
      </div>

      {/* Action Type Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ACTION_TYPES.map((at) => (
          <button
            key={at.value}
            onClick={() => {
              setActionType(at.value);
              // Reset form fields
              setAmount("");
              setSourceAccount("");
              setDestinationAccount("");
              setFromPortfolio("");
              setToPortfolio("");
              setPortfolioId("");
              setUnits("");
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              actionType === at.value
                ? "border-teal-500 bg-teal-50/50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className={`inline-flex p-2 rounded-lg ${at.color}`}>
              <at.icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-slate-900 mt-3">
              {at.label}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{at.description}</p>
          </button>
        ))}
      </div>

      {/* Dynamic Form */}
      {actionType && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base text-slate-900">
              {ACTION_TYPES.find((t) => t.value === actionType)?.label} Details
            </CardTitle>
            <CardDescription className="text-slate-500">
              Fill in the details for your request
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* CONTRIBUTION Fields */}
              {actionType === "CONTRIBUTION" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="amount" className="text-sm text-slate-700">
                        Amount (PHP)
                      </Label>
                      <Input
                        id="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter amount..."
                        className="mt-1 border-slate-300"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="sourceAccount" className="text-sm text-slate-700">
                        Source Account
                      </Label>
                      <Input
                        id="sourceAccount"
                        value={sourceAccount}
                        onChange={(e) => setSourceAccount(e.target.value)}
                        placeholder="Bank account / reference"
                        className="mt-1 border-slate-300"
                      />
                    </div>
                  </div>
                  {portfolios.length > 0 && (
                    <div>
                      <Label className="text-sm text-slate-700">
                        Target Portfolio
                      </Label>
                      <Select
                        value={portfolioId || portfolios[0]?.id}
                        onValueChange={setPortfolioId}
                      >
                        <SelectTrigger className="mt-1 border-slate-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {portfolios.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {/* WITHDRAWAL Fields */}
              {actionType === "WITHDRAWAL" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="amount" className="text-sm text-slate-700">
                        Amount (PHP)
                      </Label>
                      <Input
                        id="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter amount..."
                        className="mt-1 border-slate-300"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="destAccount" className="text-sm text-slate-700">
                        Destination Account
                      </Label>
                      <Input
                        id="destAccount"
                        value={destinationAccount}
                        onChange={(e) => setDestinationAccount(e.target.value)}
                        placeholder="Receiving bank account"
                        className="mt-1 border-slate-300"
                      />
                    </div>
                  </div>
                  {portfolios.length > 0 && (
                    <div>
                      <Label className="text-sm text-slate-700">
                        From Portfolio
                      </Label>
                      <Select
                        value={portfolioId || portfolios[0]?.id}
                        onValueChange={setPortfolioId}
                      >
                        <SelectTrigger className="mt-1 border-slate-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {portfolios.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {/* TRANSFER Fields */}
              {actionType === "TRANSFER" && (
                <>
                  <div>
                    <Label htmlFor="transferAmount" className="text-sm text-slate-700">
                      Amount (PHP)
                    </Label>
                    <Input
                      id="transferAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount..."
                      className="mt-1 border-slate-300"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-slate-700">
                        From Portfolio
                      </Label>
                      <Select
                        value={fromPortfolio}
                        onValueChange={setFromPortfolio}
                      >
                        <SelectTrigger className="mt-1 border-slate-300">
                          <SelectValue placeholder="Select source..." />
                        </SelectTrigger>
                        <SelectContent>
                          {portfolios.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm text-slate-700">
                        To Portfolio
                      </Label>
                      <Select
                        value={toPortfolio}
                        onValueChange={setToPortfolio}
                      >
                        <SelectTrigger className="mt-1 border-slate-300">
                          <SelectValue placeholder="Select destination..." />
                        </SelectTrigger>
                        <SelectContent>
                          {portfolios.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* REDEMPTION Fields */}
              {actionType === "REDEMPTION" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="units" className="text-sm text-slate-700">
                        Units / Amount
                      </Label>
                      <Input
                        id="units"
                        type="number"
                        min="0"
                        step="0.01"
                        value={units}
                        onChange={(e) => setUnits(e.target.value)}
                        placeholder="Enter units or amount..."
                        className="mt-1 border-slate-300"
                        required
                      />
                    </div>
                    {portfolios.length > 0 && (
                      <div>
                        <Label className="text-sm text-slate-700">
                          Portfolio
                        </Label>
                        <Select
                          value={portfolioId || portfolios[0]?.id}
                          onValueChange={setPortfolioId}
                        >
                          <SelectTrigger className="mt-1 border-slate-300">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {portfolios.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Notes (common to all) */}
              <div>
                <Label htmlFor="notes" className="text-sm text-slate-700">
                  Additional Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional instructions or remarks..."
                  rows={3}
                  className="mt-1 border-slate-300"
                />
              </div>

              {/* Info Banner */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    Review Required
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    All requests are subject to back-office review and approval.
                    You will be notified once your request has been processed.
                    Processing typically takes 1-2 business days.
                  </p>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300"
                  onClick={handleReset}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-teal-600 hover:bg-teal-700 text-white px-6"
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
                      Submit Request
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Empty state when no type selected */}
      {!actionType && (
        <Card className="border-slate-200">
          <CardContent className="py-12 text-center">
            <ArrowLeftRight className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              Select an action type above to get started
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
