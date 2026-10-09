-- 인보이스 설정 테이블 (출고 관리 > 인보이스 설정 탭에서 관리)
-- key-value 형식으로 유연하게 확장 가능
CREATE TABLE IF NOT EXISTS invoice_settings (
  code TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

COMMENT ON TABLE invoice_settings IS '인보이스 양식 설정 (payment_terms, bank_info, terms_and_conditions 등)';

-- 기본값 삽입 (없을 때만)
INSERT INTO invoice_settings (code, value) VALUES
  ('payment_terms', 'Net 30 Days'),
  ('shipping_method', 'Company Delivery'),
  ('bank_name', 'Kasikorn Bank (KBank)'),
  ('account_no', '166-2-97079-0'),
  ('account_name', 'S&J Global Co., Ltd.'),
  ('swift_code', 'KASITHBK'),
  ('terms_and_conditions', '["Goods once sold cannot be returned or exchanged","Payment is due within the specified terms","Late payments may incur interest charges at 1.5% per month"]'),
  ('seller_email', ''),
  ('seller_website', ''),
  ('remarks', 'Please transfer payment to the bank account shown above.')
ON CONFLICT (code) DO NOTHING;
