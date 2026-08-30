-- 조회만. DROP/ALTER 없음. 영업 중 실행해도 DB는 바뀌지 않습니다.
-- public 스키마에서 anon을 사실상 전부 허용하는 RLS 정책 목록.
-- 행이 있으면 「Allow all」 구멍이 아직 열려 있는 것입니다.

SELECT
  schemaname AS schema,
  tablename AS table_name,
  policyname AS policy_name,
  roles,
  cmd AS command,
  qual AS using_expr,
  with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    policyname ILIKE 'Allow all%'
    OR COALESCE(qual, '') IN ('true', '(true)')
    OR COALESCE(with_check, '') IN ('true', '(true)')
  )
ORDER BY tablename, policyname;
