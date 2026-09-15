-- Omni: Cost Analysis > Blend cost (PGRST205)
-- 증상: Could not find the table 'public.sauces' in the schema cache
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 않는 것을 권장합니다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sauces (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'g',
  total_quantity NUMERIC(12,4) DEFAULT 0,
  cost_per_unit NUMERIC(12,6) DEFAULT 0,
  overhead_percent NUMERIC(5,2) DEFAULT 5,
  sort_order INT DEFAULT 0,
  usage_kind TEXT NOT NULL DEFAULT 'for_sale',
  linked_item_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(12,4) DEFAULT 0;
ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(12,6) DEFAULT 0;
ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS overhead_percent NUMERIC(5,2) DEFAULT 5;
ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS usage_kind TEXT;
ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS linked_item_code TEXT;
ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.sauces ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.sauces
SET usage_kind = 'for_sale'
WHERE usage_kind IS NULL OR btrim(usage_kind) = '';

ALTER TABLE public.sauces ALTER COLUMN usage_kind SET DEFAULT 'for_sale';
ALTER TABLE public.sauces ALTER COLUMN usage_kind SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.sauce_ingredients (
  id BIGSERIAL PRIMARY KEY,
  sauce_id BIGINT NOT NULL REFERENCES public.sauces(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  loss_rate NUMERIC(5,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sauce_ingredients ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE public.sauce_ingredients ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,4) DEFAULT 1;
ALTER TABLE public.sauce_ingredients ADD COLUMN IF NOT EXISTS loss_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.sauce_ingredients ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE public.sauce_ingredients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sauce_ingredients_sauce ON public.sauce_ingredients(sauce_id);

COMMENT ON TABLE public.sauces IS
  '배합(합성품) 마스터. Cost Analysis > Blend cost / 원가 계산기에서 사용';
COMMENT ON COLUMN public.sauces.code IS '고유 코드 (예: S001). pos_menu_ingredients.item_code에서 참조';
COMMENT ON COLUMN public.sauces.cost_per_unit IS '단위당 원가 (캐시). 재료 가격 변경 시 재계산';
COMMENT ON COLUMN public.sauces.overhead_percent IS 'OH(오버헤드) % - 기본 5';
COMMENT ON COLUMN public.sauces.usage_kind IS
  'for_sale: 품목 연결 필수·원가 계산기에서 선택. store_use: 매장용(연결 없음)';
COMMENT ON COLUMN public.sauces.linked_item_code IS
  'usage_kind=for_sale 일 때 items.code. store_use 는 null';
COMMENT ON TABLE public.sauce_ingredients IS '배합 레시피 - item_code는 items.code 또는 sauces.code';
COMMENT ON COLUMN public.sauce_ingredients.item_code IS 'items 또는 sauces의 code';

ALTER TABLE public.sauces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sauce_ingredients ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sauces TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sauces TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sauce_ingredients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sauce_ingredients TO postgres;

DO $$
BEGIN
  IF to_regclass('public.sauces_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.sauces_id_seq TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.sauces_id_seq TO postgres';
  END IF;
  IF to_regclass('public.sauce_ingredients_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.sauce_ingredients_id_seq TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.sauce_ingredients_id_seq TO postgres';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
