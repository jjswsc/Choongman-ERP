-- system_settings RLS 정책 추가
-- pos_menu_categories, push_notice_enabled 등 설정 저장 시 anon 키 사용 시 필요
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 또는 service_role 키 미설정 환경에서 anon으로 접근할 때 적용

DROP POLICY IF EXISTS "Allow all for system_settings" ON public.system_settings;
CREATE POLICY "Allow all for system_settings" ON public.system_settings
  FOR ALL USING (true) WITH CHECK (true);
