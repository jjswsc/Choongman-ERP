-- POS 접속 기기 목록: 매장별 메인/주문 단말 조회·컨트롤용
-- 터미널 접속 시 registerPosDevice로 등록, 관리자에서 목록 조회·메인 지정·접속 해제 가능
create table if not exists public.pos_connected_devices (
  store_code text not null,
  device_token text not null,
  role text not null default 'order' check (role in ('main', 'order')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (store_code, device_token)
);

comment on table public.pos_connected_devices is 'POS 터미널 접속 기기 (메인/주문). last_seen_at으로 접속 여부 갱신';
comment on column public.pos_connected_devices.role is 'main: 메인 포스 1대, order: 주문 단말';

-- RLS: 서버(service_role)는 RLS를 우회하여 접근. anon은 정책 없으면 접근 불가.
alter table public.pos_connected_devices enable row level security;
