-- ============================================================
-- POS 쿠폰 - Supabase 테이블
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- discount_type: 'percent' = %, 'fixed' = ฿
-- discount_value: 퍼센트면 1-100, 고정이면 금액
CREATE TABLE IF NOT EXISTS pos_coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_from DATE DEFAULT NULL,
  valid_to DATE DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_coupons_code ON pos_coupons(code);
CREATE INDEX IF NOT EXISTS idx_pos_coupons_active ON pos_coupons(is_active);
