-- 1/3 CM027 본사(CM Office 묶음) 기준일 재고 — 화면 로직 vs 삭제분 제외
-- 재고 목록은 stock_logs.qty 전체 합(is_deleted 미제외). 영업 중 실행 가능(SELECT only).
-- 이것만 복사 → Run.

WITH bounds AS (
  SELECT
    ('2026-09-02'::timestamp AT TIME ZONE 'Asia/Bangkok') AS sep2_start,
    ('2026-09-14'::timestamp AT TIME ZONE 'Asia/Bangkok') AS sep14_start
),
hq AS (
  SELECT sl.*
  FROM public.stock_logs sl
  WHERE upper(btrim(coalesce(sl.item_code, ''))) = 'CM027'
    AND lower(btrim(coalesce(sl.location, ''))) IN (
      'cm office', '입고등록', 'office', '본사', '오피스', '본점', 'hq'
    )
)
SELECT
  round(sum(h.qty) FILTER (WHERE h.log_date < b.sep2_start), 3) AS qty_sep1_화면과동일,
  round(sum(h.qty) FILTER (
    WHERE h.log_date < b.sep2_start
      AND coalesce(h.is_deleted, false) = false
  ), 3) AS qty_sep1_삭제제외,
  round(sum(h.qty) FILTER (WHERE h.log_date < b.sep14_start), 3) AS qty_sep13_화면과동일,
  round(sum(h.qty) FILTER (
    WHERE h.log_date < b.sep14_start
      AND coalesce(h.is_deleted, false) = false
  ), 3) AS qty_sep13_삭제제외,
  round(
    coalesce(sum(h.qty) FILTER (WHERE h.log_date < b.sep14_start), 0)
    - coalesce(sum(h.qty) FILTER (WHERE h.log_date < b.sep2_start), 0)
  , 3) AS delta_sep2_to_13_화면,
  round(
    coalesce(sum(h.qty) FILTER (
      WHERE h.log_date >= b.sep2_start
        AND h.log_date < b.sep14_start
        AND coalesce(h.is_deleted, false) = true
    ), 0)
  , 3) AS delta_중_삭제행_qty합
FROM hq h
CROSS JOIN bounds b;
