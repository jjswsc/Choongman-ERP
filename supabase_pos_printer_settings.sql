-- ============================================================
-- POS 프린터 설정 - Supabase 테이블
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 매장별 프린터 설정
-- kitchen_mode: 1=주방 1대(통합), 2=주방 2대(카테고리별)
-- kitchen1_categories, kitchen2_categories: JSON 배열, 해당 프린터로 출력할 카테고리
CREATE TABLE IF NOT EXISTS pos_printer_settings (
  store_code TEXT NOT NULL PRIMARY KEY,
  kitchen_mode INT DEFAULT 1,
  kitchen1_categories JSONB DEFAULT '[]',
  kitchen2_categories JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
