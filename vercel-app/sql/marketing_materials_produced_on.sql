-- 홍보물 제작 완료일 (본사 체크리스트)
-- Run in Supabase SQL Editor

ALTER TABLE public.marketing_materials
  ADD COLUMN IF NOT EXISTS produced_on DATE NULL;

COMMENT ON COLUMN public.marketing_materials.produced_on IS
  '스탠디/포스터 등 제작 완료일 (방콕 YYYY-MM-DD). status=completed|distributed 시 자동 입력 가능';

CREATE INDEX IF NOT EXISTS idx_marketing_materials_produced_on
  ON public.marketing_materials(produced_on)
  WHERE produced_on IS NOT NULL;
