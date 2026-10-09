-- ============================================================
-- POS 테이블 배치 - Supabase 테이블
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 매장별 테이블 배치 (layout_json: [{ id, name, x, y, w, h }, ...])
CREATE TABLE IF NOT EXISTS pos_table_layouts (
  store_code TEXT NOT NULL PRIMARY KEY,
  layout_json JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE pos_table_layouts IS 'POS 매장별 테이블 평면 배치';
