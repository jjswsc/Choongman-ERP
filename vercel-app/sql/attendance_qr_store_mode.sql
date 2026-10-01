-- 매장별 출퇴근 QR 모드
-- rotating: 방콕시간 2시간마다 변경 (기본, 행이 없어도 동일)
-- fixed: QR 고정. 화면 캡처로 현장 없이 출퇴근할 수 있음
--
-- Supabase SQL Editor에 이 파일 전체를 한 번 붙여넣고 Run.

create table if not exists public.attendance_qr_store_settings (
  store_code text primary key,
  mode text not null default 'rotating' check (mode in ('rotating', 'fixed')),
  updated_at timestamptz not null default now()
);

alter table public.attendance_qr_store_settings
  add column if not exists tenant_id text not null default '';

comment on table public.attendance_qr_store_settings is
  '매장별 출퇴근 QR. rotating=방콕 2시간마다 변경(기본), fixed=고정';

comment on column public.attendance_qr_store_settings.mode is
  'rotating | fixed';

alter table public.attendance_qr_store_settings enable row level security;

grant select, insert, update, delete on table public.attendance_qr_store_settings to service_role;
grant select, insert, update, delete on table public.attendance_qr_store_settings to postgres;
