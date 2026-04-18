-- =============================================================================
-- pos_printer_settings 없음 (ERROR 42P01) 또는 ESC/POS 절단 컬럼만 추가할 때
-- Supabase 대시보드 → SQL Editor → **본인 프로젝트** 선택 후 실행 (멱등)
-- =============================================================================

-- 1) 테이블이 아예 없을 때: 최소 스키마 (기존 supabase_pos_printer_settings.sql 과 동일 계열)
CREATE TABLE IF NOT EXISTS public.pos_printer_settings (
  store_code text NOT NULL PRIMARY KEY,
  kitchen_mode integer DEFAULT 1,
  kitchen1_categories jsonb DEFAULT '[]'::jsonb,
  kitchen2_categories jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- 2) Windows 하이브리드 절단 설정 (관리자 POS 프린터 설정 UI)
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_kitchen_html boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_hall_order_html boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_payment_receipt_html boolean DEFAULT false;

COMMENT ON COLUMN public.pos_printer_settings.esc_pos_cut_after_kitchen_html IS
  'Windows 설치형 POS: 주방 주문서 인쇄 후 ESC/POS 절단';
COMMENT ON COLUMN public.pos_printer_settings.esc_pos_cut_after_hall_order_html IS
  'Windows 설치형 POS: 홀/터미널 주문서 인쇄 후 절단';
COMMENT ON COLUMN public.pos_printer_settings.esc_pos_cut_after_payment_receipt_html IS
  'Windows 설치형 POS: 결제 영수증 인쇄 후 절단';
