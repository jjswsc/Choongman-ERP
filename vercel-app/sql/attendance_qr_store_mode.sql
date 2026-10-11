-- 매장별 출퇴근 QR 모드
-- rotating: 방콕시간 2시간마다 변경 (기본, 행이 없어도 동일)
-- fixed: QR 고정. 화면 캡처로 현장 없이 출퇴근할 수 있음
--
-- Supabase SQL Editor에 이 파일 전체를 한 번 붙여넣고 Run.

-- 이미 테이블이 있는 DB는 attendance_qr_store_mode_tenant_pk.sql 로 기본키를 (tenant_id, store_code)로 바꾼다.
create table if not exists public.attendance_qr_store_settings (
  tenant_id text not null default '',
  store_code text not null,
  mode text not null default 'rotating' check (mode in ('rotating', 'fixed')),
  updated_at timestamptz not null default now(),
  constraint attendance_qr_store_settings_pkey primary key (tenant_id, store_code)
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
