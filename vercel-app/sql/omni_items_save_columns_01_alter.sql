-- Omni: 품목 저장에 필요한 items 컬럼 (PGRST204 purchase_source 등)
-- 증상: Column 'purchase_source' is missing
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 마세요.

BEGIN;

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS purchase_source TEXT DEFAULT 'hq';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS outbound_location TEXT DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS spec TEXT DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS total_quantity NUMERIC;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS stock_base_unit TEXT DEFAULT '';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS stock_unit_options JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS standard_units JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS account_subject_id BIGINT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS order_disabled BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sort_order INT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE public.items
SET purchase_source = 'hq'
WHERE purchase_source IS NULL OR btrim(purchase_source) = '';

COMMENT ON COLUMN public.items.purchase_source IS 'hq=본사 발주, store=매장 직구';

COMMIT;
