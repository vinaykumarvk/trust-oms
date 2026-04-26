/**
 * Lead Creation / Edit Form (CRM Phase 4)
 *
 * 7-tab form for capturing comprehensive lead information in the
 * wealth-management back-office context.
 *
 * Tabs:
 *   1. Lead Information   4. Identification   7. Preferences
 *   2. Family Members     5. Lifestyle
 *   3. Address / Contact  6. Documents
 *
 * Supports create (POST) and edit (PATCH) modes via URL param ?id=<leadId>
 * or route param :id.
 */

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import {
  Save, ArrowLeft,
  User, Users, MapPin, CreditCard, Heart, FileText, Settings,
} from 'lucide-react';
import { fetcher, authHeaders } from '@/lib/api';
import {
  ENTITY_TYPES, SALUTATIONS, GENDERS, MARITAL_STATUSES, COUNTRIES,
  PRODUCT_INTERESTS, RISK_APPETITES, CLASSIFICATIONS, CURRENCIES,
  type CrmFamilyMember, type CrmAddress, type CrmIdentification, type CrmDocumentRecord,
  type CrmSubEntities,
} from '@/lib/crm-constants';
import { useSubEntityHandlers } from '@/lib/use-sub-entity-handlers';
import { FamilyTab } from '@/components/crm/form-tabs/family-tab';
import { AddressTab } from '@/components/crm/form-tabs/address-tab';
import { IdentificationTab } from '@/components/crm/form-tabs/identification-tab';
import { LifestyleTab } from '@/components/crm/form-tabs/lifestyle-tab';
import { DocumentsTab } from '@/components/crm/form-tabs/documents-tab';

/* ---------- Constants ---------- */

const API = '/api/v1/leads';

/* ---------- Interfaces ---------- */

interface LeadFormData {
  lead_type: string;
  salutation: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  short_name: string;
  entity_name: string;
  dob: string;
  gender: string;
  nationality: string;
  country_of_residence: string;
  marital_status: string;
  occupation: string;
  industry: string;
  email: string;
  mobile_phone: string;
  country_code: string;
  primary_contact_no: string;
  fixed_line_no: string;
  family_members: CrmFamilyMember[];
  addresses: CrmAddress[];
  identifications: CrmIdentification[];
  hobbies: string;
  cuisine_preferences: string;
  sports: string;
  clubs: string;
  special_dates: string;
  communication_preference: string;
  documents: CrmDocumentRecord[];
  product_interests: string[];
  risk_appetite: string;
  gross_monthly_income: string;
  estimated_aum: string;
  aum_currency: string;
  trv: string;
  trv_currency: string;
  classification: string;
  politically_exposed: boolean;
}

const INITIAL_FORM: LeadFormData = {
  lead_type: 'INDIVIDUAL',
  salutation: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  short_name: '',
  entity_name: '',
  dob: '',
  gender: '',
  nationality: '',
  country_of_residence: 'Philippines',
  marital_status: '',
  occupation: '',
  industry: '',
  email: '',
  mobile_phone: '',
  country_code: '+63',
  primary_contact_no: '',
  fixed_line_no: '',
  family_members: [],
  addresses: [],
  identifications: [],
  hobbies: '',
  cuisine_preferences: '',
  sports: '',
  clubs: '',
  special_dates: '',
  communication_preference: '',
  documents: [],
  product_interests: [],
  risk_appetite: '',
  gross_monthly_income: '',
  estimated_aum: '',
  aum_currency: 'PHP',
  trv: '',
  trv_currency: 'PHP',
  classification: '',
  politically_exposed: false,
};

/* ---------- Component ---------- */

