-- Track when a submission was exported/downloaded
ALTER TABLE form_sessions ADD COLUMN exported_at timestamp with time zone;
