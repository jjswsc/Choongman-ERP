-- 사회보험(SSO) 미지급 계정 2195 — 지출등록 세금 세부 「ประกันสังคม」 분개용
-- Supabase SQL Editor에서 이 파일만 복사 → Run (1회)

ALTER TABLE public.account_subjects
  ADD COLUMN IF NOT EXISTS name_th TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS statement_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS normal_side TEXT NULL;

INSERT INTO public.account_subjects
  (code, name, name_en, name_th, type, p_and_l_section, sort_order, statement_type, normal_side, is_system)
VALUES
  (
    '2195',
    '사회보험예수금',
    'SSO Payable',
    'ประกันสังคมค้างจ่าย',
    'liability',
    NULL,
    8,
    'bs',
    'credit',
    TRUE
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  name_th = EXCLUDED.name_th,
  type = EXCLUDED.type,
  statement_type = EXCLUDED.statement_type,
  normal_side = EXCLUDED.normal_side,
  is_system = TRUE;
