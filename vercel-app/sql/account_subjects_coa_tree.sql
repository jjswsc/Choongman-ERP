-- 계정과목(COA) 트리·태국 표시·시스템 계정 플래그
-- Supabase SQL Editor에서 idempotent로 실행.

ALTER TABLE public.account_subjects
  ADD COLUMN IF NOT EXISTS parent_id BIGINT NULL REFERENCES public.account_subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name_th TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_header BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coa_class TEXT NULL;

COMMENT ON COLUMN public.account_subjects.parent_id IS '상위 계정과목 id (트리)';
COMMENT ON COLUMN public.account_subjects.name_th IS '태국어 표시명';
COMMENT ON COLUMN public.account_subjects.is_header IS '집계용 헤더(직접 분개 비권장)';
COMMENT ON COLUMN public.account_subjects.is_system IS '시스템 기본 계정(삭제 불가)';
COMMENT ON COLUMN public.account_subjects.coa_class IS '태국 재무제표 틀 참고 1~5 (1자산 2부채 3자본 4수익 5비용), 선택';

CREATE INDEX IF NOT EXISTS idx_account_subjects_parent_id ON public.account_subjects(parent_id);

-- 스크립트로 넣은 기본 계정은 시스템으로 표시(이미 운영 중 커스텀 행은 false 유지)
UPDATE public.account_subjects
SET is_system = TRUE
WHERE code IN (
  '1010', '1130', '1150', '1160', '1460', '1470', '1490',
  '2110', '2150', '2180', '2190',
  '3110', '3120',
  '4110', '5110', '5520'
);
