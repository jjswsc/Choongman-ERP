-- ⚠️ 영업 중·POS 켜진 상태 실행 금지 — 전 매장 마감 후(심야)에만 실행
-- 이미 결제완료 주문의 payment_* UPDATE → Realtime 전달. unpaid→paid 전환이 아니라 재인쇄 가드에 걸리지만, 규칙상 마감 후 실행.
-- 실행 전 grab_cash_to_delivery_app_01_preview.sql 로 건수·금액 확인.
-- Grab 웹훅 주문의 현금 기록(payment_cash)을 배달앱 결제(Grab)로 옮긴다 — 최근 14일
BEGIN;

UPDATE public.pos_orders o
SET
  payment_delivery_app = ROUND((COALESCE(o.payment_delivery_app, 0) + o.payment_cash)::numeric, 2),
  payment_cash = 0,
  delivery_payment_channel = 'grab'
WHERE o.created_at >= now() - interval '14 days'
  AND o.memo ILIKE '%grab_order:%'
  AND o.status IN ('paid', 'completed')
  AND COALESCE(o.payment_cash, 0) > 0
  AND COALESCE(o.payment_card, 0) = 0
  AND COALESCE(o.payment_qr, 0) = 0
  AND COALESCE(o.payment_other, 0) = 0;

COMMIT;

DO $$ BEGIN
 IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
 INSERT INTO public.sql_applied_log (file_name) VALUES ('grab_cash_to_delivery_app_03_apply.sql')
 ON CONFLICT (file_name) DO UPDATE
 SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
 END IF;
END $$;
