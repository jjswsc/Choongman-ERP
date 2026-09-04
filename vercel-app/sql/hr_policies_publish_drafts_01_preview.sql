-- 인사 규정 초안(미게시) 미리보기
-- 다른 PC·직원 앱 홈에 안 보이는 건 is_active = false 인 경우가 많습니다.
-- 이 결과만 확인한 뒤 02를 실행하세요.

SELECT
  id,
  title,
  is_active,
  created_at,
  left(coalesce(content, ''), 80) AS content_preview
FROM public.hr_policies
WHERE is_active = false
ORDER BY created_at DESC;
