-- 코드 중심 원가(BOM) 재시드 (최종 매핑표 버전)
--
-- 목적:
-- 1) menu_id가 바뀌어도 code로 대상 메뉴를 찾는다.
-- 2) 떡볶이 3종(T001/T002/T003)을 코드 중심으로 모두 복구한다.
-- 3) 도시락 3종(K001/K002/K003)은 code 기반 source 복제로 복구한다.
--
-- 중요:
-- - 이 스크립트는 안전하게 마지막을 ROLLBACK으로 둔다.
-- - 결과 확인 후 ROLLBACK -> COMMIT으로 바꿔 재실행.
-- - 백업 테이블은 트랜잭션 밖에서 유지된다.
--
-- 실행 순서:
-- 1) 섹션 1-0 "사전 매핑 미리보기" 단독 실행 → resolved_code null 없어야 함
-- 2) begin ~ rollback 전체 실행 → bad_rows 0 확인
-- 3) rollback → commit 후 재실행
--
-- BOM 은 이미 들어가 있고 bad_rows(숫자코드)만 고칠 때:
--   begin; 섹션 6-1 ~ 7(검증) 만 실행 후 commit
--
-- 전제:
-- - pos_menu_ingredients_code_guard.sql 적용 완료 (menu_code 컬럼/트리거)

-- ------------------------------------------------------------
-- 0) 현재 대상 백업 (트랜잭션 밖, 영구 유지)
-- ------------------------------------------------------------
create table if not exists public.cm_backup_reseed_tteok_dosirak_now
(like public.pos_menu_ingredients including all);
truncate table public.cm_backup_reseed_tteok_dosirak_now;

insert into public.cm_backup_reseed_tteok_dosirak_now
select i.*
from public.pos_menu_ingredients i
join public.pos_menus m on m.id = i.menu_id
where upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003');

-- 백업 생성 확인
select to_regclass('public.cm_backup_reseed_tteok_dosirak_now') as backup_table;
select count(*) as backup_rows from public.cm_backup_reseed_tteok_dosirak_now;

-- ------------------------------------------------------------
-- 1) 대상 메뉴 id 조회 (code 중심)
-- ------------------------------------------------------------
with m as (
  select id, upper(trim(code)) as code, name
  from public.pos_menus
  where upper(trim(code)) in ('T001','T002','T003','K001','K002','K003','K027','K028','K029')
)
select * from m order by code;

