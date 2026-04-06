
-- Admin settings table (single row, stores all config as JSONB)
CREATE TABLE public.admin_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  youtube_links TEXT[] DEFAULT '{}',
  terms_link TEXT DEFAULT '',
  home_video_url TEXT DEFAULT '',
  home_image_url TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  marquee_text TEXT DEFAULT '@Tech-info999',
  practice_questions JSONB DEFAULT '[]',
  credentials JSONB DEFAULT '{"username": "Aryan Singh", "password": "Singh@@1122", "passcode": "922915"}',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings (needed for homepage, practice page etc)
CREATE POLICY "Anyone can read admin settings"
  ON public.admin_settings FOR SELECT
  USING (true);

-- Anyone can update (admin auth is handled in the app layer)
CREATE POLICY "Anyone can update admin settings"
  ON public.admin_settings FOR UPDATE
  USING (true);

-- Anyone can insert (for initial seed)
CREATE POLICY "Anyone can insert admin settings"
  ON public.admin_settings FOR INSERT
  WITH CHECK (true);

-- Insert default row
INSERT INTO public.admin_settings (id) VALUES (1);

-- Storage bucket for logos and images
INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true);

-- Anyone can read assets
CREATE POLICY "Public read access for assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'assets');

-- Anyone can upload assets (admin-gated in UI)
CREATE POLICY "Anyone can upload assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'assets');

-- Anyone can update assets
CREATE POLICY "Anyone can update assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'assets');

-- Anyone can delete assets
CREATE POLICY "Anyone can delete assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'assets');
