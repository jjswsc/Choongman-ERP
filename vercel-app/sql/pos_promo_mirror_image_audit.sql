-- 프로모션 미러 메뉴 이미지 진단
-- 증상: 세트(프로모션) 대표 이미지를 지정했는데 밥/사이드 이미지가 표시됨
-- 핵심 원인 후보:
-- 1) pos_menus 미러 행(promo_id 연결)의 image 값이 비어있음 -> 구성품 이미지 fallback
-- 2) 미러 image가 구성품(특히 side/rice)과 동일하게 저장되어 있음
-- 3) 편집한 대상이 pos_menus 미러가 아닌 다른 화면(예: 캠페인 배너)이라 POS 대표이미지에 반영되지 않음

-- A) 미러 메뉴 상태 + fallback 후보(구성품 첫 이미지)
with first_component_image as (
  select
    mirror.id as mirror_menu_id,
    (
      select comp.id
      from public.pos_promo_items pi
      join public.pos_menus comp on comp.id = pi.menu_id
      where pi.promo_id = mirror.promo_id
        and trim(coalesce(comp.image, '')) <> ''
      order by pi.sort_order asc nulls last, pi.id asc
      limit 1
    ) as first_component_menu_id,
    (
      select comp.image
      from public.pos_promo_items pi
      join public.pos_menus comp on comp.id = pi.menu_id
      where pi.promo_id = mirror.promo_id
        and trim(coalesce(comp.image, '')) <> ''
      order by pi.sort_order asc nulls last, pi.id asc
      limit 1
    ) as first_component_image
  from public.pos_menus mirror
  where mirror.promo_id is not null
)
select
  mirror.id as mirror_menu_id,
  mirror.promo_id,
  promo.code as promo_code,
  promo.name as promo_name,
  mirror.code as mirror_code,
  mirror.name as mirror_name,
  trim(coalesce(mirror.image, '')) as mirror_image,
  f.first_component_menu_id,
  trim(coalesce(f.first_component_image, '')) as first_component_image,
  case
    when trim(coalesce(mirror.image, '')) = '' then 'mirror_blank_fallback_active'
    when trim(coalesce(f.first_component_image, '')) <> ''
      and trim(coalesce(mirror.image, '')) = trim(coalesce(f.first_component_image, ''))
      then 'mirror_equals_first_component'
    else 'mirror_custom_or_other'
  end as image_status
from public.pos_menus mirror
left join public.pos_promos promo on promo.id = mirror.promo_id
left join first_component_image f on f.mirror_menu_id = mirror.id
where mirror.promo_id is not null
order by mirror.code, mirror.id;

-- B) side/rice가 대표로 잡힐 위험 행만 추림
with component_rank as (
  select
    mirror.id as mirror_menu_id,
    mirror.code as mirror_code,
    mirror.name as mirror_name,
    mirror.promo_id,
    trim(coalesce(mirror.image, '')) as mirror_image,
    pi.menu_id as component_menu_id,
    trim(coalesce(comp.image, '')) as component_image,
    lower(concat_ws(' ',
      coalesce(comp.code, ''),
      coalesce(comp.name, ''),
      coalesce(comp.category_main, ''),
      coalesce(comp.category, '')
    )) as comp_haystack,
    row_number() over (
      partition by mirror.id
      order by pi.sort_order asc nulls last, pi.id asc
    ) as rn
  from public.pos_menus mirror
  join public.pos_promo_items pi on pi.promo_id = mirror.promo_id
  join public.pos_menus comp on comp.id = pi.menu_id
  where mirror.promo_id is not null
    and trim(coalesce(comp.image, '')) <> ''
)
select
  c.mirror_menu_id,
  c.mirror_code,
  c.mirror_name,
  c.promo_id,
  c.component_menu_id as first_component_menu_id,
  c.component_image as first_component_image,
  c.mirror_image,
  case
    when c.comp_haystack ~ '(side|drink|beverage|rice|치킨무|kimchi|pickled radish|무|사이드|음료|ข้าว|เครื่องดื่ม|กิมจิ|หัวไชเท้า)'
      then 'first_component_is_side_or_rice_like'
    else 'not_side_like'
  end as risk_tag
from component_rank c
where c.rn = 1
  and c.comp_haystack ~ '(side|drink|beverage|rice|치킨무|kimchi|pickled radish|무|사이드|음료|ข้าว|เครื่องดื่ม|กิมจิ|หัวไชเท้า)'
order by c.mirror_code, c.mirror_menu_id;

-- C) 보정: mirror.image가 구성품(밥·치킨)과 동일 URL이면 비우기 → Delivery Ops에서 세트 사진 재업로드
-- vercel-app/sql/pos_promo_mirror_image_fix_side_copy.sql
-- (구성품 이미지를 미러에 복사하는 pos_menu_sync_mirror_image_from_promo_items.sql 는 사용 중단)

