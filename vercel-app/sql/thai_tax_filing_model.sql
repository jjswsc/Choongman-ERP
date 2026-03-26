-- 태국 신고 자동화용 공통 모델
-- 방콕시간 기준 기간(YYYY-MM)으로 운영

-- 1) 태국 세무코드/신고폼 매핑
CREATE TABLE IF NOT EXISTS thai_tax_code_mappings (
  id BIGSERIAL PRIMARY KEY,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('vat', 'wht', 'cit')),
  tax_code TEXT NOT NULL,
  filing_form TEXT NOT NULL,
  line_key TEXT NULL,
  description TEXT NULL,
  default_rate NUMERIC(8,4) NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thai_tax_code_mappings_active
  ON thai_tax_code_mappings(tax_type, filing_form, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_thai_tax_code_mappings_key
  ON thai_tax_code_mappings (tax_type, tax_code, filing_form, COALESCE(line_key, ''));

ALTER TABLE thai_tax_code_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all thai_tax_code_mappings" ON thai_tax_code_mappings;
CREATE POLICY "Allow all thai_tax_code_mappings"
  ON thai_tax_code_mappings FOR ALL USING (true) WITH CHECK (true);

-- 2) 법인세 세무조정 항목 (PND50/51 공통)
CREATE TABLE IF NOT EXISTS corporate_tax_adjustments (
  id BIGSERIAL PRIMARY KEY,
  period_key TEXT NOT NULL, -- YYYY-MM, YYYY-H1/H2, YYYY
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'half_year', 'annual')),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('add_back', 'deduction')),
  item_code TEXT NULL,
  item_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  memo TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_tax_adjustments_period
  ON corporate_tax_adjustments(period_type, period_key);

ALTER TABLE corporate_tax_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all corporate_tax_adjustments" ON corporate_tax_adjustments;
CREATE POLICY "Allow all corporate_tax_adjustments"
  ON corporate_tax_adjustments FOR ALL USING (true) WITH CHECK (true);

-- 3) 신고 워크플로우 진행 상태
CREATE TABLE IF NOT EXISTS accounting_filing_workflow_status (
  id BIGSERIAL PRIMARY KEY,
  year_month TEXT NOT NULL,
  filing_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  note TEXT NULL,
  owner TEXT NULL,
  updated_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year_month, filing_type)
);

CREATE INDEX IF NOT EXISTS idx_accounting_filing_workflow_status_ym
  ON accounting_filing_workflow_status(year_month);

ALTER TABLE accounting_filing_workflow_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_filing_workflow_status" ON accounting_filing_workflow_status;
CREATE POLICY "Allow all accounting_filing_workflow_status"
  ON accounting_filing_workflow_status FOR ALL USING (true) WITH CHECK (true);

