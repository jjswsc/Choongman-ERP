-- POS 채널(홀/배달/포장) + Grab 연동 점검
-- 사용법:
-- 1) 필요 시 params.store_code 값을 특정 매장코드로 바꾼다. (null = 전체)
-- 2) Supabase SQL Editor에서 전체 실행
-- 3) summary에서 row_count가 0이 아닌 항목을 details에서 확인

-- optional table shim: public.pos_grab_store_integrations
drop table if exists _audit_grab_integrations;
create temporary table _audit_grab_integrations (
  grab_merchant_id text,
  partner_merchant_id text,
  integration_status text,
  updated_at timestamptz,
  last_request_id text,
  last_message text
);

do $$
begin
  if to_regclass('public.pos_grab_store_integrations') is not null then
    execute '
      insert into _audit_grab_integrations
      (grab_merchant_id, partner_merchant_id, integration_status, updated_at, last_request_id, last_message)
      select
        grab_merchant_id::text,
        partner_merchant_id::text,
        integration_status::text,
        updated_at,
        last_request_id::text,
        last_message::text
      from public.pos_grab_store_integrations
    ';
  else
    insert into _audit_grab_integrations(integration_status, last_message)
    values ('table_missing', 'public.pos_grab_store_integrations not found');
  end if;
end $$;

-- optional table shim: public.pos_grab_webhook_events (24h aggregate)
drop table if exists _audit_grab_webhook_events_recent;
create temporary table _audit_grab_webhook_events_recent (
  event_kind text,
  event_count bigint
);

do $$
begin
  if to_regclass('public.pos_grab_webhook_events') is not null then
    execute '
      insert into _audit_grab_webhook_events_recent(event_kind, event_count)
      select event_kind::text, count(*)::bigint
      from public.pos_grab_webhook_events
      where received_at >= now() - interval ''24 hours''
      group by event_kind
    ';
    if not exists (select 1 from _audit_grab_webhook_events_recent) then
      insert into _audit_grab_webhook_events_recent(event_kind, event_count)
      values ('no_events_last_24h', 0);
    end if;
  else
    insert into _audit_grab_webhook_events_recent(event_kind, event_count)
    values ('table_missing', 0);
  end if;
end $$;

-- optional table shim: public.pos_delivery_menu_images
drop table if exists _audit_delivery_menu_images;
create temporary table _audit_delivery_menu_images (
  store_code text,
  app_code text,
  menu_id bigint,
  image_url text
);

do $$
begin
  if to_regclass('public.pos_delivery_menu_images') is not null then
    execute '
      insert into _audit_delivery_menu_images(store_code, app_code, menu_id, image_url)
      select
        store_code::text,
        app_code::text,
        menu_id::bigint,
        image_url::text
      from public.pos_delivery_menu_images
    ';
  end if;
end $$;

-- 점검용 공통 스냅샷 (CTE는 문장마다 사라지므로 temp table 사용)
drop table if exists _audit_params;
create temporary table _audit_params (
  store_code text
);
insert into _audit_params (store_code)
values (null);  -- 예: 'CM Office'

drop table if exists _audit_base_menus;
create temporary table _audit_base_menus as
select m.*
from public.pos_menus m
where coalesce(m.is_active, true) = true;

drop table if exists _audit_grab_enabled_stores;
create temporary table _audit_grab_enabled_stores as
select p.store_code
from public.pos_delivery_app_policies p
cross join _audit_params params
where p.app_code = 'grab'
  and p.enabled = true
  and (params.store_code is null or p.store_code = params.store_code);

drop table if exists _audit_grab_menu_rows;
create temporary table _audit_grab_menu_rows as
select dmp.*
from public.pos_delivery_menu_policies dmp
join _audit_grab_enabled_stores gs on gs.store_code = dmp.store_code
where dmp.app_code = 'grab';

-- summary
select 'menu_missing_hall_price'::text as check_name, count(*)::bigint as row_count
from _audit_base_menus m
where coalesce(m.price, 0) <= 0
union all
select 'menu_missing_delivery_price', count(*)::bigint
from _audit_base_menus m
where coalesce(m.price_delivery, 0) <= 0
union all
select 'menu_missing_code', count(*)::bigint
from _audit_base_menus m
where trim(coalesce(m.code, '')) = ''
union all
select 'delivery_option_blank_option_code', count(*)::bigint
from public.pos_menu_options o
join _audit_base_menus m on m.id = o.menu_id
where coalesce(o.sell_delivery, true) = true
  and trim(coalesce(o.option_code, '')) = ''
union all
select 'delivery_option_code_prefix_mismatch', count(*)::bigint
from public.pos_menu_options o
join _audit_base_menus m on m.id = o.menu_id
where coalesce(o.sell_delivery, true) = true
  and trim(coalesce(o.option_code, '')) <> ''
  and split_part(trim(o.option_code), '-', 1) <> trim(coalesce(m.code, ''))
union all
select 'all_channel_sell_flags_false', count(*)::bigint
from public.pos_menu_options o
where coalesce(o.sell_hall, true) = false
  and coalesce(o.sell_delivery, true) = false
  and coalesce(o.sell_packaging, true) = false
