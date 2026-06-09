-- POS 단말: 메인/주문 대수 제한 + 현장 자가 변경 잠금
-- 적용: Supabase SQL Editor에서 1회 실행

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS main_device_max_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS order_device_max_count INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS main_device_role_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pos_printer_settings.main_device_max_count IS
  '매장당 메인(카운터) POS 최대 대수. 관리자 단말 설정에서 지정한 기기만 메인.';
COMMENT ON COLUMN public.pos_printer_settings.order_device_max_count IS
  '매장당 주문 단말 최대 대수(최근 접속 기준).';
COMMENT ON COLUMN public.pos_printer_settings.main_device_role_locked IS
  'true면 POS·태블릿에서 메인/주문 역할 변경 불가. DB에 저장된 역할 고정(관리자만 변경).';
 