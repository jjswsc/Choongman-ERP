-- KT20K(กท.20 ก) 고용주 설정
-- 연도별 설정(관할 SSO, 사업코드, 요율 등) 저장

CREATE TABLE IF NOT EXISTS public.thai_workers_comp_settings (
  id bigserial PRIMARY KEY,
  effective_year integer NOT NULL,
  company_tax_id text,
  company_name text,
  sso_office_province text,
  sso_office_phone text,
  business_code_5 text,
  fund_rate_percent numeric(6, 2),
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_thai_workers_comp_settings_year
  ON public.thai_workers_comp_settings (effective_year);

CREATE INDEX IF NOT EXISTS idx_thai_workers_comp_settings_updated_at
  ON public.thai_workers_comp_settings (updated_at DESC);

ALTER TABLE public.thai_workers_comp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all thai_workers_comp_settings" ON public.thai_workers_comp_settings;
CREATE POLICY "Allow all thai_workers_comp_settings"
ON public.thai_workers_comp_settings
FOR ALL
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.thai_workers_comp_settings IS 'KT20K(กท.20 ก) 연도별 고용주 설정';
COMMENT ON COLUMN public.thai_workers_comp_settings.effective_year IS '적용 연도(YYYY)';
COMMENT ON COLUMN public.thai_workers_comp_settings.business_code_5 IS '사업 코드 5자리';
COMMENT ON COLUMN public.thai_workers_comp_settings.fund_rate_percent IS '기금 요율(%), 예: 0.20 ~ 1.00';
