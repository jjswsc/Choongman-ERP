-- POS 메뉴 코드 정리 후 영향 점검 체크리스트
-- 실행 목적:
-- 1) 코드 중복/고아 참조 여부 확인
-- 2) 원가분석·Grab 매핑에 영향 줄 수 있는 잔여 데이터 확인

-- A. code 정규화 기준 중복이 없어야 함
select lower(trim(code)) as code_key, count(*) as row_count, array_agg(id order by id) as menu_ids
from pos_menus
where trim(coalesce(code, '')) <> ''
group by lower(trim(code))
having count(*) > 1
order by code_key;

-- B. 중복 정리 시 비활성으로 밀린 행(__dup_) 현황
select id, code, name, is_active, category_main, category
from pos_menus
where code ilike '%__dup_%'
order by id;

-- C. 원가분석 영향 확인용: 비활성 메뉴 건수
select
  count(*) filter (where is_active = false) as inactive_count,
  count(*) filter (where is_active is distinct from false) as active_count,
  count(*) as total_count
from pos_menus;

-- D. 주요 테이블 menu_id 고아 참조 점검(0건 권장)
select 'pos_menu_options' as table_name, count(*) as orphan_rows
from pos_menu_options o
left join pos_menus m on m.id = o.menu_id
where o.menu_id is not null and m.id is null
union all
select 'pos_menu_ingredients' as table_name, count(*) as orphan_rows
from pos_menu_ingredients i
left join pos_menus m on m.id = i.menu_id
where i.menu_id is not null and m.id is null
union all
select 'pos_menu_store_scopes' as table_name, count(*) as orphan_rows
from pos_menu_store_scopes s
left join pos_menus m on m.id = s.menu_id
where s.menu_id is not null and m.id is null
union all
select 'pos_promo_items' as table_name, count(*) as orphan_rows
from pos_promo_items p
left join pos_menus m on m.id = p.menu_id
where p.menu_id is not null and m.id is null
order by table_name;

-- D-1. 옵션 코드 무결성 점검
-- 1) menu별 option_code 중복
select o.menu_id,
       lower(trim(coalesce(o.option_code, ''))) as option_code_key,
       count(*) as row_count,
       array_agg(o.id order by o.id) as option_ids
from pos_menu_options o
where trim(coalesce(o.option_code, '')) <> ''
group by o.menu_id, lower(trim(coalesce(o.option_code, '')))
having count(*) > 1
order by o.menu_id, option_code_key;

-- 2) option_code prefix(menu code) 불일치
select o.id as option_id,
       o.menu_id,
       m.code as menu_code,
       o.option_code
from pos_menu_options o
join pos_menus m on m.id = o.menu_id
where trim(coalesce(o.option_code, '')) <> ''
  and split_part(o.option_code, '-', 1) <> trim(coalesce(m.code, ''))
order by o.menu_id, o.id;

-- E. Grab 주문 매핑 대비: code 빈값/중복 여부(0건 권장)
select
  count(*) filter (where trim(coalesce(code, '')) = '') as blank_code_rows,
  count(*) filter (where code ilike 'grab\_%' escape '\') as grab_like_codes
from pos_menus;

-- F. Grab 통합 활성 매장 현황
drop table if exists _check_grab_integrations;
create temporary table _check_grab_integrations (
  integration_status text,
  row_count bigint
);

do $$
begin
  if to_regclass('public.pos_grab_store_integrations') is not null then
    execute '
      insert into _check_grab_integrations (integration_status, row_count)
      select integration_status::text, count(*)::bigint
      from public.pos_grab_store_integrations
      group by integration_status
      order by integration_status
    ';
  else
    insert into _check_grab_integrations (integration_status, row_count)
    values ('table_missing:public.pos_grab_store_integrations', 0);
  end if;
end $$;

select integration_status, row_count
from _check_grab_integrations
order by integration_status;

-- G. 가격 예약 스케줄(pos_menu) 고아 점검
-- price_schedules.entity_id가 문자열이라 FK가 없을 수 있어 별도 점검
drop table if exists _check_price_schedule_orphans;
create temporary table _check_price_schedule_orphans (
  orphan_price_schedules bigint
);

do $$
begin
  if to_regclass('public.price_schedules') is not null then
    execute '
      insert into _check_price_schedule_orphans (orphan_price_schedules)
      select count(*)::bigint
      from public.price_schedules ps
      left join public.pos_menus pm
        on ps.entity_type = ''pos_menu''
       and pm.id::text = ps.entity_id
      where ps.entity_type = ''pos_menu''
        and pm.id is null
    ';
  else
    insert into _check_price_schedule_orphans (orphan_price_schedules) values (0);
  end if;
end $$;

select orphan_price_schedules
from _check_price_schedule_orphans;
