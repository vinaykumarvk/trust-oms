export interface FieldDefaults {
  label: string;
  group?: string;
  groupOrder?: number;
  displayOrder?: number;
  inputType?:
    | 'text'
    | 'number'
    | 'date'
    | 'email'
    | 'password'
    | 'textarea'
    | 'switch'
    | 'select'
    | 'combobox'
    | 'lookup'
    | 'percentage'
    | 'currency'
    | 'phone'
    | 'tin'
    | 'isin'
    | 'json';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  visibleInForm?: boolean;
  visibleInTable?: boolean;
  visibleInDetail?: boolean;
  editable?: boolean;
  piiSensitive?: boolean;
  piiClassification?: 'None' | 'PII' | 'Sensitive-PII' | 'Financial-PII';
  dataResidency?: 'PH-only' | 'Allowed-offshore';
  validationRegex?: string;
  uniqueCheck?: boolean;
  fuzzyMatch?: boolean;
  columnWidth?: string;
  sortable?: boolean;
  filterable?: boolean;
  formatType?: string;
  selectOptions?: Array<{ value: string; label: string }>;
  selectOptionsSource?: string;
  dependsOnField?: string;
  dependsOnValue?: string;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
}

export interface EntityFieldDefaults {
  fields: Record<string, FieldDefaults>;
  fieldGroups: string[];
}

export interface MergedFieldConfig extends FieldDefaults {
  fieldName: string;
}

export interface MergedEntityConfig {
  entityKey: string;
  displayName: string;
  displayNamePlural: string;
  fieldGroups: string[];
  fields: MergedFieldConfig[];
}

export interface CrossValidationRule {
  id?: number;
  entityKey: string;
  ruleName: string;
  condition: Record<string, unknown>;
  errorMessage: string;
  isActive: boolean;
}
