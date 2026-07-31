-- CM006 / Tigudak Garlic Sauce — 2026-07 (Asia/Bangkok) 출고·입고 비교
-- 목적: 집계 탭(매장 입고) vs 본사 Outbound 과소 여부 확인
-- 영업 중 실행 가능 (SELECT only)

WITH bounds AS (
  SELECT
    ('2026-07-01'::timestamp AT TIME ZONE 'Asia/Bangkok') AS start_ts,
    ('2026-08-01'::timestamp AT TIME ZONE 'Asia/Bangkok') AS end_ts
),
matched AS (
  SELECT
    sl.id,
    sl.log_type,
    sl.location,
    sl.vendor_target,
    sl.item_code,
    sl.item_name,
    sl.qty,
    abs(coalesce(sl.qty, 0)::numeric) AS qty_abs,
    coalesce(sl.is_deleted, false) AS is_deleted,
    sl.order_id,
    (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date AS ymd_bkk
  FROM public.stock_logs sl
  CROSS JOIN bounds b
  WHERE sl.log_date >= b.start_ts
    AND sl.log_date < b.end_ts
    AND (
      sl.item_code ILIKE '%CM006%'
      OR sl.item_name ILIKE '%Tigudak Garlic%'
      OR sl.item_name ILIKE '%Garlic Sauce%'
    )
)
-- 1) log_type × location 요약
SELECT
  log_type,
  coalesce(nullif(btrim(location), ''), '(empty)') AS location,
  coalesce(nullif(btrim(vendor_target), ''), '(empty)') AS vendor_target,
  is_deleted,
  count(*) AS row_cnt,
  round(sum(qty_abs), 3) AS qty_abs_sum
FROM matched
GROUP BY 1, 2, 3, 4
ORDER BY qty_abs_sum DESC;

-- 2) 집계 탭과 동일: 매장 Inbound From HQ + ForcePush(HQ)
SELECT
  log_type,
  location AS store,
  round(sum(qty_abs), 3) AS qty_abs_sum,
  count(*) AS row_cnt
FROM matched
WHERE coalesce(is_deleted, false) = false
  AND (
    (log_type = 'Inbound' AND btrim(coalesce(vendor_target, '')) ILIKE '%From HQ%')
    OR (log_type = 'ForcePush' AND (
      btrim(coalesce(vendor_target, '')) = 'HQ'
      OR btrim(coalesce(vendor_target, '')) ILIKE '%HQ%'
    ))
  )
GROUP BY 1, 2
ORDER BY qty_abs_sum DESC;

-- 3) 기존 출고내역(본사 Outbound/ForceOutbound)만
SELECT
  log_type,
  vendor_target AS store,
  location AS hq_location,
  round(sum(qty_abs), 3) AS qty_abs_sum,
  count(*) AS row_cnt
FROM matched
WHERE coalesce(is_deleted, false) = false
  AND log_type IN ('Outbound', 'ForceOutbound')
GROUP BY 1, 2, 3
ORDER BY qty_abs_sum DESC;

-- 4) 품목 직접정산 여부
SELECT
  i.code,
  i.name,
  i.vendor,
  v.direct_settlement
FROM public.items i
LEFT JOIN public.vendors v
  ON v.code = i.vendor OR v.name = i.vendor OR v.gps_name = i.vendor
WHERE i.code ILIKE '%CM006%'
   OR i.name ILIKE '%Tigudak Garlic%'
   OR i.name ILIKE '%Garlic Sauce%';
