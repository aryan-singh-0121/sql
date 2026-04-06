
-- Create a view that excludes credentials for public use
CREATE OR REPLACE VIEW public.admin_settings_public AS
SELECT 
  id, logo_url, marquee_text, favicon_url, site_title, instagram_url,
  youtube_links, terms_link, home_video_url, home_image_url,
  instagram_popup_enabled, practice_questions, updated_at
FROM public.admin_settings;

-- Grant access to the view
GRANT SELECT ON public.admin_settings_public TO anon, authenticated;
