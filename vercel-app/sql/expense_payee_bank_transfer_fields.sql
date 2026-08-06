-- 은행이체 보기용: 거래처 은행명·계좌 + 지출발생 이체 스냅샷
-- Supabase SQL Editor에 붙여넣어 실행하세요.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS bank_account_no TEXT DEFAULT NULL;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.vendors.bank_account_no IS '매입처 계좌번호 (입금 시 참고)';
COMMENT ON COLUMN public.vendors.bank_name IS '매입처 입금 은행명 (K-BANK, SCB, PromptPay 등)';

ALTER TABLE public.expense_accruals
  ADD COLUMN IF NOT EXISTS payee_account_holder TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payee_bank_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payee_bank_account_no TEXT DEFAULT NULL;

COMMENT ON COLUMN public.expense_accruals.payee_account_holder IS '이체용 예금주(스냅샷). 비우면 payee_name/거래처명 사용';
COMMENT ON COLUMN public.expense_accruals.payee_bank_name IS '이체용 은행명(스냅샷). 비우면 vendors.bank_name';
COMMENT ON COLUMN public.expense_accruals.payee_bank_account_no IS '이체용 계좌번호(스냅샷). 비우면 vendors.bank_account_no';
