-- 1/2 미리보기 — CURRY / GARLIC Bar.B.Q FRIED CHICKEN 사진 URL 확인 (True 매장 제보: 두 사진이 서로 바뀜)
-- pos_menus.image 는 전 매장 공통. 매장별 사진 override 없음 → 교체하면 전 매장 POS 동일 반영.
-- 교체 후 검증도 이 파일을 다시 Run.

select
  pm.id,
  pm.code,
  pm.name,
  pm.is_active,
  (regexp_match(pm.image, '[0-9]+-([0-9]+)[\._]'))[1]::bigint as file_menu_id,
  pm.image,
  (
    select string_agg(s.store_code || '=' || coalesce(s.enabled::text, 'null'), ', ' order by s.store_code)
    from public.pos_menu_store_scopes s
    where s.menu_id = pm.id
      and (s.store_code ilike '%true%' or s.store_code = '1040')
  ) as true_store_scope
from public.pos_menus pm
where lower(regexp_replace(btrim(coalesce(pm.name, '')), '\s+', ' ', 'g'))
  in ('curry bar.b.q fried chicken', 'garlic bar.b.q fried chicken')
order by pm.name, pm.id;
