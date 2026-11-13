-- allocate_pos_order_no / 카운터 테이블 배포 여부 (미리보기만, 변경 없음)
SELECT
  'rpc' AS kind,
  p.proname AS name,
  pg_get_function_identity_arguments(p.oid) AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'allocate_pos_order_no'
UNION ALL
SELECT
  'table' AS kind,
  'pos_order_no_counters' AS name,
  CASE
    WHEN to_regclass('public.pos_order_no_counters') IS NULL THEN 'missing'
    ELSE 'ok'
  END AS detail
ORDER BY 1, 2, 3;
