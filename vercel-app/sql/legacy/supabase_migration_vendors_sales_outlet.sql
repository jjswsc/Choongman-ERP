-- ============================================================
-- vendors.sales_outlet 컬럼 추가
-- gps_name = 매장(직영/가맹점), sales_outlet = 판매처(매장 아닌 외부 매출처)
-- 사용법: Supabase SQL Editor → 붙여넣기 → Run
-- ============================================================

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS sales_outlet TEXT DEFAULT NULL;
COMMENT ON COLUMN vendors.sales_outlet IS '판매처 표시명 (매장이 아닌 외부 매출처). gps_name=매장, sales_outlet=판매처';
