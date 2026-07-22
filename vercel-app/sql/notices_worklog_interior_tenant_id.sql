-- W3 Omni SaaS: 공지·업무일지·인테리어 tenant_id
-- Supabase SQL Editor (Omni DB)에 붙여넣어 실행.
-- 백필: erp_stores / employees / parent(notices·interior_projects) 경유. 없으면 '' .

-- ── 1) 컬럼 + 인덱스 ─────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'notices',
    'notice_reads',
    'notice_templates',
    'ai_notice_drafts',
    'work_logs',
    'work_logs_audit',
    'interior_projects',
    'interior_schedule_items',
    'interior_expense_items',
    'interior_kitchen_items',
    'interior_direct_purchases',
    'interior_specifications',
    'interior_project_files',
    'interior_work_packages',
    'interior_vendor_tracks',
    'interior_layout_items',
    'interior_material_specs',
    'interior_layout_editor_prefs',
    'interior_vendor_directory'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I add column if not exists tenant_id text', t);
    execute format(
      'update public.%I set tenant_id = '''' where tenant_id is null',
      t
    );
    execute format('alter table public.%I alter column tenant_id set default ''''', t);
    begin
      execute format('alter table public.%I alter column tenant_id set not null', t);
    exception when others then
      raise notice '% tenant_id not null skip: %', t, sqlerrm;
    end;
    execute format(
      'create index if not exists idx_%s_tenant_id on public.%I (tenant_id)',
      t,
      t
    );
  end loop;
end $$;

-- ── 2) notices: sender 매장/직원 → tenant ────────────────────
do $$
begin
  if to_regclass('public.notices') is null then
    return;
  end if;

  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employees' and column_name = 'tenant_id'
     ) then
    update public.notices n
    set tenant_id = e.tenant_id
    from public.employees e
    where coalesce(trim(n.tenant_id), '') = ''
      and nullif(trim(e.tenant_id), '') is not null
      and lower(trim(coalesce(e.name, ''))) = lower(trim(coalesce(n.sender, '')))
      and (
        n.target_store is null
        or trim(n.target_store) = ''
        or n.target_store in ('전체', 'All')
        or lower(trim(coalesce(e.store, ''))) = lower(trim(coalesce(n.target_store, '')))
      );
  end if;

  if to_regclass('public.erp_stores') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'erp_stores' and column_name = 'tenant_id'
     ) then
    update public.notices n
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(n.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and n.target_store is not null
      and trim(n.target_store) <> ''
      and n.target_store not in ('전체', 'All')
      and (
        lower(trim(coalesce(n.target_store, ''))) = lower(trim(coalesce(es.store_code, '')))
        or lower(trim(coalesce(n.target_store, ''))) = lower(trim(coalesce(es.store_name, '')))
        or lower(trim(coalesce(n.target_store, ''))) = lower(trim(coalesce(es.display_name, '')))
      );
  end if;
end $$;

-- notice_reads ← notices
do $$
begin
  if to_regclass('public.notice_reads') is null or to_regclass('public.notices') is null then
    return;
  end if;
  update public.notice_reads r
  set tenant_id = n.tenant_id
  from public.notices n
  where r.notice_id = n.id
    and coalesce(trim(r.tenant_id), '') = ''
    and nullif(trim(n.tenant_id), '') is not null;
end $$;

-- ── 3) work_logs: store / employee_id ────────────────────────
do $$
begin
  if to_regclass('public.work_logs') is null then
    return;
  end if;

  if to_regclass('public.erp_stores') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'work_logs' and column_name = 'store'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'erp_stores' and column_name = 'tenant_id'
     ) then
    update public.work_logs w
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(w.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and (
        lower(trim(coalesce(w.store, ''))) = lower(trim(coalesce(es.store_code, '')))
        or lower(trim(coalesce(w.store, ''))) = lower(trim(coalesce(es.store_name, '')))
        or lower(trim(coalesce(w.store, ''))) = lower(trim(coalesce(es.display_name, '')))
      );
  end if;

  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'work_logs' and column_name = 'employee_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employees' and column_name = 'tenant_id'
     ) then
    update public.work_logs w
    set tenant_id = e.tenant_id
    from public.employees e
    where coalesce(trim(w.tenant_id), '') = ''
      and nullif(trim(e.tenant_id), '') is not null
      and w.employee_id is not null
      and e.id = w.employee_id;
  end if;
end $$;

