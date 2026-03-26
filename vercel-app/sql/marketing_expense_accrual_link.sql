-- 마케팅 4메뉴(광고·인플·홍보물·프로모) 실비 → 지출관리 지급예정(expense_accruals) 연동용
-- Supabase SQL Editor에서 실행 (멱등)

ALTER TABLE IF EXISTS public.marketing_ads
  ADD COLUMN IF NOT EXISTS expense_accrual_id BIGINT NULL;

ALTER TABLE IF EXISTS public.marketing_influencers
  ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.marketing_influencers
  ADD COLUMN IF NOT EXISTS expense_accrual_id BIGINT NULL;

ALTER TABLE IF EXISTS public.marketing_materials
  ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.marketing_materials
  ADD COLUMN IF NOT EXISTS expense_accrual_id BIGINT NULL;

ALTER TABLE IF EXISTS public.pos_promos
  ADD COLUMN IF NOT EXISTS marketing_actual_cost NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.pos_promos
  ADD COLUMN IF NOT EXISTS expense_accrual_id BIGINT NULL;

COMMENT ON COLUMN public.marketing_ads.expense_accrual_id IS '실제 비용(actual_spent) 지급예정 연동 ID';
COMMENT ON COLUMN public.marketing_influencers.actual_cost IS '실제 지출(인플 협찬/지급액). budget은 계약/예산용';
COMMENT ON COLUMN public.marketing_influencers.expense_accrual_id IS 'actual_cost 지급예정 연동 ID';
COMMENT ON COLUMN public.marketing_materials.actual_cost IS '실제 제작/발주 비용(단가×수량과 별도)';
COMMENT ON COLUMN public.marketing_materials.expense_accrual_id IS 'actual_cost 지급예정 연동 ID';
COMMENT ON COLUMN public.pos_promos.marketing_actual_cost IS '캠페인 연동 프로모션 실제 비용';
COMMENT ON COLUMN public.pos_promos.expense_accrual_id IS 'marketing_actual_cost 지급예정 연동 ID';

CREATE INDEX IF NOT EXISTS idx_marketing_ads_expense_accrual_id ON public.marketing_ads (expense_accrual_id);
CREATE INDEX IF NOT EXISTS idx_marketing_influencers_expense_accrual_id ON public.marketing_influencers (expense_accrual_id);
CREATE INDEX IF NOT EXISTS idx_marketing_materials_expense_accrual_id ON public.marketing_materials (expense_accrual_id);
CREATE INDEX IF NOT EXISTS idx_pos_promos_expense_accrual_id ON public.pos_promos (expense_accrual_id);
