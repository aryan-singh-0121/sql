
-- Fix the security definer view issue
ALTER VIEW public.admin_settings_public SET (security_invoker = on);
