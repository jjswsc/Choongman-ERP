-- Omni 공유 DB 준비 점검 (조회만, 변경 없음)
-- Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 DB에는 돌리지 마세요. status = GAP / RISK 인 행만 보면 됩니다.

SELECT
  area,
  check_id,
  status,
  detail
FROM (
  SELECT
    'schema'::text AS area,
    t.table_name AS check_id,
    CASE WHEN to_regclass('public.' || t.table_name) IS NULL THEN 'GAP' ELSE 'ok' END AS status,
    CASE WHEN to_regclass('public.' || t.table_name) IS NULL THEN '테이블 없음' ELSE '있음' END AS detail
  FROM (VALUES
    ('tenants'),
    ('erp_stores'),
    ('employees'),
    ('items'),
    ('item_categories'),
    ('vendors'),
    ('stock_logs'),
    ('orders'),
    ('inbound_batches'),
    ('pos_orders'),
    ('pos_menus'),
    ('pos_menu_options'),
    ('pos_menu_ingredients'),
    ('pos_printer_settings'),
    ('pos_settlements'),
    ('pos_channel_settlements'),
    ('pos_close_runs'),
    ('pos_payment_settings'),
    ('pos_order_no_counters'),
    ('pos_connected_devices'),
    ('members'),
    ('attendance_logs'),
    ('schedules'),
    ('payroll_records'),
    ('leave_requests'),
    ('journal_entries'),
    ('account_subjects'),
    ('receivable_transactions'),
    ('payable_transactions'),
    ('tenant_integrations'),
    ('tenant_policy_settings')
  ) AS t(table_name)

  UNION ALL

  SELECT
    'tenant_col',
    c.table_name || '.tenant_id',
    CASE
      WHEN to_regclass('public.' || c.table_name) IS NULL THEN 'GAP'
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.table_name
          AND col.column_name = 'tenant_id'
      ) THEN 'GAP'
      ELSE 'ok'
    END,
    CASE
      WHEN to_regclass('public.' || c.table_name) IS NULL THEN '테이블 없음'
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.table_name
          AND col.column_name = 'tenant_id'
      ) THEN 'tenant_id 없음 — 법인끼리 한 통으로 보임'
      ELSE 'tenant_id 있음'
    END
  FROM (VALUES
    ('erp_stores'),
    ('employees'),
    ('items'),
    ('vendors'),
    ('stock_logs'),
    ('pos_orders'),
    ('pos_menus'),
    ('pos_settlements'),
    ('pos_close_runs'),
    ('pos_channel_settlements'),
    ('pos_payment_settings'),
    ('pos_order_no_counters'),
    ('members'),
    ('attendance_logs'),
    ('schedules'),
    ('payroll_records'),
    ('leave_requests'),
    ('pos_connected_devices')
  ) AS c(table_name)

  UNION ALL

  SELECT
    'unique',
    i.indexname,
    'RISK',
    '매장코드만 유니크 — 법인 B가 같은 매장코드를 쓰면 저장이 막히거나 결산이 섞임'
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND i.indexname IN (
      'ux_pos_settlements_store_date',
      'pos_settlements_store_code_settle_date_key',
      'pos_close_runs_uniq',
      'pos_channel_settlements_store_code_settle_date_channel_key',
      'ux_pos_menus_code_norm',
      'ux_pos_orders_idempotency_key_hash'
    )

  UNION ALL

  SELECT
    'unique',
    want.idx,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_indexes i
      WHERE i.schemaname = 'public' AND i.indexname = want.idx
    ) THEN 'ok' ELSE 'GAP' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_indexes i
      WHERE i.schemaname = 'public' AND i.indexname = want.idx
    ) THEN '법인+매장 유니크 있음' ELSE '법인 단위 유니크 없음' END
  FROM (VALUES
    ('uq_pos_settlements_tenant_store_date'),
    ('uq_pos_close_runs_tenant_store_date'),
    ('uq_erp_stores_tenant_store_code'),
    ('ux_pos_menus_tenant_code_norm'),
    ('uq_members_tenant_phone_canonical'),
    ('ux_items_tenant_code'),
    ('ux_pos_orders_tenant_idempotency_key_hash')
  ) AS want(idx)

  UNION ALL

  SELECT
    'rls',
    p.tablename || '.' || p.policyname,
    'RISK',
    'USING(true) — anon 키로 다른 법인 행이 열릴 수 있음'
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN (
      'pos_orders', 'pos_menus', 'pos_settlements', 'employees', 'members',
      'erp_stores', 'stock_logs', 'items', 'payroll_records'
    )
    AND (
      coalesce(p.qual, '') IN ('true', '(true)')
      OR coalesce(p.with_check, '') IN ('true', '(true)')
    )

  UNION ALL

  SELECT
    'rpc',
    f.proname,
    'ok',
    '함수 있음'
  FROM pg_proc f
  JOIN pg_namespace n ON n.oid = f.pronamespace
  WHERE n.nspname = 'public'
    AND f.proname IN (
      'allocate_pos_order_no',
      'get_store_stock',
      'get_distinct_stock_locations',
      'get_member_list_cursor',
      'get_saas_tenant_usage_batch'
    )

  UNION ALL

  SELECT
    'rpc',
    need.name,
    'GAP',
    '함수 없음'
  FROM (VALUES
    ('allocate_pos_order_no'),
    ('get_store_stock'),
    ('get_distinct_stock_locations'),
    ('get_member_list_cursor'),
    ('get_saas_tenant_usage_batch')
  ) AS need(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc f
    JOIN pg_namespace n ON n.oid = f.pronamespace
    WHERE n.nspname = 'public' AND f.proname = need.name
  )

  UNION ALL

  SELECT
    'login',
    'tenants.company_name 중복',
    CASE WHEN dup.n > 0 THEN 'RISK' ELSE 'ok' END,
    CASE WHEN dup.n > 0
      THEN dup.n::text || '개 회사명이 두 법인에 같음 — 로그인이 먼저 만든 법인으로 붙을 수 있음'
      ELSE '회사명 중복 없음'
    END
  FROM (
    SELECT count(*)::int AS n
    FROM (
      SELECT lower(trim(company_name))
      FROM public.tenants
      GROUP BY lower(trim(company_name))
      HAVING count(*) > 1
    ) d
  ) dup
) checks
WHERE status IN ('GAP', 'RISK')
ORDER BY area, check_id;
