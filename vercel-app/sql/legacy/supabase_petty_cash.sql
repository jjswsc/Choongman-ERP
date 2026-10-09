-- 패티 캐쉬 (소액 현금) 내역
-- store: 매장, trans_type: 수령/지출/보충/정산, amount: 금액 (지출은 음수)
CREATE TABLE IF NOT EXISTS petty_cash_transactions (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  trans_date DATE NOT NULL,
  trans_type TEXT NOT NULL DEFAULT 'expense',
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) DEFAULT NULL,
  memo TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_store ON petty_cash_transactions(store);
CREATE INDEX IF NOT EXISTS idx_petty_cash_trans_date ON petty_cash_transactions(trans_date);
CREATE INDEX IF NOT EXISTS idx_petty_cash_created ON petty_cash_transactions(created_at);

ALTER TABLE petty_cash_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON petty_cash_transactions;
CREATE POLICY "Allow all for anon" ON petty_cash_transactions FOR ALL USING (true) WITH CHECK (true);
