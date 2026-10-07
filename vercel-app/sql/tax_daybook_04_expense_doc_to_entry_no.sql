-- 영업 중 pos_orders UPDATE 없음. journal_entries.entry_no만 수정(세무 book).
-- 지출 문서번호(EXP…)를 세무 분개 entry_no로 맞춰 일별장부 검색이 되게 함.
-- entry_no UNIQUE: 회사 장부(JE-)는 건드리지 않음. 이미 같은 EXP가 있으면 skip.

BEGIN;

-- 지출 발생 → 세무 분개
UPDATE public.journal_entries je
SET entry_no = ea.document_no
FROM public.expense_accruals ea
WHERE je.source_type = 'expense_accrual'
  AND je.source_id = ea.id
  AND je.book = 'tax'
  AND ea.document_no IS NOT NULL
  AND ea.document_no <> ''
  AND je.accounting_date >= '2026-07-01'
  AND coalesce(je.entry_no, '') IS DISTINCT FROM ea.document_no
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entries x
    WHERE x.entry_no = ea.document_no AND x.id <> je.id
  );

-- 통장 지출 (document_no 있는 건)
UPDATE public.journal_entries je
SET entry_no = bt.document_no
FROM public.bank_transactions bt
WHERE je.source_type = 'bank_transaction'
  AND je.source_id = bt.id
  AND je.book = 'tax'
  AND bt.document_no IS NOT NULL
  AND bt.document_no <> ''
  AND je.accounting_date >= '2026-07-01'
  AND coalesce(je.entry_no, '') IS DISTINCT FROM bt.document_no
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entries x
    WHERE x.entry_no = bt.document_no AND x.id <> je.id
  );

-- 패티 지출
UPDATE public.journal_entries je
SET entry_no = pct.document_no
FROM public.petty_cash_transactions pct
WHERE je.source_type = 'petty_cash'
  AND je.source_id = pct.id
  AND je.book = 'tax'
  AND pct.document_no IS NOT NULL
  AND pct.document_no <> ''
  AND je.accounting_date >= '2026-07-01'
  AND coalesce(je.entry_no, '') IS DISTINCT FROM pct.document_no
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entries x
    WHERE x.entry_no = pct.document_no AND x.id <> je.id
  );

COMMIT;
