-- pos_connected_devices: 출퇴근 QR 전용 단말 역할 추가
-- 적용: Supabase SQL Editor에서 1회 실행

alter table public.pos_connected_devices drop constraint if exists pos_connected_devices_role_check;

alter table public.pos_connected_devices
  add constraint pos_connected_devices_role_check
  check (role in ('main', 'order', 'attendance_display'));

comment on column public.pos_connected_devices.role is
  'main: 메인 POS, order: 주문 단말, attendance_display: 출퇴근 QR 표시 전용';
