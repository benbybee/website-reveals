-- Enable Supabase Realtime for admin dashboard tables
alter publication supabase_realtime add table form_sessions;
alter publication supabase_realtime add table clients;
alter publication supabase_realtime add table tasks;
