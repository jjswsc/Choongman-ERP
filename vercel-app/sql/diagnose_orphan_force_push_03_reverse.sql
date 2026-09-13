-- 3/3 반대: 살아 있는 강제출고가 ForcePush보다 많은 건 (매장 미입고)
-- 본사 재고는 차감됐는데 매장 입고 로그가 없는 상태. 영업 중 실행 가능(SELECT only).
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
    ), 3) AS live_outbound_qty
  FROM public.stock_logs sl
  WHERE sl.log_type IN ('ForcePush', 'ForceOutbound')
    AND btrim(coalesce(sl.reference_no, '')) <> ''
    AND btrim(coalesce(sl.item_code, '')) <> ''
  GROUP BY 1, 2, 3
)
SELECT
  item_code,
  item_name,
  store_location,
  reference_no,
  live_push_cnt,
  live_outbound_cnt,
  live_push_qty,
  live_outbound_qty,
  round(coalesce(live_outbound_qty, 0) - coalesce(live_push_qty, 0), 3) AS missing_store_qty
FROM keyed
WHERE live_outbound_cnt > live_push_cnt
ORDER BY missing_store_qty DESC, item_code, store_location, reference_no;
