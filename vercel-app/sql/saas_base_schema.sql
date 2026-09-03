-- SaaS 기본 스키마 (코어 테이블)
-- 실행 순서:
-- 1) saas_base_schema.sql                (코어 테이블/인덱스/트리거)
-- 2) saas_tenant_bootstrap.sql           (기존 DB 보강 + 선택 시드)
-- 3) saas_admin_control_plane.sql        (요금제/정책/디바이스/RLS)

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

-- 기존 스키마 호환
alter table if exists public.employees add column if not exists tenant_id text;
alter table if exists public.employees add column if not exists company text;
alter table if exists public.employees add column if not exists nick text;
alter table if exists public.employees add column if not exists join_date date;
alter table if exists public.employees add column if not exists resign_date date;
alter table if exists public.employees add column if not exists employee_code text;
alter table if exists public.employees add column if not exists extra_stores jsonb not null default '[]'::jsonb;
alter table if exists public.employees add column if not exists name_title text not null default '';
alter table if exists public.employees add column if not exists phone text not null default '';
alter table if exists public.employees add column if not exists birth date;
alter table if exists public.employees add column if not exists nation text;
alter table if exists public.employees add column if not exists email text;
alter table if exists public.employees add column if not exists sal_type text;
alter table if exists public.employees add column if not exists sal_amt numeric;
alter table if exists public.employees add column if not exists annual_leave_days numeric;
alter table if exists public.employees add column if not exists id_number text;
alter table if exists public.employees add column if not exists id_card_photo text;
alter table if exists public.employees add column if not exists tax_id text;
alter table if exists public.employees add column if not exists sso_number text;
alter table if exists public.employees add column if not exists sso_exempt boolean not null default false;
alter table if exists public.employees add column if not exists address text;
alter table if exists public.employees add column if not exists bank_name text;
alter table if exists public.employees add column if not exists account_number text;
alter table if exists public.employees add column if not exists position_allowance numeric not null default 0;
alter table if exists public.employees add column if not exists haz_allow numeric not null default 0;
alter table if exists public.employees add column if not exists attendance_allowance numeric;
alter table if exists public.employees add column if not exists grade text;
alter table if exists public.employees add column if not exists photo text;
alter table if exists public.employees add column if not exists employment_status text default 'active';
alter table if exists public.employees add column if not exists can_manage_office_payroll boolean not null default false;
alter table if exists public.employees add column if not exists deleted_at timestamptz;
alter table if exists public.employees add column if not exists deleted_by text;
alter table if exists public.employees add column if not exists delete_reason text;
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
