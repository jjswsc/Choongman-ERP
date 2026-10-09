-- 1/3 미리보기 — Future Park 테이블 2·4 고아 미결제 빌 확인
-- 대상: CMFUTUREPARK-20260916-002, CMFUTUREPARK-20260916-003
-- 아직 UPDATE 하지 않음. 2행·status=pending 인지 확인한 뒤 02를 실행.
-- 이것만 복사 → Run.

SELECT
  id,
  order_no,
  store_code,
  table_name,
  order_type,
  status,
  total,
  COALESCE(payment_cash, 0)
    + COALESCE(payment_card, 0)
    + COALESCE(payment_qr, 0)
    + COALESCE(payment_other, 0)
    + COALESCE(payment_delivery_app, 0) AS payment_sum,
  created_at,
  memo
FROM public.pos_orders
WHERE order_no IN (
  'CMFUTUREPARK-20260916-002',
  'CMFUTUREPARK-20260916-003'
)
ORDER BY order_no;
