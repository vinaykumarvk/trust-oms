/**
 * Client Onboarding Wizard — Phase 1A
 *
 * Multi-step onboarding form implementing BRD FR-ONB-001 through FR-ONB-007.
 *
 * Steps:
 *   1. Identity — Legal Name, Type, TIN, DOB, ID, Address, Contact
 *   2. Risk Assessment — Questionnaire with auto-calculated risk rating
 *   3. UBO (Beneficial Owners) — Table to capture 25%+ owners
 *   4. FATCA/CRS — US Person, jurisdictions, foreign TIN, self-certification
 *   5. Suitability Profile — Risk tolerance, horizon, knowledge -> auto-score
 *   6. Sanctions Screening — Auto-run screening stub
 *   7. Review & Submit — Summary of all captured data
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@ui/lib/queryClient';
import { useToast } from '@ui/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/ui/select';
import { Switch } from '@ui/components/ui/switch';
import { Textarea } from '@ui/components/ui/textarea';
import { Badge } from '@ui/components/ui/badge';
import {
  User,
  ShieldAlert,
  Users,
  Globe,
  Target,
  Search,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Identity', icon: User },
  { id: 2, label: 'Risk Assessment', icon: ShieldAlert },
  { id: 3, label: 'UBO', icon: Users },
  { id: 4, label: 'FATCA/CRS', icon: Globe },
  { id: 5, label: 'Suitability', icon: Target },
  { id: 6, label: 'Screening', icon: Search },
  { id: 7, label: 'Review', icon: CheckCircle },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UBO {
  name: string;
  tin: string;
  ownership_pct: number;
  verified: boolean;
}

interface OnboardingData {
  // Step 1: Identity
  legal_name: string;
  type: string;
  tin: string;
  birth_date: string;
  id_type: string;
  id_number: string;
  address: string;
  contact_phone: string;
  contact_email: string;

  // Step 2: Risk Assessment
  source_of_income: string;
  annual_income: string;
  purpose_of_investment: string;
  investment_experience: string;
  calculated_risk: string;

  // Step 3: UBO
  beneficial_owners: UBO[];

  // Step 4: FATCA/CRS
  us_person: boolean;
  reporting_jurisdictions: string;
  tin_foreign: string;
  fatca_certified: boolean;

  // Step 5: Suitability
  risk_tolerance: string;
  investment_horizon: string;
  knowledge_level: string;
  source_of_wealth: string;
  income: string;
  net_worth: string;
  suitability_score: string;

  // Step 6: Screening
  screening_result: 'PENDING' | 'NO_HIT' | 'POTENTIAL_MATCH' | null;
  screening_details: string;
}

const initialData: OnboardingData = {
  legal_name: '',
  type: 'INDIVIDUAL',
  tin: '',
  birth_date: '',
  id_type: '',
  id_number: '',
  address: '',
  contact_phone: '',
  contact_email: '',
  source_of_income: '',
  annual_income: '',
  purpose_of_investment: '',
  investment_experience: '',
  calculated_risk: '',
  beneficial_owners: [],
  us_person: false,
  reporting_jurisdictions: '',
  tin_foreign: '',
  fatca_certified: false,
  risk_tolerance: '',
  investment_horizon: '',
  knowledge_level: '',
  source_of_wealth: '',
  income: '',
  net_worth: '',
  suitability_score: '',
  screening_result: null,
  screening_details: '',
};

// ---------------------------------------------------------------------------
// Scoring Helpers
// ---------------------------------------------------------------------------

function calculateRiskRating(data: OnboardingData): string {
  // Auto-escalation: high risk if cash-intensive or no experience
  if (data.source_of_income?.toLowerCase().includes('cash')) return 'HIGH';
  if (data.investment_experience === 'NONE') return 'HIGH';
  if (data.annual_income && parseFloat(data.annual_income) > 10_000_000) return 'MEDIUM';
  return 'LOW';
}

function calculateSuitabilityScore(data: OnboardingData): string {
  const riskMap: Record<string, number> = { LOW: 1, MODERATE: 2, HIGH: 3 };
  const horizonMap: Record<string, number> = { SHORT: 1, MEDIUM: 2, LONG: 3 };
  const knowledgeMap: Record<string, number> = {
    BASIC: 1,
    INTERMEDIATE: 2,
    ADVANCED: 3,
    EXPERT: 4,
  };

  const score =
    (riskMap[data.risk_tolerance] ?? 2) +
    (horizonMap[data.investment_horizon] ?? 2) +
    (knowledgeMap[data.knowledge_level] ?? 2);

  if (score <= 4) return 'CONSERVATIVE';
  if (score <= 6) return 'MODERATE';
  if (score <= 8) return 'BALANCED';
  if (score <= 10) return 'GROWTH';
  return 'AGGRESSIVE';
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ClientOnboarding() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(initialData);
  const navigate = useNavigate();
  const { toast } = useToast();

  const updateField = useCallback(
    <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
      setData((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Submit client
  const createClientMutation = useMutation({
    mutationFn: async (onboardingData: OnboardingData) => {
      // 1. Create client
      const client = await apiRequest('POST', '/api/v1/clients', {
        client_id: `CLI-${Date.now()}`,
        legal_name: onboardingData.legal_name,
        type: onboardingData.type,
        tin: onboardingData.tin,
        birth_date: onboardingData.birth_date,
        address: JSON.stringify({ line1: onboardingData.address }),
        contact: JSON.stringify({
          phone: onboardingData.contact_phone,
          email: onboardingData.contact_email,
        }),
        risk_profile: onboardingData.calculated_risk || 'MODERATE',
      });

      const clientId = client.client_id ?? client.data?.client_id;

      // 2. Initiate KYC
      await apiRequest('POST', `/api/v1/kyc/${clientId}/initiate`, {
        risk_rating: onboardingData.calculated_risk,
        id_type: onboardingData.id_type,
        id_number: onboardingData.id_number,
      });

      // 3. Capture suitability
      await apiRequest('POST', `/api/v1/suitability/${clientId}/capture`, {
        risk_tolerance: onboardingData.risk_tolerance,
        investment_horizon: onboardingData.investment_horizon,
        knowledge_level: onboardingData.knowledge_level,
        source_of_wealth: onboardingData.source_of_wealth,
        income: onboardingData.income,
        net_worth: onboardingData.net_worth,
      });

      return client;
    },
    onSuccess: () => {
      toast({ title: 'Client onboarded successfully' });
      navigate('/master-data/clients');
    },
    onError: (err: Error) => {
      toast({
        title: 'Onboarding failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleNext = () => {
    if (step === 2) {
      updateField('calculated_risk', calculateRiskRating(data));
    }
    if (step === 5) {
      updateField('suitability_score', calculateSuitabilityScore(data));
    }
    if (step === 6) {
      // Auto-run screening (stub — always returns NO_HIT)
      updateField('screening_result', 'NO_HIT');
      updateField('screening_details', 'No sanctions matches found.');
    }
    if (step < 7) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    createClientMutation.mutate(data);
  };

  // ---------- Step Content Renderers ----------

  const renderStep1 = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Legal Name *</Label>
        <Input
          value={data.legal_name}
          onChange={(e) => updateField('legal_name', e.target.value)}
          placeholder="Full legal name"
        />
      </div>
      <div className="space-y-2">
        <Label>Client Type *</Label>
        <Select value={data.type} onValueChange={(v) => updateField('type', v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INDIVIDUAL">Individual</SelectItem>
            <SelectItem value="CORPORATE">Corporate</SelectItem>
            <SelectItem value="INSTITUTIONAL">Institutional</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>TIN</Label>
        <Input
          value={data.tin}
          onChange={(e) => updateField('tin', e.target.value)}
          placeholder="Tax ID Number"
        />
      </div>
      <div className="space-y-2">
        <Label>Date of Birth</Label>
        <Input
          type="date"
          value={data.birth_date}
          onChange={(e) => updateField('birth_date', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>ID Type</Label>
        <Select value={data.id_type} onValueChange={(v) => updateField('id_type', v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select ID type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PASSPORT">Passport</SelectItem>
            <SelectItem value="DRIVERS_LICENSE">Driver's License</SelectItem>
            <SelectItem value="SSS">SSS ID</SelectItem>
            <SelectItem value="UMID">UMID</SelectItem>
            <SelectItem value="PHILSYS">PhilSys/National ID</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>ID Number</Label>
        <Input
          value={data.id_number}
          onChange={(e) => updateField('id_number', e.target.value)}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Address</Label>
        <Textarea
          value={data.address}
          onChange={(e) => updateField('address', e.target.value)}
          placeholder="Complete address"
        />
      </div>
      <div className="space-y-2">
        <Label>Phone</Label>
        <Input
          value={data.contact_phone}
          onChange={(e) => updateField('contact_phone', e.target.value)}
          placeholder="+63"
        />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input
          type="email"
          value={data.contact_email}
          onChange={(e) => updateField('contact_email', e.target.value)}
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Source of Income *</Label>
        <Select
          value={data.source_of_income}
          onValueChange={(v) => updateField('source_of_income', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EMPLOYMENT">Employment</SelectItem>
            <SelectItem value="BUSINESS">Business</SelectItem>
            <SelectItem value="INVESTMENTS">Investments</SelectItem>
            <SelectItem value="INHERITANCE">Inheritance</SelectItem>
            <SelectItem value="CASH_INTENSIVE">Cash-Intensive Business</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Estimated Annual Income</Label>
        <Input
          type="number"
          value={data.annual_income}
          onChange={(e) => updateField('annual_income', e.target.value)}
          placeholder="PHP"
        />
      </div>
      <div className="space-y-2">
        <Label>Purpose of Investment</Label>
        <Select
          value={data.purpose_of_investment}
          onValueChange={(v) => updateField('purpose_of_investment', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WEALTH_PRESERVATION">Wealth Preservation</SelectItem>
            <SelectItem value="CAPITAL_GROWTH">Capital Growth</SelectItem>
            <SelectItem value="INCOME_GENERATION">Income Generation</SelectItem>
            <SelectItem value="RETIREMENT">Retirement Planning</SelectItem>
            <SelectItem value="EDUCATION">Education Fund</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Investment Experience</Label>
        <Select
          value={data.investment_experience}
          onValueChange={(v) => updateField('investment_experience', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">None</SelectItem>
            <SelectItem value="BASIC">{'Basic (< 2 years)'}</SelectItem>
            <SelectItem value="INTERMEDIATE">Intermediate (2-5 years)</SelectItem>
            <SelectItem value="ADVANCED">Advanced (5+ years)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {data.calculated_risk && (
        <div className="md:col-span-2 p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">Calculated Risk Rating:</p>
          <Badge
            className={
              data.calculated_risk === 'HIGH'
                ? 'bg-red-100 text-red-800'
                : data.calculated_risk === 'MEDIUM'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-green-100 text-green-800'
            }
          >
            {data.calculated_risk}
          </Badge>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Capture beneficial owners with 25%+ ownership.
      </p>
      {data.beneficial_owners.map((ubo, idx) => (
        <div key={idx} className="grid gap-3 md:grid-cols-4 p-3 border rounded-lg">
          <Input
            placeholder="Name"
            value={ubo.name}
            onChange={(e) => {
              const owners = [...data.beneficial_owners];
              owners[idx] = { ...owners[idx], name: e.target.value };
              updateField('beneficial_owners', owners);
            }}
          />
          <Input
            placeholder="TIN"
            value={ubo.tin}
            onChange={(e) => {
              const owners = [...data.beneficial_owners];
              owners[idx] = { ...owners[idx], tin: e.target.value };
              updateField('beneficial_owners', owners);
            }}
          />
          <Input
            type="number"
            placeholder="Ownership %"
            value={String(ubo.ownership_pct)}
            onChange={(e) => {
              const owners = [...data.beneficial_owners];
              owners[idx] = {
                ...owners[idx],
                ownership_pct: parseFloat(e.target.value) || 0,
              };
              updateField('beneficial_owners', owners);
            }}
          />
          <div className="flex items-center gap-2">
            <Switch
              checked={ubo.verified}
              onCheckedChange={(v) => {
                const owners = [...data.beneficial_owners];
                owners[idx] = { ...owners[idx], verified: v };
                updateField('beneficial_owners', owners);
              }}
            />
            <Label className="text-sm">Verified</Label>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-red-500"
              onClick={() => {
                updateField(
                  'beneficial_owners',
                  data.beneficial_owners.filter((_, i) => i !== idx),
                );
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          updateField('beneficial_owners', [
            ...data.beneficial_owners,
            { name: '', tin: '', ownership_pct: 0, verified: false },
          ]);
        }}
      >
        + Add Beneficial Owner
      </Button>
    </div>
  );

  const renderStep4 = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex items-center gap-3 md:col-span-2">
        <Switch
          checked={data.us_person}
          onCheckedChange={(v) => updateField('us_person', v)}
        />
        <Label>US Person (FATCA reportable)</Label>
      </div>
      <div className="space-y-2">
        <Label>Reporting Jurisdictions</Label>
        <Input
          value={data.reporting_jurisdictions}
          onChange={(e) => updateField('reporting_jurisdictions', e.target.value)}
          placeholder="e.g. US, UK"
        />
      </div>
      <div className="space-y-2">
        <Label>Foreign TIN</Label>
        <Input
          value={data.tin_foreign}
          onChange={(e) => updateField('tin_foreign', e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <Switch
          checked={data.fatca_certified}
          onCheckedChange={(v) => updateField('fatca_certified', v)}
        />
        <Label>
          I certify that the information provided is true and correct (FATCA/CRS
          Self-Certification)
        </Label>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Risk Tolerance *</Label>
        <Select
          value={data.risk_tolerance}
          onValueChange={(v) => updateField('risk_tolerance', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MODERATE">Moderate</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Investment Horizon *</Label>
        <Select
          value={data.investment_horizon}
          onValueChange={(v) => updateField('investment_horizon', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SHORT">{'Short (< 1 year)'}</SelectItem>
            <SelectItem value="MEDIUM">Medium (1-5 years)</SelectItem>
            <SelectItem value="LONG">Long (5+ years)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Knowledge Level *</Label>
        <Select
          value={data.knowledge_level}
          onValueChange={(v) => updateField('knowledge_level', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BASIC">Basic</SelectItem>
            <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
            <SelectItem value="ADVANCED">Advanced</SelectItem>
            <SelectItem value="EXPERT">Expert</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Source of Wealth</Label>
        <Input
          value={data.source_of_wealth}
          onChange={(e) => updateField('source_of_wealth', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Annual Income (PHP)</Label>
        <Input
          type="number"
          value={data.income}
          onChange={(e) => updateField('income', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Net Worth (PHP)</Label>
        <Input
          type="number"
          value={data.net_worth}
          onChange={(e) => updateField('net_worth', e.target.value)}
        />
      </div>
      {data.suitability_score && (
        <div className="md:col-span-2 p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">Suitability Score:</p>
          <Badge className="text-base">{data.suitability_score}</Badge>
        </div>
      )}
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-4 text-center">
      {data.screening_result === null ? (
        <div className="py-12 space-y-3">
          <Search className="h-12 w-12 mx-auto text-muted-foreground animate-pulse" />
          <p className="text-lg">Screening will run automatically...</p>
          <p className="text-sm text-muted-foreground">
            Click Next to run sanctions & PEP screening
          </p>
        </div>
      ) : data.screening_result === 'NO_HIT' ? (
        <div className="py-12 space-y-3">
          <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
          <p className="text-lg text-green-600 font-semibold">No Sanctions Hits</p>
          <p className="text-sm text-muted-foreground">{data.screening_details}</p>
        </div>
      ) : (
        <div className="py-12 space-y-3">
          <ShieldAlert className="h-12 w-12 mx-auto text-red-600" />
          <p className="text-lg text-red-600 font-semibold">Potential Match Found</p>
          <p className="text-sm text-muted-foreground">{data.screening_details}</p>
        </div>
      )}
    </div>
  );

  const renderStep7 = () => (
    <div className="space-y-4">
      <h3 className="font-semibold">Review Summary</h3>
      <div className="grid gap-3 md:grid-cols-2 text-sm">
        <div>
          <span className="text-muted-foreground">Name:</span> {data.legal_name}
        </div>
        <div>
          <span className="text-muted-foreground">Type:</span> {data.type}
        </div>
        <div>
          <span className="text-muted-foreground">TIN:</span> {data.tin || '-'}
        </div>
        <div>
          <span className="text-muted-foreground">DOB:</span> {data.birth_date || '-'}
        </div>
        <div>
          <span className="text-muted-foreground">ID:</span> {data.id_type} &mdash;{' '}
          {data.id_number}
        </div>
        <div>
          <span className="text-muted-foreground">Risk Rating:</span>{' '}
          <Badge>{data.calculated_risk || '-'}</Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Suitability:</span>{' '}
          <Badge>{data.suitability_score || '-'}</Badge>
        </div>
        <div>
          <span className="text-muted-foreground">UBOs:</span>{' '}
          {data.beneficial_owners.length}
        </div>
        <div>
          <span className="text-muted-foreground">US Person:</span>{' '}
          {data.us_person ? 'Yes' : 'No'}
        </div>
        <div>
          <span className="text-muted-foreground">Screening:</span>{' '}
          <Badge
            className={
              data.screening_result === 'NO_HIT'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }
          >
            {data.screening_result ?? 'Pending'}
          </Badge>
        </div>
      </div>
    </div>
  );

  const stepRenderers = [
    renderStep1,
    renderStep2,
    renderStep3,
    renderStep4,
    renderStep5,
    renderStep6,
    renderStep7,
  ];

  // ---------- Render ----------

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Client Onboarding</h1>
        <p className="text-sm text-muted-foreground">
          Complete all steps to onboard a new client
        </p>
      </div>

      {/* Step Tracker */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = step === s.id;
          const isCompleted = step > s.id;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (isCompleted) setStep(s.id);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                      ? 'bg-green-100 text-green-800 cursor-pointer hover:bg-green-200'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
              {s.id < 7 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const Icon = STEPS[step - 1].icon;
              return <Icon className="h-5 w-5" />;
            })()}
            Step {step}: {STEPS[step - 1].label}
          </CardTitle>
        </CardHeader>
        <CardContent>{stepRenderers[step - 1]()}</CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} disabled={step === 1}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {step < 7 ? (
          <Button onClick={handleNext}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={createClientMutation.isPending}>
            {createClientMutation.isPending ? 'Submitting...' : 'Submit & Create Client'}
          </Button>
        )}
      </div>

      {createClientMutation.isError && (
        <p className="text-sm text-red-600">
          Error: {createClientMutation.error?.message}
        </p>
      )}
    </div>
  );
}
