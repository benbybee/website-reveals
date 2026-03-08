-- Storage bucket for form uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-uploads', 'form-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: anyone can upload
CREATE POLICY "Anyone can upload form files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'form-uploads');

-- Storage policy: public read
CREATE POLICY "Public read form files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'form-uploads');

-- Helper RPC: safely append a URL to form_sessions.file_urls
CREATE OR REPLACE FUNCTION append_file_url(p_token uuid, p_url text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE form_sessions
  SET file_urls = file_urls || to_jsonb(p_url)
  WHERE token = p_token;
$$;
