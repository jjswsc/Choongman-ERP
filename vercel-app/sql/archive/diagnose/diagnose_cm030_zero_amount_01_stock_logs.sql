-- 1/3 CM030 Mozzarella 출고 로그 단가 스냅샷 (invoice_unit_price)
-- 출고 화면 금액 = invoice_unit_price × 수량. 값이 0이면 화면에 0으로 나온다.
-- 주문 2183(IV20260804-2183)만 0인지, 다른 주문도 0인지 비교. SELECT only — 영업 중 실행 가능.

SELECT
  sl.id,
  sl.order_id,
  sl.vendor_target,
  sl.log_date AT TIME ZONE 'Asia/Bangkok' AS log_date_bkk,
  sl.qty,
  sl.invoice_unit_price,
  coalesce(sl.is_deleted, false) AS is_deleted
FROM public.stock_logs sl
WHERE upper(btrim(coalesce(sl.item_code, ''))) = 'CM030'
  AND sl.log_type = 'Outbound'
  AND sl.log_date >= ('2026-07-01'::timestamp AT TIME ZONE 'Asia/Bangkok')
ORDER BY sl.log_date DESC, sl.id DESC
LIMIT 200;
