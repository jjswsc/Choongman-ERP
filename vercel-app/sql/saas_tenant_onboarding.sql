-- SaaS 온보딩 상태: tenants.onboarding_flags + 집계 RPC (선택 배포)
-- 미배포 시 API는 JS 집계로 동작한다.

alter table if exists public.tenants
  add column if not exists onboarding_flags jsonb not null default '{}'::jsonb;

comment on column public.tenants.onboarding_flags is
  'SaaS 온보딩: pricingConfirmed, integrationsSkipped, loginVerified (boolean)';

create or replace function public.get_tenant_onboarding_status(p_tenant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_flags jsonb := '{}'::jsonb;
  v_company_ok boolean := false;
  v_store_ok boolean := false;
  v_admin_ok boolean := false;
  v_pricing_ok boolean := false;
  v_integration_ok boolean := false;
  v_verify_ok boolean := false;
  v_active_stores int := 0;
  v_managers int := 0;
  v_modules int := 0;
  v_integrations int := 0;
begin
  select
    coalesce(t.onboarding_flags, '{}'::jsonb),
    coalesce(t.is_active, true)
  into v_flags, v_company_ok
  from public.tenants t
  where t.id = p_tenant_id;

  if not found then
    return jsonb_build_object(
      'tenantId', p_tenant_id,
      'found', false,
      'steps', jsonb_build_object(
        'company', false, 'store', false, 'admin', false,
        'pricing', false, 'integrations', false, 'verify', false
      )
    );
  end if;

  select count(*)::int into v_active_stores
  from public.erp_stores s
  where s.tenant_id = p_tenant_id
    and coalesce(s.is_active, true) = true;

  v_store_ok := v_active_stores > 0;

  select count(distinct e.id)::int into v_managers
  from public.employees e
  where e.tenant_id = p_tenant_id
    and coalesce(e.resign_date, '') = ''
    and (
      lower(coalesce(e.role, '')) like '%manager%'
      or lower(coalesce(e.role, '')) like '%franchisee%'
    )
    and exists (
      select 1 from public.erp_stores s
      where s.tenant_id = e.tenant_id
        and s.store_name = e.store
        and coalesce(s.is_active, true) = true
    );

  v_admin_ok := v_managers > 0;

  select count(*)::int into v_modules
  from public.tenant_module_pricing mp
  where mp.tenant_id = p_tenant_id
    and coalesce(mp.is_enabled, false) = true;

  v_pricing_ok := coalesce((v_flags->>'pricingConfirmed')::boolean, false) or v_modules > 0;

  select count(*)::int into v_integrations
  from public.tenant_integrations ti
  where ti.tenant_id = p_tenant_id
    and ti.is_enabled = true
    and ti.config_json is not null
    and ti.config_json <> '{}'::jsonb;

  v_integration_ok := coalesce((v_flags->>'integrationsSkipped')::boolean, false) or v_integrations > 0;

  v_verify_ok := coalesce((v_flags->>'loginVerified')::boolean, false);

  return jsonb_build_object(
    'tenantId', p_tenant_id,
    'found', true,
    'flags', v_flags,
    'steps', jsonb_build_object(
      'company', v_company_ok,
      'store', v_store_ok,
      'admin', v_admin_ok,
      'pricing', v_pricing_ok,
      'integrations', v_integration_ok,
      'verify', v_verify_ok
    ),
    'counts', jsonb_build_object(
      'activeStores', v_active_stores,
      'managersWithStore', v_managers,
      'enabledModules', v_modules,
      'enabledIntegrations', v_integrations
    )
  );
end;
$$;

create or replace function public.get_all_tenant_onboarding_status()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select id from public.tenants order by created_at asc loop
    return next public.get_tenant_onboarding_status(r.id);
  end loop;
end;
$$;