-- ------------------------------------------------------------
-- 1-0) 엑셀 Item No → items.code 사전 매핑 미리보기 (먼저 단독 실행)
--      resolved_code 가 null 이면 품목 관리에 해당 이름 품목이 없는 것
-- ------------------------------------------------------------
with legacy_hint(excel_no, name_hint, force_code, keyword_hint, expected_price, expected_total_qty, expected_unit) as (
  values
    ('16', 'Onion', null::text, null::text, null::numeric, null::numeric, null::text),
    ('29', 'Egg', null, null, null, null, null),
    ('65', 'Dried Parsley', null, null, null, null, null),
    ('73', 'CHOONGMAN TTEOKBOKKI SOUP POWDER', null, 'tteokbokki soup', null, null, null),
    ('81', 'Hot Issue Wheat Tteok', null, 'tteok rice cake', 95::numeric, 1000::numeric, 'kg'),
    ('82', 'SAJO Fishcake', null, 'fishcake fish cake', 160::numeric, 1000::numeric, 'kg'),
    ('102', 'water', null, 'water', 0::numeric, null, null),
    ('105', 'Food Tray 1000', null, 'food tray 1000', null, null, null),
    ('116', 'Chopsticks', null, 'chopsticks', null, null, null),
    ('117', 'Choongman Plastic Bag', null, 'plastic bag', null, null, null),
    ('128', 'Mozzarella Cheese', null, 'mozzarella', null, null, null),
    ('171', 'Sweet Potato Noodles', 'CT013', 'sweet potato noodles', null, null, null),
    ('238', 'Food Tray Sealing Film CM Chicken', null, 'sealing film', null, null, null),
    ('264', 'Food Tray Seal Film Cutter', null, 'film cutter', null, null, null)
),
resolved as (
  select
    lh.excel_no,
    lh.name_hint,
    lh.force_code,
    coalesce(
      lh.force_code,
      (
        select it.code
        from public.items it
        where lower(regexp_replace(trim(coalesce(it.name, '')), '\s+', ' ', 'g'))
              like '%' || lower(regexp_replace(trim(lh.name_hint), '\s+', ' ', 'g')) || '%'
        order by
          case
            when lower(trim(it.name)) = lower(trim(lh.name_hint)) then 0
            when lower(trim(it.name)) like lower(trim(lh.name_hint)) || '%' then 1
            else 2
          end,
          length(trim(it.name)),
          it.code
        limit 1
      ),
      (
        select it.code
        from public.items it
        where trim(coalesce(lh.keyword_hint, '')) <> ''
          and (
            lower(coalesce(it.name, '')) like '%' || split_part(lower(lh.keyword_hint), ' ', 1) || '%'
            or lower(coalesce(it.name, '')) like '%' || split_part(lower(lh.keyword_hint), ' ', 2) || '%'
            or lower(coalesce(it.name, '')) like '%' || split_part(lower(lh.keyword_hint), ' ', 3) || '%'
          )
        order by length(trim(coalesce(it.name, ''))), it.code
        limit 1
      ),
      (
        select it.code
        from public.items it
        where lh.expected_price is not null
          and abs(coalesce(it.price, it.cost, 0)::numeric - lh.expected_price) <= 1
          and (
            lh.expected_total_qty is null
            or (
              it.total_quantity is not null
              and (
                abs(it.total_quantity::numeric - lh.expected_total_qty) <= 5
                or (
                  lower(trim(coalesce(it.unit, ''))) in ('kg', 'กิโลกรัม/kg')
                  and abs(it.total_quantity::numeric - (lh.expected_total_qty / 1000)) <= 0.01
                )
              )
            )
          )
        order by
          abs(coalesce(it.price, it.cost, 0)::numeric - lh.expected_price),
          case
            when it.total_quantity is null or lh.expected_total_qty is null then 9999
            else abs(it.total_quantity::numeric - lh.expected_total_qty)
          end,
          it.code
        limit 1
      )
    ) as resolved_code
  from legacy_hint lh
)
select
  excel_no,
  name_hint,
  force_code,
  resolved_code,
  case when resolved_code is null then 'MISSING' else 'ok' end as status
from resolved
order by excel_no::int;

begin;

-- ------------------------------------------------------------
-- 2) 대상 BOM 초기화
-- ------------------------------------------------------------
delete from public.pos_menu_ingredients i
using public.pos_menus m
where m.id = i.menu_id
  and upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003');

-- ------------------------------------------------------------
-- 3) T001 (Tteokbokki) 엑셀 기준 입력
-- ------------------------------------------------------------
insert into public.pos_menu_ingredients (menu_id, menu_code, option_id, item_code, quantity, loss_rate, ingredient_type)
select m.id, m.code, null, x.item_code, x.qty, 0, x.ingredient_type
from public.pos_menus m
join (
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
) as x(item_code, qty, ingredient_type) on true
where upper(trim(m.code)) = 'T001';

-- ------------------------------------------------------------
-- 4) T003 (Cheese Tteokbokki) 엑셀 기준 입력
-- ------------------------------------------------------------
insert into public.pos_menu_ingredients (menu_id, menu_code, option_id, item_code, quantity, loss_rate, ingredient_type)
select m.id, m.code, null, x.item_code, x.qty, 0, x.ingredient_type
from public.pos_menus m
join (
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
) as x(item_code, qty, ingredient_type) on true
where upper(trim(m.code)) = 'T003';

