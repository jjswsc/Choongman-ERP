-- 회원앱 혜택 탭 — 쿠폰 카탈로그·셀프 수령(무료/포인트 교환)
ALTER TABLE public.pos_coupons
  ADD COLUMN IF NOT EXISTS portal_image_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS portal_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS portal_claim_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS portal_point_cost INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portal_max_claims_per_member INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS portal_sort_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_coupons.portal_image_url IS
  'Member app coupon card image URL.';
COMMENT ON COLUMN public.pos_coupons.portal_visible IS
  'When true, show in member app Benefits coupon catalog (portal_claim_mode free|points).';
COMMENT ON COLUMN public.pos_coupons.portal_claim_mode IS
  'none | free (collect) | points (redeem with portal_point_cost).';
COMMENT ON COLUMN public.pos_coupons.portal_point_cost IS
  'Points deducted on self-claim when portal_claim_mode = points.';
COMMENT ON COLUMN public.pos_coupons.portal_max_claims_per_member IS
  'Max times a member may claim this coupon via portal (lifetime, non-cancelled issues).';
COMMENT ON COLUMN public.pos_coupons.portal_sort_order IS
  'Catalog sort order (ascending).';
