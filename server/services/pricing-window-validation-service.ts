type PricingType =
  | 'FIXED_AMOUNT'
  | 'FIXED_RATE'
  | 'SLAB_CUMULATIVE_AMOUNT'
  | 'SLAB_CUMULATIVE_RATE'
  | 'SLAB_INCREMENTAL_AMOUNT'
  | 'SLAB_INCREMENTAL_RATE'
  | 'STEP_FUNCTION';

interface PricingTierInput {
  from?: number | string | null;
  to?: number | string | null;
  rate?: number | string | null;
  amount?: number | string | null;
}

interface StepWindowInput {
  from_month?: number | string | null;
  to_month?: number | string | null;
  amount?: number | string | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOpenEnded(value: number | string | null | undefined): boolean {
  return value === null || value === undefined || value === '' || Number(value) === 0;
}

function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requiredNonNegative(
  value: number | string | null | undefined,
  field: string,
  label: string,
  errors: string[],
): void {
  const parsed = toNumber(value);
  if (parsed === null) {
    errors.push(`${label} requires ${field}`);
  } else if (parsed < 0) {
    errors.push(`${label} ${field} cannot be negative`);
  }
}

function validateFixedPricing(
  pricingType: PricingType,
  tiers: PricingTierInput[],
  errors: string[],
): void {
  if (tiers.length !== 1) {
    errors.push(`${pricingType} requires exactly one pricing tier`);
    return;
  }
  const tier = tiers[0];
  if (pricingType === 'FIXED_AMOUNT') {
    requiredNonNegative(tier.amount, 'amount', 'Fixed pricing tier 1', errors);
  } else {
    requiredNonNegative(tier.rate, 'rate', 'Fixed pricing tier 1', errors);
  }
}

function validateSlabPricing(
  pricingType: PricingType,
  tiers: PricingTierInput[],
  errors: string[],
): void {
  if (tiers.length === 0) {
    errors.push(`${pricingType} requires at least one pricing tier`);
    return;
  }

  const sorted = [...tiers].sort((a, b) => (toNumber(a.from) ?? 0) - (toNumber(b.from) ?? 0));
  let expectedFrom = 0;
  let hasOpenEndedFinal = false;

  for (let index = 0; index < sorted.length; index++) {
    const tier = sorted[index];
    const label = `Pricing tier ${index + 1}`;
    const from = toNumber(tier.from) ?? (index === 0 ? 0 : null);
    const openEnded = isOpenEnded(tier.to);
    const to = openEnded ? null : toNumber(tier.to);

    if (from === null) {
      errors.push(`${label} requires from`);
      continue;
    }
    if (from < 0) {
      errors.push(`${label} from cannot be negative`);
    }
    if (from !== expectedFrom) {
      errors.push(`${label} creates gap or overlap: expected from ${expectedFrom}, received ${from}`);
    }
    if (openEnded && index !== sorted.length - 1) {
      errors.push(`${label} is open-ended but is not the final tier`);
    }
    if (!openEnded && to !== null && to <= from) {
      errors.push(`${label} from (${from}) must be less than to (${to})`);
    }
    if (!openEnded && to === null) {
      errors.push(`${label} has invalid to`);
    }

    if (pricingType.endsWith('_RATE')) {
      requiredNonNegative(tier.rate, 'rate', label, errors);
    } else {
      requiredNonNegative(tier.amount, 'amount', label, errors);
    }

    if (openEnded) {
      hasOpenEndedFinal = true;
    } else if (to !== null) {
      expectedFrom = to;
    }
  }

  if (!hasOpenEndedFinal) {
    errors.push(`${pricingType} requires an open-ended final tier to cover the configured billing base`);
  }
}

function validateStepWindows(windows: StepWindowInput[], errors: string[]): void {
  if (windows.length === 0) {
    errors.push('STEP_FUNCTION requires at least one step window');
    return;
  }

  const sorted = [...windows].sort((a, b) => (toNumber(a.from_month) ?? 0) - (toNumber(b.from_month) ?? 0));
  let expectedFrom = 0;
  let hasOpenEndedFinal = false;

  for (let index = 0; index < sorted.length; index++) {
    const window = sorted[index];
    const label = `Step window ${index + 1}`;
    const from = toNumber(window.from_month) ?? (index === 0 ? 0 : null);
    const openEnded = isOpenEnded(window.to_month);
    const to = openEnded ? null : toNumber(window.to_month);

    if (from === null) {
      errors.push(`${label} requires from_month`);
      continue;
    }
    if (!Number.isInteger(from) || from < 0) {
      errors.push(`${label} from_month must be a non-negative integer`);
    }
    if (from !== expectedFrom) {
      errors.push(`${label} creates gap or overlap: expected from_month ${expectedFrom}, received ${from}`);
    }
    if (openEnded && index !== sorted.length - 1) {
      errors.push(`${label} is open-ended but is not the final window`);
    }
    if (!openEnded && to !== null && (!Number.isInteger(to) || to <= from)) {
      errors.push(`${label} from_month (${from}) must be less than to_month (${to})`);
    }
    if (!openEnded && to === null) {
      errors.push(`${label} has invalid to_month`);
    }
    requiredNonNegative(window.amount, 'amount', label, errors);

    if (openEnded) {
      hasOpenEndedFinal = true;
    } else if (to !== null) {
      expectedFrom = to;
    }
  }

  if (!hasOpenEndedFinal) {
    errors.push('STEP_FUNCTION requires an open-ended final window to cover the configured billing horizon');
  }
}

export function validatePricingDefinitionWindows(input: {
  pricing_type?: string | null;
  pricing_tiers?: unknown[] | null;
  step_windows?: unknown[] | null;
}): string[] {
  const errors: string[] = [];
  const pricingType = input.pricing_type as PricingType | undefined;
  if (!pricingType) return errors;

  const tiers = Array.isArray(input.pricing_tiers)
    ? input.pricing_tiers as PricingTierInput[]
    : [];
  const windows = Array.isArray(input.step_windows)
    ? input.step_windows as StepWindowInput[]
    : [];

  if (pricingType === 'FIXED_AMOUNT' || pricingType === 'FIXED_RATE') {
    validateFixedPricing(pricingType, tiers, errors);
  } else if (pricingType === 'STEP_FUNCTION') {
    validateStepWindows(windows, errors);
  } else if (pricingType.startsWith('SLAB_')) {
    validateSlabPricing(pricingType, tiers, errors);
  }

  return errors;
}

export function validateEffectiveDateWindow(input: {
  effective_date?: string | null;
  expiry_date?: string | null;
  label?: string;
}): string[] {
  const errors: string[] = [];
  const label = input.label ?? 'Effective window';
  const effectiveDate = input.effective_date ?? null;
  const expiryDate = input.expiry_date ?? null;

  if (!isValidIsoDate(effectiveDate)) {
    errors.push(`${label} has invalid effective_date`);
  }
  if (!isValidIsoDate(expiryDate)) {
    errors.push(`${label} has invalid expiry_date`);
  }
  if (effectiveDate && expiryDate && isValidIsoDate(effectiveDate) && isValidIsoDate(expiryDate) && expiryDate < effectiveDate) {
    errors.push(`${label} expiry_date cannot be before effective_date`);
  }

  return errors;
}
