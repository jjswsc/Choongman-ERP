-- PostgREST 기본 정렬(PK store_code, menu_id)로 앞 1000/10000행만 읽었을 때
-- C010에 The Street·Huamak가 남는지
-- 로직: getPosMenus가 supabaseSelectAllPages 없이 한 방 조회

with ordered as (
  select
    menu_id,
    store_code,
    row_number() over (order by store_code, menu_id) as rn
  from public.pos_menu_store_scopes
  where enabled is distinct from false
),
c010 as (
  select *
  from ordered
  where menu_id = 25
)
select
  1000 as page_size,
  count(*) filter (where rn <= 1000) as c010_rows_in_page,
  coalesce(bool_or(rn <= 1000 and store_code = 'CM The street'), false) as has_the_street,
  coalesce(bool_or(rn <= 1000 and store_code = 'CM Huamak'), false) as has_huamak
from c010
union all
select
  10000,
  count(*) filter (where rn <= 10000),
  coalesce(bool_or(rn <= 10000 and store_code = 'CM The street'), false),
  coalesce(bool_or(rn <= 10000 and store_code = 'CM Huamak'), false)
from c010;
