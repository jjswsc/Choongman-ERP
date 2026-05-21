-- POS 메뉴 이미지 URL ↔ pos_menus.id 불일치 점검
-- 증상: 메뉴 저장 시 "이 메뉴(id N)용 사진이 아닙니다. 파일은 메뉴 id M용..."
-- 원인: 메뉴 id/코드 재배정 후 예전 Storage 파일명(id)이 image 컬럼에 남음
--
-- Storage 규칙: {timestamp}-{menuId}_{suffix}
-- 앱 검증: vercel-app/lib/pos-menu-image-storage-path.ts

-- ── 1) 불일치 목록 (pos-menu-images URL만) ──
with parsed as (
  select
    pm.id as menu_id,
    pm.code,
    pm.name,
    pm.is_active,
    pm.category_main,
    pm.category,
    pm.image,
    (regexp_match(pm.image, '[0-9]+-([0-9]+)[\._]'))[1]::bigint as file_menu_id
  from public.pos_menus pm
  where trim(coalesce(pm.image, '')) <> ''
    and pm.image ilike '%pos-menu-images%'
)
select
  menu_id,
  code,
  name,
  is_active,
  category_main,
  category,
  file_menu_id,
  left(image, 120) as image_sample
from parsed
where file_menu_id is not null
  and file_menu_id <> menu_id
order by menu_id;

-- ── 2) 요약 건수 ──
with parsed as (
  select
    pm.id as menu_id,
    (regexp_match(pm.image, '[0-9]+-([0-9]+)[\._]'))[1]::bigint as file_menu_id
  from public.pos_menus pm
  where trim(coalesce(pm.image, '')) <> ''
    and pm.image ilike '%pos-menu-images%'
)
select
  count(*) filter (where file_menu_id is not null and file_menu_id <> menu_id) as mismatch_count,
  count(*) filter (where file_menu_id is null) as unparsed_pos_menu_images,
  count(*) as pos_menu_images_total
from parsed;

-- ── 3) 떡볶이(T001~T003) 빠른 확인 ──
select
  pm.id,
  pm.code,
  pm.name,
  pm.image,
  (regexp_match(pm.image, '[0-9]+-([0-9]+)[\._]'))[1]::bigint as file_menu_id
from public.pos_menus pm
where upper(trim(pm.code)) in ('T001', 'T002', 'T003')
order by pm.id;

-- ── 4) (선택) 불일치 image URL 초기화 — 사진은 메뉴 화면에서 다시 업로드
-- begin;
-- update public.pos_menus pm
-- set image = ''
-- where pm.id in (
--   select p.menu_id
--   from (
--     select
--       pm2.id as menu_id,
--       (regexp_match(pm2.image, '[0-9]+-([0-9]+)[\._]'))[1]::bigint as file_menu_id
--     from public.pos_menus pm2
--     where trim(coalesce(pm2.image, '')) <> ''
--       and pm2.image ilike '%pos-menu-images%'
--   ) p
--   where p.file_menu_id is not null
--     and p.file_menu_id <> p.menu_id
-- );
-- commit;
