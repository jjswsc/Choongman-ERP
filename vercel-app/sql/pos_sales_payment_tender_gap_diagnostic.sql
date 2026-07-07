-- POS 매출 vs 결제수단 불일치 진단·정정 가이드
-- Supabase SQL Editor에서 실행. p_store_code·기간은 필요 시 수정.
--
-- ERP 매출 관리 「기간별」: sum(total) vs sum(payment_*) 가 다르면 아래 주문들이 원인입니다.
-- 정정 API: POST /api/correctPosOrderPayment (당일·전일 영업일, Bearer 인증, reason 필수)
-- 영수증 관리 UI에서도 동일 API 호출 가능.

-- ============================================================
-- 0) 파라미터
-- ============================================================
-- p_store_code 예: 'CM True Digital'
-- p_start_ymd / p_end_ymd 예: '2026-05-01' ~ '2026-05-31'

-- ============================================================
-- 1) 주문 단위 — 결제 합계 ≠ total (완료·결제·준비완료)
-- ============================================================
WITH params AS (
  SELECT
    'CM True Digital'::text AS store_code,
    '2026-05-01'::date AS start_ymd,
    '2026-05-31'::date AS end_ymd
),
paid_like AS (
  SELECT
    o.id,
    o.order_no,
    o.store_code,
    o.status,
    o.order_type,
    o.delivery_app_code,
    o.total,
    o.service_amt,
    o.payment_cash,
    o.payment_card,
    o.payment_qr,
    o.payment_other,
    o.payment_delivery_app,
    (
      coalesce(o.payment_cash, 0)
      + coalesce(o.payment_card, 0)
      + coalesce(o.payment_qr, 0)
      + coalesce(o.payment_other, 0)
      + coalesce(o.payment_delivery_app, 0)
    ) AS payment_sum,
    o.created_at,
    o.paid_at,
    o.memo
  FROM public.pos_orders o
  CROSS JOIN params p
  WHERE btrim(coalesce(o.store_code, '')) = p.store_code
    AND o.created_at >= (p.start_ymd::text || 'T00:00:00+07:00')::timestamptz
    AND o.created_at < ((p.end_ymd + 1)::text || 'T00:00:00+07:00')::timestamptz
    AND lower(btrim(coalesce(o.status, ''))) IN ('completed', 'paid', 'ready')
)
SELECT
  id,
  order_no,
  status,
  order_type,
  delivery_app_code,
  round(coalesce(total, 0)::numeric, 2) AS total,
  round(payment_sum::numeric, 2) AS payment_sum,
  round((coalesce(total, 0) - payment_sum)::numeric, 2) AS gap,
  round(coalesce(service_amt, 0)::numeric, 2) AS service_amt,
  payment_cash,
  payment_card,
  payment_qr,
  payment_other,
  payment_delivery_app,
  created_at,
  paid_at
FROM paid_like
WHERE abs(coalesce(total, 0) - payment_sum) > 0.02
ORDER BY abs(coalesce(total, 0) - payment_sum) DESC, created_at;

-- ============================================================
-- 2) 일별 집계 — 매출 관리 스프레드시트 diff 와 동일 비교
-- ============================================================
WITH params AS (
  SELECT
    'CM True Digital'::text AS store_code,
    '2026-05-01'::date AS start_ymd,
    '2026-05-31'::date AS end_ymd
),
daily AS (
  SELECT
    (timezone('Asia/Bangkok', o.created_at))::date AS biz_day,
    count(*) AS order_cnt,
    round(sum(coalesce(o.total, 0))::numeric, 2) AS total_sales,
    round(sum(
      coalesce(o.payment_cash, 0)
      + coalesce(o.payment_card, 0)
      + coalesce(o.payment_qr, 0)
      + coalesce(o.payment_other, 0)
      + coalesce(o.payment_delivery_app, 0)
    )::numeric, 2) AS payment_sum
  FROM public.pos_orders o
  CROSS JOIN params p
  WHERE btrim(coalesce(o.store_code, '')) = p.store_code
    AND o.created_at >= (p.start_ymd::text || 'T00:00:00+07:00')::timestamptz
    AND o.created_at < ((p.end_ymd + 1)::text || 'T00:00:00+07:00')::timestamptz
    AND lower(btrim(coalesce(o.status, ''))) IN ('completed', 'paid', 'ready')
  GROUP BY 1
)
SELECT
  biz_day,
  order_cnt,
  total_sales,
  payment_sum,
  round((total_sales - payment_sum)::numeric, 2) AS diff
FROM daily
WHERE abs(total_sales - payment_sum) > 0.02
ORDER BY biz_day;

