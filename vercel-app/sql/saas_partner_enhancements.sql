-- SaaS 대리점 고도화: 정산 · 모듈별 마진 · 카탈로그 재가격 정책
-- saas_partner_reseller.sql 실행 후

alter table if exists public.saas_partners
  add column if not exists catalog_reprice_policy text not null default 'retain_margin_pct';

do $$
begin
  if to_regclass('public.saas_partners') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'saas_partners_catalog_reprice_policy_chk'
    ) then
      alter table public.saas_partners
      add constraint saas_partners_catalog_reprice_policy_chk
      check (catalog_reprice_policy in ('retain_margin_pct', 'retain_margin_amount', 'retain_retail'));
    end if;
  end if;
end $$;

create table if not exists public.saas_partner_margin_rules (
  id bigserial primary key,
  partner_id text not null references public.saas_partners(id) on delete cascade,
  module_key text not null,
  margin_pct numeric(6,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (partner_id, module_key)
);

create index if not exists idx_saas_partner_margin_rules_partner
  on public.saas_partner_margin_rules (partner_id);

create table if not exists public.saas_partner_settlements (
  id bigserial primary key,
  partner_id text not null references public.saas_partners(id) on delete cascade,
  period_ym text not null,
  currency text not null default 'THB',
  wholesale_total numeric(14,2) not null default 0,
  margin_total numeric(14,2) not null default 0,
  retail_total numeric(14,2) not null default 0,
  tenant_count integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'paid')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, period_ym)
);

create index if not exists idx_saas_partner_settlements_partner_period
  on public.saas_partner_settlements (partner_id, period_ym desc);
