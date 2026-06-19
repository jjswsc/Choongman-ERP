-- 회원앱 주문 채널 (홀/배달/포장/회원 중 4번째)
-- 기본값: 포장(sell_packaging)과 동일. 프로모 미러는 pos_promos 채널로 백필.

alter table if exists public.pos_menus
  add column if not exists sell_member boolean not null default true;

alter table if exists public.pos_menu_options
  add column if not exists sell_member boolean not null default true;

comment on column public.pos_menus.sell_member is '회원앱 픽업 주문에서 노출/판매할지 여부 (기본은 포장과 동일하게 운영)';
comment on column public.pos_menu_options.sell_member is '회원앱 픽업 주문 옵션 노출 여부';

-- 포장 설정과 동일하게 1차 백필
update public.pos_menus
set sell_member = coalesce(sell_packaging, true)
where sell_member is distinct from coalesce(sell_packaging, true);

update public.pos_menu_options
set sell_member = coalesce(sell_packaging, true)
where sell_member is distinct from coalesce(sell_packaging, true);

-- 프로모 미러: 프로모 채널 플래그와 동기화 (배달 전용 세트는 회원앱에서 제외)
update public.pos_menus pm
set
  sell_hall = coalesce(p.channel_hall, pm.sell_hall, true),
  sell_delivery = coalesce(p.channel_delivery, pm.sell_delivery, true),
  sell_packaging = coalesce(p.channel_takeout, pm.sell_packaging, true),
  sell_member = coalesce(p.channel_takeout, pm.sell_packaging, true)
from public.pos_promos p
where pm.promo_id = p.id;
