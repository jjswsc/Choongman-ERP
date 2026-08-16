-- Omni SaaS: 기능(모듈)별 요금 — 글로벌 기본가 + 고객사별 오버라이드
-- tenant_module_pricing 미배포 시 API는 코드 기본값(DEFAULT_SAAS_MODULE_PRICES)으로 동작

create table if not exists public.saas_module_price_catalog (
  module_key text primary key,
  monthly_price numeric(14,2) not null default 0,
  yearly_price numeric(14,2) not null default 0,
  is_per_unit boolean not null default false,
  is_custom_quote boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_module_pricing (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  module_key text not null,
  monthly_price numeric(14,2) not null default 0,
  yearly_price numeric(14,2) not null default 0,
  is_enabled boolean not null default false,
  is_per_unit boolean not null default false,
  is_custom_quote boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_key)
);

create index if not exists idx_tenant_module_pricing_tenant
  on public.tenant_module_pricing (tenant_id);

-- 고객사별 요금 산정 방식: stage(패키지) | module(기능별)
alter table if exists public.tenant_policy_settings
  add column if not exists pricing_mode text not null default 'stage';

do $$
begin
  if to_regclass('public.tenant_policy_settings') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'tenant_policy_settings_pricing_mode_chk'
    ) then
      alter table public.tenant_policy_settings
      add constraint tenant_policy_settings_pricing_mode_chk
      check (pricing_mode in ('stage', 'module'));
    end if;
  end if;
end $$;

-- POS 단말 과금 기준: erp_admin | saas_limit | usage
alter table if exists public.tenant_policy_settings
  add column if not exists pos_device_billing_basis text not null default 'usage';

do $$
begin
  if to_regclass('public.tenant_policy_settings') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'tenant_policy_settings_pos_billing_basis_chk'
    ) then
      alter table public.tenant_policy_settings
      add constraint tenant_policy_settings_pos_billing_basis_chk
      check (pos_device_billing_basis in ('erp_admin', 'saas_limit', 'usage'));
    end if;
  end if;
end $$;

-- 글로벌 기본가 (THB, 월간) — 앱 DEFAULT_SAAS_MODULE_PRICES 와 동기
insert into public.saas_module_price_catalog (module_key, monthly_price, yearly_price, is_per_unit, is_custom_quote, sort_order)
values
  ('pos_base', 300, 3000, false, false, 10),
  ('pos_device', 100, 1000, true, false, 20),
  ('store_ops', 50, 500, false, false, 25),
  ('kbank', 300, 3000, false, false, 30),
  ('grab', 300, 3000, false, false, 40),
  ('member_mgmt', 100, 1000, false, false, 50),
  ('attendance', 100, 1000, false, false, 60),
  ('cost_analysis', 50, 500, false, false, 70),
  ('work_log', 50, 500, false, false, 80),
  ('notices', 50, 500, false, false, 90),
  ('documents', 50, 500, false, false, 100),
  ('marketing', 100, 1000, false, false, 110),
  ('logistics', 100, 1000, false, false, 120),
  ('accounting', 100, 1000, false, false, 130),
  ('ai_center', 0, 0, false, true, 140)
on conflict (module_key) do update set
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  is_per_unit = excluded.is_per_unit,
  is_custom_quote = excluded.is_custom_quote,
  sort_order = excluded.sort_order,
  updated_at = now();
