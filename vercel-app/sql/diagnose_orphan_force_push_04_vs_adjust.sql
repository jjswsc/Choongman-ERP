-- 1/2 유령 ForcePush 과다수량 vs 해당 매장 재고조정(Adjustment)
-- extra + 조정합 ≈ 0 이면 이미 보정된 것으로 봄. 영업 중 실행 가능(SELECT only).
-- 이것만 복사 → Run.

WITH keyed AS (
  SELECT
    btrim(coalesce(sl.reference_no, '')) AS reference_no,
    btrim(coalesce(sl.item_code, '')) AS item_code,
    CASE
      WHEN sl.log_type = 'ForcePush' THEN btrim(coalesce(sl.location, ''))
      ELSE btrim(coalesce(sl.vendor_target, ''))
    END AS store_location,
    max(btrim(coalesce(sl.item_name, ''))) AS item_name,
    count(*) FILTER (
      WHERE sl.log_type = 'ForcePush' AND coalesce(sl.is_deleted, false) = false
    ) AS live_push_cnt,
    count(*) FILTER (
      WHERE sl.log_type = 'ForceOutbound' AND coalesce(sl.is_deleted, false) = false
    ) AS live_outbound_cnt,
    round(sum(sl.qty) FILTER (
      WHERE sl.log_type = 'ForcePush' AND coalesce(sl.is_deleted, false) = false
    ), 3) AS live_push_qty,
    round(sum(abs(coalesce(sl.qty, 0))) FILTER (
      WHERE sl.log_type = 'ForceOutbound' AND coalesce(sl.is_deleted, false) = false
    ), 3) AS live_outbound_qty,
    min(sl.log_date) FILTER (
      WHERE sl.log_type = 'ForcePush' AND coalesce(sl.is_deleted, false) = false
    ) AS first_live_push_at
  FROM public.stock_logs sl
  WHERE sl.log_type IN ('ForcePush', 'ForceOutbound')
    AND btrim(coalesce(sl.reference_no, '')) <> ''
    AND btrim(coalesce(sl.item_code, '')) <> ''
  GROUP BY 1, 2, 3
),
orphans AS (
  SELECT
    item_code,
    item_name,
    store_location,
    round(coalesce(live_push_qty, 0) - coalesce(live_outbound_qty, 0), 3) AS extra_store_qty,
    first_live_push_at
  FROM keyed
  WHERE live_push_cnt > live_outbound_cnt
),
by_store AS (
  SELECT
    item_code,
    max(item_name) AS item_name,
    store_location,
    round(sum(extra_store_qty), 3) AS extra_store_qty,
    min(first_live_push_at) AS first_live_push_at
  FROM orphans
  GROUP BY item_code, store_location
)
SELECT
  b.item_code,
  b.item_name,
  b.store_location,
  b.extra_store_qty,
  round(coalesce(sum(adj.qty) FILTER (
    WHERE adj.log_date >= b.first_live_push_at
  ), 0), 3) AS adj_qty_after_push,
  round(coalesce(sum(adj.qty), 0), 3) AS adj_qty_all,
  count(adj.id) FILTER (
    WHERE adj.log_date >= b.first_live_push_at
  ) AS adj_rows_after_push,
  round(
    b.extra_store_qty
    + coalesce(sum(adj.qty) FILTER (WHERE adj.log_date >= b.first_live_push_at), 0)
  , 3) AS remaining_after_adj,
  CASE
    WHEN abs(
      b.extra_store_qty
      + coalesce(sum(adj.qty) FILTER (WHERE adj.log_date >= b.first_live_push_at), 0)
    ) < 0.001 THEN '이미 조정으로 상쇄'
    WHEN coalesce(sum(adj.qty) FILTER (WHERE adj.log_date >= b.first_live_push_at), 0) < 0
     AND abs(
       b.extra_store_qty
       + coalesce(sum(adj.qty) FILTER (WHERE adj.log_date >= b.first_live_push_at), 0)
     ) >= 0.001 THEN '일부만 조정됨'
    ELSE '조정 없음·미상쇄'
  END AS adj_status
FROM by_store b
LEFT JOIN public.stock_logs adj
  ON adj.log_type = 'Adjustment'
 AND coalesce(adj.is_deleted, false) = false
 AND btrim(coalesce(adj.item_code, '')) = b.item_code
 AND lower(btrim(coalesce(adj.location, ''))) = lower(b.store_location)
GROUP BY b.item_code, b.item_name, b.store_location, b.extra_store_qty, b.first_live_push_at
ORDER BY remaining_after_adj DESC, b.item_code, b.store_location;