-- work_logs_audit ← employee / store
do $$
begin
  if to_regclass('public.work_logs_audit') is null then
    return;
  end if;

  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'work_logs_audit' and column_name = 'employee_id'
     ) then
    update public.work_logs_audit a
    set tenant_id = e.tenant_id
    from public.employees e
    where coalesce(trim(a.tenant_id), '') = ''
      and nullif(trim(e.tenant_id), '') is not null
      and a.employee_id is not null
      and e.id = a.employee_id;
  end if;

  if to_regclass('public.erp_stores') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'work_logs_audit' and column_name = 'employee_store'
     ) then
    update public.work_logs_audit a
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(a.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and (
        lower(trim(coalesce(a.employee_store, ''))) = lower(trim(coalesce(es.store_code, '')))
        or lower(trim(coalesce(a.employee_store, ''))) = lower(trim(coalesce(es.store_name, '')))
        or lower(trim(coalesce(a.employee_store, ''))) = lower(trim(coalesce(es.display_name, '')))
      );
  end if;
end $$;

-- ── 4) interior_projects: location → erp_stores ──────────────
do $$
begin
  if to_regclass('public.interior_projects') is null then
    return;
  end if;

  if to_regclass('public.erp_stores') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'interior_projects' and column_name = 'location'
     ) then
    update public.interior_projects p
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(p.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and (
        lower(trim(coalesce(p.location, ''))) = lower(trim(coalesce(es.store_code, '')))
        or lower(trim(coalesce(p.location, ''))) = lower(trim(coalesce(es.store_name, '')))
        or lower(trim(coalesce(p.location, ''))) = lower(trim(coalesce(es.display_name, '')))
      );
  end if;
end $$;

-- interior children ← interior_projects
do $$
declare
  child text;
begin
  if to_regclass('public.interior_projects') is null then
    return;
  end if;

  foreach child in array array[
    'interior_schedule_items',
    'interior_expense_items',
    'interior_kitchen_items',
    'interior_direct_purchases',
    'interior_specifications',
    'interior_project_files',
    'interior_work_packages',
    'interior_vendor_tracks',
    'interior_layout_items',
    'interior_material_specs',
    'interior_layout_editor_prefs'
  ]
  loop
    if to_regclass('public.' || child) is null then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = child and column_name = 'project_id'
    ) then
      continue;
    end if;
    execute format(
      $f$
      update public.%I c
      set tenant_id = p.tenant_id
      from public.interior_projects p
      where c.project_id = p.id
        and coalesce(trim(c.tenant_id), '') = ''
        and nullif(trim(p.tenant_id), '') is not null
      $f$,
      child
    );
  end loop;
end $$;

-- ── 5) 대시보드 RPC: optional p_tenant_id (원본 로직 + 테넌트) ─
drop function if exists public.get_interior_dashboard_summary();
drop function if exists public.get_interior_dashboard_summary(text);

create or replace function public.get_interior_dashboard_summary(p_tenant_id text default null)
returns jsonb
language sql
stable
as $$
with today as (
  select (now() at time zone 'Asia/Bangkok')::date as d
),
projects as (
  select
    id,
    code,
    name,
    coalesce(status, 'active') as status,
    coalesce(budget_total, 0)::numeric as budget_total
  from public.interior_projects
  where p_tenant_id is null
     or coalesce(trim(tenant_id), '') = ''
     or tenant_id = p_tenant_id
),
wp_projects as (
  select distinct project_id from public.interior_work_packages
),
wp_late as (
  select wp.project_id, count(*)::int as cnt
  from public.interior_work_packages wp
  cross join today t
  where coalesce(wp.status, 'planned') not in ('done', 'cancelled')
    and wp.end_date is not null
    and wp.end_date < t.d
    and exists (select 1 from projects p where p.id = wp.project_id)
  group by wp.project_id
),
legacy_late as (
  select si.project_id, count(*)::int as cnt
  from public.interior_schedule_items si
  cross join today t
  where not exists (
    select 1 from wp_projects wp where wp.project_id = si.project_id
  )
    and si.end_date is not null
    and si.end_date < t.d
    and exists (select 1 from projects p where p.id = si.project_id)
  group by si.project_id
),
schedule_late as (
  select project_id, sum(cnt)::int as cnt
  from (
    select project_id, cnt from wp_late
    union all
    select project_id, cnt from legacy_late
  ) x
  group by project_id
),
vt_late as (
  select v.project_id, count(*)::int as cnt
  from public.interior_vendor_tracks v
  cross join today t
  where coalesce(v.status, 'planned') not in ('done', 'cancelled')
    and (
      (v.payment_due_date is not null and v.payment_paid_date is null and v.payment_due_date < t.d)
      or (v.material_eta_date is not null and v.material_received_date is null and v.material_eta_date < t.d)
      or (
        v.work_completed_date is not null
        and coalesce(v.status, 'planned') <> 'done'
        and v.work_completed_date < t.d
      )
    )
    and exists (select 1 from projects p where p.id = v.project_id)
  group by v.project_id
),
paid as (
  select project_id, coalesce(sum(paid), 0)::numeric as paid_total
  from public.interior_expense_items e
  where exists (select 1 from projects p where p.id = e.project_id)
  group by project_id
),
project_rows as (
  select
    p.id,
    coalesce(paid.paid_total, 0) as paid_total,
    coalesce(schedule_late.cnt, 0) as schedule_late_count,
    coalesce(vt_late.cnt, 0) as vendor_delayed_count,
    (
      p.budget_total > 0
      and coalesce(paid.paid_total, 0) > p.budget_total
    ) as over_budget,
    (
      coalesce(schedule_late.cnt, 0) > 0
      or coalesce(vt_late.cnt, 0) > 0
      or (
        p.budget_total > 0
        and coalesce(paid.paid_total, 0) > p.budget_total
      )
    ) as has_alert
  from projects p
  left join paid on paid.project_id = p.id
  left join schedule_late on schedule_late.project_id = p.id
  left join vt_late on vt_late.project_id = p.id
)
select jsonb_build_object(
  'generatedAt', (select d::text from today),
  'totals', jsonb_build_object(
    'activeProjectCount', (
      select count(*)::int from projects where status <> 'completed'
    ),
    'scheduleOverdueCount', coalesce((select sum(schedule_late_count) from project_rows), 0),
    'vendorDelayedCount', coalesce((select sum(vendor_delayed_count) from project_rows), 0),
    'overBudgetProjectCount', (
      select count(*)::int from project_rows where over_budget
    ),
    'projectsWithAnyAlert', (
      select count(*)::int from project_rows where has_alert
    )
  ),
  'projects', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'paidTotal', paid_total,
          'scheduleLateCount', schedule_late_count,
          'vendorDelayedCount', vendor_delayed_count,
          'overBudget', over_budget,
          'hasAlert', has_alert
        )
        order by id
      )
      from project_rows
    ),
    '[]'::jsonb
  )
);
$$;

notify pgrst, 'reload schema';
