-- POS 메뉴 채널 노출 플래그(홀/배달/포장)
-- 메뉴 정보 체크박스 + 메뉴 화면 구성 유형 필터 연동용

alter table if exists public.pos_menus
  add column if not exists sell_hall boolean not null default true;

alter table if exists public.pos_menus
  add column if not exists sell_delivery boolean not null default true;

alter table if exists public.pos_menus
  add column if not exists sell_packaging boolean not null default true;

comment on column public.pos_menus.sell_hall is '메뉴를 홀(매장 주문)에서 노출/판매할지 여부';
comment on column public.pos_menus.sell_delivery is '메뉴를 배달 주문에서 노출/판매할지 여부';
comment on column public.pos_menus.sell_packaging is '메뉴를 포장 주문에서 노출/판매할지 여부';
