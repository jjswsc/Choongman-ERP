-- POS 옵션 그룹 고유 코드 도입 (무중단 1차)
-- 목적:
-- 1) group_key/표시명 변경과 내부 식별자 분리
-- 2) 홀/배달/주방/채널 연동 시 문자열 키 혼선 완화
--
-- 적용 순서 (같은 Supabase 프로젝트·SQL Editor):
-- 0) pos_option_groups 테이블 없으면 먼저 실행:
--    vercel-app/sql/pos_option_groups_master_and_menu_links.sql
--    (pos_menus 없으면 해당 마이그레이션도 선행)
-- 1) 이 스크립트 실행 (group_code 컬럼/인덱스/트리거)
-- 2) 앱은 group_key 유지 + API code 필드 병행 (DB 미적용 시 key 파생)
-- 3) 후속: 참조부를 group_code 중심으로 전환

do $$
begin
  if to_regclass('public.pos_option_groups') is null then
    raise exception
      'public.pos_option_groups 가 없습니다. 먼저 pos_option_groups_master_and_menu_links.sql 을 실행하세요.';
  end if;
end $$;

begin;

alter table public.pos_option_groups
  add column if not exists group_code text;

create or replace function public.normalize_pos_option_group_code(raw text)
returns text
language plpgsql
as $$
declare
  v text := upper(coalesce(raw, ''));
begin
  v := regexp_replace(v, '[^A-Z0-9]+', '_', 'g');
  v := regexp_replace(v, '_+', '_', 'g');
  v := regexp_replace(v, '^_+|_+$', '', 'g');
  if v = '' then
    return 'OG_UNSPEC';
  end if;
  return 'OG_' || left(v, 28);
end;
$$;

-- 기존 데이터 1차 백필: group_key 기반 코드
update public.pos_option_groups
set group_code = public.normalize_pos_option_group_code(group_key)
where coalesce(group_code, '') = '';

-- 충돌(같은 코드) 해소: 뒤에 id를 붙여 유니크 보장
with ranked as (
  select
    id,
    group_code,
    row_number() over (partition by group_code order by id) as rn
  from public.pos_option_groups
)
update public.pos_option_groups g
set group_code = left(g.group_code, 24) || '_' || g.id::text
from ranked r
where g.id = r.id
  and r.rn > 1;

-- 신규/수정 시 코드 자동 보정
create or replace function public.set_pos_option_group_code()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.group_code, '') = '' then
    new.group_code := public.normalize_pos_option_group_code(new.group_key);
  else
    new.group_code := public.normalize_pos_option_group_code(new.group_code);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pos_option_groups_set_code on public.pos_option_groups;
create trigger trg_pos_option_groups_set_code
before insert or update on public.pos_option_groups
for each row
execute function public.set_pos_option_group_code();

-- not null + unique (지연 검증)
alter table public.pos_option_groups
  alter column group_code set not null;

create unique index if not exists uq_pos_option_groups_group_code
  on public.pos_option_groups(group_code);

comment on column public.pos_option_groups.group_code
  is '옵션 그룹 고유 코드(내부 식별자). 표기명/키 변경과 분리.';

commit;
