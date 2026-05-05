CREATE TABLE IF NOT EXISTS client_portal_evidence_events (
  id serial PRIMARY KEY,
  evidence_event_id text UNIQUE NOT NULL,
  client_id text NOT NULL REFERENCES clients(client_id),
  portal_user_id text,
  event_type text NOT NULL,
  action text NOT NULL,
  source_channel text NOT NULL DEFAULT 'CLIENT_PORTAL',
  source_entity_type text NOT NULL,
  source_entity_id text,
  source_entity_ref text,
  direction text,
  event_status text NOT NULL DEFAULT 'RECORDED',
  notification_status text,
  content_hash text,
  evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text,
  correlation_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_client_portal_evidence_event_id
  ON client_portal_evidence_events (evidence_event_id);

CREATE INDEX IF NOT EXISTS idx_client_portal_evidence_client
  ON client_portal_evidence_events (client_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_client_portal_evidence_type
  ON client_portal_evidence_events (event_type, event_status);

CREATE INDEX IF NOT EXISTS idx_client_portal_evidence_entity
  ON client_portal_evidence_events (source_entity_type, source_entity_id);

ALTER TABLE client_statements
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS last_downloaded_by text,
  ADD COLUMN IF NOT EXISTS last_downloaded_ip text,
  ADD COLUMN IF NOT EXISTS access_history jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO client_portal_evidence_events (
  evidence_event_id,
  client_id,
  portal_user_id,
  event_type,
  action,
  source_channel,
  source_entity_type,
  source_entity_id,
  source_entity_ref,
  direction,
  event_status,
  evidence_payload,
  occurred_at,
  created_by,
  updated_by
)
SELECT
  'CPE-MESSAGE-SENT-' || id::text,
  recipient_client_id,
  sender_id::text,
  'MESSAGE_SENT',
  'MESSAGE_SENT',
  'CLIENT_PORTAL',
  'CLIENT_MESSAGE',
  id::text,
  thread_id,
  CASE WHEN sender_type = 'CLIENT' THEN 'OUTBOUND' ELSE 'INBOUND' END,
  CASE WHEN is_read THEN 'READ' ELSE 'SENT' END,
  jsonb_build_object(
    'thread_id', thread_id,
    'sender_type', sender_type,
    'subject', subject,
    'related_sr_id', related_sr_id,
    'backfilled', true
  ),
  sent_at,
  'MIGRATION_BACKFILL',
  'MIGRATION_BACKFILL'
FROM client_messages
WHERE is_deleted = false
ON CONFLICT (evidence_event_id) DO NOTHING;

INSERT INTO client_portal_evidence_events (
  evidence_event_id,
  client_id,
  portal_user_id,
  event_type,
  action,
  source_channel,
  source_entity_type,
  source_entity_id,
  source_entity_ref,
  direction,
  event_status,
  evidence_payload,
  occurred_at,
  created_by,
  updated_by
)
SELECT
  'CPE-MESSAGE-READ-' || id::text,
  recipient_client_id,
  updated_by,
  'MESSAGE_READ',
  'MESSAGE_READ',
  'CLIENT_PORTAL',
  'CLIENT_MESSAGE',
  id::text,
  thread_id,
  'INBOUND',
  'READ',
  jsonb_build_object(
    'thread_id', thread_id,
    'sender_type', sender_type,
    'backfilled', true
  ),
  COALESCE(read_at, updated_at),
  'MIGRATION_BACKFILL',
  'MIGRATION_BACKFILL'
FROM client_messages
WHERE is_deleted = false
  AND is_read = true
ON CONFLICT (evidence_event_id) DO NOTHING;

INSERT INTO client_portal_evidence_events (
  evidence_event_id,
  client_id,
  portal_user_id,
  event_type,
  action,
  source_channel,
  source_entity_type,
  source_entity_id,
  source_entity_ref,
  direction,
  event_status,
  content_hash,
  evidence_payload,
  occurred_at,
  created_by,
  updated_by
)
SELECT
  'CPE-STATEMENT-DOWNLOAD-' || id::text,
  client_id,
  last_downloaded_by,
  'STATEMENT_DOWNLOADED',
  'DOWNLOAD',
  'CLIENT_PORTAL',
  'CLIENT_STATEMENT',
  id::text,
  period,
  'OUTBOUND',
  'DELIVERED',
  content_hash,
  jsonb_build_object(
    'statement_type', statement_type,
    'period', period,
    'download_count', download_count,
    'last_downloaded_ip', last_downloaded_ip,
    'backfilled', true
  ),
  COALESCE(last_downloaded_at, updated_at),
  'MIGRATION_BACKFILL',
  'MIGRATION_BACKFILL'
FROM client_statements
WHERE download_count > 0
ON CONFLICT (evidence_event_id) DO NOTHING;

INSERT INTO client_portal_evidence_events (
  evidence_event_id,
  client_id,
  event_type,
  action,
  source_channel,
  source_entity_type,
  source_entity_id,
  direction,
  event_status,
  notification_status,
  content_hash,
  notification_payload,
  occurred_at,
  created_by,
  updated_by
)
SELECT
  'CPE-NOTIFICATION-' || id::text,
  recipient_id,
  'PORTAL_NOTIFICATION',
  'NOTIFICATION_DELIVERED',
  COALESCE(channel::text, 'IN_APP'),
  'NOTIFICATION_LOG',
  id::text,
  'INBOUND',
  COALESCE(notification_status, 'SENT'),
  notification_status,
  content_hash,
  jsonb_build_object(
    'event_type', event_type,
    'channel', channel,
    'sent_at', sent_at,
    'delivered_at', delivered_at,
    'backfilled', true
  ),
  COALESCE(delivered_at, sent_at, created_at),
  'MIGRATION_BACKFILL',
  'MIGRATION_BACKFILL'
FROM notification_log
WHERE recipient_id IS NOT NULL
  AND is_deleted = false
ON CONFLICT (evidence_event_id) DO NOTHING;
