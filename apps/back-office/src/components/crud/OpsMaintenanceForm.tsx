/**
 * OpsMaintenanceForm — Config-driven create/edit/view form in a Sheet (side panel).
 *
 * Auto-generates form fields from MergedEntityConfig, groups them into tabs,
 * supports validation, PII masking, draft auto-save, and duplicate checks.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  MergedEntityConfig,
  MergedFieldConfig,
  CrossValidationRule,
} from '@shared/entity-configs/types';
import { apiRequest } from '@ui/lib/queryClient';
import { useToast } from '@ui/components/ui/toast';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Textarea } from '@ui/components/ui/textarea';
import { Label } from '@ui/components/ui/label';
import { Switch } from '@ui/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { ScrollArea } from '@ui/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ui/components/ui/alert-dialog';
import { Lock, Search as SearchIcon, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpsMaintenanceFormProps {
  entityKey: string;
  config: MergedEntityConfig;
  mode: 'create' | 'edit' | 'view';
  initialData?: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  crossValidationRules?: CrossValidationRule[];
}

interface FieldError {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAFT_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFormFields(config: MergedEntityConfig): MergedFieldConfig[] {
  return config.fields
    .filter((f) => f.visibleInForm !== false)
    .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
}

function getFieldGroups(
  config: MergedEntityConfig,
  formFields: MergedFieldConfig[],
): string[] {
  const groups = config.fieldGroups;
  if (groups.length > 0) return groups;
  // Derive from fields
  const seen = new Set<string>();
  const derived: string[] = [];
  for (const f of formFields) {
    const g = f.group ?? 'General';
    if (!seen.has(g)) {
      seen.add(g);
      derived.push(g);
    }
  }
  return derived.length > 0 ? derived : ['General'];
}

function buildInitialFormData(
  fields: MergedFieldConfig[],
  initialData?: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (initialData && initialData[field.fieldName] !== undefined) {
      data[field.fieldName] = initialData[field.fieldName];
    } else {
      // Default values based on type
      switch (field.inputType) {
        case 'switch':
          data[field.fieldName] = false;
          break;
        case 'number':
        case 'currency':
        case 'percentage':
          data[field.fieldName] = '';
          break;
        default:
          data[field.fieldName] = '';
      }
    }
  }
  return data;
}

function maskPiiValue(value: unknown): string {
  if (value === null || value === undefined) return '****';
  const str = String(value);
  if (str.length <= 4) return '****';
  return str.slice(0, 2) + '*'.repeat(str.length - 4) + str.slice(-2);
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function validateField(
  field: MergedFieldConfig,
  value: unknown,
): string | null {
  const strValue = String(value ?? '');

  // Required check
  if (field.required) {
    if (field.inputType === 'switch') {
      // switch is always valid (false is a valid value)
    } else if (!strValue.trim()) {
      return `${field.label} is required`;
    }
  }

  if (!strValue.trim()) return null; // remaining validations only apply if value is present

  // Min/max length
  if (field.minLength !== undefined && strValue.length < field.minLength) {
    return `${field.label} must be at least ${field.minLength} characters`;
  }
  if (field.maxLength !== undefined && strValue.length > field.maxLength) {
    return `${field.label} must be at most ${field.maxLength} characters`;
  }

  // Min/max value for numeric types
  if (
    field.inputType === 'number' ||
    field.inputType === 'currency' ||
    field.inputType === 'percentage'
  ) {
    const num = Number(strValue);
    if (isNaN(num)) return `${field.label} must be a valid number`;
    if (field.minValue !== undefined && num < field.minValue) {
      return `${field.label} must be at least ${field.minValue}`;
    }
    if (field.maxValue !== undefined && num > field.maxValue) {
      return `${field.label} must be at most ${field.maxValue}`;
    }
  }

  // Regex validation
  if (field.validationRegex) {
    try {
      const re = new RegExp(field.validationRegex);
      if (!re.test(strValue)) {
        return `${field.label} format is invalid`;
      }
    } catch {
      // ignore bad regex from config
    }
  }

  return null;
}

function runCrossValidation(
  formData: Record<string, unknown>,
  rules: CrossValidationRule[],
): FieldError[] {
  const errors: FieldError[] = [];
  for (const rule of rules) {
    if (!rule.isActive) continue;
    try {
      // condition is a simple JSON object: { field, operator, compareTo, value }
      const cond = rule.condition as Record<string, string>;
      const fieldVal = formData[cond.field];
      const compareVal = cond.compareTo ? formData[cond.compareTo] : cond.value;

      let failed = false;
      switch (cond.operator) {
        case 'eq':
          failed = fieldVal !== compareVal;
          break;
        case 'neq':
          failed = fieldVal === compareVal;
          break;
        case 'gt':
          failed = Number(fieldVal) <= Number(compareVal);
          break;
        case 'gte':
          failed = Number(fieldVal) < Number(compareVal);
          break;
        case 'lt':
          failed = Number(fieldVal) >= Number(compareVal);
          break;
        case 'lte':
          failed = Number(fieldVal) > Number(compareVal);
          break;
        case 'requiredIf':
          if (formData[cond.compareTo!]) {
            failed = !String(fieldVal ?? '').trim();
          }
          break;
        default:
          break;
      }

      if (failed) {
        errors.push({ field: cond.field, message: rule.errorMessage });
      }
    } catch {
      // skip broken rules
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpsMaintenanceForm({
  entityKey,
  config,
  mode,
  initialData,
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  crossValidationRules = [],
}: OpsMaintenanceFormProps) {
  const { toast } = useToast();
  const formFields = useMemo(() => getFormFields(config), [config]);
  const fieldGroups = useMemo(() => getFieldGroups(config, formFields), [config, formFields]);

  // ---- State ------------------------------------------------------------

  const [formData, setFormData] = useState<Record<string, unknown>>(() =>
    buildInitialFormData(formFields, initialData),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateChecking, setDuplicateChecking] = useState<Record<string, boolean>>({});
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [activeTab, setActiveTab] = useState(fieldGroups[0] ?? 'General');
  const draftKey = `draft-${entityKey}`;
  const draftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Reset form when opening or data changes --------------------------

  useEffect(() => {
    if (isOpen) {
      const newData = buildInitialFormData(formFields, initialData);

      // Check for saved draft (create mode only)
      if (mode === 'create') {
        try {
          const saved = localStorage.getItem(draftKey);
          if (saved) {
            setShowDraftDialog(true);
            // Don't load the draft yet — wait for user confirmation
            setFormData(newData);
            setErrors({});
            setActiveTab(fieldGroups[0] ?? 'General');
            return;
          }
        } catch {
          // ignore
        }
      }

      setFormData(newData);
      setErrors({});
      setActiveTab(fieldGroups[0] ?? 'General');
    }
  }, [isOpen, initialData, formFields, mode, draftKey, fieldGroups]);

  // ---- Draft auto-save --------------------------------------------------

  useEffect(() => {
    if (!isOpen || mode !== 'create') return;

    draftTimerRef.current = setInterval(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(formData));
      } catch {
        // storage full — ignore
      }
    }, DRAFT_INTERVAL_MS);

    return () => {
      if (draftTimerRef.current) {
        clearInterval(draftTimerRef.current);
      }
    };
  }, [isOpen, mode, formData, draftKey]);

  // ---- Draft resume handlers --------------------------------------------

  const handleResumeDraft = useCallback(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        setFormData((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
    setShowDraftDialog(false);
  }, [draftKey]);

  const handleDiscardDraft = useCallback(() => {
    localStorage.removeItem(draftKey);
    setShowDraftDialog(false);
  }, [draftKey]);

  // ---- Field change handler ---------------------------------------------

  const handleFieldChange = useCallback(
    (fieldName: string, value: unknown) => {
      setFormData((prev) => ({ ...prev, [fieldName]: value }));
      // Clear error for this field on change
      setErrors((prev) => {
        if (prev[fieldName]) {
          const next = { ...prev };
          delete next[fieldName];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  // ---- Duplicate check on blur ------------------------------------------

  const handleDuplicateCheck = useCallback(
    async (field: MergedFieldConfig) => {
      const value = formData[field.fieldName];
      if (!value || !String(value).trim()) return;

      setDuplicateChecking((prev) => ({ ...prev, [field.fieldName]: true }));
      try {
        const result = await apiRequest(
          'POST',
          `/api/v1/${entityKey}/check-duplicate`,
          { field: field.fieldName, value },
        );
        if (result && (result as Record<string, unknown>).isDuplicate) {
          setErrors((prev) => ({
            ...prev,
            [field.fieldName]: `A record with this ${field.label.toLowerCase()} already exists`,
          }));
        }
      } catch {
        // silently fail — server might not support this endpoint yet
      } finally {
        setDuplicateChecking((prev) => ({ ...prev, [field.fieldName]: false }));
      }
    },
    [entityKey, formData],
  );

  // ---- Submit handler ---------------------------------------------------

  const handleSubmit = useCallback(() => {
    // 1. Per-field validation
    const newErrors: Record<string, string> = {};
    for (const field of formFields) {
      if (mode === 'edit' && field.editable === false) continue;
      const err = validateField(field, formData[field.fieldName]);
      if (err) newErrors[field.fieldName] = err;
    }

    // 2. Cross-field validation
    const crossErrors = runCrossValidation(formData, crossValidationRules);
    for (const ce of crossErrors) {
      if (!newErrors[ce.field]) {
        newErrors[ce.field] = ce.message;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Switch to the tab containing the first error
      const firstErrorField = formFields.find((f) => newErrors[f.fieldName]);
      if (firstErrorField) {
        setActiveTab(firstErrorField.group ?? 'General');
      }
      toast({
        title: 'Validation Error',
        description: 'Please fix the highlighted fields.',
        variant: 'destructive',
      });
      return;
    }

    // Clear draft on successful submit
    localStorage.removeItem(draftKey);
    onSubmit(formData);
  }, [formFields, formData, crossValidationRules, mode, onSubmit, toast, draftKey]);

  // ---- Close handler (cleans up) ----------------------------------------

  const handleClose = useCallback(() => {
    setErrors({});
    onClose();
  }, [onClose]);

  // ---- Render a single field --------------------------------------------

  function renderField(field: MergedFieldConfig) {
    const value = formData[field.fieldName];
    const error = errors[field.fieldName];
    const isReadOnly = mode === 'view' || (mode === 'edit' && field.editable === false);
    const isChecking = duplicateChecking[field.fieldName] ?? false;

    // In view mode with PII, mask the value
    const displayValue =
      mode === 'view' && field.piiSensitive ? maskPiiValue(value) : value;

    return (
      <div key={field.fieldName} className="space-y-2">
        {/* Label */}
        <Label
          htmlFor={`field-${field.fieldName}`}
          className="flex items-center gap-1.5"
        >
          {field.label}
          {field.required && <span className="text-destructive">*</span>}
          {field.piiSensitive && (
            <Lock className="h-3 w-3 text-muted-foreground" />
          )}
          {isChecking && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </Label>

        {/* Field control */}
        {renderFieldControl(field, displayValue, isReadOnly)}

        {/* Help text */}
        {field.helpText && !error && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}

        {/* Error */}
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  function renderFieldControl(
    field: MergedFieldConfig,
    displayValue: unknown,
    isReadOnly: boolean,
  ) {
    const fieldId = `field-${field.fieldName}`;

    switch (field.inputType) {
      case 'textarea':
        return (
          <Textarea
            id={fieldId}
            value={String(displayValue ?? '')}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            disabled={isReadOnly}
            maxLength={field.maxLength}
          />
        );

      case 'switch':
        return (
          <div className="flex items-center gap-2">
            <Switch
              id={fieldId}
              checked={Boolean(displayValue)}
              onCheckedChange={(checked) => handleFieldChange(field.fieldName, checked)}
              disabled={isReadOnly}
            />
            <span className="text-sm text-muted-foreground">
              {displayValue ? 'Yes' : 'No'}
            </span>
          </div>
        );

      case 'select':
        return (
          <Select
            value={String(displayValue ?? '')}
            onValueChange={(v) => handleFieldChange(field.fieldName, v)}
            disabled={isReadOnly}
          >
            <SelectTrigger id={fieldId}>
              <SelectValue placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {/* Options will be loaded from selectOptionsSource in a real implementation.
                  For now we render an empty state. The select component still works
                  when options are dynamically provided. */}
              {field.selectOptionsSource && (
                <SelectItem value="__placeholder" disabled>
                  Loading options...
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        );

      case 'date':
        return (
          <Input
            id={fieldId}
            type="date"
            value={String(displayValue ?? '')}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            disabled={isReadOnly}
          />
        );

      case 'email':
        return (
          <Input
            id={fieldId}
            type="email"
            value={String(displayValue ?? '')}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            disabled={isReadOnly}
            onBlur={field.uniqueCheck ? () => handleDuplicateCheck(field) : undefined}
          />
        );

      case 'password':
        return (
          <Input
            id={fieldId}
            type="password"
            value={String(displayValue ?? '')}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            disabled={isReadOnly}
          />
        );

      case 'number':
      case 'currency':
      case 'percentage':
        return (
          <Input
            id={fieldId}
            type="number"
            value={String(displayValue ?? '')}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            disabled={isReadOnly}
            min={field.minValue}
            max={field.maxValue}
            step={field.inputType === 'currency' ? '0.01' : undefined}
            onBlur={field.uniqueCheck ? () => handleDuplicateCheck(field) : undefined}
          />
        );

      case 'combobox':
        return (
          <div className="relative">
            <Input
              id={fieldId}
              value={String(displayValue ?? '')}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
              placeholder={field.placeholder ?? `Search ${field.label.toLowerCase()}...`}
              disabled={isReadOnly}
              onBlur={field.uniqueCheck ? () => handleDuplicateCheck(field) : undefined}
            />
            <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        );

      case 'lookup':
        return (
          <div className="relative">
            <Input
              id={fieldId}
              value={String(displayValue ?? '')}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
              placeholder={field.placeholder ?? `Search ${field.label.toLowerCase()}...`}
              disabled={isReadOnly}
              onBlur={field.uniqueCheck ? () => handleDuplicateCheck(field) : undefined}
            />
            <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        );

      case 'json': {
        const jsonStr =
          displayValue && typeof displayValue === 'object'
            ? JSON.stringify(displayValue, null, 2)
            : String(displayValue ?? '');
        if (isReadOnly) {
          return (
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs">
              {jsonStr}
            </pre>
          );
        }
        return (
          <Textarea
            id={fieldId}
            value={jsonStr}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                handleFieldChange(field.fieldName, parsed);
              } catch {
                handleFieldChange(field.fieldName, e.target.value);
              }
            }}
            placeholder={field.placeholder}
            disabled={isReadOnly}
            className="font-mono text-xs"
            rows={8}
          />
        );
      }

      case 'phone':
      case 'tin':
      case 'isin':
      case 'text':
      default:
        return (
          <Input
            id={fieldId}
            type="text"
            value={String(displayValue ?? '')}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            disabled={isReadOnly}
            maxLength={field.maxLength}
            onBlur={field.uniqueCheck ? () => handleDuplicateCheck(field) : undefined}
          />
        );
    }
  }

  // ---- Title based on mode ----------------------------------------------

  const title = useMemo(() => {
    switch (mode) {
      case 'create':
        return `New ${config.displayName}`;
      case 'edit':
        return `Edit ${config.displayName}`;
      case 'view':
        return `View ${config.displayName}`;
    }
  }, [mode, config.displayName]);

  // ---- Group fields by tab ----------------------------------------------

  const fieldsByGroup = useMemo(() => {
    const map: Record<string, MergedFieldConfig[]> = {};
    for (const group of fieldGroups) {
      map[group] = [];
    }
    for (const field of formFields) {
      const group = field.group ?? 'General';
      if (!map[group]) map[group] = [];
      map[group].push(field);
    }
    return map;
  }, [formFields, fieldGroups]);

  const hasMultipleGroups = fieldGroups.length > 1;

  // ---- Render -----------------------------------------------------------

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl">
          {/* Sticky header */}
          <SheetHeader className="shrink-0 border-b pb-4">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {mode === 'view'
                ? `Viewing ${config.displayName.toLowerCase()} details.`
                : mode === 'edit'
                  ? `Update the ${config.displayName.toLowerCase()} record below.`
                  : `Fill in the details to create a new ${config.displayName.toLowerCase()}.`}
            </SheetDescription>
          </SheetHeader>

          {/* Scrollable form area */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="py-4">
              {hasMultipleGroups ? (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="mb-4 w-full flex-wrap">
                    {fieldGroups.map((group) => (
                      <TabsTrigger key={group} value={group} className="flex-1">
                        {group}
                        {/* Error indicator dot */}
                        {fieldsByGroup[group]?.some((f) => errors[f.fieldName]) && (
                          <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-destructive" />
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {fieldGroups.map((group) => (
                    <TabsContent key={group} value={group} className="space-y-4">
                      {(fieldsByGroup[group] ?? []).map(renderField)}
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <div className="space-y-4">
                  {formFields.map(renderField)}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Sticky footer */}
          {mode !== 'view' && (
            <div className="shrink-0 border-t pt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'create' ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          )}

          {mode === 'view' && (
            <div className="shrink-0 border-t pt-4 flex justify-end">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Draft resume dialog */}
      <AlertDialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved draft for this form. Would you like to resume where you left off?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardDraft}>
              Discard
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleResumeDraft}>
              Resume Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
