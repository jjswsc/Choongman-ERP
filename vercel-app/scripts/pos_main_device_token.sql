-- POS 메인 포스 1대 지정: 매장당 등록된 기기만 주문 수신·자동 인쇄
-- 관리자 > POS 설정 > 단말 설정에서 해제 가능
alter table public.pos_printer_settings add column if not exists main_device_token text;
