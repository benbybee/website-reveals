-- Notification audience toggles. Three rows by design — one per audience.
-- Notification call sites consult is_enabled(audience) before sending.

CREATE TABLE notification_settings (
  audience    text PRIMARY KEY CHECK (audience IN ('client', 'sales_rep', 'admin')),
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO notification_settings (audience, enabled) VALUES
  ('client',    true),
  ('sales_rep', true),
  ('admin',     true);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on notification_settings"
  ON notification_settings FOR ALL
  USING (true)
  WITH CHECK (true);
