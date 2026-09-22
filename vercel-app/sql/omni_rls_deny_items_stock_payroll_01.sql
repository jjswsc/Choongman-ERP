-- Omni만. 품목·재고·급여 anon/authenticated 직접 조회 차단.
-- 서버 API(service_role)는 RLS를 우회하므로 ERP·POS 동작은 유지됩니다.
-- pos_orders Realtime 정책은 건드리지 않습니다.

DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY['items', 'stock_logs', 'payroll_records'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip %: table missing', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

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
