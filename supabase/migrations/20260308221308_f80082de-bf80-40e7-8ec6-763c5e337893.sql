
-- Remove plaintext credentials from column default
ALTER TABLE public.admin_settings ALTER COLUMN credentials SET DEFAULT '{}'::jsonb;
