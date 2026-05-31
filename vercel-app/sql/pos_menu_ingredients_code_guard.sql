-- POS BOM 코드 중심 매핑 가드
--
-- 목적:
-- - pos_menu_ingredients에 menu_code 스냅샷을 함께 저장
-- - menu_id 변경/코드 정리 작업이 있어도 코드 기반으로 추적 가능
--
-- 실행: Supabase SQL Editor에서 전체 실행

begin;

alter table if exists public.pos_menu_ingredients
  add column if not exists menu_code text;

-- 기존 데이터 백필 (menu_id 기준)
update public.pos_menu_ingredients i
set menu_code = pm.code
from public.pos_menus pm
where pm.id = i.menu_id
  and trim(coalesce(pm.code, '')) <> ''
  and (
    i.menu_code is null
    or trim(i.menu_code) = ''
    or lower(trim(i.menu_code)) <> lower(trim(pm.code))
  );

create index if not exists idx_pos_menu_ingredients_menu_code
  on public.pos_menu_ingredients (menu_code);

create or replace function public.sync_pos_menu_ingredients_menu_code()
returns trigger
language plpgsql
as $$
declare
  v_code text;
begin
  if new.menu_id is not null then
    select pm.code into v_code
    from public.pos_menus pm
    where pm.id = new.menu_id
    limit 1;

    if trim(coalesce(v_code, '')) <> '' then
      new.menu_code := v_code;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_sync_pos_menu_ingredients_menu_code
  on public.pos_menu_ingredients;

create trigger trg_sync_pos_menu_ingredients_menu_code
before insert or update of menu_id
on public.pos_menu_ingredients
for each row
execute function public.sync_pos_menu_ingredients_menu_code();

commit;

-- 점검 쿼리
-- select menu_id, menu_code, count(*) from public.pos_menu_ingredients group by menu_id, menu_code order by menu_id, menu_code;
