-- ============================================================
-- 복식부기(분개/원장) 1차 스키마
-- ============================================================

-- 1) 계정과목 확장 (재무제표 구분, 정상잔액 방향)
ALTER TABLE account_subjects
ADD COLUMN IF NOT EXISTS statement_type TEXT NULL,
ADD COLUMN IF NOT EXISTS normal_side TEXT NULL;

COMMENT ON COLUMN account_subjects.statement_type IS 'bs(재무상태표) | pl(손익계산서)';
COMMENT ON COLUMN account_subjects.normal_side IS 'debit | credit';

-- 2) 분개 헤더
CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGSERIAL PRIMARY KEY,
  entry_no TEXT UNIQUE,
  accounting_date DATE NOT NULL,
  source_type TEXT NOT NULL,      -- bank_transaction, petty_cash, pos_order, stock_receive ...
  source_id BIGINT NULL,
  store_name TEXT NULL,
  memo TEXT NULL,
  posted_by TEXT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_accounting_date ON journal_entries(accounting_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source_type, source_id);

-- 3) 분개 라인 (차변/대변)
CREATE TABLE IF NOT EXISTS journal_lines (
  id BIGSERIAL PRIMARY KEY,
  journal_entry_id BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_no INT NOT NULL DEFAULT 1,
  account_subject_id BIGINT NULL REFERENCES account_subjects(id),
  account_code TEXT NOT NULL,
  account_name TEXT NULL,
  side TEXT NOT NULL,             -- debit | credit
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_code ON journal_lines(account_code);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_subject_id ON journal_lines(account_subject_id);

-- 4) 계정별 월 누적 캐시(선택)
CREATE TABLE IF NOT EXISTS ledger_balances (
  id BIGSERIAL PRIMARY KEY,
  year_month TEXT NOT NULL,       -- YYYY-MM
  store_name TEXT NOT NULL DEFAULT 'All',
  account_code TEXT NOT NULL,
  debit_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(year_month, store_name, account_code)
);

CREATE INDEX IF NOT EXISTS idx_ledger_balances_month_store ON ledger_balances(year_month, store_name);

-- 5) 기본 계정과목 보강 (코드가 없을 때만 생성)
INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order, statement_type, normal_side)
VALUES
  ('1010', '현금및예금', 'Cash and Banks', 'asset', NULL, 1, 'bs', 'debit'),
  ('1460', '재고자산', 'Inventory', 'asset', NULL, 2, 'bs', 'debit'),
  ('1130', '매출채권', 'Trade Receivables', 'asset', NULL, 3, 'bs', 'debit'),
  ('2110', '매입채무', 'Trade Payables', 'liability', NULL, 4, 'bs', 'credit'),
  ('3110', '자본금', 'Capital', 'equity', NULL, 5, 'bs', 'credit'),
  ('3120', '이익잉여금', 'Retained Earnings', 'equity', NULL, 6, 'bs', 'credit'),
  ('4110', '매출', 'Sales', 'revenue', 'revenue', 50, 'pl', 'credit'),
  ('5110', '매출원가', 'Cost of Goods Sold', 'expense', 'cost', 90, 'pl', 'debit'),
  ('5520', '기타경비', 'Misc Expense', 'expense', 'expense', 199, 'pl', 'debit')
ON CONFLICT (code) DO NOTHING;

-- 6) 기존 account_subjects 보정
UPDATE account_subjects
SET statement_type = CASE
  WHEN type IN ('asset', 'liability', 'equity') THEN 'bs'
  ELSE 'pl'
END
WHERE statement_type IS NULL;

UPDATE account_subjects
SET normal_side = CASE
  WHEN type IN ('asset', 'expense') THEN 'debit'
  ELSE 'credit'
END
WHERE normal_side IS NULL;

-- 7) RLS
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for journal_entries" ON journal_entries;
CREATE POLICY "Allow all for journal_entries" ON journal_entries FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for journal_lines" ON journal_lines;
CREATE POLICY "Allow all for journal_lines" ON journal_lines FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ledger_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for ledger_balances" ON ledger_balances;
CREATE POLICY "Allow all for ledger_balances" ON ledger_balances FOR ALL USING (true) WITH CHECK (true);

