-- 회사 장부(book≠tax)에서 같은 원천(source_type, source_id)에 전표가 2개 이상인 건.
-- 출고 화면·인쇄 화면이 동시에 วางบิล 처리를 호출해 청구 전표가 두 번 들어간 사례 확인용.

SELECT
  x.source_type,
  count(*) AS dup_sources,
  sum(x.cnt - 1) AS extra_entries,
  min(x.sample_memo) AS sample
FROM (
  SELECT source_type, source_id, count(*) AS cnt, min(memo) AS sample_memo
  FROM public.journal_entries
  WHERE COALESCE(book, '') <> 'tax'
    AND source_id IS NOT NULL
    AND source_type IN ('outbound_bill', 'outbound_bill_force', 'outbound_collection')
  GROUP BY source_type, source_id
  HAVING count(*) > 1
) x
GROUP BY x.source_type
ORDER BY x.source_type;