-- ------------------------------------------------------------
-- 5) T002 (Rosé Tteokbokki) 입력
-- ------------------------------------------------------------
-- Rosé 상세 BOM 원본이 현재 레포에 없어 1차 복구는 T001 기준으로 채운다.
-- (원본 확보 후 T002 섹션만 교체하면 코드 중심으로 안정 반영 가능)
insert into public.pos_menu_ingredients (menu_id, menu_code, option_id, item_code, quantity, loss_rate, ingredient_type)
select
  tm.id as menu_id,
  'T002'::text as menu_code,
  null as option_id,
  i.item_code,
  i.quantity,
  coalesce(i.loss_rate, 0),
  coalesce(i.ingredient_type, 'food')
from public.pos_menus tm
join public.pos_menus sm on upper(trim(sm.code)) = 'T001'
join public.pos_menu_ingredients i on i.menu_id = sm.id
where upper(trim(tm.code)) = 'T002'
  and (i.option_id is null or i.option_id = 0);

-- ------------------------------------------------------------
-- 6) code 기반 복제 매핑 (도시락 최종 매핑표)
-- ------------------------------------------------------------
-- 도시락 3종 최종 매핑표(매장 기준):
--   K001(Dakgalbi Dosirak)         <- K029(DAKGALBI CHICKEN BOWL)
--   K002(Gochujang Bulgogi Dosirak)<- K027(GOCHUJANG BULGOGI BOWL)
--   K003(Soy Sauce Bulgogi Dosirak)<- K028(SOY SAUCE BULGOGI BOWL)
with code_map as (
  select 'K001'::text as target_code, 'K029'::text as source_code
  union all select 'K002', 'K027'
  union all select 'K003', 'K028'
),
ids as (
  select
    cm.target_code,
    cm.source_code,
    tm.id as target_id,
    sm.id as source_id
  from code_map cm
  join public.pos_menus tm on upper(trim(tm.code)) = cm.target_code
  join public.pos_menus sm on upper(trim(sm.code)) = cm.source_code
)
insert into public.pos_menu_ingredients (menu_id, menu_code, option_id, item_code, quantity, loss_rate, ingredient_type)
select
  ids.target_id as menu_id,
  ids.target_code as menu_code,
  null as option_id,
  i.item_code,
  i.quantity,
  coalesce(i.loss_rate, 0),
  coalesce(i.ingredient_type, 'food')
from ids
join public.pos_menu_ingredients i on i.menu_id = ids.source_id
where i.option_id is null or i.option_id = 0;

