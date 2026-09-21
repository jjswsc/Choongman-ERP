-- Omni: vendors.code unique 가 전역이면 회사마다 HQ 행을 만들 수 없음
-- ux_vendors_tenant_code 가 있어야 테넌트별 HQ 가 가능합니다.
-- 충만 레거시 DB에는 실행하지 마세요.

SELECT
  n.nspname AS schema_name,
  c.relname AS index_or_constraint,
  pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'vendors'
  AND (
    c.relname ILIKE '%vendors_code%'
    OR c.relname ILIKE '%tenant_code%'
    OR pg_get_indexdef(i.indexrelid) ILIKE '%code%'
  )
ORDER BY c.relname;
