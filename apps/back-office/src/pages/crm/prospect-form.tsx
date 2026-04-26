/**
 * Prospect Creation / Edit Form (CRM Phase 4)
 *
 * 7-tab form for prospect management. Similar structure to lead-form
 * with additional prospect-specific fields:
 *   - Classification tier display, TRV, risk_profile_comments
 *   - CIF number, ageing_days display
 *
 * Supports create (POST) and edit (PATCH) via route param :id or ?id=<prospectId>
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
  Clock,
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

const API = '/api/v1/prospects';

/* ---------- Interfaces ---------- */

interface ProspectFormData {
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
  cif_number: string;
  classification: string;
  risk_profile_comments: string;
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
  politically_exposed: boolean;
}

const INITIAL_FORM: ProspectFormData = {
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
  cif_number: '',
  classification: '',
  risk_profile_comments: '',
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
  politically_exposed: false,
};

/* ---------- Component ---------- */

export default function ProspectForm() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const prospectId = params.id || searchParams.get('id');
  const isEditMode = Boolean(prospectId);

  const [activeTab, setActiveTab] = useState('info');
  const [form, setForm] = useState<ProspectFormData>(INITIAL_FORM);

  const {
    updateField, addFamilyMember, removeFamilyMember, updateFamilyMember,
    addAddress, removeAddress, updateAddress,
    addIdentification, removeIdentification, updateIdentification,
    addDocument, removeDocument, updateDocument,
    toggleProductInterest,
  } = useSubEntityHandlers(setForm as unknown as Dispatch<SetStateAction<CrmSubEntities & Record<string, unknown>>>);

  /* ---- Load existing prospect ---- */

  const { data: existing, isPending: loadPending, isError: loadError } = useQuery<ProspectFormData & { id: number; ageing_days?: number; prospect_code?: string }>({
    queryKey: ['prospect-detail', prospectId],
    queryFn: () => fetcher(`${API}/${prospectId}`),
    enabled: isEditMode,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        lead_type: existing.lead_type || 'INDIVIDUAL',
        salutation: existing.salutation || '',
        first_name: existing.first_name || '',
        middle_name: existing.middle_name || '',
        last_name: existing.last_name || '',
        short_name: existing.short_name || '',
        entity_name: existing.entity_name || '',
        dob: existing.dob || '',
        gender: existing.gender || '',
        nationality: existing.nationality || '',
        country_of_residence: existing.country_of_residence || 'Philippines',
        marital_status: existing.marital_status || '',
        occupation: existing.occupation || '',
        industry: existing.industry || '',
        email: existing.email || '',
        mobile_phone: existing.mobile_phone || '',
        country_code: existing.country_code || '+63',
        primary_contact_no: existing.primary_contact_no || '',
        fixed_line_no: existing.fixed_line_no || '',
        cif_number: existing.cif_number || '',
        classification: existing.classification || '',
        risk_profile_comments: existing.risk_profile_comments || '',
        family_members: existing.family_members || [],
        addresses: existing.addresses || [],
        identifications: existing.identifications || [],
        hobbies: existing.hobbies || '',
        cuisine_preferences: existing.cuisine_preferences || '',
        sports: existing.sports || '',
        clubs: existing.clubs || '',
        special_dates: existing.special_dates || '',
        communication_preference: existing.communication_preference || '',
        documents: existing.documents || [],
        product_interests: existing.product_interests || [],
        risk_appetite: existing.risk_appetite || '',
        gross_monthly_income: existing.gross_monthly_income || '',
        estimated_aum: existing.estimated_aum || '',
        aum_currency: existing.aum_currency || 'PHP',
        trv: existing.trv || '',
        trv_currency: existing.trv_currency || 'PHP',
        politically_exposed: existing.politically_exposed || false,
      });
    }
  }, [existing]);

  /* ---- Mutations ---- */

  const saveMutation = useMutation({
    mutationFn: (data: ProspectFormData) => {
      const url = isEditMode ? `${API}/${prospectId}` : API;
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
      toast.success(isEditMode ? 'Prospect updated successfully' : 'Prospect created successfully');
      navigate('/crm/prospects');
    },
    onError: (err: Error) => toast.error(err.message),
  });

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
          <p className="text-muted-foreground">Loading prospect details...</p>
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
          <Button variant="ghost" size="sm" onClick={() => navigate('/crm/prospects')}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isEditMode ? 'Edit Prospect' : 'New Prospect'}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode ? 'Update prospect information' : 'Capture a new prospect into the CRM system'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isEditMode && existing && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {existing.prospect_code && (
                <Badge variant="outline" className="font-mono">{existing.prospect_code}</Badge>
              )}
              {existing.ageing_days != null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {existing.ageing_days} days
                </span>
              )}
            </div>
          )}
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? 'Saving...' : isEditMode ? 'Update Prospect' : 'Save Prospect'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="info"><User className="mr-1 h-3 w-3" /> Prospect Info</TabsTrigger>
          <TabsTrigger value="family"><Users className="mr-1 h-3 w-3" /> Family</TabsTrigger>
          <TabsTrigger value="address"><MapPin className="mr-1 h-3 w-3" /> Address</TabsTrigger>
          <TabsTrigger value="identification"><CreditCard className="mr-1 h-3 w-3" /> IDs</TabsTrigger>
          <TabsTrigger value="lifestyle"><Heart className="mr-1 h-3 w-3" /> Lifestyle</TabsTrigger>
          <TabsTrigger value="documents"><FileText className="mr-1 h-3 w-3" /> Documents</TabsTrigger>
          <TabsTrigger value="preferences"><Settings className="mr-1 h-3 w-3" /> Preferences</TabsTrigger>
        </TabsList>

        {/* ---- Tab 1: Prospect Information (unique) ---- */}
        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prospect Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label htmlFor="prospect-lead_type" className="text-sm font-medium">Lead Type *</label>
                  <Select value={form.lead_type} onValueChange={(v: string) => updateField('lead_type', v)}>
                    <SelectTrigger id="prospect-lead_type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="prospect-salutation" className="text-sm font-medium">Salutation</label>
                  <Select value={form.salutation} onValueChange={(v: string) => updateField('salutation', v)}>
                    <SelectTrigger id="prospect-salutation"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="prospect-gender" className="text-sm font-medium">Gender</label>
                  <Select value={form.gender} onValueChange={(v: string) => updateField('gender', v)}>
                    <SelectTrigger id="prospect-gender"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="prospect-cif_number" className="text-sm font-medium">CIF Number</label>
                  <Input id="prospect-cif_number" value={form.cif_number} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('cif_number', e.target.value)} placeholder="CIF-00000" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="prospect-first_name" className="text-sm font-medium">First Name *</label>
                  <Input id="prospect-first_name" value={form.first_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('first_name', e.target.value)} placeholder="Juan" />
                </div>
                <div>
                  <label htmlFor="prospect-middle_name" className="text-sm font-medium">Middle Name</label>
                  <Input id="prospect-middle_name" value={form.middle_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('middle_name', e.target.value)} placeholder="Santos" />
                </div>
                <div>
                  <label htmlFor="prospect-last_name" className="text-sm font-medium">Last Name *</label>
                  <Input id="prospect-last_name" value={form.last_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('last_name', e.target.value)} placeholder="Dela Cruz" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="prospect-short_name" className="text-sm font-medium">Short Name</label>
                  <Input id="prospect-short_name" value={form.short_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('short_name', e.target.value)} placeholder="J. Dela Cruz" />
                </div>
                {form.lead_type === 'NON_INDIVIDUAL' && (
                  <div className="md:col-span-2">
                    <label htmlFor="prospect-entity_name" className="text-sm font-medium">Entity Name *</label>
                    <Input id="prospect-entity_name" value={form.entity_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('entity_name', e.target.value)} placeholder="Company / Trust / Foundation name" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label htmlFor="prospect-dob" className="text-sm font-medium">Date of Birth</label>
                  <Input id="prospect-dob" type="date" value={form.dob} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('dob', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="prospect-nationality" className="text-sm font-medium">Nationality</label>
                  <Select value={form.nationality} onValueChange={(v: string) => updateField('nationality', v)}>
                    <SelectTrigger id="prospect-nationality"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="prospect-country_of_residence" className="text-sm font-medium">Country of Residence</label>
                  <Select value={form.country_of_residence} onValueChange={(v: string) => updateField('country_of_residence', v)}>
                    <SelectTrigger id="prospect-country_of_residence"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="prospect-marital_status" className="text-sm font-medium">Marital Status</label>
                  <Select value={form.marital_status} onValueChange={(v: string) => updateField('marital_status', v)}>
                    <SelectTrigger id="prospect-marital_status"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {MARITAL_STATUSES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="prospect-occupation" className="text-sm font-medium">Occupation</label>
                  <Input id="prospect-occupation" value={form.occupation} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('occupation', e.target.value)} placeholder="e.g. Business Owner" />
                </div>
                <div>
                  <label htmlFor="prospect-industry" className="text-sm font-medium">Industry</label>
                  <Input id="prospect-industry" value={form.industry} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('industry', e.target.value)} placeholder="e.g. Real Estate" />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Classification & Risk Profile</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="prospect-classification" className="text-sm font-medium">Classification Tier</label>
                  <Select value={form.classification} onValueChange={(v: string) => updateField('classification', v)}>
                    <SelectTrigger id="prospect-classification"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {CLASSIFICATIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="prospect-risk_profile_comments" className="text-sm font-medium">Risk Profile Comments</label>
                  <Input id="prospect-risk_profile_comments" value={form.risk_profile_comments} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('risk_profile_comments', e.target.value)} placeholder="Notes on risk profiling assessment" />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Contact Information</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="prospect-email" className="text-sm font-medium">Email</label>
                  <Input id="prospect-email" type="email" value={form.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('email', e.target.value)} placeholder="juan@example.com" />
                </div>
                <div>
                  <label htmlFor="prospect-country_code" className="text-sm font-medium">Country Code</label>
                  <Input id="prospect-country_code" value={form.country_code} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('country_code', e.target.value)} placeholder="+63" />
                </div>
                <div>
                  <label htmlFor="prospect-mobile_phone" className="text-sm font-medium">Mobile Phone</label>
                  <Input id="prospect-mobile_phone" value={form.mobile_phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('mobile_phone', e.target.value)} placeholder="9171234567" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="prospect-primary_contact_no" className="text-sm font-medium">Primary Contact No</label>
                  <Input id="prospect-primary_contact_no" value={form.primary_contact_no} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('primary_contact_no', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="prospect-fixed_line_no" className="text-sm font-medium">Fixed Line No</label>
                  <Input id="prospect-fixed_line_no" value={form.fixed_line_no} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fixed_line_no', e.target.value)} placeholder="(02) 8123-4567" />
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
                  <label className="text-sm font-medium">Classification Tier</label>
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
                  Indicate if this prospect or any immediate family member holds a prominent public position
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
