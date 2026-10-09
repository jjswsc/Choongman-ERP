-- ============================================================
-- e-Tax 제출 이력 테이블 (태국 국세청 e-Tax Invoice 연동)
-- 출고 인보이스별 e-Tax 제출 상태·결과 저장
-- ============================================================

CREATE TABLE IF NOT EXISTS e_tax_submissions (
  id BIGSERIAL PRIMARY KEY,
  ref_type TEXT NOT NULL DEFAULT 'outbound',
  ref_key TEXT NOT NULL,
  invoice_no TEXT,
  invoice_date DATE,
  target_name TEXT,
  total_amount NUMERIC(12,2),
  vat_amount NUMERIC(12,2),
  grand_total NUMERIC(12,2),
  xml_content TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  response_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE e_tax_submissions IS 'e-Tax 인보이스 제출 이력 (태국 국세청)';
COMMENT ON COLUMN e_tax_submissions.ref_type IS 'outbound, purchase_order 등';
COMMENT ON COLUMN e_tax_submissions.ref_key IS '고유 식별키 (예: date_target_type_orderRowId)';
COMMENT ON COLUMN e_tax_submissions.status IS 'pending, submitted, accepted, rejected';
COMMENT ON COLUMN e_tax_submissions.response_json IS 'e-Tax 포털/API 응답';

CREATE UNIQUE INDEX IF NOT EXISTS idx_etax_ref ON e_tax_submissions(ref_type, ref_key);
CREATE INDEX IF NOT EXISTS idx_etax_status ON e_tax_submissions(status);
CREATE INDEX IF NOT EXISTS idx_etax_invoice_no ON e_tax_submissions(invoice_no) WHERE invoice_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_etax_invoice_date ON e_tax_submissions(invoice_date);

ALTER TABLE e_tax_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for e_tax_submissions" ON e_tax_submissions;
CREATE POLICY "Allow all for e_tax_submissions" ON e_tax_submissions FOR ALL USING (true) WITH CHECK (true);
