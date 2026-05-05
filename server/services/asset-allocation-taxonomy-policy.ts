export interface AssetClassReference {
  id: number;
  code: string;
  name?: string | null;
  is_deleted?: boolean | null;
}

export interface AssetAllocationLineInput {
  risk_category: string;
  asset_class: string;
  allocation_percentage: string;
  expected_return_pct?: string;
  standard_deviation_pct?: string;
}

export interface TaxonomyBoundAllocationLine extends AssetAllocationLineInput {
  asset_class: string;
  asset_class_id: number;
  asset_class_code: string;
  taxonomy_snapshot: Record<string, unknown>;
}

export function normalizeAssetClassCode(value: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function validateAssetAllocationTaxonomy(
  lines: AssetAllocationLineInput[],
  references: AssetClassReference[],
  validatedAt: Date = new Date(),
): { valid: boolean; errors: string[]; lines: TaxonomyBoundAllocationLine[] } {
  const activeRefs = new Map(
    references
      .filter((ref) => ref.code && !ref.is_deleted)
      .map((ref) => [normalizeAssetClassCode(ref.code), ref]),
  );
  const errors: string[] = [];
  const boundLines: TaxonomyBoundAllocationLine[] = [];

  for (const [index, line] of lines.entries()) {
    const code = normalizeAssetClassCode(line.asset_class);
    const ref = activeRefs.get(code);
    if (!code) {
      errors.push(`Line ${index + 1}: asset_class is required`);
      continue;
    }
    if (!ref) {
      errors.push(`Line ${index + 1}: asset_class ${line.asset_class} is not in the approved asset class taxonomy`);
      continue;
    }
    boundLines.push({
      ...line,
      asset_class: code,
      asset_class_id: ref.id,
      asset_class_code: code,
      taxonomy_snapshot: {
        asset_class_id: ref.id,
        asset_class_code: code,
        asset_class_name: ref.name ?? null,
        taxonomy_source: 'asset_classes',
        validated_at: validatedAt.toISOString(),
      },
    });
  }

  return { valid: errors.length === 0, errors, lines: boundLines };
}

export function summarizeAllocationByRiskCategory(
  lines: Pick<AssetAllocationLineInput, 'risk_category' | 'allocation_percentage'>[],
): Record<string, number> {
  return lines.reduce<Record<string, number>>((summary, line) => {
    const key = String(line.risk_category ?? '').trim().toUpperCase();
    const amount = Number(line.allocation_percentage);
    summary[key] = (summary[key] ?? 0) + (Number.isFinite(amount) ? amount : 0);
    return summary;
  }, {});
}
