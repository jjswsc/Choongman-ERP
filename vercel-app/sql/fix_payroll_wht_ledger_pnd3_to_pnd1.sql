-- 급여 자동 원천(AUTO:PAYROLL_RECORD_WHT)을 ภ.ง.ด.1(PND1)로 교정.
-- SSO 미적용(3%) 직원도 급여이므로 PND1. 개인 용역 지출(AUTO:EXPENSE_ACCRUAL_WHT / EAW-*)는 변경하지 않음.
--
-- 제출(submitted) 행은 건드리지 않음. draft만 수정.
-- POS Realtime 무관(원장 테이블). 가능하면 마감 후·동기화 전에 실행 권장.
--
-- 미리보기:
-- SELECT id, tax_month, store_name, payee_name, form_hint, income_type, certificate_no, filing_status, memo
-- FROM public.withholding_tax_ledger_entries
-- WHERE memo ILIKE '%[AUTO:PAYROLL_RECORD_WHT:%'
--   AND upper(trim(coalesce(form_hint, ''))) = 'PND3'
--   AND lower(trim(coalesce(filing_status, 'draft'))) <> 'submitted'
-- ORDER BY tax_month DESC, id;

UPDATE public.withholding_tax_ledger_entries
SET
  form_hint = 'PND1',
  income_type = '급여',
  certificate_no = CASE
    WHEN certificate_no ~* '^PR3-' THEN regexp_replace(certificate_no, '^PR3-', 'PR1-', 'i')
    ELSE certificate_no
  END,
  memo = regexp_replace(
    regexp_replace(coalesce(memo, ''), 'PND3 급여 원천세 자동', 'PND1 급여 원천세 자동', 'g'),
    '\[AUTO:PAYROLL_RECORD_WHT:(\d+)\]\s*PND3',
    '[AUTO:PAYROLL_RECORD_WHT:\1] PND1',
    'g'
  ),
  updated_at = now()
WHERE memo ILIKE '%[AUTO:PAYROLL_RECORD_WHT:%'
  AND upper(trim(coalesce(form_hint, ''))) = 'PND3'
  AND lower(trim(coalesce(filing_status, 'draft'))) <> 'submitted';

-- 검증: 급여 자동분 중 PND3가 남아 있으면 안 됨(제출분만 예외 가능)
-- SELECT form_hint, filing_status, count(*)
-- FROM public.withholding_tax_ledger_entries
-- WHERE memo ILIKE '%[AUTO:PAYROLL_RECORD_WHT:%'
-- GROUP BY 1, 2;
--
-- 개인 용역(지출) PND3는 그대로:
-- SELECT id, payee_name, form_hint, certificate_no, memo
-- FROM public.withholding_tax_ledger_entries
-- WHERE memo ILIKE '%[AUTO:EXPENSE_ACCRUAL_WHT:%'
--   AND tax_month = '2026-07'
--   AND (certificate_no IN ('EAW-1976', 'EAW-2246') OR payee_name ILIKE '%วรางรัตน์%' OR payee_name ILIKE '%ปวริศา%');
