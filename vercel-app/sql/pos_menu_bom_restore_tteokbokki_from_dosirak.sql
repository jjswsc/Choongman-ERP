-- 떡볶이 BOM 복구: K001~K003(도시락 id)에 잘못 붙은 pos_menu_ingredients → T001~T003(id 1,2,3)
--
-- 배경: pos_menu_fk_recover_after_wrong_canonical.sql 실행 시
--   id 1,2,3(떡볶이) BOM 이 id 69,67,68(도시락) 으로 menu_id 만 이동됨.
--   이후 T001~T003 코드는 id 1,2,3 에 재할당됐으나 BOM 은 도시락 id 에 남음.
--
-- 확정 매핑 (FK 복구 스크립트의 역방향):
--   69 K001 Dakgalbi Dosirak        → 1 T001 Tteokbokki
--   67 K002 Gochujang Bulgogi ...   → 2 T002 Rosé Tteokbokki
--   68 K003 Soy Sauce Bulgogi ...   → 3 T003 Cheese Tteokbokki
--
-- ⚠️ 실행 전 사전 점검 (아래 SELECT) 결과가 기대와 같을 때만 COMMIT.
-- ⚠️ K001~K003 도시락 메뉴는 BOM 이 비게 됨 → 도시락 레시피는 원가 계산기에서 다시 입력 필요.
-- ⚠️ 실행 전 백업 테이블 생성 권장(아래 백업 블록).

-- [사전 점검] BOM 분포
select
  m.id,
  m.code,
  m.name,
  count(i.id) filter (where i.option_id is null or i.option_id = 0) as base_bom_cnt,
  count(i.id) filter (where i.option_id is not null and i.option_id <> 0) as opt_bom_cnt,
  count(i.id) as total_bom_cnt
from pos_menus m
left join pos_menu_ingredients i on i.menu_id = m.id
where upper(trim(m.code)) in ('T001', 'T002', 'T003', 'K001', 'K002', 'K003')
   or m.id in (1, 2, 3, 67, 68, 69)
group by m.id, m.code, m.name
order by m.code;

-- [권장] 실행 직전 스냅샷 백업 (필요 시 복구용)
-- drop table if exists _backup_pos_menu_ingredients_tk_swap;
-- create table _backup_pos_menu_ingredients_tk_swap as
-- select *
-- from pos_menu_ingredients
-- where menu_id in (1, 2, 3, 67, 68, 69);

begin;

with mapping as (
  select 69::bigint as from_menu_id, 1::bigint as to_menu_id, 'K001→T001'::text as label
  union all select 67, 2, 'K002→T002'
  union all select 68, 3, 'K003→T003'
)
update pos_menu_ingredients i
set menu_id = m.to_menu_id
from mapping m
where i.menu_id = m.from_menu_id;

commit;

-- [사후 검증] T001~T003 에 BOM 있음 / K001~K003 base BOM 0
select
  m.id,
  m.code,
  m.name,
  count(i.id) as total_bom_cnt
from pos_menus m
left join pos_menu_ingredients i on i.menu_id = m.id
where upper(trim(m.code)) in ('T001', 'T002', 'T003', 'K001', 'K002', 'K003')
group by m.id, m.code, m.name
order by m.code;

-- [롤백] 위 이동을 되돌려 K001~K003 로 다시 이동(숫자가 더 이상해졌을 때)
-- begin;
-- with mapping as (
--   select 1::bigint as from_menu_id, 69::bigint as to_menu_id, 'T001→K001'::text as label
--   union all select 2, 67, 'T002→K002'
--   union all select 3, 68, 'T003→K003'
-- )
-- update pos_menu_ingredients i
-- set menu_id = m.to_menu_id
-- from mapping m
-- where i.menu_id = m.from_menu_id;
-- commit;

-- ── (선택) Sweet Potato Noodles CT013 단가 — g 기준 레시피와 맞추기 ──
-- 현재: price 1300 / total_quantity 50 / unit pack → per_unit 26 (g 수량에 곱하면 폭주)
-- 엑셀 기준 ≈ 0.144 ฿/g → 1300 ÷ 9000g ≈ 0.144 (50팩 × 180g/팩 가정)
--
-- [사전 확인]
-- select code, name, price, total_quantity, unit from items where code = 'CT013';
--
-- begin;
-- update items
-- set unit = 'g',
--     total_quantity = 9000
-- where code = 'CT013'
--   and price = 1300;
-- commit;
--
-- [검증] round(1300::numeric / 9000, 4)  → 0.1444
