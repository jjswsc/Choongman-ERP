-- 배달앱 API 주문 discount_reason 일회성 보정 (할인 분석「배달·플랫폼」)
-- Supabase SQL Editor에서 실행. 적용 전 SELECT로 건수 확인 권장.

-- Grab
UPDATE public.pos_orders
SET
  discount_reason = 'Grab platform promo',
  updated_at = NOW()
WHERE order_type = 'delivery'
  AND discount_amt > 0
  AND (
    LOWER(COALESCE(delivery_app_code, '')) LIKE '%grab%'
    OR memo ILIKE '%grab_order:%'
  )
  AND COALESCE(TRIM(discount_reason), '') <> 'Grab platform promo';

-- Shopee (레거시 ShopeeFood 문구 포함 정규화)
UPDATE public.pos_orders
SET
  discount_reason = 'Shopee platform promo',
  updated_at = NOW()
WHERE order_type = 'delivery'
  AND discount_amt > 0
  AND LOWER(COALESCE(delivery_app_code, '')) LIKE '%shopee%'
  AND COALESCE(TRIM(discount_reason), '') <> 'Shopee platform promo';
