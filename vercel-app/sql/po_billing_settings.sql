-- PO 청구 비율 (매장별). Supabase SQL Editor에서 실행 후 RLS는 환경에 맞게 추가하세요.
-- 서버 API는 service_role 사용 시 RLS를 우회합니다.

create table if not exists public.po_billing_settings (
  store_name text not null primary key,
  royalty_pct numeric not null default 0,
  delivery_gp_pct numeric not null default 0,
  grab_gp_pct numeric not null default 0,
  label_royalty text,
  label_delivery_gp text,
  label_grab_gp text,
  updated_at timestamptz not null default now()
);

comment on table public.po_billing_settings is 'PO 로얄티·배달 GP·Grab GP 청구 비율(%) 및 라벨';

create index if not exists po_billing_settings_updated_at_idx on public.po_billing_settings (updated_at desc);
