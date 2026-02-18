-- ============================================================
-- POS 프린터 설정 - 자동 재고 차감 옵션 추가
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- auto_stock_deduction: 매장별로 주문 완료 시 BOM 기반 자동 재고 차감 사용 여부
-- 기본값 false = 사용 안 함 (매장이 적응 후 사용할 수 있도록)
ALTER TABLE pos_printer_settings
ADD COLUMN IF NOT EXISTS auto_stock_deduction BOOLEAN DEFAULT false;
