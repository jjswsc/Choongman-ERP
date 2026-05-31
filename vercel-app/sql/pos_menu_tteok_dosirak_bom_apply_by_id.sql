-- T001~T003 / K001~K003 BOM 즉시 적용 (menu_id 고정)
--
-- 확인된 menu_id (2026-05):
--   T001=1, T002=2, T003=3
--   K001=69, K002=67, K003=68
--   복제 원본: K029→K001, K027→K002, K028→K003
--
-- 실행: Supabase SQL Editor에서 이 파일만 통째로 실행 (commit 포함)
-- 사전: pos_menu_ingredients_code_guard.sql 1회 실행 권장

begin;

-- 대상 base BOM만 삭제 (옵션별 BOM은 유지)
delete from public.pos_menu_ingredients
where menu_id in (1, 2, 3, 67, 68, 69)
  and (option_id is null or option_id = 0);

-- ── T001 (menu_id=1) ──
insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
select 1, null, x.item_code, x.qty, 0, x.ingredient_type
from (
  values
    ('81', 130::numeric, 'food'::text),
    ('82', 80::numeric, 'food'),
    ('73', 60::numeric, 'food'),
    ('65', 1::numeric, 'food'),
    ('16', 10::numeric, 'food'),
    ('29', 1::numeric, 'food'),
    ('102', 400::numeric, 'food'),
    ('171', 40::numeric, 'food'),
    ('105', 1::numeric, 'packaging'),
    ('117', 1::numeric, 'packaging'),
    ('116', 1::numeric, 'packaging'),
    ('238', 1::numeric, 'packaging'),
    ('264', 1::numeric, 'packaging')
) as x(item_code, qty, ingredient_type);

-- ── T003 (menu_id=3) ──
insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
select 3, null, x.item_code, x.qty, 0, x.ingredient_type
from (
  values
    ('81', 130::numeric, 'food'::text),
    ('82', 80::numeric, 'food'),
    ('73', 60::numeric, 'food'),
    ('128', 100::numeric, 'food'),
    ('16', 10::numeric, 'food'),
    ('29', 1::numeric, 'food'),
    ('102', 400::numeric, 'food'),
    ('65', 1::numeric, 'food'),
    ('171', 40::numeric, 'food'),
    ('105', 1::numeric, 'packaging'),
    ('117', 1::numeric, 'packaging'),
    ('116', 1::numeric, 'packaging'),
    ('238', 1::numeric, 'packaging'),
    ('264', 1::numeric, 'packaging')
) as x(item_code, qty, ingredient_type);

-- ── T002 (menu_id=2) ← T001 복제 ──
insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
select 2, null, i.item_code, i.quantity, coalesce(i.loss_rate, 0), coalesce(i.ingredient_type, 'food')
from public.pos_menu_ingredients i
where i.menu_id = 1
  and (i.option_id is null or i.option_id = 0);

-- ── K001/K002/K003 ← K029/K027/K028 복제 (base 없으면 option_id 최다 버킷) ──
with code_map as (
  select 69::bigint as target_id, 'K029'::text as source_code
  union all select 67, 'K027'
  union all select 68, 'K028'
),
src as (
  select cm.target_id, sm.id as source_id
  from code_map cm
  join public.pos_menus sm on upper(trim(sm.code)) = cm.source_code
),
source_pick as (
  select
    s.target_id,
    s.source_id,
    coalesce(
      (
        select count(*)::int
        from public.pos_menu_ingredients i
        where i.menu_id = s.source_id
          and (i.option_id is null or i.option_id = 0)
      ),
      0
    ) as base_cnt,
    (
      select i.option_id
      from public.pos_menu_ingredients i
      where i.menu_id = s.source_id
        and not (i.option_id is null or i.option_id = 0)
      group by i.option_id
      order by count(*) desc, i.option_id
      limit 1
    ) as fallback_option_id
  from src s
),
picked as (
  select sp.target_id, i.item_code, i.quantity, i.loss_rate, i.ingredient_type
  from source_pick sp
  join public.pos_menu_ingredients i on i.menu_id = sp.source_id
  where
    (sp.base_cnt > 0 and (i.option_id is null or i.option_id = 0))
    or (
      sp.base_cnt = 0
      and sp.fallback_option_id is not null
      and i.option_id = sp.fallback_option_id
    )
)
insert into public.pos_menu_ingredients (menu_id, option_id, item_code, quantity, loss_rate, ingredient_type)
select
  p.target_id,
  null,
  p.item_code,
  p.quantity,
  coalesce(p.loss_rate, 0),
  coalesce(p.ingredient_type, 'food')