-- ------------------------------------------------------------
-- 6-1) item_code 정규화 (엑셀 Item No / 소스코드)
-- ------------------------------------------------------------
-- 엑셀 Cost 시트의 Item No(16, 81, 171…)는 items.id 가 아님.
-- 품목명 + 확정 코드(171→CT013)로 items.code 를 찾는다.
with legacy_hint(excel_no, name_hint, force_code, keyword_hint, expected_price, expected_total_qty, expected_unit) as (
  values
    ('16', 'Onion', null::text, null::text, null::numeric, null::numeric, null::text),
    ('29', 'Egg', null, null, null, null, null),
    ('65', 'Dried Parsley', null, null, null, null, null),
    ('73', 'CHOONGMAN TTEOKBOKKI SOUP POWDER', null, 'tteokbokki soup', null, null, null),
    ('81', 'Hot Issue Wheat Tteok', null, 'tteok rice cake', 95::numeric, 1000::numeric, 'kg'),
    ('82', 'SAJO Fishcake', null, 'fishcake fish cake', 160::numeric, 1000::numeric, 'kg'),
    ('102', 'water', null, 'water', 0::numeric, null, null),
    ('105', 'Food Tray 1000', null, 'food tray 1000', null, null, null),
    ('116', 'Chopsticks', null, 'chopsticks', null, null, null),
    ('117', 'Choongman Plastic Bag', null, 'plastic bag', null, null, null),
    ('128', 'Mozzarella Cheese', null, 'mozzarella', null, null, null),
    ('171', 'Sweet Potato Noodles', 'CT013', 'sweet potato noodles', null, null, null),
    ('238', 'Food Tray Sealing Film CM Chicken', null, 'sealing film', null, null, null),
    ('264', 'Food Tray Seal Film Cutter', null, 'film cutter', null, null, null)
),
resolved as (
  select
    lh.excel_no,
    coalesce(
      lh.force_code,
      (
        select it.code
        from public.items it
        where lower(regexp_replace(trim(coalesce(it.name, '')), '\s+', ' ', 'g'))
              like '%' || lower(regexp_replace(trim(lh.name_hint), '\s+', ' ', 'g')) || '%'
        order by
          case
            when lower(trim(it.name)) = lower(trim(lh.name_hint)) then 0
            when lower(trim(it.name)) like lower(trim(lh.name_hint)) || '%' then 1
            else 2
          end,
          length(trim(it.name)),
          it.code
        limit 1
      ),
      (
        select it.code
        from public.items it
        where trim(coalesce(lh.keyword_hint, '')) <> ''
          and (
            lower(coalesce(it.name, '')) like '%' || split_part(lower(lh.keyword_hint), ' ', 1) || '%'
            or lower(coalesce(it.name, '')) like '%' || split_part(lower(lh.keyword_hint), ' ', 2) || '%'
            or lower(coalesce(it.name, '')) like '%' || split_part(lower(lh.keyword_hint), ' ', 3) || '%'
          )
        order by length(trim(coalesce(it.name, ''))), it.code
        limit 1
      ),
      (
        select it.code
        from public.items it
        where lh.expected_price is not null
          and abs(coalesce(it.price, it.cost, 0)::numeric - lh.expected_price) <= 1
          and (
            lh.expected_total_qty is null
            or (
              it.total_quantity is not null
              and (
                abs(it.total_quantity::numeric - lh.expected_total_qty) <= 5
                or (
                  lower(trim(coalesce(it.unit, ''))) in ('kg', 'กิโลกรัม/kg')
                  and abs(it.total_quantity::numeric - (lh.expected_total_qty / 1000)) <= 0.01
                )
              )
            )
          )
        order by
          abs(coalesce(it.price, it.cost, 0)::numeric - lh.expected_price),
          case
            when it.total_quantity is null or lh.expected_total_qty is null then 9999
            else abs(it.total_quantity::numeric - lh.expected_total_qty)
          end,
          it.code
        limit 1
      )
    ) as item_code
  from legacy_hint lh
)
update public.pos_menu_ingredients i
set item_code = r.item_code
from public.pos_menus m,
     resolved r
where i.menu_id = m.id
  and trim(coalesce(i.item_code, '')) = r.excel_no
  and upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003')
  and trim(coalesce(r.item_code, '')) <> '';

-- water(102) 추가 패턴 — 품목명이 Water/น้ำ 등인 경우
update public.pos_menu_ingredients i
set item_code = it.code
from public.pos_menus m,
     public.items it
where i.menu_id = m.id
  and trim(coalesce(i.item_code, '')) = '102'
  and upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003')
  and lower(trim(coalesce(it.name, ''))) in ('water', 'น้ำ', 'น้ำเปล่า')
  and trim(coalesce(it.code, '')) <> '';

-- 소스코드(예: S005, S016, S017) — linked_item_code 우선, 없으면 sauces.code 유지
update public.pos_menu_ingredients i
set item_code = coalesce(nullif(trim(s.linked_item_code), ''), trim(s.code))
from public.pos_menus m,
     public.sauces s
where i.menu_id = m.id
  and upper(trim(s.code)) = upper(trim(i.item_code))
  and upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003')
  and trim(coalesce(s.code, '')) <> '';

-- 원가 0인 water(102) — 품목 미등록이면 bad_rows 방지를 위해 행 제거
delete from public.pos_menu_ingredients i
using public.pos_menus m
where i.menu_id = m.id
  and trim(coalesce(i.item_code, '')) = '102'
  and upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003');

