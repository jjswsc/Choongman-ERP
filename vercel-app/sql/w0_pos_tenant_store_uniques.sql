-- W0 Omni SaaS: POS·마감·결산·주문번호 unique를 (tenant_id, store_code/…) 로 전환
-- Supabase SQL Editor에 붙여넣어 실행.
-- 충만 레거시: tenant_id 빈 문자열('')로 백필 → 기존 단일 테넌트 동작 유지.
-- Omni: erp_stores.tenant_id 로 백필 후 테넌트별 동일 store_code 허용.

-- ── helpers ─────────────────────────────────────────────
create or replace function public._w0_backfill_tenant_from_erp_stores(p_table regclass)
returns void
language plpgsql
as $$
declare
  t text := p_table::text;
begin
  if to_regclass('public.erp_stores') is null then
    raise notice 'skip backfill %: erp_stores missing', t;
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'erp_stores' and column_name = 'tenant_id'
  ) then
    raise notice 'skip backfill %: erp_stores.tenant_id missing', t;
    return;
  end if;
  execute format(
    $q$
    update %s x
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(x.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and lower(trim(coalesce(x.store_code, ''))) = lower(trim(coalesce(es.store_code, '')))
    $q$,
    t
  );
end;
$$;

-- ── pos_settlements ─────────────────────────────────────
do $$
begin
  if to_regclass('public.pos_settlements') is null then
    return;
  end if;

  alter table public.pos_settlements add column if not exists tenant_id text;
  update public.pos_settlements set tenant_id = '' where tenant_id is null;
  alter table public.pos_settlements alter column tenant_id set default '';
  alter table public.pos_settlements alter column tenant_id set not null;

  perform public._w0_backfill_tenant_from_erp_stores('public.pos_settlements');

  alter table public.pos_settlements drop constraint if exists pos_settlements_store_code_settle_date_key;
  drop index if exists ux_pos_settlements_store_date;
  drop index if exists pos_settlements_store_code_settle_date_key;

  create unique index if not exists uq_pos_settlements_tenant_store_date
    on public.pos_settlements (tenant_id, store_code, settle_date);
  create index if not exists idx_pos_settlements_tenant_id
    on public.pos_settlements (tenant_id);
end $$;

-- ── pos_close_runs ──────────────────────────────────────
do $$
begin
  if to_regclass('public.pos_close_runs') is null then
    return;
  end if;

  alter table public.pos_close_runs add column if not exists tenant_id text;
  update public.pos_close_runs set tenant_id = '' where tenant_id is null;
  alter table public.pos_close_runs alter column tenant_id set default '';
  alter table public.pos_close_runs alter column tenant_id set not null;

  perform public._w0_backfill_tenant_from_erp_stores('public.pos_close_runs');

  alter table public.pos_close_runs drop constraint if exists pos_close_runs_uniq;
  alter table public.pos_close_runs drop constraint if exists pos_close_runs_store_code_business_date_key;
  drop index if exists pos_close_runs_uniq;

  create unique index if not exists uq_pos_close_runs_tenant_store_date
    on public.pos_close_runs (tenant_id, store_code, business_date);
  create index if not exists idx_pos_close_runs_tenant_id
    on public.pos_close_runs (tenant_id);
end $$;

-- ── pos_channel_settlements ─────────────────────────────
do $$
begin
  if to_regclass('public.pos_channel_settlements') is null then
    return;
  end if;

  alter table public.pos_channel_settlements add column if not exists tenant_id text;
  update public.pos_channel_settlements set tenant_id = '' where tenant_id is null;
  alter table public.pos_channel_settlements alter column tenant_id set default '';
  alter table public.pos_channel_settlements alter column tenant_id set not null;

  perform public._w0_backfill_tenant_from_erp_stores('public.pos_channel_settlements');

  alter table public.pos_channel_settlements
    drop constraint if exists pos_channel_settlements_store_code_settle_date_channel_key;
  drop index if exists pos_channel_settlements_store_code_settle_date_channel_key;

  create unique index if not exists uq_pos_channel_settlements_tenant_store_date_channel
    on public.pos_channel_settlements (tenant_id, store_code, settle_date, channel);
  create index if not exists idx_pos_channel_settlements_tenant_id
    on public.pos_channel_settlements (tenant_id);
end $$;

-- ── pos_menu_screen_configs ─────────────────────────────
do $$
begin
  if to_regclass('public.pos_menu_screen_configs') is null then
    return;
  end if;

  alter table public.pos_menu_screen_configs add column if not exists tenant_id text;
  update public.pos_menu_screen_configs set tenant_id = '' where tenant_id is null;
  alter table public.pos_menu_screen_configs alter column tenant_id set default '';
  alter table public.pos_menu_screen_configs alter column tenant_id set not null;

  perform public._w0_backfill_tenant_from_erp_stores('public.pos_menu_screen_configs');

  drop index if exists pos_menu_screen_configs_store_code_uidx;
  drop index if exists idx_pos_menu_screen_configs_code_store;

  create unique index if not exists uq_pos_menu_screen_configs_tenant_store
    on public.pos_menu_screen_configs (tenant_id, coalesce(store_code, ''));
  create index if not exists idx_pos_menu_screen_configs_tenant_id
    on public.pos_menu_screen_configs (tenant_id);
end $$;

-- ── pos_delivery_apps ───────────────────────────────────
do $$
begin
  if to_regclass('public.pos_delivery_apps') is null then
    return;
  end if;

  alter table public.pos_delivery_apps add column if not exists tenant_id text;
  update public.pos_delivery_apps set tenant_id = '' where tenant_id is null;
  alter table public.pos_delivery_apps alter column tenant_id set default '';
  alter table public.pos_delivery_apps alter column tenant_id set not null;

  perform public._w0_backfill_tenant_from_erp_stores('public.pos_delivery_apps');

  drop index if exists idx_pos_delivery_apps_code_store;

  create unique index if not exists uq_pos_delivery_apps_tenant_code_store
    on public.pos_delivery_apps (tenant_id, code, coalesce(store_code, ''));
  create index if not exists idx_pos_delivery_apps_tenant_id
    on public.pos_delivery_apps (tenant_id);
end $$;

-- ── pos_payment_settings (store_code PK → tenant 복합) ──
do $$
begin
  if to_regclass('public.pos_payment_settings') is null then
    return;
  end if;

  alter table public.pos_payment_settings add column if not exists tenant_id text;
  update public.pos_payment_settings set tenant_id = '' where tenant_id is null;
  alter table public.pos_payment_settings alter column tenant_id set default '';
  alter table public.pos_payment_settings alter column tenant_id set not null;

  perform public._w0_backfill_tenant_from_erp_stores('public.pos_payment_settings');

  -- PK가 store_code 단독이면 복합 unique 추가로 동일 코드 교차 테넌트는 여전히 PK에서 막힘.
  -- Omni saas 스키마는 store_code PK가 아닐 수 있음 → unique(tenant_id, store_code) 보장.
  begin
    alter table public.pos_payment_settings drop constraint if exists pos_payment_settings_pkey;
  exception when others then
    raise notice 'pos_payment_settings drop pkey: %', sqlerrm;
  end;

  create unique index if not exists uq_pos_payment_settings_tenant_store
    on public.pos_payment_settings (tenant_id, store_code);
  create index if not exists idx_pos_payment_settings_tenant_id
    on public.pos_payment_settings (tenant_id);
end $$;

-- ── erp_stores: (tenant_id, store_code) unique (PK는 건드리지 않음) ──
do $$
begin
  if to_regclass('public.erp_stores') is null then
    return;
  end if;

  alter table public.erp_stores add column if not exists tenant_id text;

  -- store_code 가 PK인 레거시에서는 동일 코드 교차 테넌트가 불가.
  -- Omni(saas)에서 store_code 가 PK가 아니면 아래 unique로 테넌트 분리.
  create unique index if not exists uq_erp_stores_tenant_store_code
    on public.erp_stores (coalesce(tenant_id, ''), coalesce(store_code, ''))
    where coalesce(store_code, '') <> '';
end $$;

-- ── pos_order_no_counters + RPC ─────────────────────────
do $$
begin
  if to_regclass('public.pos_order_no_counters') is null then
    create table public.pos_order_no_counters (
      tenant_id text not null default '',
      store_slug text not null,
      business_ymd text not null check (business_ymd ~ '^[0-9]{8}$'),
      last_seq integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (tenant_id, store_slug, business_ymd)
    );
  else
    alter table public.pos_order_no_counters add column if not exists tenant_id text;
    update public.pos_order_no_counters set tenant_id = '' where tenant_id is null;
    alter table public.pos_order_no_counters alter column tenant_id set default '';
    alter table public.pos_order_no_counters alter column tenant_id set not null;

    begin
      alter table public.pos_order_no_counters drop constraint if exists pos_order_no_counters_pkey;
    exception when others then
      raise notice 'pos_order_no_counters drop pkey: %', sqlerrm;
    end;

    begin
      alter table public.pos_order_no_counters
        add primary key (tenant_id, store_slug, business_ymd);
    exception when others then
      create unique index if not exists uq_pos_order_no_counters_tenant_slug_ymd
        on public.pos_order_no_counters (tenant_id, store_slug, business_ymd);
    end;
  end if;
end $$;

create or replace function public.allocate_pos_order_no(
  p_store_slug text,
  p_business_ymd text,
  p_tenant_id text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_ymd text;
  v_tenant text;
  v_next integer;
begin
  v_slug := upper(regexp_replace(coalesce(p_store_slug, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_slug = '' then
    v_slug := 'ST';
  end if;
  v_slug := left(v_slug, 12);

  v_ymd := regexp_replace(coalesce(p_business_ymd, ''), '[^0-9]', '', 'g');
  if length(v_ymd) <> 8 then
    raise exception 'invalid business ymd: %', coalesce(p_business_ymd, '');
  end if;

  v_tenant := lower(trim(coalesce(p_tenant_id, '')));

  insert into public.pos_order_no_counters as c (tenant_id, store_slug, business_ymd, last_seq, updated_at)
  values (v_tenant, v_slug, v_ymd, 1, now())
  on conflict (tenant_id, store_slug, business_ymd)
  do update
    set last_seq = c.last_seq + 1,
        updated_at = now()
  returning last_seq into v_next;

  return v_slug || '-' || v_ymd || '-' || lpad(v_next::text, 3, '0');
end;
$$;

-- 구 시그니처 호환 (2인자) — 동일 본문 tenant ''
create or replace function public.allocate_pos_order_no(
  p_store_slug text,
  p_business_ymd text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.allocate_pos_order_no(p_store_slug, p_business_ymd, '');
end;
$$;

revoke all on function public.allocate_pos_order_no(text, text) from public, anon, authenticated;
revoke all on function public.allocate_pos_order_no(text, text, text) from public, anon, authenticated;
grant execute on function public.allocate_pos_order_no(text, text) to service_role;
grant execute on function public.allocate_pos_order_no(text, text, text) to service_role;

-- ── pos_orders tenant index (컬럼은 saas_base 에 있을 수 있음) ──
do $$
begin
  if to_regclass('public.pos_orders') is null then
    return;
  end if;
  alter table public.pos_orders add column if not exists tenant_id text;
  create index if not exists idx_pos_orders_tenant_id on public.pos_orders (tenant_id);
  create index if not exists idx_pos_orders_tenant_store_created
    on public.pos_orders (tenant_id, store_code, created_at desc);
end $$;

drop function if exists public._w0_backfill_tenant_from_erp_stores(regclass);
