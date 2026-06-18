-- SaaS tenant bootstrap (기존 DB 전환 + 선택 시드)
-- 전제: saas_base_schema.sql 실행 후 사용
-- 목적:
-- 1) 기존 DB에 tenant 컬럼/인덱스 누락 시 보강
-- 2) 최소 1개 테넌트/본사 매장/관리자 계정 샘플 생성(선택)

create table if not exists public.tenants (
  id text primary key,
  company_name text not null,
  supabase_project_id text not null default 'default',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table if exists public.employees add column if not exists tenant_id text;
alter table if exists public.employees add column if not exists company text;
alter table if exists public.erp_stores add column if not exists tenant_id text;
alter table if exists public.erp_stores add column if not exists store_name text;
alter table if exists public.vendors add column if not exists tenant_id text;
alter table if exists public.pos_orders add column if not exists tenant_id text;
alter table if exists public.employees add column if not exists nick text;

do $$
begin
  if to_regclass('public.employees') is not null then
    create index if not exists idx_employees_tenant_id on public.employees (tenant_id);
  end if;
  if to_regclass('public.erp_stores') is not null then
    create index if not exists idx_erp_stores_tenant_id on public.erp_stores (tenant_id);
  end if;
  if to_regclass('public.vendors') is not null then
    create index if not exists idx_vendors_tenant_id on public.vendors (tenant_id);
  end if;
  if to_regclass('public.pos_orders') is not null then
    create index if not exists idx_pos_orders_tenant_id on public.pos_orders (tenant_id);
  end if;
end $$;

-- ---------------------------------------------------------
-- 선택 시드(필요 시 값만 바꿔서 실행)
-- ---------------------------------------------------------
with cfg as (
  select
    'omnifoodtech-demo'::text as tenant_id,
    'OmniFoodTech'::text as company_name,
    '본사'::text as store_name,
    'HQ'::text as pos_store_code,
    'admin'::text as admin_name,
    '1234'::text as admin_password
)
insert into public.tenants (id, company_name, supabase_project_id, is_active)
select tenant_id, company_name, 'default', true
from cfg
on conflict (id) do update
set
  company_name = excluded.company_name,
  is_active = excluded.is_active;

with cfg as (
  select
    'omnifoodtech-demo'::text as tenant_id,
    '본사'::text as store_name
)
insert into public.erp_stores (tenant_id, store_name, store_code, is_active)
select tenant_id, store_name, 'HQ', true
from cfg
on conflict ((coalesce(tenant_id, '')), store_name) do update
set
  is_active = excluded.is_active;

with cfg as (
  select
    'omnifoodtech-demo'::text as tenant_id,
    'OmniFoodTech'::text as company_name,
    '본사'::text as store_name,
    'HQ'::text as pos_store_code,
    'admin'::text as admin_name
)
delete from public.employees e
using cfg
where coalesce(e.tenant_id, '') = cfg.tenant_id
  and coalesce(e.company, '') = cfg.company_name
  and e.store in (cfg.store_name, cfg.pos_store_code)
  and e.name = cfg.admin_name;

with cfg as (
  select
    'omnifoodtech-demo'::text as tenant_id,
    'OmniFoodTech'::text as company_name,
    'HQ'::text as pos_store_code,
    'admin'::text as admin_name,
    '1234'::text as admin_password
)
insert into public.employees
  (tenant_id, company, store, name, password, role, job)
select
  tenant_id,
  company_name,
  pos_store_code,
  admin_name,
  admin_password,
  'officer',
  'officer'
from cfg;

-- 다음 단계:
-- saas_admin_control_plane.sql 실행
