-- 품목별 기본 계정과목(선택) 저장 컬럼
-- 미지정(NULL)면 기존 재고/매입 흐름을 유지한다.

ALTER TABLE IF EXISTS public.items
ADD COLUMN IF NOT EXISTS account_subject_id bigint NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'items'
      AND column_name = 'account_subject_id'
  ) THEN
    ALTER TABLE public.items
    DROP CONSTRAINT IF EXISTS items_account_subject_id_fkey;

    ALTER TABLE public.items
    ADD CONSTRAINT items_account_subject_id_fkey
    FOREIGN KEY (account_subject_id)
    REFERENCES public.account_subjects(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_account_subject_id
ON public.items (account_subject_id);

-- ------------------------------------------------------------
-- 카테고리 → 계정과목 기본 매핑(관리형)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_account_subject_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_type TEXT NOT NULL DEFAULT 'keyword', -- keyword | default
  keyword TEXT NOT NULL DEFAULT '',
  match_mode TEXT NOT NULL DEFAULT 'contains', -- contains | exact
  account_subject_id BIGINT NOT NULL REFERENCES public.account_subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_account_subject_rules_priority
ON public.item_account_subject_rules (is_active, priority, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_account_subject_rules_rule_keyword_mode
ON public.item_account_subject_rules (rule_type, keyword, match_mode);

ALTER TABLE IF EXISTS public.item_account_subject_rules
  ALTER COLUMN keyword SET DEFAULT '';

UPDATE public.item_account_subject_rules
SET keyword = ''
WHERE keyword IS NULL;

ALTER TABLE IF EXISTS public.item_account_subject_rules
  ALTER COLUMN keyword SET NOT NULL;

-- ------------------------------------------------------------
-- 기본 원가 과목 보강
-- - 식품원재료(기본)
-- - 포장재(패킹/포장 카테고리 기본)
-- 둘 다 매입(원가) 흐름에 남도록 expense + p_and_l_section=cost 로 생성
-- ------------------------------------------------------------
INSERT INTO public.account_subjects
  (code, name, name_en, type, p_and_l_section, sort_order, statement_type, normal_side, is_system)
VALUES
  ('5111', '식품원재료', 'Food Raw Materials', 'expense', 'cost', 91, 'pl', 'debit', FALSE),
  ('5112', '포장재', 'Packaging Materials', 'expense', 'cost', 92, 'pl', 'debit', FALSE),
  ('5520', '기타경비', 'Misc Expense', 'expense', 'expense', 149, 'pl', 'debit', FALSE),
  ('5521', '소모품비', 'Supplies Expense', 'expense', 'expense', 150, 'pl', 'debit', FALSE)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  type = EXCLUDED.type,
  p_and_l_section = EXCLUDED.p_and_l_section,
  statement_type = EXCLUDED.statement_type,
  normal_side = EXCLUDED.normal_side;

-- 기본 매핑 룰 시드 (idempotent)
-- 1) 패킹/포장 키워드면 포장재(5112)
WITH packaging_subject AS (
  SELECT id
  FROM public.account_subjects
  WHERE code = '5112'
  LIMIT 1
)
INSERT INTO public.item_account_subject_rules (rule_type, keyword, match_mode, account_subject_id, priority, is_active)
SELECT 'keyword', k.keyword, 'contains', ps.id, 10, TRUE
FROM packaging_subject ps
CROSS JOIN (
  VALUES
    ('packing'),
    ('package'),
    ('pkg'),
    ('포장'),
    ('패킹'),
    ('포장재'),
    ('포장자재'),
    ('포장부자재'),
    ('부자재')
) AS k(keyword)
ON CONFLICT (rule_type, keyword, match_mode) DO UPDATE
SET
  account_subject_id = EXCLUDED.account_subject_id,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 2) 그 외 기본값은 식품원재료(5111)
WITH food_raw_subject AS (
  SELECT id
  FROM public.account_subjects
  WHERE code = '5111'
  LIMIT 1
)
INSERT INTO public.item_account_subject_rules (rule_type, keyword, match_mode, account_subject_id, priority, is_active)
SELECT 'default', '', 'contains', fr.id, 999, TRUE
FROM food_raw_subject fr
ON CONFLICT (rule_type, keyword, match_mode) DO UPDATE
SET
  account_subject_id = EXCLUDED.account_subject_id,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 패킹/포장 카테고리 품목은 포장재로 기본 세팅 (미지정 품목만)
WITH packaging_subject AS (
  SELECT id
  FROM public.account_subjects
  WHERE code = '5112'
  LIMIT 1
)
UPDATE public.items i
SET account_subject_id = ps.id
FROM packaging_subject ps
WHERE i.account_subject_id IS NULL
  AND (
    COALESCE(i.category, '') ILIKE '%packing%'
    OR COALESCE(i.category, '') ILIKE '%package%'
    OR COALESCE(i.category, '') ILIKE '%pkg%'
    OR COALESCE(i.category, '') ILIKE '%포장%'
    OR COALESCE(i.category, '') ILIKE '%패킹%'
    OR COALESCE(i.category, '') ILIKE '%포장재%'
    OR COALESCE(i.category, '') ILIKE '%포장자재%'
    OR COALESCE(i.category, '') ILIKE '%포장부자재%'
    OR COALESCE(i.category, '') ILIKE '%부자재%'
  );

-- 나머지 미지정 품목은 식품원재료 기본 세팅
WITH food_raw_subject AS (
  SELECT id
  FROM public.account_subjects
  WHERE code = '5111'
  LIMIT 1
)
UPDATE public.items i
SET account_subject_id = fr.id
FROM food_raw_subject fr
WHERE i.account_subject_id IS NULL;
