-- Omni SaaS: CRM 부가 테이블 tenant_id (회원 tenant 상속)
-- members.tenant_id 가 없으면 여기서 추가·백필 후 자식 테이블을 채웁니다.
-- (전화 unique 등은 sql/members_tenant_id.sql 을 별도 실행 권장)

-- 0) members.tenant_id 선행 (없으면 백필 UPDATE 가 42703 으로 실패함)
do $$
begin
  if to_regclass('public.members') is null then
    raise exception 'public.members 가 없습니다. sql/members_tenant_id.sql 을 먼저 확인하세요.';
  end if;

  alter table public.members
    add column if not exists tenant_id text;

  create index if not exists idx_members_tenant_id
    on public.members (tenant_id);
end $$;

-- 3) signup store 목표 tenant_id (store_code → erp_stores.tenant_id)
do $$
begin
  if to_regclass('public.member_signup_store_goals') is null then
    return;
  end if;

  alter table public.member_signup_store_goals
    add column if not exists tenant_id text;
  create index if not exists idx_member_signup_store_goals_tenant_id
    on public.member_signup_store_goals (tenant_id);

  -- 기존 unique(store_code, month_ymd) 환경을 tenant 분리 키로 교체
  alter table public.member_signup_store_goals
    drop constraint if exists member_signup_store_goals_store_code_month_ymd_key;
  create unique index if not exists uq_member_signup_store_goals_tenant_store_month
    on public.member_signup_store_goals (tenant_id, store_code, month_ymd);

  if to_regclass('public.erp_stores') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'erp_stores'
         and column_name = 'tenant_id'
     ) then
    update public.member_signup_store_goals g
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(g.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and lower(trim(coalesce(g.store_code, ''))) = lower(trim(coalesce(es.store_code, '')));
  else
    raise notice 'skip member_signup_store_goals backfill: erp_stores.tenant_id missing';
  end if;
end $$;

-- 0b) members.tenant_id 백필 (join_store_code → erp_stores)
-- 충만 레거시 등 erp_stores.tenant_id 가 없으면 스킵
do $$
begin
  if to_regclass('public.erp_stores') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_stores'
      and column_name = 'tenant_id'
  ) then
    raise notice 'skip members tenant backfill: erp_stores.tenant_id missing';
    return;
  end if;

  update public.members m
  set tenant_id = es.tenant_id
  from public.erp_stores es
  where coalesce(trim(m.tenant_id), '') = ''
    and nullif(trim(es.tenant_id), '') is not null
    and lower(trim(coalesce(m.join_store_code, '')))
      = lower(trim(coalesce(es.store_code, '')));
end $$;

-- 0c) 활성 tenant 가 하나뿐이면 orphan 회원 일괄
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
      update public.members
      set tenant_id = only_tenant
      where coalesce(trim(tenant_id), '') = '';
    end if;
  end if;
end $$;

-- 1) CRM 부가 테이블 tenant_id 컬럼
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'member_points_ledger',
    'member_tier_histories',
    'member_coupon_issues',
    'member_stamp_cards',
    'member_stamp_ledger',
    'member_stamp_reward_issues',
    'member_stamp_issue_logs'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('alter table public.%I add column if not exists tenant_id text', target_table);
      execute format(
        'create index if not exists %I on public.%I (tenant_id)',
        'idx_' || target_table || '_tenant_id',
        target_table
      );
    end if;
  end loop;
end $$;

-- 2) member_id → members.tenant_id 백필 (members.tenant_id 컬럼 있을 때만)
do $$
declare
  target_table text;
  members_has_tenant boolean;
begin
  if to_regclass('public.members') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'members'
      and column_name = 'tenant_id'
  ) into members_has_tenant;

  if not members_has_tenant then
    raise notice 'members.tenant_id 없음 — 자식 테이블 백필을 건너뜁니다.';
    return;
  end if;

  foreach target_table in array array[
    'member_points_ledger',
    'member_tier_histories',
    'member_coupon_issues',
    'member_stamp_cards',
    'member_stamp_ledger',
    'member_stamp_reward_issues',
    'member_stamp_issue_logs'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = target_table
           and column_name = 'member_id'
       ) then
      execute format(
        'update public.%1$I x
         set tenant_id = m.tenant_id
         from public.members m
         where x.member_id = m.id
           and coalesce(trim(x.tenant_id), '''') = ''''
           and nullif(trim(m.tenant_id), '''') is not null',
        target_table
      );
    end if;
  end loop;
end $$;
