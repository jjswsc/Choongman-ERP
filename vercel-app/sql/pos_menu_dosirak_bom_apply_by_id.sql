-- K001~K003 도시락 BOM 직접 복제 (menu_id·source code 명시)
--
-- K027/K028/K029 는 option_id=null base BOM 8~9건 확인됨.
-- 이 스크립트는 source menu id 를 code 로 조회한 뒤 3쌍을 각각 INSERT.
-- INSERT 0건이면 EXCEPTION 으로 중단.
--
-- 매핑: K001(69)←K029, K002(67)←K027, K003(68)←K028

begin;

do $$
declare
  k001_id bigint := 69;
  k002_id bigint := 67;
  k003_id bigint := 68;
  k027_id bigint;
  k028_id bigint;
  k029_id bigint;
  n int;
begin
  select id into k029_id
  from public.pos_menus
  where upper(trim(code)) = 'K029'
  order by (is_active is true) desc, id asc
  limit 1;

  select id into k027_id
  from public.pos_menus
  where upper(trim(code)) = 'K027'
  order by (is_active is true) desc, id asc
  limit 1;

  select id into k028_id
  from public.pos_menus
  where upper(trim(code)) = 'K028'
  order by (is_active is true) desc, id asc
  limit 1;

  if k029_id is null or k027_id is null or k028_id is null then
    raise exception 'K027/K028/K029 메뉴 id 를 찾을 수 없습니다. k027=%, k028=%, k029=%',
      k027_id, k028_id, k029_id;
  end if;

  delete from public.pos_menu_ingredients
  where menu_id in (k001_id, k002_id, k003_id)
    and (option_id is null or option_id = 0);

  insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
  select k001_id, null, i.item_code, i.quantity, coalesce(i.loss_rate, 0), coalesce(i.ingredient_type, 'food')
  from public.pos_menu_ingredients i
  where i.menu_id = k029_id
    and (i.option_id is null or i.option_id = 0);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'K001←K029 복제 0건 (source menu_id=%)', k029_id;
  end if;

  insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
  select k002_id, null, i.item_code, i.quantity, coalesce(i.loss_rate, 0), coalesce(i.ingredient_type, 'food')
  from public.pos_menu_ingredients i
  where i.menu_id = k027_id
    and (i.option_id is null or i.option_id = 0);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'K002←K027 복제 0건 (source menu_id=%)', k027_id;
  end if;

  insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
  select k003_id, null, i.item_code, i.quantity, coalesce(i.loss_rate, 0), coalesce(i.ingredient_type, 'food')
  from public.pos_menu_ingredients i
  where i.menu_id = k028_id
    and (i.option_id is null or i.option_id = 0);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'K003←K028 복제 0건 (source menu_id=%)', k028_id;
  end if;
end $$;

-- 소스코드 → linked_item_code
update public.pos_menu_ingredients i
set item_code = coalesce(nullif(trim(s.linked_item_code), ''), trim(s.code))
from public.sauces s
where i.menu_id in (67, 68, 69)
  and (i.option_id is null or i.option_id = 0)
  and upper(trim(s.code)) = upper(trim(i.item_code));

update public.pos_menu_ingredients i
set menu_code = pm.code
from public.pos_menus pm
where pm.id = i.menu_id
  and i.menu_id in (67, 68, 69)
  and trim(coalesce(pm.code, '')) <> ''
  and (
    i.menu_code is null
    or trim(i.menu_code) = ''
    or lower(trim(i.menu_code)) <> lower(trim(pm.code))
  );

commit;

-- 검증
select m.code, m.id, count(i.id) as bom_cnt
from public.pos_menus m
left join public.pos_menu_ingredients i
  on i.menu_id = m.id and (i.option_id is null or i.option_id = 0)
where m.id in (67, 68, 69)
group by m.code, m.id
order by m.code;

select m.code as menu_code, i.item_code, count(*) as bad_rows
from public.pos_menu_ingredients i
join public.pos_menus m on m.id = i.menu_id
left join public.items it on trim(it.code) = trim(i.item_code)
left join public.sauces s on upper(trim(s.code)) = upper(trim(i.item_code))
where m.id in (67, 68, 69)
  and (i.option_id is null or i.option_id = 0)
  and trim(coalesce(i.item_code, '')) <> ''
  and it.code is null and s.code is null
group by m.code, i.item_code
order by m.code, i.item_code;

-- source id 확인 (에러 시 참고)
select code, id, name, is_active
from public.pos_menus
where upper(trim(code)) in ('K027', 'K028', 'K029', 'K001', 'K002', 'K003')
order by code, id;
