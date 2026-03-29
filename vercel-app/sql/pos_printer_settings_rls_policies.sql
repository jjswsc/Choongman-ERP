-- pos_printer_settings RLS: savePosPrinterSettings INSERT/UPDATE·getPosPrinterSettings SELECT
--
-- 증상: "new row violates row-level security policy for table \"pos_printer_settings\"" (42501)
-- 원인: supabase_enable_rls_all_tables.sql 등으로 RLS만 켠 뒤 INSERT 허용 정책이 없거나,
--       정책이 TO anon 만 있어 authenticated(JWT) 요청이 막히는 경우.
--
-- ═══ 권장 ═══
-- Vercel/서버에 SUPABASE_SERVICE_ROLE_KEY 를 넣으면 API는 RLS를 우회합니다(서버 전용).
-- anon 키만 쓰는 환경에서는 아래를 Supabase SQL Editor에서 실행하세요.
--
-- Supabase Dashboard → SQL Editor → 전체 실행

ALTER TABLE public.pos_printer_settings ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pos_printer_settings TO anon, authenticated;

-- 구버전: 역할별 개별 정책
DROP POLICY IF EXISTS "Allow select pos_printer_settings" ON public.pos_printer_settings;
DROP POLICY IF EXISTS "Allow insert pos_printer_settings" ON public.pos_printer_settings;
DROP POLICY IF EXISTS "Allow update pos_printer_settings" ON public.pos_printer_settings;

DROP POLICY IF EXISTS "pos_printer_settings_allow_public" ON public.pos_printer_settings;

-- pos_menu_ingredients 와 동일: REST(anon/authenticated)에서 SELECT·INSERT·UPDATE 허용
CREATE POLICY "pos_printer_settings_allow_public"
  ON public.pos_printer_settings
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
