-- Omni SaaS: 품목·거래처·재고 tenant_id (회사 간 격리)
-- 없는 테이블은 건너뜁니다. 충만 레거시 DB에는 실행하지 않는 것을 권장.

do $$
begin
  -- vendors (이미 있을 수 있음)
  if to_regclass('public.vendors') is not null then
    alter table public.vendors add column if not exists tenant_id text;
    create index if not exists idx_vendors_tenant_id on public.vendors (tenant_id);
  end if;

  if to_regclass('public.items') is not null then
    alter table public.items add column if not exists tenant_id text;
    create index if not exists idx_items_tenant_id on public.items (tenant_id);
  end if;

  if to_regclass('public.stock_logs') is not null then
    alter table public.stock_logs add column if not exists tenant_id text;
    create index if not exists idx_stock_logs_tenant_id on public.stock_logs (tenant_id);
  end if;

  if to_regclass('public.item_categories') is not null then
    alter table public.item_categories add column if not exists tenant_id text;
    create index if not exists idx_item_categories_tenant_id on public.item_categories (tenant_id);
  end if;

  if to_regclass('public.item_vendors') is not null then
    alter table public.item_vendors add column if not exists tenant_id text;
    create index if not exists idx_item_vendors_tenant_id on public.item_vendors (tenant_id);
  end if;

  if to_regclass('public.inbound_batches') is not null then
    alter table public.inbound_batches add column if not exists tenant_id text;
    create index if not exists idx_inbound_batches_tenant_id on public.inbound_batches (tenant_id);
  end if;

  if to_regclass('public.warehouse_locations') is not null then
    alter table public.warehouse_locations add column if not exists tenant_id text;
    create index if not exists idx_warehouse_locations_tenant_id on public.warehouse_locations (tenant_id);
  end if;
end $$;

-- 백필: 테넌트가 하나뿐이면 orphan 일괄
do $$
declare
  tenant_cnt int;
  only_tenant text;
begin
  if to_regclass('public.tenants') is null then
    return;
  end if;

  select count(distinct nullif(trim(id), '')) into tenant_cnt from public.tenants;
  if tenant_cnt <> 1 then
    return;
  end if;

  select nullif(trim(id), '') into only_tenant from public.tenants limit 1;
  if only_tenant is null then
    return;
  end if;

  if to_regclass('public.vendors') is not null then
    update public.vendors set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.items') is not null then
    update public.items set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.stock_logs') is not null then
    update public.stock_logs set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.item_categories') is not null then
    update public.item_categories set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.item_vendors') is not null then
    update public.item_vendors set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.inbound_batches') is not null then
    update public.inbound_batches set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
  if to_regclass('public.warehouse_locations') is not null then
    update public.warehouse_locations set tenant_id = only_tenant where coalesce(trim(tenant_id), '') = '';
  end if;
end $$;

-- stock_logs: location → erp_stores.tenant_id 백필 (가능 시)
do $$
begin
  if to_regclass('public.stock_logs') is null or to_regclass('public.erp_stores') is null then
    return;
  end if;

  update public.stock_logs sl
  set tenant_id = es.tenant_id
  from public.erp_stores es
  where coalesce(trim(sl.tenant_id), '') = ''
    and nullif(trim(es.tenant_id), '') is not null
    and (
      lower(trim(coalesce(sl.location, ''))) = lower(trim(coalesce(es.store_code, '')))
      or lower(trim(coalesce(sl.location, ''))) = lower(trim(coalesce(es.store_name, '')))
    );
end $$;

-- items / vendors code unique → 테넌트 단위 (전역 unique 가 있으면 교체 시도)
do $$
begin
  if to_regclass('public.items') is not null then
    begin
      drop index if exists public.uq_items_code;
      drop index if exists public.items_code_key;
    exception when others then
      null;
    end;
    begin
      alter table public.items drop constraint if exists items_code_key;
    exception when others then
      null;
    end;
    create unique index if not exists ux_items_tenant_code
      on public.items (coalesce(tenant_id, ''), (lower(trim(code))))
      where trim(coalesce(code, '')) <> '';
  end if;

  if to_regclass('public.vendors') is not null then
    begin
      drop index if exists public.uq_vendors_code;
      drop index if exists public.vendors_code_key;
    exception when others then
      null;
    end;
    begin
      alter table public.vendors drop constraint if exists vendors_code_key;
    exception when others then
      null;
    end;
    create unique index if not exists ux_vendors_tenant_code
      on public.vendors (coalesce(tenant_id, ''), (lower(trim(code))))
      where trim(coalesce(code, '')) <> '';
  end if;
end $$;
