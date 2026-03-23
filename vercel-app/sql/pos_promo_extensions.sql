-- 프로모션 확장: 채널·기간·분류·미러 메뉴 연동
-- Supabase SQL Editor에서 실행 (이미 있으면 IF NOT EXISTS로 스킵)
--
-- INSERT 시 42501 (row-level security) 이면:
--   · Vercel에 SUPABASE_SERVICE_ROLE_KEY 설정 권장, 또는
--   · pos_promos → sql/pos_promos_rls_policies.sql
--   · pos_menus(미러 메뉴) → sql/pos_menus_rls_policies.sql

alter table public.pos_promos
  add column if not exists category_main text;

-- 마케팅 캠페인 연결 (테이블이 있으면 FK 추가 가능)
alter table public.pos_promos
  add column if not exists marketing_campaign_id bigint;

comment on column public.pos_promos.marketing_campaign_id is 'marketing_campaigns.id (선택). FK는 DB에 캠페인 테이블이 있을 때 별도 추가 가능.';

alter table public.pos_promos
  add column if not exists channel_hall boolean not null default true;

alter table public.pos_promos
  add column if not exists channel_takeout boolean not null default true;

alter table public.pos_promos
  add column if not exists channel_delivery boolean not null default true;

alter table public.pos_promos
  add column if not exists delivery_app_codes jsonb;

alter table public.pos_promos
  add column if not exists discount_percent numeric(7,2);

alter table public.pos_promos
  add column if not exists valid_from date;

alter table public.pos_promos
  add column if not exists valid_to date;

alter table public.pos_menus
  add column if not exists promo_id bigint references public.pos_promos (id) on delete set null;

create unique index if not exists idx_pos_menus_promo_id_unique
  on public.pos_menus (promo_id)
  where promo_id is not null;

comment on column public.pos_menus.promo_id is '프로모션 마스터와 연동된 미러 메뉴(1:1)';

-- 기존 행 백필: 대분류 없으면 프로모션 통일
update public.pos_promos
set category_main = 'Promotion'
where category_main is null or nullif(trim(category_main), '') is null;
