-- 출금 관리 스키마 확장
-- 5가지 유형: 매입대금, 경비, 자산취득, 자금이동, 자본거래

-- 0) 계정과목 추가 (출금 유형별)
INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order, statement_type, normal_side)
VALUES
  ('1150', '대여금', 'Loans Receivable', 'asset', NULL, 4, 'bs', 'debit'),
  ('1160', '선급금', 'Prepayments', 'asset', NULL, 5, 'bs', 'debit'),
  ('2150', '차입금', 'Borrowings', 'liability', NULL, 5, 'bs', 'credit'),
  ('2180', '부가세예수금', 'VAT Payable', 'liability', NULL, 6, 'bs', 'credit'),
  ('2190', '원천세예수금', 'Withholding Tax Payable', 'liability', NULL, 7, 'bs', 'credit'),
  ('1490', '기타유형자산', 'Other Fixed Assets', 'asset', NULL, 8, 'bs', 'debit')
ON CONFLICT (code) DO NOTHING;

-- 1) bank_transactions에 고정자산 연결, 이체 대상 계좌
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS fixed_asset_id BIGINT NULL;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS transfer_to_account_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_fixed_asset_id ON bank_transactions(fixed_asset_id);

COMMENT ON COLUMN bank_transactions.fixed_asset_id IS '고정자산 구매 시 fixed_assets.id';
COMMENT ON COLUMN bank_transactions.transfer_to_account_id IS '이체 시 상대 계좌 bank_accounts.id';
