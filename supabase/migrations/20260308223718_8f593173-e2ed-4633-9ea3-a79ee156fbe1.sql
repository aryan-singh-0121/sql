
-- Recreate the view with security_invoker = off so it bypasses RLS on admin_settings
-- This is safe because the view excludes the credentials column
DROP VIEW IF EXISTS public.admin_settings_public;

CREATE VIEW public.admin_settings_public
WITH (security_invoker = off)
AS
SELECT
  id,
  youtube_links,
  terms_link,
  home_video_url,
  home_image_url,
  logo_url,
  favicon_url,
  site_title,
  instagram_url,
  instagram_popup_enabled,
  marquee_text,
  practice_questions,
  updated_at
FROM public.admin_settings;

-- Grant SELECT on the view to anon and authenticated
GRANT SELECT ON public.admin_settings_public TO anon, authenticated;