-- ============================================================
-- 3) CM True Digital — 2026-05 불일치 10건 (2026-06-08 정정 완료, 감사 참고)
-- ============================================================
-- id    | order_no                         | gap  | 정정 방식
-- 3663  | CMTRUEDIGITA-20260512-083        | 1046 | payment_other
-- 4110  | CMTRUEDIGITA-20260515-005        |  289 | payment_delivery_app (grab)
-- 4112  | CMTRUEDIGITA-20260515-006        | 1414 | payment_delivery_app (grab)
-- 4114  | CMTRUEDIGITA-20260515-007        |  260 | payment_delivery_app (lineman)
-- 4124  | CMTRUEDIGITA-20260515-012        |  111 | payment_delivery_app (grab)
-- 4128  | CMTRUEDIGITA-20260515-014        |  111 | payment_delivery_app (grab)
-- 4136  | CMTRUEDIGITA-20260515-022        |  239 | payment_other (takeout)
-- 4141  | CMTRUEDIGITA-20260515-027        |  149 | payment_delivery_app (grab)
-- 4666  | CMTRUEDIGITA-20260517-032        | 1188 | payment_other
-- 8942  | CMTRUEDIGITA-20260529-072        |  229 | payment_other += service_comp (QR 1460 유지)

-- ============================================================
-- 4) 일괄 정정 SQL 템플릿 (실행 전 §1 결과로 id·금액 확인)
-- ============================================================
-- 배달앱 단독 (Grab/Lineman 등):
-- UPDATE public.pos_orders SET
--   payment_delivery_app = total,
--   payment_cash = 0, payment_card = 0, payment_qr = 0, payment_other = 0,
--   delivery_payment_channel = 'grab',
--   memo = coalesce(memo, '') || E'\n[PAY_GAP_FIX manual] 결제수단 정정'
-- WHERE id = 4112 AND abs(total - coalesce(payment_delivery_app,0)) > 0.02;
--
-- 홀·포장 (수단 불명 → 기타):
-- UPDATE public.pos_orders SET
--   payment_other = total,
--   payment_cash = 0, payment_card = 0, payment_qr = 0, payment_delivery_app = 0,
--   payment_other_breakdown = jsonb_build_object('uncategorized', total),
--   memo = coalesce(memo, '') || E'\n[PAY_GAP_FIX manual] 결제수단 정정'
-- WHERE id = 3663;
--
-- 서비스(컴)만큼 결제 부족:
-- UPDATE public.pos_orders SET
--   payment_other = coalesce(payment_other, 0) + 229,
--   payment_other_breakdown = coalesce(payment_other_breakdown, '{}'::jsonb)
--     || jsonb_build_object('service_comp', 229)
-- WHERE id = 8942;

-- ============================================================
-- 5) API 정정 (영수증 관리·스크립트) — correctPosOrderPayment
-- ============================================================
-- POST /api/correctPosOrderPayment
-- Authorization: Bearer <JWT>
-- Body 예:
-- {
--   "id": 3663,
--   "reason": "매출·결제수단 불일치 정정",
--   "paymentCash": 0,
--   "paymentCard": 0,
--   "paymentQr": 0,
--   "paymentOther": 1046,
--   "paymentDeliveryApp": 0
-- }
-- ============================================================
-- 6) 자동 보정 SQL (서비스 컴·배달앱 단독) — §1 실행 후 적용
-- ============================================================
-- 서비스(컴) gap = service_amt:
-- UPDATE public.pos_orders o SET
--   payment_other = coalesce(o.payment_other, 0) + round((coalesce(o.total,0) - (
--     coalesce(o.payment_cash,0)+coalesce(o.payment_card,0)+coalesce(o.payment_qr,0)+
--     coalesce(o.payment_other,0)+coalesce(o.payment_delivery_app,0)
--   ))::numeric, 2),
--   payment_other_breakdown = coalesce(o.payment_other_breakdown, '{}'::jsonb)
--     || jsonb_build_object('service_comp', round((coalesce(o.total,0) - (...))::numeric, 2)),
--   memo = coalesce(o.memo, '') || E'\n[PAY_GAP_FIX auto] service_comp'
-- FROM gaps g WHERE o.id = g.id AND abs(g.gap - coalesce(o.service_amt,0)) <= 0.02;
--
-- 배달앱 단독(다른 채널 0):
-- UPDATE public.pos_orders SET payment_delivery_app = total, payment_cash = 0, ...
-- WHERE order_type = 'delivery' AND delivery_app_code IS NOT NULL AND gap > 0.02;