from picked p;

-- ── item_code 정규화 (확정 force_code) ──
update public.pos_menu_ingredients
set item_code = v.new_code
from (
  values
    ('73', 'CM019'),
    ('81', 'JD007'),
    ('82', 'JD008'),
    ('171', 'CT013')
) as v(old_code, new_code)
where menu_id in (1, 2, 3, 67, 68, 69)
  and (option_id is null or option_id = 0)
  and trim(item_code) = v.old_code;

-- 엑셀 번호 → items.code (이름 매칭, force_code 제외)
with legacy_hint(excel_no, name_hint) as (
  values
    ('16', 'Onion'),
    ('29', 'Egg'),
    ('65', 'Dried Parsley'),
    ('102', 'water'),
    ('105', 'Food Tray 1000'),
    ('116', 'Chopsticks'),
    ('117', 'Choongman Plastic Bag'),
    ('128', 'Mozzarella Cheese'),
    ('238', 'Food Tray Sealing Film CM Chicken'),
    ('264', 'Food Tray Seal Film Cutter')
),
resolved as (
  select
    lh.excel_no,
    (
      select it.code
      from public.items it
      where lower(regexp_replace(trim(coalesce(it.name, '')), '\s+', ' ', 'g'))
            like '%' || lower(regexp_replace(trim(lh.name_hint), '\s+', ' ', 'g')) || '%'
      order by length(trim(it.name)), it.code
      limit 1
    ) as item_code
  from legacy_hint lh
)
update public.pos_menu_ingredients i
set item_code = r.item_code
from resolved r
where i.menu_id in (1, 2, 3, 67, 68, 69)
  and (i.option_id is null or i.option_id = 0)
  and trim(coalesce(i.item_code, '')) = r.excel_no
  and trim(coalesce(r.item_code, '')) <> '';

-- 소스코드(S005 등) → linked_item_code
update public.pos_menu_ingredients i
set item_code = coalesce(nullif(trim(s.linked_item_code), ''), trim(s.code))
from public.sauces s
where i.menu_id in (1, 2, 3, 67, 68, 69)
  and (i.option_id is null or i.option_id = 0)
  and upper(trim(s.code)) = upper(trim(i.item_code));

-- water(102) 미등록 시 제거
delete from public.pos_menu_ingredients i
where i.menu_id in (1, 2, 3, 67, 68, 69)
  and (i.option_id is null or i.option_id = 0)
  and trim(coalesce(i.item_code, '')) = '102';

-- menu_code 백필 (컬럼 있을 때)
update public.pos_menu_ingredients i
set menu_code = pm.code
from public.pos_menus pm
where pm.id = i.menu_id
  and i.menu_id in (1, 2, 3, 67, 68, 69)
  and trim(coalesce(pm.code, '')) <> ''
  and (
    i.menu_code is null
    or trim(i.menu_code) = ''
    or lower(trim(i.menu_code)) <> lower(trim(pm.code))
  );

commit;

-- ── 검증 (commit 후 실행) ──
select m.code, m.id, count(i.id) as bom_cnt
from public.pos_menus m
left join public.pos_menu_ingredients i
  on i.menu_id = m.id and (i.option_id is null or i.option_id = 0)
where m.id in (1, 2, 3, 67, 68, 69)
group by m.code, m.id
order by m.code;

select m.code as menu_code, i.item_code, count(*) as bad_rows
from public.pos_menu_ingredients i
join public.pos_menus m on m.id = i.menu_id
left join public.items it on trim(it.code) = trim(i.item_code)
left join public.sauces s on upper(trim(s.code)) = upper(trim(i.item_code))
where m.id in (1, 2, 3, 67, 68, 69)
  and (i.option_id is null or i.option_id = 0)
  and trim(coalesce(i.item_code, '')) <> ''
  and it.code is null and s.code is null
group by m.code, i.item_code
order by m.code, i.item_code;