union all
select 'grab_store_policy_missing', count(*)::bigint
from _audit_grab_enabled_stores gs
where gs.store_code is null
union all
select 'grab_menu_policy_enabled_but_menu_missing', count(*)::bigint
from _audit_grab_menu_rows dmp
left join _audit_base_menus m on m.id = dmp.menu_id
where coalesce(dmp.enabled, true) = true
  and m.id is null
union all
select 'grab_menu_policy_enabled_but_sold_out', count(*)::bigint
from _audit_grab_menu_rows dmp
where coalesce(dmp.enabled, true) = true
  and coalesce(dmp.sold_out, false) = true
union all
select 'grab_menu_image_missing', count(*)::bigint
from _audit_grab_menu_rows dmp
join _audit_base_menus m on m.id = dmp.menu_id
left join _audit_delivery_menu_images img
  on img.store_code = dmp.store_code
 and img.app_code = 'grab'
 and img.menu_id = dmp.menu_id
where coalesce(dmp.enabled, true) = true
  and trim(coalesce(img.image_url, m.image, '')) = ''
union all
select 'grab_integration_table_missing',
       case when to_regclass('public.pos_grab_store_integrations') is null then 1 else 0 end::bigint
union all
select 'grab_integration_not_connected', count(*)::bigint
from _audit_grab_integrations g
where lower(trim(coalesce(g.integration_status, ''))) not in ('connected', 'active', 'ok')
  and lower(trim(coalesce(g.integration_status, ''))) <> 'table_missing'
union all
select 'grab_webhook_table_missing',
       case when to_regclass('public.pos_grab_webhook_events') is null then 1 else 0 end::bigint
union all
select 'grab_webhook_events_last_24h_zero',
       case
         when to_regclass('public.pos_grab_webhook_events') is null then 0
         when coalesce((select sum(event_count) from _audit_grab_webhook_events_recent), 0) = 0 then 1
         else 0
       end::bigint
order by check_name;

-- =========================================================
-- details 1) 메뉴 가격/코드 누락
-- =========================================================
select
  m.id, m.code, m.name, m.price, m.price_delivery, m.category_main, m.category
from _audit_base_menus m
where coalesce(m.price, 0) <= 0
   or coalesce(m.price_delivery, 0) <= 0
   or trim(coalesce(m.code, '')) = ''
order by m.code, m.id;

-- =========================================================
-- details 2) 배달 옵션 코드/채널 플래그 이상
-- =========================================================
select
  o.id as option_id,
  o.menu_id,
  m.code as menu_code,
  m.name as menu_name,
  o.name as option_name,
  o.option_code,
  o.sell_hall, o.sell_delivery, o.sell_packaging,
  o.price_modifier, o.price_modifier_delivery, o.price_modifier_packaging,
  case
    when trim(coalesce(o.option_code, '')) = '' then 'blank_option_code'
    when split_part(trim(o.option_code), '-', 1) <> trim(coalesce(m.code, '')) then 'prefix_mismatch'
    when coalesce(o.sell_hall, true) = false
      and coalesce(o.sell_delivery, true) = false
      and coalesce(o.sell_packaging, true) = false then 'all_channels_off'
    else 'ok'
  end as issue
from public.pos_menu_options o
join _audit_base_menus m on m.id = o.menu_id
where (coalesce(o.sell_delivery, true) = true and trim(coalesce(o.option_code, '')) = '')
   or (coalesce(o.sell_delivery, true) = true
       and trim(coalesce(o.option_code, '')) <> ''
       and split_part(trim(o.option_code), '-', 1) <> trim(coalesce(m.code, '')))
   or (coalesce(o.sell_hall, true) = false
       and coalesce(o.sell_delivery, true) = false
       and coalesce(o.sell_packaging, true) = false)
order by m.code, o.id;

-- =========================================================
-- details 3) Grab 메뉴 정책 + 이미지 누락
-- =========================================================
select
  dmp.store_code,
  dmp.menu_id,
  m.code as menu_code,
  m.name as menu_name,
  dmp.enabled,
  dmp.sold_out,
  m.image as base_image_url,
  img.image_url as grab_override_image_url,
  case
    when m.id is null then 'menu_missing'
    when coalesce(dmp.enabled, true) = false then 'policy_disabled'
    when coalesce(dmp.sold_out, false) = true then 'policy_sold_out'
    when trim(coalesce(img.image_url, m.image, '')) = '' then 'image_missing'
    else 'ok'
  end as issue
from _audit_grab_menu_rows dmp
left join _audit_base_menus m on m.id = dmp.menu_id
left join _audit_delivery_menu_images img
  on img.store_code = dmp.store_code
 and img.app_code = 'grab'
 and img.menu_id = dmp.menu_id
where m.id is null
   or coalesce(dmp.enabled, true) = false
   or coalesce(dmp.sold_out, false) = true
   or trim(coalesce(img.image_url, m.image, '')) = ''
order by dmp.store_code, menu_code, dmp.menu_id;

-- =========================================================
-- details 4) Grab 통합 상태 / 최근 웹훅 샘플
-- =========================================================
select
  g.grab_merchant_id,
  g.partner_merchant_id,
  g.integration_status,
  g.updated_at,
  g.last_request_id,
  g.last_message
from _audit_grab_integrations g
order by g.updated_at desc nulls last;

select
  e.event_kind,
  e.event_count
from _audit_grab_webhook_events_recent e
order by e.event_count desc, e.event_kind;
