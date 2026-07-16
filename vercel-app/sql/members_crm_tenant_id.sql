-- Omni SaaS: CRM 부가 테이블 tenant_id (회원 tenant 상속)
-- members.tenant_id 선행 필요.

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'member_points_ledger',
    'member_tier_histories',
    'member_coupon_issues',
    'member_stamp_cards',
    'member_stamp_ledger'
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

-- member_id → members.tenant_id 백필
do $$
declare
  target_table text;
begin
  if to_regclass('public.members') is null then
    return;
  end if;

  foreach target_table in array array[
    'member_points_ledger',
    'member_tier_histories',
    'member_coupon_issues',
    'member_stamp_cards',
    'member_stamp_ledger'
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
