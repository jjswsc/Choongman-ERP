-- 회원앱 CRM 이미지 Storage (member-portal-content)
-- Supabase SQL Editor에서 실행. presign API 자동 생성과 병행 가능.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'member-portal-content',
  'member-portal-content',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read member-portal-content" ON storage.objects;
CREATE POLICY "Public read member-portal-content"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'member-portal-content');