-- 최종 매핑표 확인
with code_map as (
  select 'K001'::text as target_code, 'K029'::text as source_code
  union all select 'K002', 'K027'
  union all select 'K003', 'K028'
)
select
  cm.target_code,
  tm.name as target_name,
  cm.source_code,
  sm.name as source_name
from code_map cm
join public.pos_menus tm on upper(trim(tm.code)) = cm.target_code
join public.pos_menus sm on upper(trim(sm.code)) = cm.source_code
order by cm.target_code;

-- ------------------------------------------------------------
-- 7) 검증
-- ------------------------------------------------------------
select
  m.code,
  m.name,
  count(i.id) as bom_cnt
from public.pos_menus m
left join public.pos_menu_ingredients i on i.menu_id = m.id
where upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003')
group by m.code, m.name
order by m.code;

-- item_code 유효성 점검 (0건 권장)
-- items.code 또는 sauces.code/linked_item_code 중 하나라도 매칭되면 유효로 본다.
select
  m.code as menu_code,
  i.item_code,
  count(*) as bad_rows
from public.pos_menu_ingredients i
join public.pos_menus m on m.id = i.menu_id
left join public.items it on trim(it.code) = trim(i.item_code)
left join public.sauces s_code on upper(trim(s_code.code)) = upper(trim(i.item_code))
left join public.sauces s_link on trim(s_link.linked_item_code) = trim(i.item_code)
where upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003')
  and trim(coalesce(i.item_code, '')) <> ''
  and it.code is null
  and s_code.code is null
  and s_link.code is null
group by m.code, i.item_code
order by m.code, i.item_code;

-- 미해결 숫자코드 → 엑셀 품목명 힌트 (bad_rows > 0 일 때)
with legacy_hint(excel_no, name_hint) as (
  values
    ('16', 'Onion'),
    ('29', 'Egg'),
    ('65', 'Dried Parsley'),
    ('73', 'CHOONGMAN TTEOKBOKKI SOUP POWDER'),
    ('81', 'Hot Issue Wheat Tteok'),
    ('82', 'SAJO Fishcake'),
    ('102', 'water (원가 0, 미등록 시 삭제됨)'),
    ('105', 'Food Tray 1000 ml.'),
    ('116', 'Chopsticks'),
    ('117', 'Choongman Plastic Bag (S/XS)'),
    ('128', 'Mozzarella Cheese'),
    ('171', 'Sweet Potato Noodles → CT013'),
    ('238', 'Food Tray Sealing Film CM Chicken'),
    ('264', 'Food Tray Seal Film Cutter')
)
select
  m.code as menu_code,
  i.item_code,
  lh.name_hint as excel_ingredient_hint,
  count(*) as bad_rows
from public.pos_menu_ingredients i
join public.pos_menus m on m.id = i.menu_id
left join legacy_hint lh on lh.excel_no = trim(i.item_code)
left join public.items it on trim(it.code) = trim(i.item_code)
left join public.sauces s_code on upper(trim(s_code.code)) = upper(trim(i.item_code))
left join public.sauces s_link on trim(s_link.linked_item_code) = trim(i.item_code)
where upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003')
  and trim(coalesce(i.item_code, '')) <> ''
  and it.code is null
  and s_code.code is null
  and s_link.code is null
group by m.code, i.item_code, lh.name_hint
order by m.code, i.item_code;

-- ------------------------------------------------------------
-- 8) 최종 반영
-- ------------------------------------------------------------
-- 첫 실행은 rollback으로 검증, 문제 없으면 commit으로 재실행
-- commit;
rollback;

-- ------------------------------------------------------------
-- 롤백(커밋 후 문제 시)
-- begin;
-- delete from public.pos_menu_ingredients i
-- using public.pos_menus m
-- where m.id = i.menu_id
--   and upper(trim(m.code)) in ('T001','T002','T003','K001','K002','K003');
--
-- insert into public.pos_menu_ingredients
-- select * from public.cm_backup_reseed_tteok_dosirak_now;
-- commit;
