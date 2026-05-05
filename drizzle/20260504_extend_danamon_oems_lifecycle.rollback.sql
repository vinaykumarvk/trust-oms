BEGIN;

DELETE FROM oems_migration_rollback_scripts
WHERE migration_name = '20260504_extend_danamon_oems_lifecycle.sql';

DELETE FROM oems_report_definitions
WHERE report_code IN (
  'OEMS_RFP_REPORT_PACK',
  'OEMS_ADAPTER_RECONCILIATION',
  'OEMS_APPROVAL_QUEUE_SLA'
);

DELETE FROM oems_approval_queue_items
WHERE workflow_id IN (
  SELECT id
  FROM oems_approval_workflow_definitions
  WHERE workflow_code IN (
    'OEMS-ODA-ORDER-APPROVAL',
    'OEMS-MLD-TRANCHE-APPROVAL',
    'OEMS-WEALTH-ORDER-APPROVAL',
    'OEMS-FX-TODAY-APPROVAL',
    'OEMS-PARAMETER-APPROVAL',
    'OEMS-REPORT-EXPORT-APPROVAL'
  )
);

DELETE FROM oems_approval_workflow_definitions
WHERE workflow_code IN (
  'OEMS-ODA-ORDER-APPROVAL',
  'OEMS-MLD-TRANCHE-APPROVAL',
  'OEMS-WEALTH-ORDER-APPROVAL',
  'OEMS-FX-TODAY-APPROVAL',
  'OEMS-PARAMETER-APPROVAL',
  'OEMS-REPORT-EXPORT-APPROVAL'
);

DELETE FROM oems_integration_adapter_executions
WHERE adapter_id IN (
  'ADP-WEALTH-CORE',
  'ADP-RBS',
  'ADP-CA-CIB',
  'ADP-NCBS',
  'ADP-TREASURY',
  'ADP-BIU',
  'ADP-DOCUSIGN-ESIGN',
  'ADP-NOTIFICATION-GATEWAY',
  'ADP-BIG-DATA'
);

DELETE FROM oems_integration_adapters
WHERE adapter_id IN (
  'ADP-WEALTH-CORE',
  'ADP-RBS',
  'ADP-CA-CIB',
  'ADP-NCBS',
  'ADP-TREASURY',
  'ADP-BIU',
  'ADP-DOCUSIGN-ESIGN',
  'ADP-NOTIFICATION-GATEWAY',
  'ADP-BIG-DATA'
);

DROP TABLE IF EXISTS oems_migration_rollback_scripts;
DROP TABLE IF EXISTS oems_approval_queue_items;
DROP TABLE IF EXISTS oems_approval_workflow_definitions;
DROP TABLE IF EXISTS oems_report_render_artifacts;
DROP TABLE IF EXISTS oems_integration_adapter_executions;
DROP TABLE IF EXISTS oems_integration_adapters;

COMMIT;
