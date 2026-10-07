-- 지출 문서번호: VAT→PV, Non-VAT→PP (접두별 월 순번)
-- expense_document_seq.yyyymm 키 예: PV202610 / PP202610
-- 구형 allocate_expense_document_no(EXP)는 남겨 두되 신규는 아래 RPC 사용

CREATE OR REPLACE FUNCTION public.allocate_voucher_document_no(p_prefix text, p_yyyymm text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text := upper(regexp_replace(coalesce(p_prefix, ''), '[^A-Za-z]', '', 'g'));
  v_ym text := regexp_replace(coalesce(p_yyyymm, ''), '[^0-9]', '', 'g');
  v_key text;
  v_seq integer;
BEGIN
  IF v_prefix NOT IN ('PV', 'PP') THEN
    RAISE EXCEPTION 'allocate_voucher_document_no: prefix must be PV or PP, got %', p_prefix;
  END IF;
  IF length(v_ym) <> 6 THEN
    RAISE EXCEPTION 'allocate_voucher_document_no: yyyymm must be 6 digits, got %', p_yyyymm;
  END IF;

  v_key := v_prefix || v_ym;

  INSERT INTO public.expense_document_seq (yyyymm, last_seq, updated_at)
  VALUES (v_key, 1, now())
  ON CONFLICT (yyyymm) DO UPDATE
    SET last_seq = public.expense_document_seq.last_seq + 1,
        updated_at = now()
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || v_ym || lpad(v_seq::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.allocate_voucher_document_no(text, text) IS
  '접두(PV/PP)+월별 순번 증가 후 PVyyyymmNNNN 또는 PPyyyymmNNNN 반환';

GRANT EXECUTE ON FUNCTION public.allocate_voucher_document_no(text, text) TO anon, authenticated, service_role;

COMMENT ON COLUMN public.expense_accruals.document_no IS '지출 문서번호 PVyyyymmNNNN(VAT) / PPyyyymmNNNN(Non-VAT)';
COMMENT ON COLUMN public.bank_transactions.document_no IS '지출 문서번호 PV/PP (발생 연동 시 accrual과 동일)';
COMMENT ON COLUMN public.card_transactions.document_no IS '카드 경비 문서번호 PV/PP';
COMMENT ON COLUMN public.petty_cash_transactions.document_no IS '패티 경비 문서번호 PV/PP';
COMMENT ON TABLE public.expense_document_seq IS '문서번호 월별 순번 (키=PV202610|PP202610|구형 202610)';
