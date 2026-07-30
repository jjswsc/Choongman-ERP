-- Expense 문서번호 (FlowAccount식 EXPyyyymm000x)
-- Payment Plan / Register / Card 공유 월별 순번
-- 방콕시간 기준 yyyymm

ALTER TABLE public.expense_accruals
  ADD COLUMN IF NOT EXISTS document_no text;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS document_no text;

ALTER TABLE public.card_transactions
  ADD COLUMN IF NOT EXISTS document_no text;

ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS document_no text;

COMMENT ON COLUMN public.expense_accruals.document_no IS '지출 문서번호 EXPyyyymmNNNN';
COMMENT ON COLUMN public.bank_transactions.document_no IS '지출 문서번호 EXPyyyymmNNNN (발생 연동 시 accrual과 동일)';
COMMENT ON COLUMN public.card_transactions.document_no IS '카드 경비 문서번호 EXPyyyymmNNNN';
COMMENT ON COLUMN public.petty_cash_transactions.document_no IS '패티 경비 문서번호 EXPyyyymmNNNN';

-- accrual·card: 신규 발급 건은 유니크. bank/petty는 지급 연동 시 accrual 번호를 복사하므로
-- 분할 지급에서 동일 번호가 여러 행에 올 수 있어 non-unique 인덱스만 둔다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_accruals_document_no_uq
  ON public.expense_accruals (document_no)
  WHERE document_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_document_no
  ON public.bank_transactions (document_no)
  WHERE document_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_transactions_document_no_uq
  ON public.card_transactions (document_no)
  WHERE document_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_document_no
  ON public.petty_cash_transactions (document_no)
  WHERE document_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.expense_document_seq (
  yyyymm text PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.expense_document_seq IS '지출 문서번호 월별 순번 (공유: accrual/bank/card/petty)';

CREATE OR REPLACE FUNCTION public.allocate_expense_document_no(p_yyyymm text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_ym text := regexp_replace(coalesce(p_yyyymm, ''), '[^0-9]', '', 'g');
  v_seq integer;
BEGIN
  IF length(v_ym) <> 6 THEN
    RAISE EXCEPTION 'allocate_expense_document_no: yyyymm must be 6 digits, got %', p_yyyymm;
  END IF;

  INSERT INTO public.expense_document_seq (yyyymm, last_seq, updated_at)
  VALUES (v_ym, 1, now())
  ON CONFLICT (yyyymm) DO UPDATE
    SET last_seq = public.expense_document_seq.last_seq + 1,
        updated_at = now()
  RETURNING last_seq INTO v_seq;

  RETURN 'EXP' || v_ym || lpad(v_seq::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.allocate_expense_document_no(text) IS
  '월별 순번 증가 후 EXP + yyyymm + 4자리 반환 (동시성 안전)';

GRANT EXECUTE ON FUNCTION public.allocate_expense_document_no(text) TO anon, authenticated, service_role;
