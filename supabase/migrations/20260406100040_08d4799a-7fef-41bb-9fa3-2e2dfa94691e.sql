-- Add explicit deny-all policies on admin_settings
-- This makes the security posture explicit rather than relying on implicit default-deny

CREATE POLICY "Deny all select on admin_settings"
ON public.admin_settings
FOR SELECT
TO public, anon, authenticated
USING (false);

CREATE POLICY "Deny all insert on admin_settings"
ON public.admin_settings
FOR INSERT
TO public, anon, authenticated
WITH CHECK (false);

CREATE POLICY "Deny all update on admin_settings"
ON public.admin_settings
FOR UPDATE
TO public, anon, authenticated
USING (false);

CREATE POLICY "Deny all delete on admin_settings"
ON public.admin_settings
FOR DELETE
TO public, anon, authenticated
USING (false);