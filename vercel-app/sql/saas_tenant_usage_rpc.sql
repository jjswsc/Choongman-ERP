-- SaaS 제어 평면 규모 확장: tenant usage·감사·과금 일괄 RPC (Supabase SQL Editor 수동 실행)
-- 미배포 시 API는 JS fallback으로 동작한다.

-- ── 인덱스 (없으면 생성) ──
create index if not exists idx_erp_stores_tenant_id on public.erp_stores (tenant_id);
create index if not exists idx_employees_tenant_id on public.employees (tenant_id);
create index if not exists idx_tenant_device_registry_tenant_kind on public.tenant_device_registry (tenant_id, device_kind, is_active);
create index if not exists idx_pos_orders_tenant_created on public.pos_orders (tenant_id, created_at desc);
create index if not exists idx_saas_audit_logs_tenant_changed on public.saas_audit_logs (tenant_id, changed_at desc);
create index if not exists idx_saas_billing_events_tenant_happened on public.saas_billing_events (tenant_id, happened_at desc);

-- ── tenant별 usage 일괄 집계 (방콕시간 당월 주문) ──
create or replace function public.get_saas_tenant_usage_batch(p_tenant_ids text[])
returns table (
  tenant_id text,
  stores bigint,
  manager_accounts bigint,
  staff_accounts bigint,
  tablets bigint,
  pos_devices bigint,
  monthly_orders bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ids as (
    select distinct trim(t) as tenant_id
    from unnest(coalesce(p_tenant_ids, array[]::text[])) as t
    where trim(t) <> ''
  ),
  month_start as (
    select (date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as ts
  ),
  store_counts as (
    select s.tenant_id, count(*)::bigint as cnt
    from public.erp_stores s
    inner join ids i on i.tenant_id = s.tenant_id
    group by s.tenant_id
  ),
  staff_counts as (
    select e.tenant_id, count(*)::bigint as cnt
    from public.employees e
    inner join ids i on i.tenant_id = e.tenant_id
    group by e.tenant_id
  ),
  manager_counts as (
    select e.tenant_id, count(*)::bigint as cnt
    from public.employees e
    inner join ids i on i.tenant_id = e.tenant_id
    where lower(coalesce(e.role, '')) like '%manager%'
       or lower(coalesce(e.role, '')) like '%franchisee%'
    group by e.tenant_id
  ),
  tablet_counts as (
    select d.tenant_id, count(*)::bigint as cnt
    from public.tenant_device_registry d
    inner join ids i on i.tenant_id = d.tenant_id
    where d.device_kind = 'tablet' and coalesce(d.is_active, true) = true
    group by d.tenant_id
  ),
  pos_counts as (
    select d.tenant_id, count(*)::bigint as cnt
    from public.tenant_device_registry d
    inner join ids i on i.tenant_id = d.tenant_id
    where d.device_kind = 'pos' and coalesce(d.is_active, true) = true
    group by d.tenant_id
  ),
  order_counts as (
    select po.tenant_id, count(*)::bigint as cnt
    from public.pos_orders po
    inner join ids i on i.tenant_id = po.tenant_id
    cross join month_start ms
    where po.created_at >= ms.ts
    group by po.tenant_id
  )
  select
    i.tenant_id,
    coalesce(sc.cnt, 0) as stores,
    coalesce(mc.cnt, 0) as manager_accounts,
    coalesce(stc.cnt, 0) as staff_accounts,
    coalesce(tc.cnt, 0) as tablets,
    coalesce(pc.cnt, 0) as pos_devices,
    coalesce(oc.cnt, 0) as monthly_orders
  from ids i
  left join store_counts sc on sc.tenant_id = i.tenant_id
  left join manager_counts mc on mc.tenant_id = i.tenant_id
  left join staff_counts stc on stc.tenant_id = i.tenant_id
  left join tablet_counts tc on tc.tenant_id = i.tenant_id
  left join pos_counts pc on pc.tenant_id = i.tenant_id
  left join order_counts oc on oc.tenant_id = i.tenant_id;
$$;

-- ── tenant별 최근 감사 로그 (tenant당 N건) ──
create or replace function public.get_saas_tenant_audit_recent(
  p_tenant_ids text[],
  p_per_tenant int default 20
)
returns table (
  id bigint,
  tenant_id text,
  action text,
  actor_name text,
  actor_role text,
  changed_at timestamptz,
  summary text,
  payload_json jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ranked.id,
    ranked.tenant_id,
    ranked.action,
    ranked.actor_name,
    ranked.actor_role,
    ranked.changed_at,
    ranked.summary,
    ranked.payload_json
  from (
    select
      al.id,
      al.tenant_id,
      al.action,
      al.actor_name,
      al.actor_role,
      al.changed_at,
      al.summary,
      al.payload_json,
      row_number() over (
        partition by al.tenant_id
        order by al.changed_at desc nulls last, al.id desc
      ) as rn
    from public.saas_audit_logs al
    where al.tenant_id = any(coalesce(p_tenant_ids, array[]::text[]))
  ) ranked
  where ranked.rn <= greatest(1, least(coalesce(p_per_tenant, 20), 100));
$$;

-- ── tenant별 최근 과금 이벤트 (tenant당 N건) ──
create or replace function public.get_saas_tenant_billing_recent(
  p_tenant_ids text[],
  p_per_tenant int default 20
)
returns table (
  id bigint,
  tenant_id text,
  event_type text,
  amount numeric,
  currency text,
  status text,
  happened_at timestamptz,
  memo text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ranked.id,
    ranked.tenant_id,
    ranked.event_type,
    ranked.amount,
    ranked.currency,
    ranked.status,
    ranked.happened_at,
    ranked.memo
  from (
    select
      be.id,
      be.tenant_id,
      be.event_type,
      be.amount,
      be.currency,
      be.status,
      be.happened_at,
      be.memo,
      row_number() over (
        partition by be.tenant_id
        order by be.happened_at desc nulls last, be.id desc
      ) as rn
    from public.saas_billing_events be
    where be.tenant_id = any(coalesce(p_tenant_ids, array[]::text[]))
  ) ranked
  where ranked.rn <= greatest(1, least(coalesce(p_per_tenant, 20), 100));
$$;
