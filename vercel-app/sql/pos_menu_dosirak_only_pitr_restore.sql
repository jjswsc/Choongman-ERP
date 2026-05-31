-- K001~K003 도시락 BOM 전용 복구 (PITR/백업 원본 필요)
--
-- 대상 menu_id:
--   69 = K001 Dakgalbi Dosirak
--   67 = K002 Gochujang Bulgogi Dosirak
--   68 = K003 Soy Sauce Bulgogi Dosirak
--
-- 사용 순서:
-- 1) A 섹션 실행: 현재 상태 백업
-- 2) B 섹션: PITR(정상 시점) 원본을 임시 테이블에 업로드
-- 3) C 섹션 실행: 도시락 3개만 복원
-- 4) D 섹션으로 검증

-- ------------------------------------------------------------
-- A) 현재 운영값 백업 (필수)
-- ------------------------------------------------------------
drop table if exists _backup_20260531_dosirak_bom_before_restore;
create table _backup_20260531_dosirak_bom_before_restore as
select *
from pos_menu_ingredients
where menu_id in (67, 68, 69);

select menu_id, count(*) as row_cnt
from _backup_20260531_dosirak_bom_before_restore
group by menu_id
order by menu_id;

-- ------------------------------------------------------------
-- B) PITR 원본 적재
-- ------------------------------------------------------------
-- 아래 임시 테이블에 PITR/백업의 도시락 원본 행을 넣으세요.
-- 권장 컬럼:
--   id, menu_id, option_id, item_code, quantity, loss_rate, ingredient_type
drop table if exists _restore_dosirak_bom_from_pitr;
create table _restore_dosirak_bom_from_pitr (
  id bigint,
  menu_id bigint,
  option_id bigint null,
  item_code text,
  quantity numeric,
  loss_rate numeric,
  ingredient_type text
);

-- 업로드 후 점검 (67/68/69 각각 row가 있어야 함)
select menu_id, count(*) as row_cnt
from _restore_dosirak_bom_from_pitr
group by menu_id
order by menu_id;

-- ------------------------------------------------------------
-- C) 도시락 BOM 복원 실행
-- ------------------------------------------------------------
begin;

delete from pos_menu_ingredients
where menu_id in (67, 68, 69);

insert into pos_menu_ingredients (
  id,
  menu_id,
  option_id,
  item_code,
  quantity,
  loss_rate,
  ingredient_type
)
select
  r.id,
  r.menu_id,
  r.option_id,
  r.item_code,
  r.quantity,
  r.loss_rate,
  coalesce(nullif(trim(r.ingredient_type), ''), 'food')
from _restore_dosirak_bom_from_pitr r
where r.menu_id in (67, 68, 69);

-- 시퀀스 보정
do $$
begin
  if to_regclass('public.pos_menu_ingredients_id_seq') is not null then
    perform setval(
      'public.pos_menu_ingredients_id_seq',
      greatest((select coalesce(max(id), 1) from pos_menu_ingredients), 1),
      true
    );
  end if;
end $$;

commit;

-- ------------------------------------------------------------
-- D) 검증
-- ------------------------------------------------------------
select
  m.id,
  m.code,
  m.name,
  count(i.id) as total_bom_cnt
from pos_menus m
left join pos_menu_ingredients i on i.menu_id = m.id
where m.id in (67, 68, 69)
group by m.id, m.code, m.name
order by m.id;

-- 고아 옵션 체크 (0건 권장)
select
  i.menu_id,
  i.option_id,
  count(*) as orphan_cnt
from pos_menu_ingredients i
left join pos_menu_options o
  on o.id = i.option_id
 and o.menu_id = i.menu_id
where i.menu_id in (67, 68, 69)
  and i.option_id is not null
  and i.option_id <> 0
  and o.id is null
group by i.menu_id, i.option_id
order by i.menu_id, i.option_id;

-- ------------------------------------------------------------
-- E) 즉시 롤백 (이상 시)
-- ------------------------------------------------------------
-- begin;
-- delete from pos_menu_ingredients
-- where menu_id in (67, 68, 69);
--
-- insert into pos_menu_ingredients
-- select *
-- from _backup_20260531_dosirak_bom_before_restore;
-- commit;
