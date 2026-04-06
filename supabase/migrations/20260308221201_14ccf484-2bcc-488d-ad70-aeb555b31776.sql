
-- Remove the current permissive SELECT policy on admin_settings
DROP POLICY IF EXISTS "Public can read non-credential settings" ON public.admin_settings;

-- Block ALL public access to admin_settings table
-- Edge functions use service role key which bypasses RLS entirely
-- Public reads go through admin_settings_public view
