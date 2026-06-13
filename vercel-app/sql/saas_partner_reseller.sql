-- SaaS 외부 대리점(리셀러) + 고객사 귀속 + 2단 가격(도매/마진/소매)
-- 실행 순서: saas_module_pricing.sql 이후
-- 기존 tenant는 tenant_partner_assignments 없으면 본사(platform) 전용 — 파트너에게 노출되지 않음

create table if not exists public.saas_partners (
  id text primary key,
  name text not null,
  default_margin_pct numeric(6,2) not null default 0,
  contact_name text,
  contact_phone text,
  contact_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saas_partner_users (
  id bigserial primary key,
  partner_id text not null references public.saas_partners(id) on delete cascade,
  employee_id bigint not null,
  role text not null default 'partner_admin'
    check (role in ('partner_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (employee_id)
);

create index if not exists idx_saas_partner_users_partner
  on public.saas_partner_users (partner_id, is_active);

create table if not exists public.tenant_partner_assignments (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  partner_id text not null references public.saas_partners(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by_employee_id bigint
);

create index if not exists idx_tenant_partner_assignments_partner
  on public.tenant_partner_assignments (partner_id);

-- 2단 가격: wholesale + margin = retail (monthly_price / yearly_price)
alter table if exists public.tenant_module_pricing
  add column if not exists wholesale_monthly numeric(14,2),
  add column if not exists wholesale_yearly numeric(14,2),
  add column if not exists margin_monthly numeric(14,2) not null default 0,
  add column if not exists margin_yearly numeric(14,2) not null default 0;

-- 기존 행: 소매=monthly_price, 도매=동일, 마진=0 (본사 직영 고객)
update public.tenant_module_pricing
set
  wholesale_monthly = coalesce(wholesale_monthly, monthly_price),
  wholesale_yearly = coalesce(wholesale_yearly, yearly_price),
  margin_monthly = coalesce(margin_monthly, 0),
  margin_yearly = coalesce(margin_yearly, 0)
where wholesale_monthly is null or wholesale_yearly is null;

-- ---- 기존 tenant 파트너 배정 예시 (필요 시 id 수정 후 실행) ----
-- insert into public.saas_partners (id, name, default_margin_pct)
-- values ('partner-demo-001', 'Demo Reseller', 15)
-- on conflict (id) do update set name = excluded.name, default_margin_pct = excluded.default_margin_pct;
--
-- insert into public.tenant_partner_assignments (tenant_id, partner_id)
-- values ('your-tenant-id', 'partner-demo-001')
-- on conflict (tenant_id) do update set partner_id = excluded.partner_id;
