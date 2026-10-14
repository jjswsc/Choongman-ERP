-- S&J 청구(IV) 세무 미러 누락 현황.
-- 청구(SV)와 수금(RV)이 같은 IV 번호를 entry_no로 쓰다가 UNIQUE에 걸려 세무 전표가 빠진 건수.
-- rename_needed: 수금 세무 전표가 IV 번호를 그대로 쥐고 있어 청구 미러를 막는 건
-- missing_*: 회사 전표는 있는데 세무 전표(book=tax)가 없는 건 (기간 마감 여부 포함)

WITH company AS (
  SELECT je.id, je.source_type, je.source_id, je.accounting_date, je.memo
  FROM public.journal_entries je
  WHERE COALESCE(je.book, '') <> 'tax'
    AND je.source_type IN ('outbound_bill', 'outbound_bill_force', 'outbound_collection')
    AND je.store_name IN ('CM Office', 'CM Office HQ')
),
missing AS (
  SELECT c.*,
    COALESCE(p.is_closed, false) AS period_closed
  FROM company c
  LEFT JOIN public.tax_accounting_periods p
    ON p.tax_entity_code = 'tin:0105566137147'
   AND p.year_month = to_char(c.accounting_date::date, 'YYYY-MM')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.journal_entries t
    WHERE t.book = 'tax'
      AND t.source_type = c.source_type
      AND t.source_id = c.source_id
      AND t.tax_entity_code = 'tin:0105566137147'
  )
)
SELECT 'rename_needed' AS kind, count(*) AS cnt, min(entry_no) AS sample
FROM public.journal_entries
WHERE book = 'tax'
  AND source_type = 'outbound_collection'
  AND entry_no ~ '^IVF?[0-9]{8}-[0-9]+$'
UNION ALL
SELECT 'missing_' || source_type || CASE WHEN period_closed THEN '_closed' ELSE '' END,
  count(*),
  min(substring(memo from '(IVF?[0-9]{8}-[0-9]+)'))
FROM missing
GROUP BY source_type, period_closed
ORDER BY 1;
