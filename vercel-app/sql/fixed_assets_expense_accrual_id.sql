-- 고정자산 ↔ 지출발생(지급예정) 연결
-- 자산 화면에서 등록·「지급예정 만들기」 시 expense_accruals.id 를 저장합니다.
ALTER TABLE IF EXISTS public.fixed_assets
  ADD COLUMN IF NOT EXISTS expense_accrual_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_expense_accrual_id
  ON public.fixed_assets (expense_accrual_id)
  WHERE expense_accrual_id IS NOT NULL;
