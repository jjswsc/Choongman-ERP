-- 2/2 유령 ForcePush 품목·매장의 재고조정 행 상세
-- vendor_target 이 조정 메모. 영업 중 실행 가능(SELECT only).
-- 이것만 복사 → Run.

WITH keyed AS (
  SELECT
    btrim(coalesce(sl.reference_no, '')) AS reference_no,
    btrim(coalesce(sl.item_code, '')) AS item_code,
    CASE
      WHEN sl.log_type = 'ForcePush' THEN btrim(coalesce(sl.location, ''))
      ELSE btrim(coalesce(sl.vendor_target, ''))
    END AS store_location,
    count(*) FILTER (
      WHERE sl.log_type = 'ForcePush' AND coalesce(sl.is_deleted, false) = false
    ) AS live_push_cnt,
    count(*) FILTER (
      WHERE sl.log_type = 'ForceOutbound' AND coalesce(sl.is_deleted, false) = false
    ) AS live_outbound_cnt
  FROM public.stock_logs sl
  WHERE sl.log_type IN ('ForcePush', 'ForceOutbound')
    AND btrim(coalesce(sl.reference_no, '')) <> ''
    AND btrim(coalesce(sl.item_code, '')) <> ''
  GROUP BY 1, 2, 3
),
pairs AS (
  SELECT DISTINCT item_code, store_location
  FROM keyed
  WHERE live_push_cnt > live_outbound_cnt
)
SELECT
  adj.id,
  to_char(adj.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') AS ymd_bkk,
  btrim(adj.item_code) AS item_code,
  btrim(coalesce(adj.item_name, '')) AS item_name,
  btrim(adj.location) AS location,
  adj.qty AS adj_qty,
  btrim(coalesce(adj.vendor_target, '')) AS memo
FROM public.stock_logs adj
JOIN pairs p
  ON p.item_code = btrim(coalesce(adj.item_code, ''))
 AND lower(p.store_location) = lower(btrim(coalesce(adj.location, '')))
WHERE adj.log_type = 'Adjustment'
  AND coalesce(adj.is_deleted, false) = false
ORDER BY adj.log_date, adj.id;
