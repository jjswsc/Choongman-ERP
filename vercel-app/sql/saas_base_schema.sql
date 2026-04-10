-- SaaS 전용 신규 Supabase 프로젝트 초기 스키마 (빈 프로젝트용)
-- 실행 순서:
-- 1) 이 파일(saas_base_schema.sql)
-- 2) saas_tenant_bootstrap.sql
-- 3) 필요 운영 SQL/정책

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

create unique index if not exists uq_erp_stores_tenant_store_name
  on public.erp_stores (coalesce(tenant_id, ''), store_name);

create table if not exists public.employees (
  id bigserial primary key,
  tenant_id text,
  company text,
  store text not null,
  name text not null,
  password text not null,
  role text,
  job text,
  employee_code text,
  extra_stores jsonb,
  resign_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employees_tenant_id on public.employees (tenant_id);
create index if not exists idx_employees_store on public.employees (store);
create index if not exists idx_employees_name on public.employees (name);
create index if not exists idx_employees_company on public.employees (company);

create table if not exists public.vendors (
  id bigserial primary key,
  tenant_id text,
  name text not null,
  gps_name text,
  type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendors_tenant_id on public.vendors (tenant_id);

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

create index if not exists idx_pos_orders_tenant_id on public.pos_orders (tenant_id);
create index if not exists idx_pos_orders_store_name on public.pos_orders (store_name);
create index if not exists idx_pos_orders_created_at on public.pos_orders (created_at desc);

-- updated_at 자동 갱신 트리거
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
