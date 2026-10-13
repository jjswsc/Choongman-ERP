-- 6/6 9/20 이후 매장이 수령한 CM030 중 본사 출고 로그(청구 근거)가 빠진 주문
-- 직접정산 품목은 수령 시 본사 Outbound 로그를 만들지 않는다. hq_outbound_log_id 가 NULL 이면 미청구.
-- SELECT only — 영업 중 실행 가능.

SELECT
  ib.order_id,
  ib.location AS store,
  ib.log_date AT TIME ZONE 'Asia/Bangkok' AS received_bkk,
  ib.qty,
  ib.invoice_unit_price,
  ob.id AS hq_outbound_log_id
FROM public.stock_logs ib
LEFT JOIN public.stock_logs ob
  ON ob.order_id = ib.order_id
  AND ob.log_type = 'Outbound'
  AND upper(btrim(coalesce(ob.item_code, ''))) = 'CM030'
  AND coalesce(ob.is_deleted, false) = false
WHERE ib.log_type = 'Inbound'
  AND ib.vendor_target = 'From HQ'
  AND upper(btrim(coalesce(ib.item_code, ''))) = 'CM030'
  AND coalesce(ib.is_deleted, false) = false
  AND ib.log_date >= ('2026-09-20'::timestamp AT TIME ZONE 'Asia/Bangkok')
ORDER BY ib.log_date DESC, ib.order_id DESC;
