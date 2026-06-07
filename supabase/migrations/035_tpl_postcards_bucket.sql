-- Storage bucket for uploaded postcard artwork (front/back PNG/PDF). Public so
-- Lob can fetch the asset URL when rendering a postcard. Reuses Supabase Storage
-- (no new vendor). Idempotent insert.

INSERT INTO storage.buckets (id, name, public)
VALUES ('tpl-postcards', 'tpl-postcards', true)
ON CONFLICT (id) DO NOTHING;
