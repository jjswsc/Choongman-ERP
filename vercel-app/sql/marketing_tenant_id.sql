-- Omni SaaS: 존재하는 마케팅/POS 쿠폰 테이블에 tenant_id를 추가합니다.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'marketing_campaigns',
    'marketing_ads',
    'marketing_influencers',
    'marketing_materials',
    'marketing_material_deployments',
    'marketing_material_gifts',
    'marketing_material_store_checks',
    'marketing_campaign_design_tasks',
    'pos_coupons'
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

-- 자식 마케팅 데이터는 캠페인의 tenant_id를 우선 상속합니다.
do $$
declare
  target_table text;
begin
  if to_regclass('public.marketing_campaigns') is null then
    return;
  end if;

  foreach target_table in array array[
    'marketing_ads',
    'marketing_influencers',
    'marketing_materials',
    'marketing_material_deployments',
    'marketing_material_gifts',
    'marketing_material_store_checks',
    'marketing_campaign_design_tasks'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and information_schema.columns.table_name = target_table
           and column_name = 'campaign_id'
       ) then
      execute format(
        'update public.%1$I x set tenant_id = c.tenant_id
         from public.marketing_campaigns c
         where x.campaign_id = c.id
           and coalesce(trim(x.tenant_id), '''') = ''''
           and nullif(trim(c.tenant_id), '''') is not null',
        target_table
      );
    end if;
  end loop;
end $$;

-- 신규 Omni DB처럼 활성 테넌트가 하나뿐이면 남은 기존 행을 그 테넌트로 귀속합니다.
do $$
declare
  target_table text;
  only_tenant text;
begin
  if to_regclass('public.tenants') is null then
    return;
  end if;

  if (select count(*) from public.tenants where coalesce(is_active, true)) = 1 then
    select nullif(trim(id), '')
      into only_tenant
      from public.tenants
      where coalesce(is_active, true)
      limit 1;

    if only_tenant is not null then
      foreach target_table in array array[
        'marketing_campaigns',
        'marketing_ads',
        'marketing_influencers',
        'marketing_materials',
        'marketing_material_deployments',
        'marketing_material_gifts',
        'marketing_material_store_checks',
        'marketing_campaign_design_tasks',
        'pos_coupons'
      ]
      loop
        if to_regclass(format('public.%I', target_table)) is not null then
          execute format(
            'update public.%I set tenant_id = $1 where coalesce(trim(tenant_id), '''') = ''''',
            target_table
          ) using only_tenant;
        end if;
      end loop;
    end if;
  end if;
end $$;
