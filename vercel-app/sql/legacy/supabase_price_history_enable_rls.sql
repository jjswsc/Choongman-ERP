-- ============================================================
-- price_history 테이블 RLS 활성화
-- Supabase 보안 Advisory: "Policy Exists RLS Disabled" 해결
--
-- 이미 "Allow read price_history" 정책이 있으나 RLS 미활성화로
-- 동작하지 않았음. 아래 실행 시 정책이 적용됨.
--
-- ※ ERP API는 SUPABASE_SERVICE_ROLE_KEY 사용 → RLS 우회하여 정상 동작
--
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
