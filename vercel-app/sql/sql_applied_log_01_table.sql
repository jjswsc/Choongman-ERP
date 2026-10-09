-- SQL 적용 기록부 — 어떤 sql/*.sql 파일을 이 DB에 언제 실행했는지 남긴다
-- 1/2: 테이블 생성. 충만 DB·Omni DB 각각 이 파일만 Run (재실행 안전)
-- pos_orders 등 Realtime 구독 테이블은 건드리지 않음 → 영업 중 실행 가능
--
-- 앞으로 적용형 SQL(apply/backfill/DDL) 파일 맨 끝에 아래 블록을 붙인다 (파일명만 바꿔서):
--
--   DO $$ BEGIN
--     IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
--       INSERT INTO public.sql_applied_log (file_name) VALUES ('파일명.sql')
--       ON CONFLICT (file_name) DO UPDATE
--         SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
--     END IF;
--   END $$;
--
-- (테이블이 없는 DB에서도 본 작업이 롤백되지 않도록 to_regclass 로 감싼다)

CREATE TABLE IF NOT EXISTS public.sql_applied_log (
  file_name text PRIMARY KEY,
  first_applied_at timestamptz NOT NULL DEFAULT now(),
  last_applied_at timestamptz NOT NULL DEFAULT now(),
  run_count integer NOT NULL DEFAULT 1,
  note text NOT NULL DEFAULT ''
);

ALTER TABLE public.sql_applied_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sql_applied_log IS 'vercel-app/sql 파일 적용 기록 (SQL Editor 수동 실행). RLS on, 정책 없음 = service_role·SQL Editor 전용';
COMMENT ON COLUMN public.sql_applied_log.file_name IS 'vercel-app/sql 기준 파일명 (예: pos_orders_rls_bootstrap.sql, legacy/supabase_schema.sql)';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('sql_applied_log_01_table.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
