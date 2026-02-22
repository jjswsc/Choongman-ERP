-- ============================================================
-- 통장 거래 + 고정비 테이블 추가
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

-- 1. 통장(계좌) 마스터 - 여러 계좌 지원
CREATE TABLE IF NOT EXISTS bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  store TEXT NOT NULL DEFAULT '',
  opening_balance NUMERIC(12,2) DEFAULT 0,
  opening_balance_date DATE DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_store ON bank_accounts(store);

-- 2. 통장 거래 내역
CREATE TABLE IF NOT EXISTS bank_transactions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  trans_date DATE NOT NULL,
  trans_type TEXT NOT NULL DEFAULT 'withdraw',
  amount NUMERIC(12,2) NOT NULL,
  memo TEXT DEFAULT '',
  store TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(trans_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_store ON bank_transactions(store);

-- 3. 고정비 (월세, 감가상각 등)
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  store TEXT NOT NULL DEFAULT '',
  start_year_month TEXT DEFAULT NULL,
  end_year_month TEXT DEFAULT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_store ON fixed_expenses(store);

-- RLS
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for bank_accounts" ON bank_accounts;
CREATE POLICY "Allow all for bank_accounts" ON bank_accounts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for bank_transactions" ON bank_transactions;
CREATE POLICY "Allow all for bank_transactions" ON bank_transactions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for fixed_expenses" ON fixed_expenses;
CREATE POLICY "Allow all for fixed_expenses" ON fixed_expenses FOR ALL USING (true) WITH CHECK (true);
