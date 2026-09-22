-- Omni만. USING(true) 인 정책을 걷고 anon/authenticated 직접 접근을 막습니다.
-- 서버 API(service_role)는 RLS를 우회합니다.
-- pos_print_jobs 도 포함됩니다. 주방 Realtime 이 끊기면 POS 는 폴링으로 인쇄합니다.
-- 충만 DB에는 실행하지 마세요.

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOR t IN
    SELECT DISTINCT p.tablename
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND (
        coalesce(p.qual, '') IN ('true', '(true)')
        OR coalesce(p.with_check, '') IN ('true', '(true)')
      )
  LOOP
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
