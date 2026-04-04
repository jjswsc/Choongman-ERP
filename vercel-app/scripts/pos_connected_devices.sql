-- POS 접속 기기 목록: 매장별 메인/주문 단말 조회·컨트롤용
-- 터미널 접속 시 registerPosDevice로 등록, 관리자에서 목록 조회·메인 지정·접속 해제 가능
--
-- 적용: Supabase Dashboard → SQL Editor → 아래 전체 실행 (한 번이면 됨)
-- 오류 PGRST205 "Could not find the table ... pos_connected_devices" → 이 스크립트 미실행 상태일 때 발생
create table if not exists public.pos_connected_devices (
  store_code text not null,
  device_token text not null,
  role text not null default 'order' check (role in ('main', 'order')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  display_label text,
  client_hint text,
  primary key (store_code, device_token)
);

comment on table public.pos_connected_devices is 'POS 터미널 접속 기기 (메인/주문). last_seen_at으로 접속 여부 갱신';
comment on column public.pos_connected_devices.role is 'main: 메인 포스 1대, order: 주문 단말';
comment on column public.pos_connected_devices.display_label is '관리자가 지정한 표시 이름(선택). 목록에서 기기 구분용';
comment on column public.pos_connected_devices.client_hint is '단말이 보낸 식별 힌트(UA·OS 등). 접속 시 자동 갱신';

-- 이미 예전 스크립트로 테이블만 만든 경우: 컬럼 추가
alter table public.pos_connected_devices add column if not exists display_label text;
alter table public.pos_connected_devices add column if not exists client_hint text;

-- RLS: 서버(service_role)는 RLS를 우회하여 접근. anon은 정책 없으면 접근 불가.
alter table public.pos_connected_devices enable row level security;

-- API(서버)에서 service_role로 접근 가능하도록 (프로젝트 기본 GRANT와 맞춤)
grant select, insert, update, delete on table public.pos_connected_devices to service_role;
grant select, insert, update, delete on table public.pos_connected_devices to postgres;
