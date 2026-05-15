-- POS 주방 미출력(누락) 점검/복구 SQL
-- 대상 이슈: CHURRO(S001, id=13) 주방 누락 + 유사 메뉴 전체 점검
-- 실행 순서: 1) 긴급 복구 -> 2) 검증 -> 3) 전체 진단

begin;

-- 1) 긴급 복구: CHURRO(id=13) 주방1로 복원
update pos_menus
set kitchen_printer = 1
where id = 13
  and code = 'S001'
  and name = 'CHURRO';

commit;

-- 2) 복구 검증
select id, code, name, kitchen_printer, category, category_main
from pos_menus
where id = 13;

-- 3) 유사 리스크 메뉴 점검

-- 3-1) 활성 메뉴인데 주방 미출력(0)인 메뉴 목록
-- NOTE: 사이드/음료 등 운영상 의도적으로 0인 메뉴가 있을 수 있으니 "검토 리스트" 용도.
select id, code, name, kitchen_printer, category, category_main, is_active, sold_out_date
from pos_menus
where is_active = true
  and coalesce(kitchen_printer, 1) = 0
order by category_main, category, code, name, id;

-- 3-2) 같은 코드(code)인데 kitchen_printer 값이 서로 다른 경우
select lower(trim(code)) as code_key,
       count(*) as row_count,
       array_agg(id order by id) as ids,
       array_agg(distinct coalesce(kitchen_printer, -1) order by coalesce(kitchen_printer, -1)) as kitchen_printers
from pos_menus
where trim(coalesce(code, '')) <> ''
group by lower(trim(code))
having count(*) > 1
   and count(distinct coalesce(kitchen_printer, -1)) > 1
order by code_key;

-- 3-3) 같은 이름(name)인데 kitchen_printer 값이 서로 다른 경우
select lower(trim(name)) as name_key,
       count(*) as row_count,
       array_agg(id order by id) as ids,
       array_agg(distinct coalesce(kitchen_printer, -1) order by coalesce(kitchen_printer, -1)) as kitchen_printers
from pos_menus
where trim(coalesce(name, '')) <> ''
group by lower(trim(name))
having count(*) > 1
   and count(distinct coalesce(kitchen_printer, -1)) > 1
order by name_key;

-- 3-4) 최근 주문에서 menuId -> pos_menus.kitchen_printer=0 으로 빠질 수 있는 줄 추적
-- NOTE: items_json 타입이 text/json/jsonb 어느 경우든 캐스팅 가능하다는 전제.
with order_items as (
  select
    o.id as order_id,
    o.order_no,
    o.store_code,
    o.status,
    o.created_at,
    it as item_json,
    coalesce(nullif(it->>'menuId1', ''), nullif(it->>'menu_id1', ''), nullif(it->>'menuId', '')) as menu_id_text,
    coalesce(it->>'name', '') as item_name
  from pos_orders o
  cross join lateral jsonb_array_elements(
    case
      when o.items_json is null then '[]'::jsonb
      when jsonb_typeof(o.items_json::jsonb) = 'array' then o.items_json::jsonb
      else '[]'::jsonb
    end
  ) as it
  where o.created_at >= now() - interval '30 days'
)
select
  oi.order_no,
  oi.store_code,
  oi.status,
  oi.created_at,
  oi.item_name,
  oi.menu_id_text as menu_id,
  pm.code as menu_code,
  pm.name as menu_name,
  pm.kitchen_printer
from order_items oi
left join pos_menus pm
  on pm.id::text = oi.menu_id_text
where oi.menu_id_text is not null
  and oi.menu_id_text <> ''
  and coalesce(pm.kitchen_printer, 1) = 0
order by oi.created_at desc, oi.order_no;

-- 3-5) pos_printer_settings 에 kitchen_route_* 컬럼이 있는지 확인
-- 결과가 비어 있으면: `vercel-app/sql/pos_printer_kitchen_routes.sql` 을 Supabase에서 한 번 실행한 뒤,
-- `vercel-app/sql/pos_kitchen_printer_audit_route_map_mismatch.sql` 로 설정↔메뉴 불일치를 점검하세요.
-- (컬럼이 없는 DB에서 kitchen_route_by_menu 를 참조하는 쿼리는 파싱 단계에서 오류가 나므로 이 파일에는 넣지 않음.)
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pos_printer_settings'
  and column_name in (
    'kitchen_route_by_menu',
    'kitchen_route_by_category',
    'kitchen_route_by_category_main'
  )
order by column_name;
