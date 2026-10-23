-- 감사 재무제표(전년) 스냅샷 — DBD·전년비교·이월 검증용
-- Flow 세무 기초(7/1)와 별도. S&J/Jinwon/ACT는 7/1 기초를 유지하고
-- 여기에는 YE2568 감사 숫자만 보관한다. Bangna는 스크립트로 2026-01-01 기초 분개.
-- pos_orders 등 Realtime 구독 테이블은 건드리지 않음 → 영업 중 실행 가능

CREATE TABLE IF NOT EXISTS public.audited_financial_statements (
  id bigserial PRIMARY KEY,
  tax_id text NOT NULL,
  tax_entity_code text NOT NULL DEFAULT '',
  entity_name_th text NOT NULL DEFAULT '',
  entity_name_en text NOT NULL DEFAULT '',
  fiscal_year_end date NOT NULL,
  fiscal_year_be integer NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  source_label text NOT NULL DEFAULT '',
  bs jsonb NOT NULL DEFAULT '{}'::jsonb,
  pl jsonb NOT NULL DEFAULT '{}'::jsonb,
  prior_bs jsonb NULL,
  prior_pl jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NULL,
  CONSTRAINT audited_financial_statements_tax_year_uq UNIQUE (tax_id, fiscal_year_end)
);

CREATE INDEX IF NOT EXISTS idx_audited_fs_year_end
  ON public.audited_financial_statements (fiscal_year_end);

CREATE INDEX IF NOT EXISTS idx_audited_fs_tax_entity
  ON public.audited_financial_statements (tax_entity_code);

ALTER TABLE public.audited_financial_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all audited_financial_statements" ON public.audited_financial_statements;
CREATE POLICY "Allow all audited_financial_statements" ON public.audited_financial_statements
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.audited_financial_statements IS
  '감사 재무제표 스냅샷(전년 BS/손익). 세무 장부 tax_opening(Flow 7/1)과 이중 전기하지 않음';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('audited_financial_statements_01_table.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
