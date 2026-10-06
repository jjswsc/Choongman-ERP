-- 영업 중·POS 켜진 상태에서도 pos_orders UPDATE는 없음.
-- 세무 장부(book=tax)의 월 요약 전표만 삭제 (매출/매입/VAT/급여 요약).
-- 기초·결산·거래 복제 전표는 건드리지 않음.
-- 미리보기 결과 20건(2026-07-01 이후)과 같은 조건.

BEGIN;

DELETE FROM public.journal_lines
WHERE journal_entry_id IN (
  SELECT id
  FROM public.journal_entries
  WHERE book = 'tax'
    AND source_type IN (
      'tax_sales_summary',
      'tax_purchase_summary',
      'tax_vat_summary',
      'tax_payroll'
    )
    AND accounting_date >= '2026-07-01'
);

DELETE FROM public.journal_entries
WHERE book = 'tax'
  AND source_type IN (
    'tax_sales_summary',
    'tax_purchase_summary',
    'tax_vat_summary',
    'tax_payroll'
  )
  AND accounting_date >= '2026-07-01';

COMMIT;
