-- The Street Grab 메뉴·프로모 진단 (CM The Street Ratchada / partner 1050)
-- Supabase SQL Editor에서 전체 실행.
-- pos_grab_store_integrations 는 선택 DDL — 없어도 아래는 동작한다.

-- ═══════════════════════════════════════════════════════════════════
-- §0 테이블 존재 여부
-- ═══════════════════════════════════════════════════════════════════
select
  to_regclass('public.pos_grab_store_integrations') is not null as has_pos_grab_store_integrations,
  to_regclass('public.pos_grab_webhook_events') is not null as has_pos_grab_webhook_events,
  to_regclass('public.pos_menu_store_scopes') is not null as has_pos_menu_store_scopes;

-- ═══════════════════════════════════════════════════════════════════
-- §1 The Street Grab ID (코드 기본값 — Vercel GRAB_STORE_MAP_JSON 과 동일해야 함)
-- ═══════════════════════════════════════════════════════════════════
select *
from (
  values
    ('CM The Street Ratchada', '1050', '3-C7KJGBUEJND1VX', 'The Street Ratchada (ERP canonical)'),
    ('CM The Street', '1050', '3-C7KJGBUEJND1VX', 'POS 별칭 — 스코프 매칭 시 사용될 수 있음'),
    ('CM the street', '1050', '3-C7KJGBUEJND1VX', '소문자 별칭')
) as t(erp_store_code, partner_merchant_id, grab_merchant_id, note);

-- ═══════════════════════════════════════════════════════════════════
-- §2 프로모 기간·Grab 배달 채널 (전 매장 공통 마스터)
-- ═══════════════════════════════════════════════════════════════════
select
  id,
  code,
  name,
  is_active,
  valid_from,
  valid_to,
  grab_campaign_start_time_bkk,
  grab_campaign_end_time_bkk,
  channel_delivery,
  delivery_app_codes,
  price,
  price_delivery,
  (timezone('Asia/Bangkok', now()))::date as today_bkk,
  case
    when is_active = false then 'inactive'
    when valid_from is not null
      and (timezone('Asia/Bangkok', now()))::date < valid_from::date then 'before_valid_from'
    when valid_to is not null
      and (timezone('Asia/Bangkok', now()))::date > valid_to::date then 'after_valid_to'
    when channel_delivery = false then 'delivery_off'
    else 'visible_candidate'
  end as visibility_hint
from pos_promos
where name ilike '%festival%'
   or name ilike '%april%'
   or name ilike '%111%'
order by name;

-- ═══════════════════════════════════════════════════════════════════
-- §3 프로모 미러 메뉴 + 매장 스코프 (The Street / Bangna 비교)
-- ═══════════════════════════════════════════════════════════════════
with promo_mirrors as (
  select
    pm.id as menu_id,
    pm.name as menu_name,
    pm.promo_id,
    pm.is_active,
    pm.sell_delivery,
    pp.name as promo_name
  from pos_menus pm
  left join pos_promos pp on pp.id = pm.promo_id
  where pm.promo_id is not null
    and (
      pm.name ilike '%festival%'
      or pm.name ilike '%april%'
      or pm.name ilike '%111%'
      or pp.name ilike '%festival%'
      or pp.name ilike '%april%'
    )
),
scopes as (
  select
    menu_id,
    array_agg(distinct trim(store_code) order by trim(store_code))
      filter (where enabled is distinct from false) as scoped_stores
  from pos_menu_store_scopes
  group by menu_id
)
select
  m.menu_id,
  m.menu_name,
  m.promo_id,
  m.promo_name,
  m.is_active,
  m.sell_delivery,
  coalesce(s.scoped_stores, array[]::text[]) as scoped_stores,
  case
    when s.scoped_stores is null or cardinality(s.scoped_stores) = 0 then 'all_stores_compat_mode'
    when exists (
      select 1
      from unnest(s.scoped_stores) sc
      where lower(replace(replace(replace(sc, ' ', ''), '-', ''), '_', ''))
        in (
          lower(replace(replace(replace('CM The Street Ratchada', ' ', ''), '-', ''), '_', '')),
          lower(replace(replace(replace('CM The Street', ' ', ''), '-', ''), '_', '')),
          lower(replace(replace(replace('CM the street', ' ', ''), '-', ''), '_', ''))
        )
    ) then 'the_street_in_scope'
    else 'the_street_NOT_in_scope'
  end as the_street_scope_hint,
  case
    when exists (
      select 1
      from unnest(coalesce(s.scoped_stores, array[]::text[])) sc
      where lower(sc) like '%bangna%'
    ) then 'bangna_in_scope'
    when s.scoped_stores is null or cardinality(s.scoped_stores) = 0 then 'bangna_all_stores_compat'
    else 'bangna_NOT_in_scope'
  end as bangna_scope_hint
from promo_mirrors m
left join scopes s on s.menu_id = m.menu_id
order by m.promo_name, m.menu_name;

-- ═══════════════════════════════════════════════════════════════════
-- §4 Grab 연동 스냅샷 (테이블 있을 때만)
-- ═══════════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.pos_grab_store_integrations') is null then
    raise notice 'pos_grab_store_integrations 없음 — vercel-app/sql/pos_grab_store_integrations.sql 배포 후 §4b 실행';
  end if;
end $$;

-- §4b (테이블 배포 후 주석 해제)
-- select grab_merchant_id, partner_merchant_id, integration_status, updated_at, last_message
-- from pos_grab_store_integrations
-- where partner_merchant_id = '1050'
--    or grab_merchant_id = '3-C7KJGBUEJND1VX'
-- order by updated_at desc;

-- ═══════════════════════════════════════════════════════════════════
-- §5 최근 Grab 웹훅 (1050 / The Street 주문·메뉴, 테이블 있을 때)
-- ═══════════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.pos_grab_webhook_events') is null then
    raise notice 'pos_grab_webhook_events 없음 — vercel-app/sql/pos_grab_webhook_events.sql 참고';
  end if;
end $$;

-- §5b (테이블 있을 때 주석 해제)
-- select event_kind, count(*) as n, max(received_at at time zone 'Asia/Bangkok') as last_bkk
-- from pos_grab_webhook_events
-- where partner_merchant_id = '1050'
--    or merchant_id = '3-C7KJGBUEJND1VX'
--    or received_at > now() - interval '7 days'
-- group by event_kind
-- order by last_bkk desc nulls last;

-- ═══════════════════════════════════════════════════════════════════
-- §6 The Street 최근 Grab 주문 store_code (실제 저장 코드 확인)
-- ═══════════════════════════════════════════════════════════════════
select
  store_code,
  count(*) as order_count,
  max(created_at at time zone 'Asia/Bangkok') as last_order_bkk
from pos_orders
where (
  store_code ilike '%street%'
  or memo ilike '%grab%'
)
  and created_at > now() - interval '14 days'
group by store_code
order by order_count desc;
