-- K031 / K032 치킨 도시락 BOM 복구
--
-- 확인된 menu_id:
--   K031 = 385  Soy Sauce Chicken Dosirak
--   K032 = 386  Spicy Yangnyeom Chicken Dosirak
--   K022 = 311  Snow Onion Chicken Dosirak (BOM 16, 원가 표시됨 — 폴백)
--
-- 복제 우선순위 (각 대상마다):
--   1) 이름에 BOWL + (SOY SAUCE CHICKEN | SPICY YANGNYEOM)
--   2) 도시락 제외 동일 치킨명 + base BOM 있음
--   3) code C025 / C028 (ORIGINAL SERIES)
--   4) K022 Snow Onion 도시락 BOM (구조만 동일, 소스는 다를 수 있음)
--
-- 실행: Supabase SQL Editor에서 통째로 실행 (commit 포함)

-- ── 0) 소스 후보 진단 (선택) ──
select
  m.id,
  m.code,
  m.name,
  count(i.id) filter (where i.option_id is null or i.option_id = 0) as base_bom_cnt
from public.pos_menus m
left join public.pos_menu_ingredients i on i.menu_id = m.id
where lower(m.name) like '%soy%sauce%chicken%'
   or lower(m.name) like '%spicy%yangnyeom%'
   or lower(m.name) like '%yangnyeom%chicken%'
   or upper(trim(m.code)) in ('K022', 'K031', 'K032', 'C025', 'C028', 'K033', 'K034', 'K035', 'K036')
group by m.id, m.code, m.name
order by m.code, m.id;

begin;

do $$
declare
  k031_target bigint := 385;
  k032_target bigint := 386;
  k022_fallback bigint := 311;
  k031_source bigint;
  k032_source bigint;
  k031_source_label text;
  k032_source_label text;
  n int;
begin
  -- K031 source
  select m.id,
         coalesce(m.code, '') || ' ' || coalesce(m.name, '')
    into k031_source, k031_source_label
  from public.pos_menus m
  where (
      (lower(m.name) like '%soy%sauce%chicken%' and lower(m.name) like '%bowl%')
      or (
        lower(m.name) like '%soy%sauce%chicken%'
        and lower(m.name) not like '%dosirak%'
        and exists (
          select 1 from public.pos_menu_ingredients i
          where i.menu_id = m.id and (i.option_id is null or i.option_id = 0)
        )
      )
      or upper(trim(m.code)) in ('C025', 'K033', 'K034', 'K035')
    )
  order by
    case when lower(m.name) like '%bowl%' then 0 else 1 end,
    (
      select count(*) from public.pos_menu_ingredients i
      where i.menu_id = m.id and (i.option_id is null or i.option_id = 0)
    ) desc,
    m.id asc
  limit 1;

  if k031_source is null then
    k031_source := k022_fallback;
    k031_source_label := 'K022 fallback';
  end if;

  -- K032 source (SPICY — SWEET 제외)
  select m.id,
         coalesce(m.code, '') || ' ' || coalesce(m.name, '')
    into k032_source, k032_source_label
  from public.pos_menus m
  where (
      (lower(m.name) like '%spicy%yangnyeom%' and lower(m.name) like '%bowl%')
      or (
        lower(m.name) like '%spicy%yangnyeom%'
        and lower(m.name) not like '%dosirak%'
        and lower(m.name) not like '%sweet%'
        and exists (
          select 1 from public.pos_menu_ingredients i
          where i.menu_id = m.id and (i.option_id is null or i.option_id = 0)
        )
      )
      or upper(trim(m.code)) in ('C028', 'K036', 'K037')
    )
  order by
    case when lower(m.name) like '%bowl%' then 0 else 1 end,
    (
      select count(*) from public.pos_menu_ingredients i
      where i.menu_id = m.id and (i.option_id is null or i.option_id = 0)
    ) desc,
    m.id asc
  limit 1;

  if k032_source is null then
    k032_source := k022_fallback;
    k032_source_label := 'K022 fallback';
  end if;

  raise notice 'K031 source: % (id=%)', k031_source_label, k031_source;
  raise notice 'K032 source: % (id=%)', k032_source_label, k032_source;

  delete from public.pos_menu_ingredients
  where menu_id in (k031_target, k032_target)
    and (option_id is null or option_id = 0);

  insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
  select k031_target, null, i.item_code, i.quantity, coalesce(i.loss_rate, 0), coalesce(i.ingredient_type, 'food')
  from public.pos_menu_ingredients i
  where i.menu_id = k031_source
    and (i.option_id is null or i.option_id = 0);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'K031 복제 0건 (source id=%)', k031_source;
  end if;

  insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
  select k032_target, null, i.item_code, i.quantity, coalesce(i.loss_rate, 0), coalesce(i.ingredient_type, 'food')
  from public.pos_menu_ingredients i
  where i.menu_id = k032_source
    and (i.option_id is null or i.option_id = 0);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'K032 복제 0건 (source id=%)', k032_source;
  end if;
end $$;

-- 소스코드 → linked_item_code
update public.pos_menu_ingredients i
set item_code = coalesce(nullif(trim(s.linked_item_code), ''), trim(s.code))
from public.sauces s
where i.menu_id in (385, 386)
  and (i.option_id is null or i.option_id = 0)
  and upper(trim(s.code)) = upper(trim(i.item_code));

update public.pos_menu_ingredients i
set menu_code = pm.code
from public.pos_menus pm
where pm.id = i.menu_id
  and i.menu_id in (385, 386)
  and trim(coalesce(pm.code, '')) <> ''
  and (
    i.menu_code is null
    or trim(i.menu_code) = ''
    or lower(trim(i.menu_code)) <> lower(trim(pm.code))
  );

commit;

-- ── 검증 ──
select m.code, m.id, count(i.id) as bom_cnt
from public.pos_menus m
left join public.pos_menu_ingredients i
  on i.menu_id = m.id and (i.option_id is null or i.option_id = 0)
where m.id in (385, 386, 311)
group by m.code, m.id
order by m.code;

select m.code as menu_code, i.item_code, count(*) as bad_rows
from public.pos_menu_ingredients i
join public.pos_menus m on m.id = i.menu_id
left join public.items it on trim(it.code) = trim(i.item_code)
left join public.sauces s on upper(trim(s.code)) = upper(trim(i.item_code))
where m.id in (385, 386)
  and (i.option_id is null or i.option_id = 0)
  and trim(coalesce(i.item_code, '')) <> ''
  and it.code is null and s.code is null
group by m.code, i.item_code
order by m.code, i.item_code;
