-- Drop overly permissive storage policies
DROP POLICY IF EXISTS "Anyone can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete assets" ON storage.objects;

-- Create restricted policies for authenticated users only
CREATE POLICY "Authenticated users can upload assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'assets');

CREATE POLICY "Authenticated users can update assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'assets');

CREATE POLICY "Authenticated users can delete assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'assets');