-- 2/3 CM027 9/2~9/13 본사 묶음 location — 유형·창고·삭제여부 요약
-- 화면 재고 감소(-44)의 출처를 유형별로 봄. 영업 중 실행 가능(SELECT only).
-- 이것만 복사 → Run.

WITH bounds AS (
  SELECT
    ('2026-09-02'::timestamp AT TIME ZONE 'Asia/Bangkok') AS start_ts,
    ('2026-09-14'::timestamp AT TIME ZONE 'Asia/Bangkok') AS end_ts
)
SELECT
  coalesce(nullif(btrim(sl.log_type), ''), '(empty)') AS log_type,
  coalesce(nullif(btrim(sl.location), ''), '(empty)') AS location,
  coalesce(nullif(btrim(sl.vendor_target), ''), '(empty)') AS vendor_target,
  coalesce(sl.is_deleted, false) AS is_deleted,
  count(*) AS row_cnt,
  round(sum(sl.qty), 3) AS qty_sum,
  round(sum(abs(coalesce(sl.qty, 0))), 3) AS qty_abs_sum
FROM public.stock_logs sl
CROSS JOIN bounds b
WHERE upper(btrim(coalesce(sl.item_code, ''))) = 'CM027'
  AND sl.log_date >= b.start_ts
  AND sl.log_date < b.end_ts
  AND lower(btrim(coalesce(sl.location, ''))) IN (
    'cm office', '입고등록', 'office', '본사', '오피스', '본점', 'hq'
  )
GROUP BY 1, 2, 3, 4
ORDER BY qty_sum, log_type, location;
