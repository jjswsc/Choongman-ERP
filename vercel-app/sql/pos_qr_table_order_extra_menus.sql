-- QR 패키지(299/399/499) Extra 탭에 보여줄 유료 메뉴 지정.
-- Included(0฿)는 기존 pos_buffet_tier_menus 그대로.
-- 이 테이블에 행이 있는 패키지만 Extra를 해당 메뉴로 제한.
-- 행이 없으면 Extra = 포함 메뉴를 뺀 홀 메뉴 전체(기존 동작).

create table if not exists public.pos_buffet_tier_extra_menus (
  tier_id bigint not null references public.pos_buffet_tiers (id) on delete cascade,
  menu_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (tier_id, menu_id)
);

create index if not exists pos_buffet_tier_extra_menus_menu_idx
  on public.pos_buffet_tier_extra_menus (menu_id);

comment on table public.pos_buffet_tier_extra_menus is
  'QR buffet extras allowlist per tier. Empty = all non-included hall menus.';
