-- ============================================================
-- POS 쿠폰·할인 - Supabase 테이블
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 쿠폰 (코드 입력 시 할인 적용)
CREATE TABLE IF NOT EXISTS pos_coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT DEFAULT '',
  discount_type TEXT NOT NULL DEFAULT 'amount',
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  max_uses INT DEFAULT NULL,
  used_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_coupons_code ON pos_coupons(code);
CREATE INDEX IF NOT EXISTS idx_pos_coupons_active ON pos_coupons(is_active);

-- pos_orders 할인 컬럼 추가
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT NULL;
