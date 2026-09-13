-- 재고 RPC 본문에 is_deleted 필터가 들어갔는지
-- 기대: body_excludes_deleted = true. 재고 숫자는 1/3 쿼리를 다시 Run.
-- 이것만 복사 → Run.

SELECT
  p.pronargs AS arg_count,
  (pg_get_functiondef(p.oid) LIKE '%is_deleted%') AS body_excludes_deleted
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_store_stock';
