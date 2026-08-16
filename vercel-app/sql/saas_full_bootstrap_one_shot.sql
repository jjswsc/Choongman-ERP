-- OmniFoodTech SaaS one-shot bootstrap
-- 이 파일 하나만 전체 실행하면 되도록 정리한 통합 스크립트입니다.
-- (기존 중복 SQL/뷰 컬럼 순서 충돌 제거)

-- =========================================================
-- 1) Core tenant-aware schema
-- =========================================================

create table if not exists public.tenants (
  id text primary key,
  company_name text not null,
  supabase_project_id text not null default 'default',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.erp_stores (
  id bigserial primary key,
  tenant_id text,
  store_name text not null,
  store_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id bigserial primary key,
  tenant_id text,
  company text,
  store text not null,
  name text not null,
  nick text,
  password text not null,
  role text,
  job text,
  employee_code text,
  extra_stores jsonb,
  join_date date,
  resign_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id bigserial primary key,
  tenant_id text,
  name text not null,
  gps_name text,
  type text,
  created_at timestamptz not null default now()
);

create table if not exists public.pos_orders (
  id bigserial primary key,
  tenant_id text,
  store_name text not null,
  order_no text,
  status text,
  total_amount numeric(14,2),
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 프로젝트 호환: 누락 컬럼 보강
alter table if exists public.employees add column if not exists tenant_id text;
alter table if exists public.employees add column if not exists company text;
alter table if exists public.employees add column if not exists nick text;
alter table if exists public.employees add column if not exists join_date date;
alter table if exists public.erp_stores add column if not exists tenant_id text;
alter table if exists public.vendors add column if not exists tenant_id text;
alter table if exists public.pos_orders add column if not exists tenant_id text;

create unique index if not exists uq_erp_stores_tenant_store_name
  on public.erp_stores (coalesce(tenant_id, ''), store_name);

create index if not exists idx_employees_tenant_id on public.employees (tenant_id);
create index if not exists idx_employees_store on public.employees (store);
create index if not exists idx_employees_name on public.employees (name);
create index if not exists idx_employees_company on public.employees (company);
create index if not exists idx_erp_stores_tenant_id on public.erp_stores (tenant_id);
create index if not exists idx_vendors_tenant_id on public.vendors (tenant_id);
create index if not exists idx_pos_orders_tenant_id on public.pos_orders (tenant_id);
create index if not exists idx_pos_orders_store_name on public.pos_orders (store_name);
create index if not exists idx_pos_orders_created_at on public.pos_orders (created_at desc);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employees_set_updated_at on public.employees;
create trigger trg_employees_set_updated_at
before update on public.employees
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_pos_orders_set_updated_at on public.pos_orders;
create trigger trg_pos_orders_set_updated_at
before update on public.pos_orders
for each row execute function public.set_row_updated_at();

-- =========================================================
-- 2) SaaS control plane
-- =========================================================

create table if not exists public.saas_plans (
  id text primary key,
  plan_name text not null,
  tier text not null check (tier in ('starter', 'growth', 'enterprise')),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  monthly_price numeric(12,2) not null default 0,
  yearly_price numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_saas_plans_name_cycle
  on public.saas_plans (lower(plan_name), billing_cycle);

create table if not exists public.saas_plan_features (
  id bigserial primary key,
  plan_id text not null references public.saas_plans(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, feature_key)
);

create table if not exists public.saas_plan_limits (
  plan_id text primary key references public.saas_plans(id) on delete cascade,
  max_stores integer not null default 1,
  max_manager_accounts integer not null default 3,
  max_staff_accounts integer not null default 20,
  max_tablets integer not null default 2,
  max_pos_devices integer not null default 2,
  max_api_keys integer not null default 1,
  monthly_order_quota integer not null default 10000,
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_subscriptions (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  plan_id text not null references public.saas_plans(id),
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'grace', 'suspended', 'cancelled')),
  trial_start_at timestamptz,
  trial_end_at timestamptz,
  current_period_start_at timestamptz,
  current_period_end_at timestamptz,
  next_billing_at timestamptz,
  last_payment_status text default 'unpaid'
    check (last_payment_status in ('paid', 'unpaid', 'failed', 'refunded')),
  overdue_grace_days integer not null default 3,
  auto_suspend_on_overdue boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_feature_overrides (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  feature_key text not null,
  is_enabled boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, feature_key)
);

create table if not exists public.tenant_limit_overrides (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  max_stores integer,
  max_manager_accounts integer,
  max_staff_accounts integer,
  max_tablets integer,
  max_pos_devices integer,
  max_api_keys integer,
  monthly_order_quota integer,
  allow_overage boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_policy_settings (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  sales_stage text not null default 'basic'
    check (sales_stage in ('basic', 'payment', 'delivery', 'erp1', 'erp2', 'ai')),
  support_tier text not null default 'standard'
    check (support_tier in ('standard', 'priority', 'dedicated')),
  require_2fa_admin boolean not null default false,
  require_ip_allowlist boolean not null default false,
  force_weekly_backup boolean not null default false,
  data_retention_days integer not null default 365,
  timezone text not null default 'Asia/Bangkok',
  updated_at timestamptz not null default now()
);

-- 구 버전 호환: sales_stage 컬럼/제약 보강
alter table if exists public.tenant_policy_settings
  add column if not exists sales_stage text not null default 'basic';

do $$
begin
  if to_regclass('public.tenant_policy_settings') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'tenant_policy_settings_sales_stage_chk'
    ) then
      alter table public.tenant_policy_settings
      add constraint tenant_policy_settings_sales_stage_chk
      check (sales_stage in ('basic', 'payment', 'delivery', 'erp1', 'erp2', 'ai'));
    end if;
  end if;
end $$;

create table if not exists public.tenant_stage_price_overrides (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  sales_stage text not null
    check (sales_stage in ('basic', 'payment', 'delivery', 'erp1', 'erp2', 'ai')),
  monthly_price numeric(14,2) not null default 0,
  yearly_price numeric(14,2) not null default 0,
  currency text not null default 'THB',
  updated_at timestamptz not null default now(),
  unique (tenant_id, sales_stage)
);

create index if not exists idx_tenant_stage_price_overrides_tenant
  on public.tenant_stage_price_overrides (tenant_id);

create table if not exists public.tenant_device_registry (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  store_name text,
  device_kind text not null check (device_kind in ('tablet', 'pos', 'kiosk', 'kds')),
  device_uuid text,
  display_name text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, device_kind, device_uuid)
);

