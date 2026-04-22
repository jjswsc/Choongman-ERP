-- fixed_assets 계정 매핑 확장
-- 자산별 재무상태표/손익계정 기준으로 감가상각 자동분개 계정을 제어

ALTER TABLE IF EXISTS public.fixed_assets
  ADD COLUMN IF NOT EXISTS asset_account_code TEXT NULL DEFAULT '1460',
  ADD COLUMN IF NOT EXISTS accumulated_depreciation_account_code TEXT NULL DEFAULT '1470',
  ADD COLUMN IF NOT EXISTS depreciation_expense_account_code TEXT NULL DEFAULT '5500',
  ADD COLUMN IF NOT EXISTS disposed_proceeds NUMERIC(14,2) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposal_gain_loss_amount NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS disposal_journal_entry_id BIGINT NULL;

UPDATE public.fixed_assets
SET
  asset_account_code = COALESCE(NULLIF(TRIM(asset_account_code), ''), '1460'),
  accumulated_depreciation_account_code = COALESCE(NULLIF(TRIM(accumulated_depreciation_account_code), ''), '1470'),
  depreciation_expense_account_code = COALESCE(NULLIF(TRIM(depreciation_expense_account_code), ''), '5500')
WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_asset_account_code
  ON public.fixed_assets(asset_account_code);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_accum_dep_account_code
  ON public.fixed_assets(accumulated_depreciation_account_code);

==EATE INDEX IF NOT EXISTS idx_fixed_assets_dep_exp_account_code
  ON public.fixed_assets(depreciation_expense_account_code);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_disposal_journal_entry_id
  ON public.fixed_assets(disposal_journal_entry_id);

