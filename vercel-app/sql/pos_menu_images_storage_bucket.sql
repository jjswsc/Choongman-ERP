-- POS 메뉴 이미지 + 고객화면 Idle 배경 미디어용 Storage 버킷
-- Supabase SQL Editor에서 실행. (없으면 업로드 시 "bucket missing" 오류)
-- 대시보드 수동: Storage > New bucket > 이름 pos-menu-images > Public
-- 파일 한도: 이미지 ≤4MB / 동영상 ≤50MB (버킷 한도는 50MB)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pos-menu-images',
  'pos-menu-images',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 공개 URL(/object/public/...)으로 조회 허용
DROP POLICY IF EXISTS "Public read pos-menu-images" ON storage.objects;
CREATE POLICY "Public read pos-menu-images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'pos-menu-images');