create index if not exists idx_tenant_device_registry_tenant_active
  on public.tenant_device_registry (tenant_id, is_active, device_kind);

create table if not exists public.tenant_usage_daily (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  usage_date date not null,
  stores_used integer not null default 0,
  manager_accounts_used integer not null default 0,
  staff_accounts_used integer not null default 0,
  tablets_used integer not null default 0,
  pos_devices_used integer not null default 0,
  monthly_orders_used integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, usage_date)
);

create index if not exists idx_tenant_usage_daily_tenant_date
  on public.tenant_usage_daily (tenant_id, usage_date desc);

create table if not exists public.saas_audit_logs (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  action text not null,
  actor_name text,
  actor_role text,
  summary text,
  payload_json jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists idx_saas_audit_logs_tenant_changed_at
  on public.saas_audit_logs (tenant_id, changed_at desc);

create table if not exists public.saas_billing_events (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  event_type text not null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'THB',
  status text not null default 'ok',
  memo text,
  happened_at timestamptz not null default now()
);

create index if not exists idx_saas_billing_events_tenant_happened_at
  on public.saas_billing_events (tenant_id, happened_at desc);

create or replace function public.set_saas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_saas_plans_updated_at on public.saas_plans;
create trigger trg_saas_plans_updated_at
before update on public.saas_plans
for each row execute function public.set_saas_updated_at();

drop trigger if exists trg_saas_plan_features_updated_at on public.saas_plan_features;
create trigger trg_saas_plan_features_updated_at
before update on public.saas_plan_features
for each row execute function public.set_saas_updated_at();

drop trigger if exists trg_tenant_subscriptions_updated_at on public.tenant_subscriptions;
create trigger trg_tenant_subscriptions_updated_at
before update on public.tenant_subscriptions
for each row execute function public.set_saas_updated_at();

drop trigger if exists trg_tenant_feature_overrides_updated_at on public.tenant_feature_overrides;
create trigger trg_tenant_feature_overrides_updated_at
before update on public.tenant_feature_overrides
for each row execute function public.set_saas_updated_at();

drop trigger if exists trg_tenant_limit_overrides_updated_at on public.tenant_limit_overrides;
create trigger trg_tenant_limit_overrides_updated_at
before update on public.tenant_limit_overrides
for each row execute function public.set_saas_updated_at();

drop trigger if exists trg_tenant_policy_settings_updated_at on public.tenant_policy_settings;
create trigger trg_tenant_policy_settings_updated_at
before update on public.tenant_policy_settings
for each row execute function public.set_saas_updated_at();

-- =========================================================
-- 3) Consolidated view (컬럼 순서 충돌 방지: sales_stage는 맨 뒤)
-- =========================================================

