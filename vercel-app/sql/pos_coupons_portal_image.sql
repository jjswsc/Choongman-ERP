-- 회원앱 「내 혜택」 쿠폰 카드 디자인 이미지
ALTER TABLE public.pos_coupons
  ADD COLUMN IF NOT EXISTS portal_image_url TEXT DEFAULT '';

COMMENT ON COLUMN public.pos_coupons.portal_image_url IS
  'Member app privilege tab coupon card image (uploaded from CRM coupon definitions).';
