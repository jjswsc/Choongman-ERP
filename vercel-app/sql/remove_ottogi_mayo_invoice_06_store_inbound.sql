-- 6/6 매장 입고(From HQ) — 같은 기간 마요네즈가 이미 매장 재고로 들어왔는지
-- 수령된 상태면 인보이스에서 줄만 빼도 매장 재고는 남음. SELECT만. 이것만 복사 → Run.

WITH bounds AS (
  SELECT
    ('2026-06-26'::timestamp AT TIME ZONE 'Asia/Bangkok') AS start_ts,
    ('2026-09-17'::timestamp AT TIME ZONE 'Asia/Bangkok') AS end_ts
),
mayo_items AS (
  SELECT btrim(i.code) AS item_code
  FROM public.items i
  WHERE (
       i.name ILIKE '%mayo%'
       OR i.name ILIKE '%mayone%'
       OR i.name ILIKE '%mayonnaise%'
       OR i.spec ILIKE '%mayo%'
     )
     AND (
       i.name ILIKE '%ottogi%'
       OR i.name ILIKE '%3.2%'
       OR i.spec ILIKE '%3.2%'
     )
)
SELECT
  sl.location AS store,
  sl.log_type,
  btrim(coalesce(sl.vendor_target, '')) AS vendor_target,
  sl.item_code,
  sl.item_name,
  sl.spec,
  count(*) AS row_cnt,
  round(sum(abs(coalesce(sl.qty, 0)::numeric)), 3) AS qty_abs_sum,
  min((sl.log_date AT TIME ZONE 'Asia/Bangkok')::date) AS first_ymd_bkk,
  max((sl.log_date AT TIME ZONE 'Asia/Bangkok')::date) AS last_ymd_bkk
FROM public.stock_logs sl
CROSS JOIN bounds b
WHERE sl.log_date >= b.start_ts
  AND sl.log_date < b.end_ts
  AND coalesce(sl.is_deleted, false) = false
  AND sl.log_type IN ('Inbound', 'ForcePush')
  AND (
    (sl.log_type = 'Inbound' AND btrim(coalesce(sl.vendor_target, '')) ILIKE '%From HQ%')
    OR (sl.log_type = 'ForcePush' AND (
      btrim(coalesce(sl.vendor_target, '')) = 'HQ'
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE '%HQ%'
    ))
  )
  AND (
    EXISTS (
      SELECT 1 FROM mayo_items m
      WHERE m.item_code <> '' AND btrim(coalesce(sl.item_code, '')) = m.item_code
    )
    OR sl.item_name ILIKE '%mayo%'
    OR sl.item_name ILIKE '%mayone%'
    OR sl.item_name ILIKE '%mayonnaise%'
    OR sl.spec ILIKE '%mayo%'
  )
GROUP BY
  sl.location,
  sl.log_type,
  btrim(coalesce(sl.vendor_target, '')),
  sl.item_code,
  sl.item_name,
  sl.spec
ORDER BY qty_abs_sum DESC, store;
