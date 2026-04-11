-- OmniFoodTech SaaS Admin 제어 평면(Control Plane) 스키마
-- 목적:
-- 1) 고객사(tenant)별 요금제/기능/허용량/정책을 분리 저장
-- 2) 계정 수, 태블릿 수, POS 단말 수를 tenant 단위로 제한
-- 3) 연체·보안·데이터보존 등 운영 정책을 tenant별로 차등 적용
--
-- 주의:
-- - 본 파일에는 v_tenant_admin_settings 뷰를 "1회"만 정의한다.
-- - 기존 뷰와 충돌 방지를 위해 sales_stage 컬럼은 뷰의 맨 뒤에 둔다.

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

alter table if exists public.tenant_policy_settings
  add column if not exists sales_stage text not null default 'basic';

do $$
begin
  if to_regclass('public.tenant_policy_settings') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'tenant_policy_settings_sales_stage_chk'
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

-- 실 운영 조회용 뷰(요금제 + 오버라이드 + 정책 통합)
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

-- 변경 감사 로그 (누가/언제/무엇을 변경했는지)
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

-- 과금 이벤트 이력 (청구/결제/실패/수동조정 등)
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

-- ---- RLS 기본 정책 ----
-- 운영 API는 service_role로 접근하므로 RLS 우회 가능.
-- anon/authenticated 접근 시에는 JWT claim의 tenantId로 자기 테넌트만 조회 가능하게 제한.
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
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);

drop policy if exists tenant_feature_overrides_tenant_isolation on public.tenant_feature_overrides;
create policy tenant_feature_overrides_tenant_isolation on public.tenant_feature_overrides
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);

drop policy if exists tenant_limit_overrides_tenant_isolation on public.tenant_limit_overrides;
create policy tenant_limit_overrides_tenant_isolation on public.tenant_limit_overrides
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);

drop policy if exists tenant_policy_settings_tenant_isolation on public.tenant_policy_settings;
create policy tenant_policy_settings_tenant_isolation on public.tenant_policy_settings
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);

drop policy if exists tenant_stage_price_overrides_tenant_isolation on public.tenant_stage_price_overrides;
create policy tenant_stage_price_overrides_tenant_isolation on public.tenant_stage_price_overrides
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);

drop policy if exists tenant_device_registry_tenant_isolation on public.tenant_device_registry;
create policy tenant_device_registry_tenant_isolation on public.tenant_device_registry
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);

drop policy if exists tenant_usage_daily_tenant_isolation on public.tenant_usage_daily;
create policy tenant_usage_daily_tenant_isolation on public.tenant_usage_daily
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);

drop policy if exists saas_audit_logs_tenant_isolation on public.saas_audit_logs;
create policy saas_audit_logs_tenant_isolation on public.saas_audit_logs
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);

drop policy if exists saas_billing_events_tenant_isolation on public.saas_billing_events;
create policy saas_billing_events_tenant_isolation on public.saas_billing_events
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);
