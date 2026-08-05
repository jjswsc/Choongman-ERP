-- =============================================================================
-- Diagnose / fix: birthday coupon saved but total not reduced
-- Order: CMTHESTREET-20260801-015 (The Street, 2026-08-01)
--
-- 증상: 종이 영수증 TOTAL 947 / POS ใบเสร็จ ยอดรวม 1,196
-- 원인: coupon_code·coupon_discount_amt·applied_coupons 는 저장됐으나
--       discount_amt=0, total=1196 으로 가격 미반영 (재검증 0 + appliedPre 보존)
--
-- ⚠️ 영업 중·POS 켠 상태 대량 UPDATE 금지. 이 파일은 단건 보정만.
-- =============================================================================

-- 1) 미리보기
SELECT
  id,
  order_no,
  store_code,
  status,
  subtotal,
  discount_amt,
  discount_reason,
  coupon_code,
  coupon_discount_amt,
  applied_coupons,
  vat,
  total,
  payment_qr,
  payment_cash,
  payment_card,
  payment_other,
  member_no,
  paid_at
FROM pos_orders
WHERE order_no = 'CMTHESTREET-20260801-015';

-- 2) 동일 패턴(쿠폰액 있음·discount_amt 미반영·결제액≈subtotal-쿠폰) 샘플
SELECT
  id,
  order_no,
  store_code,
  subtotal,
  discount_amt,
  coupon_code,
  coupon_discount_amt,
  total,
  (COALESCE(payment_cash, 0) + COALESCE(payment_card, 0) + COALESCE(payment_qr, 0)
    + COALESCE(payment_other, 0) + COALESCE(payment_delivery_app, 0)) AS paid_sum
FROM pos_orders
WHERE coupon_discount_amt > 0.02
  AND COALESCE(discount_amt, 0) + 0.02 < coupon_discount_amt
  AND paid_at >= '2026-08-01'::timestamptz
ORDER BY id DESC
LIMIT 50;

-- 3) 단건 보정 (미리보기 확인 후 실행)
-- VAT included 7%: 947 * 7/107 ≈ 61.95
UPDATE pos_orders
SET
  discount_amt = 249,
  discount_reason = COALESCE(NULLIF(trim(discount_reason), ''), 'Coupon: CMHBDCOUPON'),
  vat = ROUND((947::numeric) * 7 / 107, 2),
  total = 947,
  updated_at = now()
WHERE id = 65125
  AND order_no = 'CMTHESTREET-20260801-015'
  AND ABS(COALESCE(total, 0) - 1196) < 0.02
  AND ABS(COALESCE(coupon_discount_amt, 0) - 249) < 0.02
  AND ABS(COALESCE(discount_amt, 0)) < 0.02;

-- 4) 검증
SELECT
  id,
  order_no,
  discount_amt,
  coupon_discount_amt,
  vat,
  total,
  payment_qr,
  discount_reason
FROM pos_orders
WHERE id = 65125;
