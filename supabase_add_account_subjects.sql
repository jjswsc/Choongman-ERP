-- ============================================================
-- 계정과목(회계 과목) 마스터
-- bank_transactions, fixed_expenses와 연계
-- 사용법: Supabase SQL Editor에서 실행 (bank_and_fixed_expenses, bank_transaction_category 이후)
-- ============================================================

-- 1. 계정과목 마스터
CREATE TABLE IF NOT EXISTS account_subjects (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT DEFAULT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  p_and_l_section TEXT DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE account_subjects IS '계정과목 마스터 - 회계 분류';
COMMENT ON COLUMN account_subjects.code IS '과목코드 (예: 5310)';
COMMENT ON COLUMN account_subjects.name IS '과목명 (한글)';
COMMENT ON COLUMN account_subjects.type IS 'expense=비용, revenue=수익, asset=자산, transfer=이체';
COMMENT ON COLUMN account_subjects.p_and_l_section IS '손익: cost=매출원가, expense=판관비, fixed=고정비';

CREATE INDEX IF NOT EXISTS idx_account_subjects_type ON account_subjects(type);
CREATE INDEX IF NOT EXISTS idx_account_subjects_code ON account_subjects(code);

-- 2. bank_transactions에 account_subject_id 추가
ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS account_subject_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_subject ON bank_transactions(account_subject_id);

-- 3. fixed_expenses에 account_subject_id 추가
ALTER TABLE fixed_expenses
ADD COLUMN IF NOT EXISTS account_subject_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_expenses_account_subject ON fixed_expenses(account_subject_id);

-- 4. 시드 데이터 - 수익 과목 (입금용)
INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('4110', '배달앱정산(기타)', 'Delivery Other', 'revenue', 'revenue', 50),
  ('4111', 'Grab', 'Grab', 'revenue', 'revenue', 51),
  ('4112', 'Line Man', 'Line Man', 'revenue', 'revenue', 52),
  ('4113', 'Shopee', 'Shopee', 'revenue', 'revenue', 53),
  ('4114', 'Food Panda', 'Food Panda', 'revenue', 'revenue', 54),
  ('4115', 'Robinhood', 'Robinhood', 'revenue', 'revenue', 55),
  ('4120', '카드매출(기타)', 'Card Other', 'revenue', 'revenue', 60),
  ('4121', 'Visa', 'Visa', 'revenue', 'revenue', 61),
  ('4122', 'Master', 'Master', 'revenue', 'revenue', 62),
  ('4123', 'UnionPay', 'UnionPay', 'revenue', 'revenue', 63),
  ('4124', 'JCB', 'JCB', 'revenue', 'revenue', 64),
  ('4130', 'QR이체매출', 'QR/Transfer', 'revenue', 'revenue', 70),
  ('4140', '현금입금', 'Cash Deposit', 'revenue', 'revenue', 80)
ON CONFLICT (code) DO NOTHING;

-- 5. 시드 데이터 - 비용 과목
INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('1110', '현금이체', 'Cash Transfer', 'transfer', NULL, 10),
  ('5310', '급여', 'Salary', 'expense', 'expense', 100),
  ('5320', '상여금', 'Bonus', 'expense', 'expense', 101),
  ('5330', '복리후생', 'Welfare', 'expense', 'expense', 102),
  ('5410', '임차료', 'Rent', 'expense', 'fixed', 110),
  ('5420', '통신비', 'Utilities', 'expense', 'fixed', 111),
  ('5430', '전기료', 'Electricity', 'expense', 'fixed', 112),
  ('5440', '수도광열비', 'Water/Gas', 'expense', 'fixed', 113),
  ('5450', '접대비', 'Entertainment', 'expense', 'expense', 120),
  ('5460', '교통비', 'Transportation', 'expense', 'expense', 121),
  ('5461', '차량유지비', 'Vehicles', 'expense', 'expense', 120),
  ('5470', '통신비(전화)', 'Phone', 'expense', 'expense', 122),
  ('5480', '소모품비', 'Supplies', 'expense', 'expense', 130),
  ('5490', '보험료', 'Insurance', 'expense', 'fixed', 131),
  ('5500', '감가상각비', 'Depreciation', 'expense', 'fixed', 132),
  ('5510', '세금공과금', 'Tax/Fees', 'expense', 'expense', 133),
  ('5520', '기타경비', 'Misc Expense', 'expense', 'expense', 199),
  ('5524', '홍보비', 'Promotion', 'expense', 'expense', 140),
  ('5525', '광고비', 'Advertising', 'expense', 'expense', 141),
  ('5526', '프로모션비', 'Promo Campaign', 'expense', 'expense', 142),
  ('5527', 'SNS마케팅', 'SNS Marketing', 'expense', 'expense', 143),
  ('5521', '용역비', 'Service costs', 'expense', 'expense', 144),
  ('5522', '연구개발비', 'R&D', 'expense', 'expense', 145),
  ('5523', '수리비', 'Repair fee', 'expense', 'expense', 146)
ON CONFLICT (code) DO NOTHING;

-- RLS
ALTER TABLE account_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for account_subjects" ON account_subjects;
CREATE POLICY "Allow all for account_subjects" ON account_subjects FOR ALL USING (true) WITH CHECK (tru