create or replace view public.v_tenant_admin_settings as
select
  t.id as tenant_id,
  t.company_name,
  ts.subscription_status,
  ts.next_billing_at,
  ts.trial_end_at,
  p.id as plan_id,
  p.plan_name,
  p.tier,
  p.billing_cycle,
  coalesce(tlo.max_stores, pl.max_stores) as max_stores,
  coalesce(tlo.max_manager_accounts, pl.max_manager_accounts) as max_manager_accounts,
  coalesce(tlo.max_staff_accounts, pl.max_staff_accounts) as max_staff_accounts,
  coalesce(tlo.max_tablets, pl.max_tablets) as max_tablets,
  coalesce(tlo.max_pos_devices, pl.max_pos_devices) as max_pos_devices,
  coalesce(tlo.max_api_keys, pl.max_api_keys) as max_api_keys,
  coalesce(tlo.monthly_order_quota, pl.monthly_order_quota) as monthly_order_quota,
  tlo.allow_overage,
  tps.support_tier,
  tps.require_2fa_admin,
  tps.require_ip_allowlist,
  tps.force_weekly_backup,
  tps.data_retention_days,
  tps.timezone,
  tps.sales_stage
from public.tenants t
left join public.tenant_subscriptions ts on ts.tenant_id = t.id
left join public.saas_plans p on p.id = ts.plan_id
left join public.saas_plan_limits pl on pl.plan_id = p.id
left join public.tenant_limit_overrides tlo on tlo.tenant_id = t.id
left join public.tenant_policy_settings tps on tps.tenant_id = t.id;

-- =========================================================
-- 4) RLS policies (tenant isolation)
-- =========================================================

alter table if exists public.tenant_subscriptions enable row level security;
alter table if exists public.tenant_feature_overrides enable row level security;
alter table if exists public.tenant_limit_overrides enable row level security;
alter table if exists public.tenant_policy_settings enable row level security;
alter table if exists public.tenant_stage_price_overrides enable row level security;
alter table if exists public.tenant_device_registry enable row level security;
alter table if exists public.tenant_usage_daily enable row level security;
alter table if exists public.saas_audit_logs enable row level security;
alter table if exists public.saas_billing_events enable row level security;

drop policy if exists tenant_subscriptions_tenant_isolation on public.tenant_subscriptions;
create policy tenant_subscriptions_tenant_isolation on public.tenant_subscriptions
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

drop policy if exists tenant_feature_overrides_tenant_isolation on public.tenant_feature_overrides;
create policy tenant_feature_overrides_tenant_isolation on public.tenant_feature_overrides
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

drop policy if exists tenant_limit_overrides_tenant_isolation on public.tenant_limit_overrides;
create policy tenant_limit_overrides_tenant_isolation on public.tenant_limit_overrides
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

drop policy if exists tenant_policy_settings_tenant_isolation on public.tenant_policy_settings;
create policy tenant_policy_settings_tenant_isolation on public.tenant_policy_settings
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

drop policy if exists tenant_stage_price_overrides_tenant_isolation on public.tenant_stage_price_overrides;
create policy tenant_stage_price_overrides_tenant_isolation on public.tenant_stage_price_overrides
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

drop policy if exists tenant_device_registry_tenant_isolation on public.tenant_device_registry;
create policy tenant_device_registry_tenant_isolation on public.tenant_device_registry
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

drop policy if exists tenant_usage_daily_tenant_isolation on public.tenant_usage_daily;
create policy tenant_usage_daily_tenant_isolation on public.tenant_usage_daily
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

drop policy if exists saas_audit_logs_tenant_isolation on public.saas_audit_logs;
create policy saas_audit_logs_tenant_isolation on public.saas_audit_logs
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

drop policy if exists saas_billing_events_tenant_isolation on public.saas_billing_events;
create policy saas_billing_events_tenant_isolation on public.saas_billing_events
for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));

-- =========================================================
-- 5) Optional demo seed (필요 시 주석 해제)
-- =========================================================
-- with cfg as (
--   select
--     'omnifoodtech-demo'::text as tenant_id,
--     'OmniFoodTech'::text as company_name,
--     '본사'::text as store_name,
--     'admin'::text as admin_name,
--     '1234'::text as admin_password
-- )
-- insert into public.tenants (id, company_name, supabase_project_id, is_active)
-- select tenant_id, company_name, 'default', true
-- from cfg
-- on conflict (id) do update
-- set company_name = excluded.company_name, is_active = excluded.is_active;
