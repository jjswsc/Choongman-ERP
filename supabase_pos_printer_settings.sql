-- ============================================================
-- POS 프린터 설정 - Supabase 테이블
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 매장별 프린터 설정 (주방 1대/2대, 카테고리 매핑)
CREATE TABLE IF NOT EXISTS pos_printer_settings (
  store_code TEXT NOT NULL PRIMARY KEY,
  kitchen_count INT DEFAULT 1,
  kitchen1_categories JSONB DEFAULT '[]',
  kitchen2_categories JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE pos_printer_settings IS 'POS 매장별 주방 프린터 설정 (1대: 통합, 2대: 카테고리별)';
