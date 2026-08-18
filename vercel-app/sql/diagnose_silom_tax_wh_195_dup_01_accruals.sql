-- 1/6 미리보기: CM Silom 원천세 ฿195 (2026-08-17) 중복 지급예정
-- Fang 등록 1회 → 처리실패(23502) + 오프라인 재시도로 แผนจ่าย만 여러 건
-- 조회만. 삭제 금지.

SELECT
  ea.id,
  ea.status,
  ea.store_name,
  ea.payee_code,
  ea.payee_name,
  ea.amount,
  ea.expense_date,
  ea.document_no,
  ea.memo,
  ea.created_at
FROM public.expense_accruals ea
WHERE ea.store_name ILIKE '%Silom%'
  AND ea.expense_date = DATE '2026-08-17'
  AND abs(ea.amount::numeric - 195) < 0.02
  AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
ORDER BY ea.id;
