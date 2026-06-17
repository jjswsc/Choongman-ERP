-- SaaS 단계별 가격 오버라이드 (고객사별 basic/payment/delivery/erp1/erp2/ai)
-- 오류 PGRST205 "Could not find the table 'public.tenant_stage_price_overrides'" → 이 스크립트 미실행
-- 실행 순서: tenants · saas_admin_control_plane.sql(또는 saas_full_bootstrap_one_shot.sql) 이후

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

alter table if exists public.tenant_stage_price_overrides enable row level security;

drop policy if exists tenant_stage_price_overrides_tenant_isolation on public.tenant_stage_price_overrides;
create policy tenant_stage_price_overrides_tenant_isolation on public.tenant_stage_price_overrides
for select using (
  tenant_id = current_setting('request.jwt.claim.tenantId', true)
);
