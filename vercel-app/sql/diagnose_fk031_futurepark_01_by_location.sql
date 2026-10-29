-- 1/3 조회만 — FK031(Cabbage) Future Park 계열 location별 합계
-- 관리자 สถานะสต๊อก(5) vs 사용 สต็อก:15 불일치 진단용. 이것만 복사 → Run

SELECT
  COALESCE(sl.location, '(null)') AS location,
  COUNT(*)::int AS log_count,
  SUM(sl.qty)::numeric AS total_qty,
  MAX(sl.log_date) AS last_log_date,
  MIN(sl.log_date) AS first_log_date
FROM public.stock_logs sl
WHERE sl.item_code = 'FK031'
  AND (sl.is_deleted IS NULL OR sl.is_deleted = false)
  AND (
    sl.location ILIKE 'CM Future Park'
    OR sl.location ILIKE 'Future Park'
    OR sl.location ILIKE '%Future Park%'
    OR sl.location ILIKE '%ฟิวเจอร์%'
    OR sl.location ILIKE '%Rangsit%'
  )
GROUP BY sl.location
ORDER BY total_qty DESC NULLS LAST, location;
