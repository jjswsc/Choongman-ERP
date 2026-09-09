-- 1/4 미리보기: EXP2026070039 (화면 발생 #2316) 지급예정 + 2026-07 마감
-- 조회만. 삭제 금지.
-- 마감 행이 여러 개면 지급예정이 여러 줄로 보입니다. is_closed = true 이면 마감월입니다.

SELECT
  ea.id,
  ea.document_no,
  ea.status,
  ea.store_name,
  ea.payee_code,
  ea.payee_name,
  ea.amount,
  ea.vat_amount,
  ea.withholding_tax_amount,
  ea.expense_date,
  ea.due_date,
  ea.memo,
  ea.invoice_received,
  ea.created_at,
  ap.year_month,
  ap.is_closed
FROM public.expense_accruals ea
LEFT JOIN public.accounting_periods ap
  ON ap.year_month = to_char(ea.expense_date, 'YYYY-MM')
WHERE ea.id = 2316
   OR ea.document_no = 'EXP2026070039'
ORDER BY ea.id;
