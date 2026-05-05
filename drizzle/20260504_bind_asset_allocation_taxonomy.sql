ALTER TABLE asset_allocation_lines
  ADD COLUMN IF NOT EXISTS asset_class_id integer REFERENCES asset_classes(id),
  ADD COLUMN IF NOT EXISTS asset_class_code text,
  ADD COLUMN IF NOT EXISTS taxonomy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS taxonomy_validated_at timestamp with time zone;

UPDATE asset_allocation_lines aal
SET
  asset_class_code = COALESCE(aal.asset_class_code, upper(replace(replace(trim(aal.asset_class), ' ', '_'), '-', '_'))),
  asset_class_id = COALESCE(aal.asset_class_id, ac.id),
  taxonomy_validated_at = COALESCE(aal.taxonomy_validated_at, now()),
  taxonomy_snapshot = CASE
    WHEN aal.taxonomy_snapshot <> '{}'::jsonb THEN aal.taxonomy_snapshot
    ELSE jsonb_build_object(
      'asset_class_id', ac.id,
      'asset_class_code', COALESCE(ac.code, upper(replace(replace(trim(aal.asset_class), ' ', '_'), '-', '_'))),
      'asset_class_name', ac.name,
      'taxonomy_source', 'asset_classes',
      'validated_at', now(),
      'backfill_status', CASE WHEN ac.id IS NULL THEN 'UNMATCHED' ELSE 'MATCHED' END
    )
  END
FROM asset_classes ac
WHERE upper(replace(replace(trim(aal.asset_class), ' ', '_'), '-', '_')) = upper(replace(replace(trim(ac.code), ' ', '_'), '-', '_'));

UPDATE asset_allocation_lines
SET
  asset_class_code = COALESCE(asset_class_code, upper(replace(replace(trim(asset_class), ' ', '_'), '-', '_'))),
  taxonomy_validated_at = COALESCE(taxonomy_validated_at, now()),
  taxonomy_snapshot = CASE
    WHEN taxonomy_snapshot <> '{}'::jsonb THEN taxonomy_snapshot
    ELSE jsonb_build_object(
      'asset_class_id', NULL,
      'asset_class_code', COALESCE(asset_class_code, upper(replace(replace(trim(asset_class), ' ', '_'), '-', '_'))),
      'asset_class_name', NULL,
      'taxonomy_source', 'asset_classes',
      'validated_at', now(),
      'backfill_status', 'UNMATCHED'
    )
  END
WHERE asset_class_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_allocation_lines_asset_class_id
  ON asset_allocation_lines(asset_class_id);

CREATE INDEX IF NOT EXISTS idx_asset_allocation_lines_asset_class_code
  ON asset_allocation_lines(asset_class_code);
