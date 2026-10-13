-- 3/3 보충: Siam Food Services 품목(CM030, SS009) 누락 본사 출고 로그(stock_logs Outbound) INSERT — 출고 내역·인보이스 청구 근거
-- 반드시 1/3(직접정산 해제) 후, 2/3 미리보기 행 확인 후 실행. 조건은 2/3과 동일.
-- stock_logs 만 INSERT — pos_orders 미변경(POS 자동인쇄 무관). 이미 출고 로그가 있는 줄은 건너뛴다(재실행 안전).
-- 본사 재고가 보충 수량만큼 차감된다. 9/25 이후 본사 CM030·SS009 실사 조정을 했다면 실행 전에 확인할 것.

BEGIN;

WITH lines AS (
  SELECT
    o.id AS order_id,
    upper(btrim(line.val->>'code')) AS code,
    (line.ord - 1) AS idx,
    line.val,
    nullif(btrim(o.received_qty_json::text), '') AS rq
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.cart_json::jsonb) WITH ORDINALITY AS line(val, ord)
  WHERE o.status = 'Approved'
    AND o.order_date >= '2026-09-20'
    AND o.delivery_status IN ('배송완료', '일부배송완료')
    AND upper(btrim(coalesce(line.val->>'code', ''))) IN ('CM030', 'SS009')
    AND nullif(btrim(o.received_indices::text), '')::jsonb @> to_jsonb((line.ord - 1)::int)
),
sib AS (
  SELECT DISTINCT ON (sl.order_id) sl.order_id, sl.log_date, sl.vendor_target
  FROM public.stock_logs sl
  WHERE sl.order_id IN (SELECT order_id FROM lines)
    AND sl.log_type = 'Outbound'
    AND coalesce(sl.is_deleted, false) = false
  ORDER BY sl.order_id, sl.id
)
INSERT INTO public.stock_logs (
  location, item_code, item_name, spec, qty, log_date, vendor_target, log_type, order_id, invoice_unit_price
)
SELECT
  '본사',
  l.code,
  coalesce(nullif(btrim(l.val->>'name'), ''), l.code),
  coalesce(nullif(btrim(l.val->>'spec'), ''), '-'),
  -abs(coalesce(l.rq::jsonb->>l.idx::text, l.val->>'qty')::numeric),
  s.log_date,
  s.vendor_target,
  'Outbound',
  l.order_id,
  (l.val->>'price')::numeric
FROM lines l
JOIN sib s ON s.order_id = l.order_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stock_logs x
  WHERE x.order_id = l.order_id
    AND x.log_type = 'Outbound'
    AND upper(btrim(coalesce(x.item_code, ''))) = l.code
    AND coalesce(x.is_deleted, false) = false
)
RETURNING id, order_id, item_code, vendor_target, log_date, qty, invoice_unit_price;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('cm030_direct_settlement_fix_03_backfill.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;

COMMIT;
