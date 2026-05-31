-- T001~T003 정밀 복구 플레이북 (PITR/백업 기반)
--
-- 목적:
-- 1) "현재 값"을 안전하게 보존
-- 2) PITR(또는 백업)에서 "정확한 과거 BOM"을 가져와 복원
-- 3) 복원 후 숫자 검증 쿼리로 원가 분석 정상 여부 확인
--
-- 전제:
-- - 대상 메뉴 id: 1,2,3(T001~T003), 67,68,69(K001~K003)
-- - 운영 DB에서 먼저 current snapshot 백업
-- - PITR 복원본 DB(또는 백업 CSV/테이블)에서 떡볶이 원본 행 추출
--
-- ------------------------------------------------------------
-- A) 운영 DB 현재 상태 백업 (반드시 먼저)
-- ------------------------------------------------------------

drop table if exists _backup_20260531_pos_menu_ingredients_tk_current;
create table _backup_20260531_pos_menu_ingredients_tk_current as
select *
from pos_menu_ingredients
where menu_id in (1, 2, 3, 67, 68, 69);

-- (선택) 옵션 테이블도 같이 백업
drop table if exists _backup_20260531_pos_menu_options_tk_current;
create table _backup_20260531_pos_menu_options_tk_current as
select *
from pos_menu_options
where menu_id in (1, 2, 3, 67, 68, 69);

-- 현재 분포 확인
select
  m.id,
  m.code,
  m.name,
  count(i.id) as total_bom_cnt
from pos_menus m
left join pos_menu_ingredients i on i.menu_id = m.id
where m.id in (1, 2, 3, 67, 68, 69)
group by m.id, m.code, m.name
order by m.id;

-- ------------------------------------------------------------
-- B) PITR/백업에서 원본 적재
-- ------------------------------------------------------------
-- 방법 1) PITR 복원본에서 아래 컬럼만 CSV export:
--   id, menu_id, option_id, item_code, quantity, loss_rate, ingredient_type
--   (필요 시 created_at, updated_at 포함 가능)
--
-- 방법 2) SQL Editor에서 임시 테이블 생성 후 붙여넣기/업로드
--   _restore_pos_menu_ingredients_from_pitr
--
-- 주의:
-- - 이 테이블에는 "정상 시점의 원본"이 들어 있어야 함.
-- - 최소한 menu_id 1,2,3에 대한 행은 반드시 포함되어야 함.

drop table if exists _restore_pos_menu_ingredients_from_pitr;
create table _restore_pos_menu_ingredients_from_pitr (
  id bigint,
  menu_id bigint,
  option_id bigint null,
  item_code text,
  quantity numeric,
  loss_rate numeric,
  ingredient_type text
);

-- 업로드 후 사전 확인
select menu_id, count(*) as row_cnt
from _restore_pos_menu_ingredients_from_pitr
group by menu_id
order by menu_id;

-- ------------------------------------------------------------
-- C) 정밀 복원 실행
-- ------------------------------------------------------------
-- 정책:
-- - 대상 6개 메뉴 BOM을 먼저 비우고
-- - PITR 원본 중 대상 6개 메뉴 행을 그대로 재삽입
-- - id를 유지해 과거 관계 추적을 쉽게 함

begin;

delete from pos_menu_ingredients
where menu_id in (1, 2, 3, 67, 68, 69);

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
from _restore_pos_menu_ingredients_from_pitr r
where r.menu_id in (1, 2, 3, 67, 68, 69);

-- 시퀀스 보정 (시퀀스 이름이 다르면 실패할 수 있음)
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
-- D) 복원 검증
-- ------------------------------------------------------------

-- 1) 메뉴별 BOM 건수
select
  m.id,
  m.code,
  m.name,
  count(i.id) filter (where i.option_id is null or i.option_id = 0) as base_bom_cnt,
  count(i.id) filter (where i.option_id is not null and i.option_id <> 0) as opt_bom_cnt,
  count(i.id) as total_bom_cnt
from pos_menus m
left join pos_menu_ingredients i on i.menu_id = m.id
where m.id in (1, 2, 3, 67, 68, 69)
group by m.id, m.code, m.name
order by m.id;

-- 2) 고아 option_id 점검 (0건 권장)
select
  i.menu_id,
  i.option_id,
  count(*) as orphan_cnt
from pos_menu_ingredients i
left join pos_menu_options o
  on o.id = i.option_id
 and o.menu_id = i.menu_id
where i.menu_id in (1, 2, 3, 67, 68, 69)
  and i.option_id is not null
  and i.option_id <> 0
  and o.id is null
group by i.menu_id, i.option_id
order by i.menu_id, i.option_id;

-- 3) CT013 단가 왜곡 점검
select code, name, price, total_quantity, unit,
       round(price / nullif(total_quantity, 0), 6) as per_unit
from items
where code = 'CT013';

-- ------------------------------------------------------------
-- E) 즉시 롤백 (복원 결과가 이상할 때)
-- ------------------------------------------------------------
-- begin;
-- delete from pos_menu_ingredients
-- where menu_id in (1, 2, 3, 67, 68, 69);
--
-- insert into pos_menu_ingredients
-- select *
-- from _backup_20260531_pos_menu_ingredients_tk_current;
-- commit;
