-- ============================================================
-- pos_printer_settings RLS 42501 해결 (INSERT/UPDATE/SELECT)
--
-- supabase_enable_rls_all_tables.sql 등으로 RLS만 켠 뒤
-- 정책이 없으면 anon 키로 PostgREST 호출 시 신규 행 INSERT가 거부됩니다.
--
-- 권장: Vercel/서버에 SUPABASE_SERVICE_ROLE_KEY 설정 → RLS 우회(서버 전용).
-- anon만 쓰는 환경에서는 아래 GRANT + 정책을 Supabase SQL Editor에서 실행하세요.
--
-- Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE ON public.pos_printer_settings TO anon;

DROP POLICY IF EXISTS "Allow select pos_printer_settings" ON public.pos_printer_settings;
DROP POLICY IF EXISTS "Allow insert pos_printer_settings" ON public.pos_printer_settings;
DROP POLICY IF EXISTS "Allow update pos_printer_settings" ON public.pos_printer_settings;

CREATE POLICY "Allow select pos_printer_settings"
  ON public.pos_printer_settings
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow insert pos_printer_settings"
  ON public.pos_printer_settings
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow update pos_printer_settings"
  ON public.pos_printer_settings
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
