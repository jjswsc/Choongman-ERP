-- POS 메뉴 code 정규화/중복 정리 + 코드 유일성 강제
-- 목적:
-- 1) 같은 code가 여러 menu_id로 존재해 관리자/포스 노출이 어긋나는 문제를 정리
-- 2) 향후 같은 문제 재발 방지를 위해 code 정규화(unique) 인덱스 적용
--
-- 실행 전 권장:
-- - 트래픽 낮은 시간대 실행
-- - 전체 백업/스냅샷 확보

-- [사전 점검] 중복 code 확인
select lower(trim(code)) as code_key,
       count(*) as row_count,
       array_agg(id order by id) as menu_ids,
       array_agg(name order by id) as menu_names
from pos_menus
where trim(coalesce(code, '')) <> ''
group by lower(trim(code))
having count(*) > 1
order by code_key;

-- 1) 중복 code 매핑 테이블 생성 (keep_id=min(id))
create temporary table if not exists _pos_menu_code_dup_map (
  code_key text not null,
  keep_id bigint not null,
  old_id bigint not null,
  primary key (old_id)
) ;

truncate table _pos_menu_code_dup_map;

insert into _pos_menu_code_dup_map (code_key, keep_id, old_id)
with dup as (
  select lower(trim(code)) as code_key,
         min(id)::bigint as keep_id,
         array_agg(id::bigint order by id) as ids
  from pos_menus
  where trim(coalesce(code, '')) <> ''
  group by lower(trim(code))
  having count(*) > 1
)
select d.code_key, d.keep_id, x.old_id
from dup d
cross join lateral unnest(d.ids) as x(old_id)
where x.old_id <> d.keep_id;

-- 1-1) pos_menu_store_scopes 충돌 선정리
-- unique(store_code, menu_id) 제약 때문에 old_id -> keep_id 업데이트 시
-- 같은 store_code가 keep_id에 이미 있거나, old_id가 여러 개인 경우 충돌할 수 있다.
with scope_rank as (
  select s.ctid,
         s.store_code,
         coalesce(m.keep_id::bigint, s.menu_id::bigint) as target_menu_id,
         row_number() over (
           partition by s.store_code, coalesce(m.keep_id::bigint, s.menu_id::bigint)
           order by case when m.old_id is null then 0 else 1 end, s.menu_id, s.ctid
         ) as rn
  from pos_menu_store_scopes s
  left join _pos_menu_code_dup_map m
    on s.menu_id::bigint = m.old_id
)
delete from pos_menu_store_scopes s
using scope_rank r
where s.ctid = r.ctid
  and r.rn > 1;

update pos_menu_store_scopes s
set menu_id = m.keep_id
from _pos_menu_code_dup_map m
where s.menu_id::bigint = m.old_id
  and s.menu_id::bigint <> m.keep_id;

-- 2) pos_menus(id)를 참조하는 FK 테이블을 자동 탐지해 menu_id를 canonical id로 통합
do $$
declare
  rec record;
begin
  for rec in
    select ns.nspname as schema_name,
           cls.relname as table_name,
           att.attname as column_name
    from pg_constraint c
    join pg_class cls on cls.oid = c.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join unnest(c.conkey) as ck(attnum) on true
    join pg_attribute att on att.attrelid = c.conrelid and att.attnum = ck.attnum
    where c.contype = 'f'
      and c.confrelid = 'public.pos_menus'::regclass
      and ns.nspname = 'public'
      and not (ns.nspname = 'public' and cls.relname = 'pos_menu_store_scopes' and att.attname = 'menu_id')
  loop
    execute format(
      'update %I.%I t
          set %I = m.keep_id
         from _pos_menu_code_dup_map m
        where t.%I = m.old_id
          and t.%I <> m.keep_id',
      rec.schema_name, rec.table_name, rec.column_name, rec.column_name, rec.column_name
    );
  end loop;
end $$;

-- 3) pos_printer_settings JSON 키(menu_id 문자열)도 canonical id로 치환
--    동일 목적지 키가 충돌하면 기존 키(keep_id) 값을 우선 유지
with rebuilt as (
  select s.ctid as row_ptr,
         (
           select coalesce(jsonb_object_agg(k2, v2), '{}'::jsonb)
           from (
             select k2, v2
             from (
               select coalesce(m.keep_id::text, kv.key) as k2,
                      kv.value as v2,
                      row_number() over (
                        partition by coalesce(m.keep_id::text, kv.key)
                        order by case when m.old_id is null then 0 else 1 end, kv.key
                      ) as rn
               from jsonb_each(coalesce(s.kitchen_route_by_menu, '{}'::jsonb)) kv
               left join _pos_menu_code_dup_map m
                 on kv.key ~ '^\d+$'
                and kv.key::bigint = m.old_id
             ) x
             where x.rn = 1
           ) y
         ) as route_map
  from pos_printer_settings s
)
update pos_printer_settings s
set kitchen_route_by_menu = r.route_map
from rebuilt r
where s.ctid = r.row_ptr
  and s.kitchen_route_by_menu is distinct from r.route_map;

-- 4) 중복으로 밀려난 메뉴 행은 비활성화 + code를 고유 접미사로 변경
update pos_menus pm
set is_active = false,
    code = concat(trim(coalesce(pm.code, '')), '__dup_', pm.id)
from _pos_menu_code_dup_map m
where pm.id = m.old_id
  and position('__dup_' in coalesce(pm.code, '')) = 0;

-- 5) code 정규화 unique 인덱스 적용 (공백/대소문자 무시)
create unique index if not exists ux_pos_menus_code_norm
  on public.pos_menus ((lower(trim(code))))
  where trim(coalesce(code, '')) <> '';

-- [사후 검증] 중복이 0이어야 함
select lower(trim(code)) as code_key, count(*) as row_count
from pos_menus
where trim(coalesce(code, '')) <> ''
group by lower(trim(code))
having count(*) > 1
order by code_key;
