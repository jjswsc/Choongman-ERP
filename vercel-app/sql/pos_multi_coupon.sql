-- POS 다중 쿠폰(영수증당 N장) — Supabase SQL Editor에서 실행
-- Phase 1: loyalty 설정, 쿠폰 템플릿 확장, 주문 적용明細
-- Phase 2: 1회용 시리얼(pos_coupon_serials)

-- 1) 브랜드 공통 loyalty 정책 (1행/브랜드)
CREATE TABLE IF NOT EXISTS public.pos_loyalty_settings (
  brand_key text PRIMARY KEY DEFAULT 'default',
  max_coupons_per_order integer NOT NULL DEFAULT 10,
  coupon_stack_with_manual_discount boolean NOT NULL DEFAULT true,
  coupon_stack_with_points boolean NOT NULL DEFAULT true,
  coupon_calc_base text NOT NULL DEFAULT 'remaining',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pos_loyalty_settings (brand_key)
VALUES ('default')
ON CONFLICT (brand_key) DO NOTHING;

-- 2) pos_coupons 템플릿 확장
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS min_order_amt numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS max_per_order integer NOT NULL DEFAULT 1;
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS redemption_mode text NOT NULL DEFAULT 'reusable_code';
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS allow_quantity_entry boolean NOT NULL DEFAULT false;
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS stack_mode text NOT NULL DEFAULT 'fixed_only';
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS max_discount_amt numeric(14,2);
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS max_uses integer;
ALTER TABLE public.pos_coupons ADD COLUMN IF NOT EXISTS used_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_coupons.redemption_mode IS 'reusable_code | single_use_serial | member_issue';
COMMENT ON COLUMN public.pos_coupons.stack_mode IS 'fixed_only | percent_only | any';

-- 기존 fixed 쿠폰: 다중 장 허용 기본값(브랜드 정책과 함께 사용)
UPDATE public.pos_coupons
SET max_per_order = GREATEST(max_per_order, 10),
    allow_quantity_entry = CASE WHEN redemption_mode = 'reusable_code' THEN true ELSE allow_quantity_entry END
WHERE discount_type <> 'percent'
  AND max_per_order <= 1;

-- 3) pos_orders 스냅샷
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS applied_coupons jsonb;

-- 4) 주문별 쿠폰 적용明細
CREATE TABLE IF NOT EXISTS public.pos_order_coupon_redemptions (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  store_code text NOT NULL,
  coupon_id bigint REFERENCES public.pos_coupons(id),
  coupon_code text NOT NULL,
  discount_amt numeric(14,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  serial_id bigint,
  member_coupon_issue_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_order_coupon_redemptions_order_id
  ON public.pos_order_coupon_redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_coupon_redemptions_store_created
  ON public.pos_order_coupon_redemptions(store_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_order_coupon_redemptions_code
  ON public.pos_order_coupon_redemptions(coupon_code);

-- 5) 1회용 쿠폰 시리얼 (Phase 2)
CREATE TABLE IF NOT EXISTS public.pos_coupon_serials (
  id bigserial PRIMARY KEY,
  coupon_id bigint NOT NULL REFERENCES public.pos_coupons(id) ON DELETE CASCADE,
  serial_code text NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  order_id bigint REFERENCES public.pos_orders(id),
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (serial_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_coupon_serials_coupon_id
  ON public.pos_coupon_serials(coupon_id);
CREATE INDEX IF NOT EXISTS idx_pos_coupon_serials_status
  ON public.pos_coupon_serials(status);

COMMENT ON COLUMN public.pos_coupon_serials.status IS 'issued | redeemed | void';
