-- 출고 소프트 삭제 무결성 점검 쿼리
-- 운영 반영 후 주기적으로 실행해 정합성을 확인한다.

-- 1) 삭제된 ForceOutbound인데 미수금(ref ForceOutbound)이 남아있는 경우
SELECT
  s.id AS stock_log_id,
  s.vendor_target,
  s.log_date,
  rt.id AS receivable_id,
  rt.amount
FROM public.stock_logs s
JOIN public.receivable_transactions rt
  ON rt.ref_type = 'ForceOutbound'
 AND rt.ref_id = s.id
WHERE s.log_type = 'ForceOutbound'
  AND coalesce(s.is_deleted, false) = true
ORDER BY s.id DESC
LIMIT 200;

-- 2) 주문 출고가 모두 삭제됐는데 Order 미수가 남은 경우
SELECT
  o.id AS order_id,
  o.store_name,
  rt.amount AS receivable_amount,
  count(s.id) AS active_outbound_log_count
FROM public.orders o
JOIN public.receivable_transactions rt
  ON rt.ref_type = 'Order'
 AND rt.ref_id = o.id
LEFT JOIN public.stock_logs s
  ON s.order_id = o.id
 AND s.log_type = 'Outbound'
 AND coalesce(s.is_deleted, false) = false
GROUP BY o.id, o.store_name, rt.amount
HAVING count(s.id) = 0
ORDER BY o.id DESC
LIMIT 200;

-- 3) 매장별 미수 잔액이 음수인 경우(수금 초과 의심)
SELECT
  store_name,
  sum(amount) AS outstanding
FROM public.receivable_transactions
GROUP BY store_name
HAVING sum(amount) < 0
ORDER BY outstanding ASC;

-- 4) 삭제 이벤트는 있는데 실제 stock_logs가 삭제 표시되지 않은 경우
SELECT
  e.id AS event_id,
  e.mode,
  e.created_at,
  e.deleted_count,
  e.stock_log_ids
FROM public.outbound_delete_events e
WHERE e.deleted_count > 0
  AND (
    e.stock_log_ids IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.stock_logs s
      WHERE s.id IN (
        SELECT jsonb_array_elements_text(e.stock_log_ids)::bigint
      )
        AND coalesce(s.is_deleted, false) = false
    )
  )
ORDER BY e.id DESC
LIMIT 200;
