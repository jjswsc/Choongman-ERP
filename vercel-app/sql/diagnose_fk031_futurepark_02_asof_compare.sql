-- 2/3 조회만 — FK031: 기준일(오늘 방콕 EOD) 포함 vs 전체 합계 비교
-- 관리자(asOfDate) vs 사용탭(날짜 없음) 차이(+10 후보) 확인. 이것만 복사 → Run

WITH patterns AS (
  SELECT ARRAY['CM Future Park', 'Future Park']::text[] AS pats
),
bangkok_today_eod AS (
  -- Asia/Bangkok 오늘 23:59:59.999 → timestamptz
  SELECT (
    (timezone('Asia/Bangkok', now()))::date
    + time '23:59:59.999'
  ) AT TIME ZONE 'Asia/Bangkok' AS eod
)
SELECT
  'as_of_today_eod'::text AS mode,
  SUM(sl.qty)::numeric AS total_qty,
  COUNT(*)::int AS log_count
FROM public.stock_logs sl
CROSS JOIN patterns p
CROSS JOIN bangkok_today_eod d
WHERE sl.item_code = 'FK031'
  AND (sl.is_deleted IS NULL OR sl.is_deleted = false)
  AND EXISTS (
    SELECT 1 FROM unnest(p.pats) AS pat
    WHERE sl.location ILIKE pat
  )
  AND sl.log_date <= d.eod

UNION ALL

SELECT
  'all_dates'::text AS mode,
  SUM(sl.qty)::numeric AS total_qty,
  COUNT(*)::int AS log_count
FROM public.stock_logs sl
CROSS JOIN patterns p
WHERE sl.item_code = 'FK031'
  AND (sl.is_deleted IS NULL OR sl.is_deleted = false)
  AND EXISTS (
    SELECT 1 FROM unnest(p.pats) AS pat
    WHERE sl.location ILIKE pat
  );
