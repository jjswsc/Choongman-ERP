-- Omni 2차 점검 (조회만). 1차에서 본 테이블·컬럼 말고
-- anon에 열린 정책, 법인 없는 유니크, store_code 단독 PK 를 찾습니다.
-- 행이 없으면 이 범위는 통과입니다.

SELECT
  area,
  check_id,
  status,
  detail
FROM (
  SELECT
    'rls'::text AS area,
    p.tablename || '.' || p.policyname AS check_id,
    'RISK'::text AS status,
    p.cmd || ' ' || coalesce(p.roles::text, '') AS detail
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND (
      coalesce(p.qual, '') IN ('true', '(true)')
      OR coalesce(p.with_check, '') IN ('true', '(true)')
    )

  UNION ALL

  SELECT
    'unique',
    i.tablename || '.' || i.indexname,
    'RISK',
    i.indexdef
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND i.indexdef ILIKE 'CREATE UNIQUE%'
    AND position('tenant_id' IN i.indexdef) = 0
    AND i.tablename IN (
      'pos_payment_settings',
      'pos_printer_settings',
      'pos_delivery_apps',
      'pos_menu_screen_configs',
      'pos_settlements',
      'pos_close_runs',
      'pos_channel_settlements',
      'pos_order_no_counters',
      'pos_menus',
      'pos_menu_options',
      'members',
      'items',
      'vendors',
      'erp_stores',
      'employees',
      'payroll_records',
      'attendance_logs',
      'schedules',
      'api_request_idempotency_keys',
      'pos_connected_devices'
    )

  UNION ALL

  SELECT
    'pk',
    c.conrelid::regclass::text || '.' || c.conname,
    'RISK',
    pg_get_constraintdef(c.oid)
  FROM pg_constraint c
  WHERE c.contype = 'p'
    AND c.connamespace = 'public'::regnamespace
    AND pg_get_constraintdef(c.oid) ILIKE '%store_code%'
    AND pg_get_constraintdef(c.oid) NOT ILIKE '%tenant_id%'
) checks
ORDER BY area, check_id;
