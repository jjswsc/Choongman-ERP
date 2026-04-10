-- SaaS 멀티테넌트 1차 부트스트랩
-- 적용 전 백업/스테이징 검증 필수

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
alter table if exists public.vendors add column if not exists tenant_id text;
alter table if exists public.pos_orders add column if not exists tenant_id text;

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

-- RLS가 이미 활성화된 테이블은 tenant_id/company 조건으로 정책을 좁혀야 한다.
-- 예시:
-- create policy employees_tenant_isolation on public.employees
-- for select using (tenant_id = current_setting('request.jwt.claim.tenantId', true));
