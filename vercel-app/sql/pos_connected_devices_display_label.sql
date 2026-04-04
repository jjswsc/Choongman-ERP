-- pos_connected_devices: 표시 이름·단말 힌트 컬럼 (기존 테이블에만 추가하면 됨)
-- 신규 설치는 scripts/pos_connected_devices.sql 전체에 포함되어 있습니다.
alter table public.pos_connected_devices add column if not exists display_label text;
alter table public.pos_connected_devices add column if not exists client_hint text;

comment on column public.pos_connected_devices.display_label is '관리자가 지정한 표시 이름(선택). 목록에서 기기 구분용';
comment on column public.pos_connected_devices.client_hint is '단말이 보낸 식별 힌트(UA·OS 등). 접속 시 자동 갱신';
