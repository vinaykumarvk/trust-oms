-- Add notification types emitted by scheduled CRM jobs.
ALTER TYPE crm_notification_type ADD VALUE IF NOT EXISTS 'MEETING_NO_SHOW';
ALTER TYPE crm_notification_type ADD VALUE IF NOT EXISTS 'TASK_REMINDER';
ALTER TYPE crm_notification_type ADD VALUE IF NOT EXISTS 'HANDOVER_SLA_BREACH';

-- Add conversation type used by opportunity and call-report note history.
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'NOTE';
