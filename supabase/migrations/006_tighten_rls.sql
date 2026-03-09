-- Tighten RLS: Since the app exclusively uses the service role key server-side,
-- disable overly permissive anon policies to prevent direct Supabase API abuse.

-- Drop the existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can create a session" ON form_sessions;
DROP POLICY IF EXISTS "Anyone can read by token" ON form_sessions;
DROP POLICY IF EXISTS "Anyone can update by token" ON form_sessions;

-- No anon policies = only service role key can access rows.
-- The app already uses createServerClient() with SUPABASE_SERVICE_ROLE_KEY
-- which bypasses RLS entirely, so no new policies are needed.
