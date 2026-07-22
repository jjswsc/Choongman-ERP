-- 인테리어 대시보드·프로젝트별 알림 집계 (방콕 일자 기준)
-- Omni: p_tenant_id 로 회사 스코프. null이면 전체(충만/레거시).
-- 전체 마이그레이션은 notices_worklog_interior_tenant_id.sql 에 포함.

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
