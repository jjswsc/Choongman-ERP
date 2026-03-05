-- ============================================================
-- RLS 원래대로 되돌리기 (보안 조치 이전 상태로 복구)
--
-- supabase_fix_rls_deny_anon.sql + supabase_enable_rls_all_tables.sql
-- 실행 후 발생한 "anon 키로 접근 불가" 문제를 해결합니다.
--
-- 적용 후: anon 키로 매장 목록 등 다시 조회 가능 (이전과 동일)
-- ⚠️ Supabase Security Advisor 경고는 다시 나타날 수 있습니다.
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

-- 1) 이전에 RLS를 활성화했던 28개 테이블 → RLS 비활성화 (완전 개방으로 복귀)
--    (테이블이 없으면 해당 줄은 WARNING으로 스킵됨)
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'bank_memo_mapping_rules','pos_table_layouts','purchase_orders','marketing_campaigns',
    'marketing_ads','pos_promos','pos_promo_items','pos_coupons','marketing_influencers',
    'pos_orders','push_tokens','bank_memo_rules','warehouse_locations','receivable_transactions',
    'pos_printer_settings','inbound_batches','bank_transaction_inbound_links','pos_sales_details',
    'pos_sales_imports','system_settings','pos_menu_options','pos_menu_ingredients',
    'sauces','sauce_ingredients','invoice_settings','payable_transactions','pos_menus','item_categories'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS disabled: public.%', t;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table not found (skip): public.%', t;
    WHEN OTHERS THEN
      RAISE WARNING 'Skip public.%: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- 2) RLS가 켜져 있는 테이블에 "Allow all for anon" 정책 복원
--    (supabase_fix_rls_deny_anon.sql로 삭제되었던 정책)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND c.relname NOT LIKE 'pg_%'
  ) LOOP
    BEGIN
      EXECUTE format(
        'DROP POLICY IF EXISTS "Allow all for anon" ON public.%I; ' ||
        'CREATE POLICY "Allow all for anon" ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        r.tablename, r.tablename
      );
      RAISE NOTICE 'Policy restored: public.%', r.tablename;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Skip public.%: %', r.tablename, SQLERRM;
    END;
  END LOOP;
END $$;
