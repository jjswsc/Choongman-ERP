-- =============================================================================
-- Omni POS — anon/authenticated 직접 접근 차단 (tenant 교차 노출·조작 완화)
-- =============================================================================
-- ⚠️ 반드시 Omni Supabase 프로젝트에서만 실행하세요.
-- ⚠️ 충만(Choongman) DB에는 절대 실행하지 마세요. (DB 자체가 분리되어 있음)
--
-- 효과:
--   - 서버 API(service_role)는 RLS 우회 → ERP/POS API 동작 유지
--   - 브라우저 anon 키로 PostgREST 직접 SELECT/INSERT/UPDATE/DELETE 불가
--   - Realtime postgres_changes(anon)는 이벤트를 못 받을 수 있음 → POS는 폴링 폴백
--
-- 선행: pos_orders / pos_menus 등 대상 테이블에 tenant_id 컬럼·백필 권장
--   (sql/pos_catalog_tenant_id.sql 등)
-- =============================================================================

DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY[
    'pos_orders',
    'pos_menus',
    'pos_menu_options',
    'pos_menu_ingredients',
    'pos_promos',
    'pos_promo_items',
    'pos_table_layouts',
    'pos_connected_devices',
    'pos_printer_settings',
    'pos_settlements',
    'employees',
    'members',
    'erp_stores',
    'stock_logs',
    'items',
    'vendors',
    'receivable_transactions',
    'payable_transactions',
    'bank_transactions',
    'journal_entries',
    'journal_lines',
    'vat_ledger_entries',
    'tenant_integrations',
    'tenant_store_integrations',
    'tenant_subscriptions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- 기존 정책 전부 제거 (USING(true) 잔존 시 deny와 OR로 뚫림)
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)',
      'omni_deny_anon_all_' || t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      'omni_deny_authenticated_all_' || t,
      t
    );
  END LOOP;
END $$;
