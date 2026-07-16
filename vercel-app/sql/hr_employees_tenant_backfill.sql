-- Omni SaaS: employees.tenant_id를 매장 마스터 기준으로 안전하게 백필합니다.
-- employees.tenant_id 컬럼은 SaaS bootstrap에서 이미 생성되어 있어야 합니다.
do $$
begin
  if to_regclass('public.employees') is null
     or to_regclass('public.erp_stores') is null then
    raise notice 'skip: employees or erp_stores table not found';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employees'
      and column_name = 'tenant_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'erp_stores' and column_name = 'tenant_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'erp_stores' and column_name = 'store_name'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'erp_stores' and column_name = 'store_code'
  ) then
    raise notice 'skip: required tenant/store columns not found';
    return;
  end if;

  execute $sql$
    update public.employees e
    set tenant_id = s.tenant_id
    from public.erp_stores s
    where coalesce(trim(e.tenant_id), '') = ''
      and nullif(trim(s.tenant_id), '') is not null
      and (
        lower(trim(e.store)) = lower(trim(coalesce(s.store_name, '')))
        or lower(trim(e.store)) = lower(trim(coalesce(s.store_code, '')))
      )
  $sql$;
end $$;

do $$
begin
  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employees' and column_name = 'tenant_id'
     ) then
    execute 'create index if not exists idx_employees_tenant_id on public.employees (tenant_id)';
  end if;
end $$;
