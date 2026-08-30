-- 조회만. DROP/ALTER 없음. 영업 중 실행해도 DB는 바뀌지 않습니다.
-- RLS가 꺼진 public 테이블. 정책이 없어도 PostgREST(anon)가 GRANT만으로 열릴 수 있습니다.

SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_on
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;
