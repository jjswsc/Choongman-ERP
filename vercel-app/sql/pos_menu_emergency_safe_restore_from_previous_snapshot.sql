-- 긴급 안전 복구: 떡볶이+도시락 BOM을 "예전 자료"로만 복원
--
-- 대상 menu_id:
--   Tteokbokki: 1,2,3
--   Dosirak:    67,68,69
--
-- 원칙:
-- 1) 현재 데이터 먼저 백업
-- 2) 복원 소스(과거 스냅샷/PITR) 건수 확인
-- 3) 건수 검증 통과 시에만 DELETE+INSERT
-- 4) 검증 실패 시 ROLLBACK
--
-- ------------------------------------------------------------
-- 0) 현재 상태 백업 (항상 먼저 실행)
-- ------------------------------------------------------------
drop table if exists public.cm_backup_pos_menu_ing_123_676869_now;
create table public.cm_backup_pos_menu_ing_123_676869_now
(like public.pos_menu_ingredients including all);

insert into public.cm_backup_pos_menu_ing_123_676869_now
select *
from public.pos_menu_ingredients
where menu_id in (1, 2, 3, 67, 68, 69);

create table if not exists public.cm_backup_pos_menu_ing_123_676869_now
(like public.pos_menu_ingredients including all);

select menu_id, count(*) as row_cnt
from public.cm_backup_pos_menu_ing_123_676869_now
group by menu_id
order by menu_id;

-- ------------------------------------------------------------
-- 1) 복원 소스 준비
-- ------------------------------------------------------------
-- 아래 테이블 중 "정상 시점의 과거 자료"가 들어있는 1개를 선택:
-- A) _restore_pos_menu_ingredients_from_pitr
-- B) _restore_dosirak_bom_from_pitr + (별도 떡볶이 PITR 테이블)
-- C) 사용자 수동 업로드 테이블
--
-- 권장: A 테이블에 1,2,3,67,68,69를 모두 채운 뒤 아래 SQL 실행.

-- (필요 시) 업로드용 통합 테이블 생성
drop table if exists public.cm_restore_all_123_676869_from_pitr;
create table public.cm_restore_all_123_676869_from_pitr (
  id bigint,
  menu_id bigint,
  option_id bigint null,
  item_code text,
  quantity numeric,
  loss_rate numeric,
  ingredient_type text
);

-- ------------------------------------------------------------
-- 2) 소스 건수 점검 (반드시 확인)
-- ------------------------------------------------------------
-- 아래 쿼리 결과에서 1,2,3,67,68,69가 모두 1건 이상이어야 진행.
select menu_id, count(*) as row_cnt
from public.cm_restore_all_123_676869_from_pitr
where menu_id in (1, 2, 3, 67, 68, 69)
group by menu_id
order by menu_id;

-- 중복 id 점검 (0건 권장)
select id, count(*) as dup_cnt
from public.cm_restore_all_123_676869_from_pitr
where menu_id in (1, 2, 3, 67, 68, 69)
group by id
having count(*) > 1
order by dup_cnt desc, id;

-- ------------------------------------------------------------
-- 3) 안전 복원 실행
-- ------------------------------------------------------------
-- 실행 전 체크:
-- - 위 건수가 6개 menu_id 모두 존재?
-- - dup id 없음?
--
-- 조건 미충족이면 절대 실행하지 말 것.

begin;

-- 3-1) 대상 메뉴 기존 BOM 삭제
delete from pos_menu_ingredients
where menu_id in (1, 2, 3, 67, 68, 69);

-- 3-2) 과거 스냅샷으로 재삽입
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
from public.cm_restore_all_123_676869_from_pitr r
where r.menu_id in (1, 2, 3, 67, 68, 69);

-- 3-3) 시퀀스 보정
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

-- 3-4) 트랜잭션 내 검증
-- A. 메뉴별 건수
with c as (
  select menu_id, count(*) as row_cnt
  from pos_menu_ingredients
  where menu_id in (1, 2, 3, 67, 68, 69)
  group by menu_id
)
select * from c order by menu_id;

-- B. 고아 옵션 점검 (0건 권장)
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

-- 검증 OK면 COMMIT, 아니면 ROLLBACK
-- commit;
rollback;

-- ------------------------------------------------------------
-- 4) 커밋 후 최종 확인 쿼리 (커밋한 뒤 따로 실행)
-- ------------------------------------------------------------
-- select
--   m.id, m.code, m.name,
--   count(i.id) filter (where i.option_id is null or i.option_id = 0) as base_bom_cnt,
--   count(i.id) filter (where i.option_id is not null and i.option_id <> 0) as opt_bom_cnt,
--   count(i.id) as total_bom_cnt
-- from pos_menus m
-- left join pos_menu_ingredients i on i.menu_id = m.id
-- where m.id in (1, 2, 3, 67, 68, 69)
-- group by m.id, m.code, m.name
-- order by m.id;

