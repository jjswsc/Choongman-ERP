-- Omni SaaS: 고객사(tenant)·매장(store)별 KBank / Grab 연동 설정
-- Vercel env는 플랫폼 1세트만 두고, 고객·매장별 시크릿·매핑은 DB에 저장한다.
-- env 미설정·DB 행 없음 → 기존 process.env 폴백(충만 단일 운영 호환).

create table if not exists public.tenant_integrations (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('kbank', 'grab')),
  is_enabled boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create index if not exists idx_tenant_integrations_tenant
  on public.tenant_integrations (tenant_id);

create table if not exists public.tenant_store_integrations (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  store_code text not null,
  provider text not null check (provider in ('kbank', 'grab')),
  is_enabled boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, store_code, provider)
);

create index if not exists idx_tenant_store_integrations_tenant
  on public.tenant_store_integrations (tenant_id);

create index if not exists idx_tenant_store_integrations_lookup
  on public.tenant_store_integrations (tenant_id, store_code, provider);

-- updated_at 트리거 (saas_admin_control_plane과 동일 패턴)
create or replace function public.touch_tenant_integration_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_integrations_updated_at on public.tenant_integrations;
create trigger trg_tenant_integrations_updated_at
before update on public.tenant_integrations
for each row execute function public.touch_tenant_integration_updated_at();

drop trigger if exists trg_tenant_store_integrations_updated_at on public.tenant_store_integrations;
create trigger trg_tenant_store_integrations_updated_at
before update on public.tenant_store_integrations
for each row execute function public.touch_tenant_integration_updated_at();

alter table if exists public.tenant_integrations enable row level security;
alter table if exists public.tenant_store_integrations enable row level security;

-- 서버(service_role) 전용 — 클라이언트 직접 접근 금지
drop policy if exists tenant_integrations_service_only on public.tenant_integrations;
create policy tenant_integrations_service_only on public.tenant_integrations
  for all using (false) with check (false);

drop policy if exists tenant_store_integrations_service_only on public.tenant_store_integrations;
create policy tenant_store_integrations_service_only on public.tenant_store_integrations
  for all using (false) with check (false);
