-- Supabase Database Linter: 0011_function_search_path_mutable
-- 역할이 바꿀 수 있는 search_path로 인한 객체 탈취 완화: 함수에 고정 search_path 부여.
--
-- Supabase Dashboard → SQL Editor → 실행
--
-- 참고 — 린트 0024 (rls_policy_always_true):
--   `FOR ALL` + USING(true)/WITH CHECK(true) 는 “anon이 테이블에 쓰기” 같은 기존 설계와 맞추기 위한 패턴이라
--   경고를 없애려면 쓰기 정책을 실질 조건으로 쪼개거나, 쓰기를 service_role(서버 API)로만 옮기는 등 설계 변경이 필요함.
--   이 파일은 함수 search_path 만 처리함.

ALTER FUNCTION public.touch_attendance_employee_manual_map_updated_at() SET search_path = public;
ALTER FUNCTION public.cm_norm_store(text) SET search_path = public;
ALTER FUNCTION public.cm_norm_name(text) SET search_path = public;
ALTER FUNCTION public.eval_json_total_score(text) SET search_path = public;
ALTER FUNCTION public.get_evaluation_analytics(date, date, text, text) SET search_path = public;
ALTER FUNCTION public.set_members_updated_at() SET search_path = public;
ALTER FUNCTION public.get_store_stock(text[], timestamptz) SET search_path = public;
ALTER FUNCTION public.get_stock_logs_purchase_agg(text[], timestamptz, timestamptz, text[], text[]) SET search_path = public;
