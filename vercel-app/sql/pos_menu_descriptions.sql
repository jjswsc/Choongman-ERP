-- POS 메뉴/옵션 채널별 설명 컬럼
-- 적용 후 /admin/pos-menus 의 메뉴정보 탭에서 설명을 입력할 수 있습니다.

alter table if exists public.pos_menus
  add column if not exists description_default text not null default '',
  add column if not exists description_delivery text,
  add column if not exists description_table text;

alter table if exists public.pos_menu_options
  add column if not exists description_default text not null default '',
  add column if not exists description_delivery text,
  add column if not exists description_table text;
