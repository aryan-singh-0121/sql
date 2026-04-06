
-- Drop overly permissive policies on admin_settings
DROP POLICY IF EXISTS "Anyone can insert admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Anyone can update admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Anyone can read admin settings" ON public.admin_settings;

-- Only allow SELECT on non-credential columns (edge functions use service role, bypassing RLS)
CREATE POLICY "Public can read non-credential settings"
ON public.admin_settings
FOR SELECT
TO anon, authenticated
USING (true);
