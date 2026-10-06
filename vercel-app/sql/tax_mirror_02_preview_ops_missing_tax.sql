-- 영업 중 pos_orders UPDATE 없음. journal_entries 조회만.
-- 2026-07-01 이후 기업 분개 중 세무 복제(book=tax, 같은 source)가 없는 건수.
SELECT
  o.source_type,
  count(*) AS ops_rows,
  count(*) FILTER (
    WHERE t.id IS NULL
  ) AS missing_tax_copies
FROM public.journal_entries o
LEFT JOIN public.journal_entries t
  ON t.book = 'tax'
 AND t.source_type = o.source_type
 AND t.source_id IS NOT DISTINCT FROM o.source_id
 AND o.source_id IS NOT NULL
 AND o.source_id > 0
WHERE o.accounting_date >= '2026-07-01'
  AND coalesce(o.book, '') <> 'tax'
  AND o.source_type NOT LIKE 'tax_%'
GROUP BY o.source_type
ORDER BY missing_tax_copies DESC;
