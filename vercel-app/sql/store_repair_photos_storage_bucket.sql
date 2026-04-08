-- 매장 수리 신고 사진용 Supabase Storage 버킷 (SQL Editor에서 실행)
-- 앱은 presign API에서 service_role로 버킷을 자동 생성하기도 합니다.
-- 대시보드에서 수동 생성을 선호하면: Storage > New bucket > 이름 store-repair-photos > Public

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-repair-photos',
  'store-repair-photos',
  true,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 공개 URL(/object/public/...)으로 이미지 조회 허용
DROP POLICY IF EXISTS "Public read store-repair-photos" ON storage.objects;
CREATE POLICY "Public read store-repair-photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'store-repair-photos');
