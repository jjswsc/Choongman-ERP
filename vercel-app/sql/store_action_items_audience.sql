-- 매장 개선 과제 — 일정 대상(공지와 동일: 매장·직책·권한·개인)
-- target_* 비어 있거나 전체면 담당자(owner)만 일정 반영
-- 실행: Supabase SQL Editor에 이 파일만 복사 → Run

ALTER TABLE public.store_action_items
  ADD COLUMN IF NOT EXISTS target_store text NOT NULL DEFAULT '';

ALTER TABLE public.store_action_items
  ADD COLUMN IF NOT EXISTS target_role text NOT NULL DEFAULT '';

ALTER TABLE public.store_action_items
  ADD COLUMN IF NOT EXISTS target_permission_group text NOT NULL DEFAULT '';

ALTER TABLE public.store_action_items
  ADD COLUMN IF NOT EXISTS target_recipients text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.store_action_items.target_store IS
  '일정 대상 매장(쉼표 구분). 빈값/전체=브로드캐스트 없음(담당자만)';
COMMENT ON COLUMN public.store_action_items.target_role IS
  '일정 대상 직책/직무(쉼표 구분). employees.job';
COMMENT ON COLUMN public.store_action_items.target_permission_group IS
  '일정 대상 권한 그룹(쉼표 구분). employees.role';
COMMENT ON COLUMN public.store_action_items.target_recipients IS
  '일정 대상 개인 JSON 배열 ["매장|이름", ...]';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('store_action_items_audience.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
