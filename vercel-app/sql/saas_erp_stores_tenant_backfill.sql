-- erp_stores.tenant_id 누락 보정 (온보딩 legacy insert 후 SaaS 매장이 목록에 안 보일 때)
-- Choongman( display_name ) / SaaS( store_name ) 스키마 모두 호환

alter table if exists public.erp_stores add column if not exists tenant_id text;
alter table if exists public.erp_stores add column if not exists store_name text;

do $$
declare
  has_display_name boolean := false;
  has_aliases boolean := false;
  sql_text text;
begin
  if to_regclass('public.erp_stores') is null then
    raise notice 'erp_stores table not found — skip backfill';
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_stores'
      and column_name = 'display_name'
  ) into has_display_name;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_stores'
      and column_name = 'aliases'
  ) into has_aliases;

  -- 1) employees.tenant_id + store 이름 → erp_stores.tenant_id
  sql_text := $q$
    update public.erp_stores s
    set tenant_id = e.tenant_id
    from (
      select distinct trim(tenant_id) as tenant_id, trim(store) as store
      from public.employees
      where coalesce(trim(tenant_id), '') <> ''
        and coalesce(trim(store), '') <> ''
    ) e
    where coalesce(trim(s.tenant_id), '') = ''
      and (
        coalesce(trim(s.store_name), '') = e.store
  $q$;

  if has_display_name then
    sql_text := sql_text || $q$
        or coalesce(trim(s.display_name), '') = e.store
    $q$;
  end if;

  if has_aliases then
    sql_text := sql_text || $q$
        or e.store = any(coalesce(s.aliases, '{}'::text[]))
    $q$;
  end if;

  sql_text := sql_text || $q$
      )
  $q$;

  execute sql_text;

  -- 2) store_code가 {tenant_id}_ 로 시작하는 행 보정
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_stores'
      and column_name = 'store_code'
  ) then
    update public.erp_stores s
    set tenant_id = split_part(lower(trim(s.store_code)), '_', 1)
    where coalesce(trim(s.tenant_id), '') = ''
      and coalesce(trim(s.store_code), '') like '%\_%'
      and exists (
        select 1 from public.tenants t
        where t.id = split_part(lower(trim(s.store_code)), '_', 1)
      );
  end if;

  -- 3) SaaS 스키마: store_name만 있고 tenant_id 비어 있으면 store_name을 display_name 대신 채움(선택)
  if not has_display_name then
    update public.erp_stores s
    set store_name = e.store
    from (
      select distinct trim(tenant_id) as tenant_id, trim(store) as store
      from public.employees
      where coalesce(trim(tenant_id), '') <> ''
        and coalesce(trim(store), '') <> ''
    ) e
    where coalesce(trim(s.tenant_id), '') = e.tenant_id
      and coalesce(trim(s.store_name), '') = ''
      and coalesce(trim(s.store_code), '') <> '';
  end if;
end $$;
