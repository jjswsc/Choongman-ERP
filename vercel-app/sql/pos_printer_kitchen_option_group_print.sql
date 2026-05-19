-- POS 프린터 설정: 주방 주문서 옵션 그룹별 출력 정책(JSON)
alter table if exists public.pos_printer_settings
  add column if not exists kitchen_slip_option_group_print jsonb not null default
  '{"size": true, "part": true, "flavor": true, "side": true, "other": true}'::jsonb;

comment on column public.pos_printer_settings.kitchen_slip_option_group_print
  is 'Kitchen slip option group print flags: size/part/flavor/side/other';

