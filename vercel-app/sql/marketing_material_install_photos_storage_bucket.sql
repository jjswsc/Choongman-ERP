-- 홍보물 설치 확인 사진 Storage (public read)
-- Run in Supabase SQL Editor or rely on presign route auto-create

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-material-install-photos',
  'marketing-material-install-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read marketing-material-install-photos" ON storage.objects;
CREATE POLICY "Public read marketing-material-install-photos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'marketing-material-install-photos');
