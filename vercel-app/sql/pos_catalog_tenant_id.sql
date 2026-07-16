-- Omni SaaS: POS 메뉴·옵션·프로모 카탈로그에 tenant_id 추가 (회사 간 격리)
-- 대상: Omni Supabase. 충만 레거시 DB에는 실행하지 않는 것을 권장.
--
-- 없는 테이블(pos_option_groups / pos_promos 등)은 건너뜁니다.
-- 실행 후 앱이 JWT tenantId 로 pos_menus 등을 필터합니다.
-- 신규 회사는 메뉴 0건이 정상입니다.

-- 1) pos_menus (필수)
do $$
begin
  if to_regclass('public.pos_menus') is null then
    raise exception 'public.pos_menus 가 없습니다. Omni POS 메뉴 스키마를 먼저 배포하세요.';
  end if;

  alter table public.pos_menus
    add column if not exists tenant_id text;

  create index if not exists idx_pos_menus_tenant_id
    on public.pos_menus (tenant_id);
end $$;

-- 1b) 선택 테이블
do $$
begin
  if to_regclass('public.pos_option_groups') is not null then
    alter table public.pos_option_groups
      add column if not exists tenant_id text;
    create index if not exists idx_pos_option_groups_tenant_id
      on public.pos_option_groups (tenant_id);
  end if;

  if to_regclass('public.pos_promos') is not null then
    alter table public.pos_promos
      add column if not exists tenant_id text;
    create index if not exists idx_pos_promos_tenant_id
      on public.pos_promos (tenant_id);
  end if;
end $$;

-- 2) 기존 메뉴 → 매장 스코프의 erp_stores.tenant_id 로 백필
do $$
begin
  if to_regclass('public.pos_menu_store_scopes') is null
     or to_regclass('public.erp_stores') is null then
    return;
  end if;

  update public.pos_menus m
  set tenant_id = s.tenant_id
  from (
    select
      pms.menu_id,
      min(nullif(trim(es.tenant_id), '')) as tenant_id
    from public.pos_menu_store_scopes pms
    join public.erp_stores es
      on lower(trim(coalesce(es.store_code, ''))) = lower(trim(coalesce(pms.store_code, '')))
    where coalesce(pms.enabled, true) = true
      and nullif(trim(es.tenant_id), '') is not null
    group by pms.menu_id
  ) s
  where m.id = s.menu_id
    and coalesce(trim(m.tenant_id), '') = ''
    and s.tenant_id is not null;
end $$;

-- 스코프 없는 메뉴: 테넌트가 하나뿐이면 그 테넌트로
do $$
declare
  tenant_cnt int;
  only_tenant text;
begin
  if to_regclass('public.tenants') is null then
    return;
  end if;

  select count(distinct nullif(trim(id), '')) into tenant_cnt from public.tenants;
  if tenant_cnt = 1 then
    select nullif(trim(id), '') into only_tenant from public.tenants limit 1;
    if only_tenant is not null then
      update public.pos_menus
      set tenant_id = only_tenant
      where coalesce(trim(tenant_id), '') = '';

      if to_regclass('public.pos_option_groups') is not null then
        update public.pos_option_groups
        set tenant_id = only_tenant
        where coalesce(trim(tenant_id), '') = '';
      end if;

      if to_regclass('public.pos_promos') is not null then
        update public.pos_promos
        set tenant_id = only_tenant
        where coalesce(trim(tenant_id), '') = '';
      end if;
    end if;
  end if;
end $$;

-- 옵션 그룹: 링크된 메뉴의 tenant_id
do $$
begin
  if to_regclass('public.pos_option_groups') is null
     or to_regclass('public.pos_menu_option_group_links') is null then
    return;
  end if;

  update public.pos_option_groups g
  set tenant_id = x.tenant_id
  from (
    select
      l.group_id,
      min(nullif(trim(m.tenant_id), '')) as tenant_id
    from public.pos_menu_option_group_links l
    join public.pos_menus m on m.id = l.menu_id
    where nullif(trim(m.tenant_id), '') is not null
    group by l.group_id
  ) x
  where g.id = x.group_id
    and coalesce(trim(g.tenant_id), '') = ''
    and x.tenant_id is not null;
end $$;

-- 프로모: 미러 메뉴 promo_id → tenant
do $$
begin
  if to_regclass('public.pos_promos') is null then
    return;
  end if;

  update public.pos_promos p
  set tenant_id = m.tenant_id
  from public.pos_menus m
  where m.promo_id = p.id
    and nullif(trim(m.tenant_id), '') is not null
    and coalesce(trim(p.tenant_id), '') = '';
end $$;

-- 3) 코드 unique 를 테넌트 단위로
do $$
begin
  drop index if exists public.ux_pos_menus_code_norm;

  create unique index if not exists ux_pos_menus_tenant_code_norm
    on public.pos_menus (coalesce(tenant_id, ''), (lower(trim(code))))
    where trim(coalesce(code, '')) <> '';
end $$;

-- 옵션 그룹 group_key → 테넌트 단위 (테이블 있을 때만)
do $$
begin
  if to_regclass('public.pos_option_groups') is null then
    return;
  end if;

  begin
    if exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'pos_option_groups'
        and indexname = 'pos_option_groups_group_key_key'
    ) then
      execute 'alter table public.pos_option_groups drop constraint if exists pos_option_groups_group_key_key';
    end if;
  exception when others then
    null;
  end;

  create unique index if not exists ux_pos_option_groups_tenant_group_key
    on public.pos_option_groups (coalesce(tenant_id, ''), (lower(trim(group_key))))
    where trim(coalesce(group_key, '')) <> '';
end $$;

-- 4) 감사 (선택 실행):
-- select id, code, name from public.pos_menus where coalesce(trim(tenant_id), '') = '' order by id;