export default function LeadForm() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const leadId = params.id || searchParams.get('id');
  const isEditMode = Boolean(leadId);

  const [activeTab, setActiveTab] = useState('info');
  const [form, setForm] = useState<LeadFormData>(INITIAL_FORM);

  const {
    updateField, addFamilyMember, removeFamilyMember, updateFamilyMember,
    addAddress, removeAddress, updateAddress,
    addIdentification, removeIdentification, updateIdentification,
    addDocument, removeDocument, updateDocument,
    toggleProductInterest,
  } = useSubEntityHandlers(setForm as unknown as Dispatch<SetStateAction<CrmSubEntities & Record<string, unknown>>>);

  /* ---- Load existing lead for edit ---- */

  const { data: existingLead, isPending: loadPending, isError: loadError } = useQuery<LeadFormData & { id: number }>({
    queryKey: ['lead-detail', leadId],
    queryFn: () => fetcher(`${API}/${leadId}`),
    enabled: isEditMode,
  });

  useEffect(() => {
    if (existingLead) {
      setForm({
        lead_type: existingLead.lead_type || 'INDIVIDUAL',
        salutation: existingLead.salutation || '',
        first_name: existingLead.first_name || '',
        middle_name: existingLead.middle_name || '',
        last_name: existingLead.last_name || '',
        short_name: existingLead.short_name || '',
        entity_name: existingLead.entity_name || '',
        dob: existingLead.dob || '',
        gender: existingLead.gender || '',
        nationality: existingLead.nationality || '',
        country_of_residence: existingLead.country_of_residence || 'Philippines',
        marital_status: existingLead.marital_status || '',
        occupation: existingLead.occupation || '',
        industry: existingLead.industry || '',
        email: existingLead.email || '',
        mobile_phone: existingLead.mobile_phone || '',
        country_code: existingLead.country_code || '+63',
        primary_contact_no: existingLead.primary_contact_no || '',
        fixed_line_no: existingLead.fixed_line_no || '',
        family_members: existingLead.family_members || [],
        addresses: existingLead.addresses || [],
        identifications: existingLead.identifications || [],
        hobbies: existingLead.hobbies || '',
        cuisine_preferences: existingLead.cuisine_preferences || '',
        sports: existingLead.sports || '',
        clubs: existingLead.clubs || '',
        special_dates: existingLead.special_dates || '',
        communication_preference: existingLead.communication_preference || '',
        documents: existingLead.documents || [],
        product_interests: existingLead.product_interests || [],
        risk_appetite: existingLead.risk_appetite || '',
        gross_monthly_income: existingLead.gross_monthly_income || '',
        estimated_aum: existingLead.estimated_aum || '',
        aum_currency: existingLead.aum_currency || 'PHP',
        trv: existingLead.trv || '',
        trv_currency: existingLead.trv_currency || 'PHP',
        classification: existingLead.classification || '',
        politically_exposed: existingLead.politically_exposed || false,
      });
    }
  }, [existingLead]);

  /* ---- Mutations ---- */

  const saveMutation = useMutation({
    mutationFn: (data: LeadFormData) => {
      const url = isEditMode ? `${API}/${leadId}` : API;
      const method = isEditMode ? 'PATCH' : 'POST';
      return fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Save failed'); });
        return r.json();
      });
    },
    onSuccess: () => {
      toast.success(isEditMode ? 'Lead updated successfully' : 'Lead created successfully');
      navigate('/crm/leads');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /* ---- Submit handler ---- */

  function handleSave() {
    if (!form.first_name.trim() && form.lead_type === 'INDIVIDUAL') {
      toast.error('First name is required');
      return;
    }
    if (!form.last_name.trim() && form.lead_type === 'INDIVIDUAL') {
      toast.error('Last name is required');
      return;
    }
    if (!form.entity_name.trim() && form.lead_type === 'NON_INDIVIDUAL') {
      toast.error('Entity name is required');
      return;
    }
    saveMutation.mutate(form);
  }

  /* ---- Loading state ---- */

  if (isEditMode && loadPending) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading lead details...</p>
        </div>
      </div>
    );
  }

  if (isEditMode && loadError) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        <p>Failed to load data. Please try again.</p>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/crm/leads')}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isEditMode ? 'Edit Lead' : 'New Lead'}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode ? 'Update lead information' : 'Capture a new lead into the CRM system'}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? 'Saving...' : isEditMode ? 'Update Lead' : 'Save Lead'}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="info"><User className="mr-1 h-3 w-3" /> Lead Info</TabsTrigger>
          <TabsTrigger value="family"><Users className="mr-1 h-3 w-3" /> Family</TabsTrigger>
          <TabsTrigger value="address"><MapPin className="mr-1 h-3 w-3" /> Address</TabsTrigger>
          <TabsTrigger value="identification"><CreditCard className="mr-1 h-3 w-3" /> IDs</TabsTrigger>
          <TabsTrigger value="lifestyle"><Heart className="mr-1 h-3 w-3" /> Lifestyle</TabsTrigger>
          <TabsTrigger value="documents"><FileText className="mr-1 h-3 w-3" /> Documents</TabsTrigger>
          <TabsTrigger value="preferences"><Settings className="mr-1 h-3 w-3" /> Preferences</TabsTrigger>
        </TabsList>

        {/* ---- Tab 1: Lead Information (unique) ---- */}
        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="lead-lead_type" className="text-sm font-medium">Lead Type *</label>
                  <Select value={form.lead_type} onValueChange={(v: string) => updateField('lead_type', v)}>
                    <SelectTrigger id="lead-lead_type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="lead-salutation" className="text-sm font-medium">Salutation</label>
                  <Select value={form.salutation} onValueChange={(v: string) => updateField('salutation', v)}>
                    <SelectTrigger id="lead-salutation"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="lead-gender" className="text-sm font-medium">Gender</label>
                  <Select value={form.gender} onValueChange={(v: string) => updateField('gender', v)}>
                    <SelectTrigger id="lead-gender"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="lead-first_name" className="text-sm font-medium">First Name *</label>
                  <Input id="lead-first_name" value={form.first_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('first_name', e.target.value)} placeholder="Juan" />
                </div>
                <div>
                  <label htmlFor="lead-middle_name" className="text-sm font-medium">Middle Name</label>
                  <Input id="lead-middle_name" value={form.middle_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('middle_name', e.target.value)} placeholder="Santos" />
                </div>
                <div>
                  <label htmlFor="lead-last_name" className="text-sm font-medium">Last Name *</label>
                  <Input id="lead-last_name" value={form.last_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('last_name', e.target.value)} placeholder="Dela Cruz" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="lead-short_name" className="text-sm font-medium">Short Name</label>
                  <Input id="lead-short_name" value={form.short_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('short_name', e.target.value)} placeholder="J. Dela Cruz" />
                </div>
                {form.lead_type === 'NON_INDIVIDUAL' && (
                  <div className="md:col-span-2">
                    <label htmlFor="lead-entity_name" className="text-sm font-medium">Entity Name *</label>
                    <Input id="lead-entity_name" value={form.entity_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('entity_name', e.target.value)} placeholder="Company / Trust / Foundation name" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label htmlFor="lead-dob" className="text-sm font-medium">Date of Birth</label>
                  <Input id="lead-dob" type="date" value={form.dob} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('dob', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="lead-nationality" className="text-sm font-medium">Nationality</label>
                  <Select value={form.nationality} onValueChange={(v: string) => updateField('nationality', v)}>
                    <SelectTrigger id="lead-nationality"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="lead-country_of_residence" className="text-sm font-medium">Country of Residence</label>
                  <Select value={form.country_of_residence} onValueChange={(v: string) => updateField('country_of_residence', v)}>
                    <SelectTrigger id="lead-country_of_residence"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="lead-marital_status" className="text-sm font-medium">Marital Status</label>
                  <Select value={form.marital_status} onValueChange={(v: string) => updateField('marital_status', v)}>
                    <SelectTrigger id="lead-marital_status"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {MARITAL_STATUSES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="lead-occupation" className="text-sm font-medium">Occupation</label>
                  <Input id="lead-occupation" value={form.occupation} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('occupation', e.target.value)} placeholder="e.g. Business Owner" />
                </div>
                <div>
                  <label htmlFor="lead-industry" className="text-sm font-medium">Industry</label>
                  <Input id="lead-industry" value={form.industry} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('industry', e.target.value)} placeholder="e.g. Real Estate" />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Contact Information</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="lead-email" className="text-sm font-medium">Email</label>
                  <Input id="lead-email" type="email" value={form.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('email', e.target.value)} placeholder="juan@example.com" />
                </div>
                <div>
                  <label htmlFor="lead-country_code" className="text-sm font-medium">Country Code</label>
                  <Input id="lead-country_code" value={form.country_code} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('country_code', e.target.value)} placeholder="+63" />
                </div>
                <div>
                  <label htmlFor="lead-mobile_phone" className="text-sm font-medium">Mobile Phone</label>
                  <Input id="lead-mobile_phone" value={form.mobile_phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('mobile_phone', e.target.value)} placeholder="9171234567" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="lead-primary_contact_no" className="text-sm font-medium">Primary Contact No</label>
                  <Input id="lead-primary_contact_no" value={form.primary_contact_no} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('primary_contact_no', e.target.value)} placeholder="Primary number" />
                </div>
                <div>
                  <label htmlFor="lead-fixed_line_no" className="text-sm font-medium">Fixed Line No</label>
                  <Input id="lead-fixed_line_no" value={form.fixed_line_no} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fixed_line_no', e.target.value)} placeholder="(02) 8123-4567" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Tabs 2-6: Shared Components ---- */}
        <TabsContent value="family" className="mt-4">
          <FamilyTab familyMembers={form.family_members} onAdd={addFamilyMember} onRemove={removeFamilyMember} onUpdate={updateFamilyMember} />
        </TabsContent>

        <TabsContent value="address" className="mt-4">
          <AddressTab addresses={form.addresses} onAdd={addAddress} onRemove={removeAddress} onUpdate={updateAddress} />
        </TabsContent>

        <TabsContent value="identification" className="mt-4">
          <IdentificationTab identifications={form.identifications} onAdd={addIdentification} onRemove={removeIdentification} onUpdate={updateIdentification} />
        </TabsContent>

        <TabsContent value="lifestyle" className="mt-4">
          <LifestyleTab
            hobbies={form.hobbies} cuisine_preferences={form.cuisine_preferences}
            sports={form.sports} clubs={form.clubs} special_dates={form.special_dates}
            communication_preference={form.communication_preference}
            onFieldChange={updateField}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTab documents={form.documents} onAdd={addDocument} onRemove={removeDocument} onUpdate={updateDocument} />
        </TabsContent>

        {/* ---- Tab 7: Preferences (unique) ---- */}
        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Investment Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Product Interests</label>
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_INTERESTS.map((product) => {
                    const isSelected = form.product_interests.includes(product);
                    return (
                      <Badge
                        key={product}
                        variant={isSelected ? 'default' : 'outline'}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        onClick={() => toggleProductInterest(product)}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProductInterest(product); } }}
                      >
                        {product}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium">Risk Appetite</label>
                  <Select value={form.risk_appetite} onValueChange={(v: string) => updateField('risk_appetite', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {RISK_APPETITES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Classification</label>
                  <Select value={form.classification} onValueChange={(v: string) => updateField('classification', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {CLASSIFICATIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Gross Monthly Income</label>
                  <Input type="number" value={form.gross_monthly_income} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('gross_monthly_income', e.target.value)} placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Estimated AUM</label>
                  <div className="flex gap-2">
                    <Input type="number" value={form.estimated_aum} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('estimated_aum', e.target.value)} placeholder="0.00" className="flex-1" />
                    <Select value={form.aum_currency} onValueChange={(v: string) => updateField('aum_currency', v)}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Total Relationship Value (TRV)</label>
                  <div className="flex gap-2">
                    <Input type="number" value={form.trv} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('trv', e.target.value)} placeholder="0.00" className="flex-1" />
                    <Select value={form.trv_currency} onValueChange={(v: string) => updateField('trv_currency', v)}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" checked={form.politically_exposed} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('politically_exposed', e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                  Politically Exposed Person (PEP)
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Indicate if this lead or any immediate family member holds a prominent public position
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
