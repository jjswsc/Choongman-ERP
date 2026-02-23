-- ============================================================
-- 매출 관리: POS 엑셀 업로드 → 기간별/배달앱별/메뉴별 분석
-- ============================================================

-- 1. 업로드 이력 (메타)
CREATE TABLE IF NOT EXISTS pos_sales_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT,
  year_month TEXT,
  row_count INT DEFAULT 0,
  total_sales NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_imports_year_month ON pos_sales_imports(year_month);
CREATE INDEX IF NOT EXISTS idx_pos_sales_imports_created ON pos_sales_imports(created_at DESC);

-- 2. 상세 데이터 (엑셀 행 단위)
CREATE TABLE IF NOT EXISTS pos_sales_details (
  id BIGSERIAL PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES pos_sales_imports(id) ON DELETE CASCADE,
  sales_datetime TIMESTAMPTZ NOT NULL,
  receipt_no TEXT,
  is_void BOOLEAN DEFAULT FALSE,
  pos TEXT,
  channel TEXT,
  menu_name TEXT,
  barcode TEXT,
  unit_price NUMERIC(12,2) DEFAULT 0,
  qty INT DEFAULT 0,
  menu_sale_price NUMERIC(12,2) DEFAULT 0,
  receipt_total NUMERIC(12,2) DEFAULT 0,
  payment_amount NUMERIC(12,2) DEFAULT 0,
  staff TEXT,
  cash NUMERIC(12,2) DEFAULT 0,
  card NUMERIC(12,2) DEFAULT 0,
  line_delivery NUMERIC(12,2) DEFAULT 0,
  grab NUMERIC(12,2) DEFAULT 0,
  shopee NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_details_import ON pos_sales_details(import_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_details_datetime ON pos_sales_details(sales_datetime);
CREATE INDEX IF NOT EXISTS idx_pos_sales_details_channel ON pos_sales_details(channel);
CREATE INDEX IF NOT EXISTS idx_pos_sales_details_menu ON pos_sales_details(menu_name);
CREATE INDEX IF NOT EXISTS idx_pos_sales_details_receipt ON pos_sales_details(import_id, receipt_no);
