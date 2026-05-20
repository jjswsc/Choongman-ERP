-- Grab 옵션 정합성 보정 (option_code 컬럼 없는 DB 호환)
-- 적용 대상:
-- 1) pos_promo_items.option_id가 존재하지만 옵션이 다른 메뉴를 가리키는 경우 -> option_id null
-- 2) pos_promo_items.option_id가 존재하지만 옵션 행이 없는 경우 -> option_id null

-- [사전 확인] 문제 건수
select
  sum(case when pi.option_id is not null and o.id is null then 1 else 0 end) as broken_option_id_cnt,
  sum(case when pi.option_id is not null and o.id is not null and o.menu_id <> pi.menu_id then 1 else 0 end) as menu_option_mismatch_cnt
from pos_promo_items pi
left join pos_menu_options o on o.id = pi.option_id;

begin;

-- 1) 메뉴-옵션 불일치: 옵션 제거(기본값 사용)
update pos_promo_items pi
set option_id = null
from pos_menu_options o
where pi.option_id is not null
  and o.id = pi.option_id
  and o.menu_id <> pi.menu_id;

-- 2) 깨진 option_id: null 처리
update pos_promo_items pi
set option_id = null
where pi.option_id is not null
  and not exists (
    select 1
    from pos_menu_options o
    where o.id = pi.option_id
  );

commit;

-- [사후 확인] 남은 불일치 0건 권장
select
  pi.id as promo_item_id,
  pi.promo_id,
  pi.menu_id,
  pi.option_id,
  o.menu_id as option_menu_id,
  o.option_code,
  o.name as option_name,
  case
    when pi.option_id is null then 'ok_no_option'
    when o.id is null then 'broken_option_id'
    when o.menu_id <> pi.menu_id then 'menu_option_mismatch'
    else 'ok'
  end as status
from pos_promo_items pi
left join pos_menu_options o on o.id = pi.option_id
where pi.option_id is not null
  and (o.id is null or o.menu_id <> pi.menu_id)
order by pi.promo_id, pi.id;
