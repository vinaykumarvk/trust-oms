export const MEETING_TYPES = [
  { value: 'CAMPAIGN_FOLLOW_UP', label: 'Campaign Follow-Up' },
  { value: 'PRODUCT_PRESENTATION', label: 'Product Presentation' },
  { value: 'SERVICE_REVIEW', label: 'Service Review' },
  { value: 'RELATIONSHIP_BUILDING', label: 'Relationship Building' },
  { value: 'GENERAL', label: 'General' },
] as const;

export const MEETING_MODES = [
  { value: 'IN_PERSON', label: 'In Person' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'VIDEO', label: 'Video Call' },
  { value: 'BRANCH_VISIT', label: 'Branch Visit' },
] as const;

export const MEETING_PURPOSES = [
  { value: 'CAMPAIGN_FOLLOW_UP', label: 'Campaign Follow-Up' },
  { value: 'SERVICE_REQUEST', label: 'Service Request' },
  { value: 'GENERAL', label: 'General' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'INITIAL_MEETING', label: 'Initial Meeting' },
  { value: 'PORTFOLIO_REVIEW', label: 'Portfolio Review' },
  { value: 'PRODUCT_PRESENTATION', label: 'Product Presentation' },
  { value: 'RELATIONSHIP_CHECK_IN', label: 'Relationship Check-In' },
  { value: 'COMPLAINT_RESOLUTION', label: 'Complaint Resolution' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const MEETING_REASONS = [
  { value: 'INITIAL_MEETING', label: 'Initial Meeting' },
  { value: 'PORTFOLIO_REVIEW', label: 'Portfolio Review' },
  { value: 'PRODUCT_PRESENTATION', label: 'Product Presentation' },
  { value: 'RELATIONSHIP_CHECK_IN', label: 'Relationship Check-In' },
  { value: 'COMPLAINT_RESOLUTION', label: 'Complaint Resolution' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'REGULATORY', label: 'Regulatory' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** AC-007: Calendar block colors keyed by meeting_reason (used in preference to status colors) */
export const meetingReasonBlockColors: Record<string, string> = {
  INITIAL_MEETING: 'bg-teal-200 dark:bg-teal-800 border-teal-400 dark:border-teal-600',
  PORTFOLIO_REVIEW: 'bg-blue-200 dark:bg-blue-800 border-blue-400 dark:border-blue-600',
  PRODUCT_PRESENTATION: 'bg-purple-200 dark:bg-purple-800 border-purple-400 dark:border-purple-600',
  RELATIONSHIP_CHECK_IN: 'bg-green-200 dark:bg-green-800 border-green-400 dark:border-green-600',
  COMPLAINT_RESOLUTION: 'bg-rose-200 dark:bg-rose-800 border-rose-400 dark:border-rose-600',
  ONBOARDING: 'bg-orange-200 dark:bg-orange-800 border-orange-400 dark:border-orange-600',
  REGULATORY: 'bg-yellow-200 dark:bg-yellow-800 border-yellow-400 dark:border-yellow-600',
  OTHER: 'bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-600',
};

export const meetingStatusColors: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  RESCHEDULED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  NO_SHOW: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export const callReportStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  SUBMITTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  RETURNED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export const actionPriorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  MEDIUM: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  URGENT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export const actionStatusColors: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

/* ---------- Business Rule Constants ---------- */

export const CRM_LATE_FILING_THRESHOLD_DAYS = 5;
export const CRM_DEFAULT_REMINDER_MINUTES = 30;
export const CRM_MIN_REJECTION_COMMENT_CHARS = 20;
export const CRM_MAX_PAGE_SIZE = 200;
export const CRM_DEFAULT_PAGE_SIZE = 20;

/* ---------- Shared Utilities ---------- */

/** Count business days between two dates (excludes Sat/Sun). */
export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const target = new Date(end);
  target.setHours(0, 0, 0, 0);
  if (current >= target) return 0;
  while (current < target) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** Calendar days since a given date string. */
export function daysSinceMeeting(meetingDate: string): number {
  if (!meetingDate) return 0;
  const meeting = new Date(meetingDate);
  const now = new Date();
  const diff = now.getTime() - meeting.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/* ---------- CRM Form Shared Constants ---------- */

export const ENTITY_TYPES = ['INDIVIDUAL', 'NON_INDIVIDUAL'] as const;
export const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Atty.', 'Engr.'] as const;
export const GENDERS = ['Male', 'Female', 'Other'] as const;
export const MARITAL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'] as const;
export const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'] as const;
export const ADDRESS_TYPES = ['HOME', 'OFFICE', 'MAILING', 'OTHER'] as const;
export const ID_TYPES = ['PASSPORT', 'DRIVERS_LICENSE', 'SSS', 'TIN', 'NATIONAL_ID', 'OTHER'] as const;
export const COMMUNICATION_PREFS = ['Email', 'Phone', 'SMS', 'Mail'] as const;
export const PRODUCT_INTERESTS = [
  'UITF', 'Bonds', 'Equities', 'Real Estate', 'Insurance',
  'Structured Products', 'Forex', 'Time Deposit', 'Trust Account',
] as const;
export const RISK_APPETITES = ['Conservative', 'Moderate', 'Aggressive'] as const;
export const CLASSIFICATIONS = ['HNWI', 'UHNWI', 'Mass Affluent', 'Retail', 'Institutional'] as const;
export const CURRENCIES = ['PHP', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'HKD'] as const;
export const COUNTRIES = [
  'Philippines', 'United States', 'Singapore', 'Hong Kong', 'Japan',
  'United Kingdom', 'Canada', 'Australia', 'China', 'Other',
] as const;

/* ---------- CRM Form Shared Interfaces ---------- */

export interface CrmFamilyMember {
  relationship: string;
  first_name: string;
  last_name: string;
  dob: string;
  occupation: string;
  contact_number: string;
}

export interface CrmAddress {
  address_type: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_primary: boolean;
}

export interface CrmIdentification {
  id_type: string;
  id_number: string;
  issue_date: string;
  expiry_date: string;
  issuing_authority: string;
  issuing_country: string;
}

export interface CrmDocumentRecord {
  document_type: string;
  file_name: string;
}

/** Base shape for form data containing sub-entity arrays */
export interface CrmSubEntities {
  family_members: CrmFamilyMember[];
  addresses: CrmAddress[];
  identifications: CrmIdentification[];
  documents: CrmDocumentRecord[];
  product_interests: string[];
}
