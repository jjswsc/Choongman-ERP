-- W1 Omni SaaS: 인사·근태·급여·스케줄·휴가·QR 기기 tenant_id
-- Supabase SQL Editor (Omni DB)에 붙여넣어 실행.
-- 백필: employees.tenant_id / erp_stores.tenant_id 경유. 없으면 '' .
--
-- 주의: attendance_logs / schedules 매장 컬럼명은 store_name (store 아님).

-- 공통: 테이블에 tenant_id 추가 + 인덱스
do $$
declare
  t text;
begin
  foreach t in array array[
    'attendance_logs',
    'attendance_log_adjustments',
    'schedules',
    'payroll_records',
    'leave_requests',
    'hr_policies',
    'hr_policy_reads',
    'employee_salary_history',
    'pos_connected_devices'
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

-- attendance_logs: store_name → erp_stores, employee_id → employees
do $$
begin
  if to_regclass('public.attendance_logs') is null then
    return;
  end if;

  if to_regclass('public.erp_stores') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'erp_stores' and column_name = 'tenant_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'attendance_logs' and column_name = 'store_name'
     ) then
    update public.attendance_logs a
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(a.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and (
        lower(trim(coalesce(a.store_name, ''))) = lower(trim(coalesce(es.store_code, '')))
        or lower(trim(coalesce(a.store_name, ''))) = lower(trim(coalesce(es.store_name, '')))
        or lower(trim(coalesce(a.store_name, ''))) = lower(trim(coalesce(es.display_name, '')))
      );
  end if;

  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employees' and column_name = 'tenant_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'attendance_logs' and column_name = 'employee_id'
     ) then
    update public.attendance_logs a
    set tenant_id = e.tenant_id
    from public.employees e
    where coalesce(trim(a.tenant_id), '') = ''
      and nullif(trim(e.tenant_id), '') is not null
      and a.employee_id is not null
      and e.id = a.employee_id;
  end if;
end $$;

-- schedules: store_name (또는 legacy store)
do $$
declare
  store_col text := null;
begin
  if to_regclass('public.schedules') is null then
    return;
  end if;
  if to_regclass('public.erp_stores') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schedules' and column_name = 'store_name'
  ) then
    store_col := 'store_name';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schedules' and column_name = 'store'
  ) then
    store_col := 'store';
  else
    raise notice 'skip schedules backfill: no store/store_name column';
    return;
  end if;

  execute format(
    $q$
    update public.schedules s
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(s.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and (
        lower(trim(coalesce(s.%I, ''))) = lower(trim(coalesce(es.store_code, '')))
        or lower(trim(coalesce(s.%I, ''))) = lower(trim(coalesce(es.store_name, '')))
        or lower(trim(coalesce(s.%I, ''))) = lower(trim(coalesce(es.display_name, '')))
      )
    $q$,
    store_col,
    store_col,
    store_col
  );
end $$;

-- payroll_records
do $$
begin
  if to_regclass('public.payroll_records') is null then
    return;
  end if;

  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'payroll_records' and column_name = 'employee_id'
     ) then
    update public.payroll_records p
    set tenant_id = e.tenant_id
    from public.employees e
    where coalesce(trim(p.tenant_id), '') = ''
      and nullif(trim(e.tenant_id), '') is not null
      and p.employee_id is not null
      and e.id = p.employee_id;
  end if;

  if to_regclass('public.erp_stores') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'payroll_records' and column_name = 'store'
     ) then
    update public.payroll_records p
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(p.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and (
        lower(trim(coalesce(p.store, ''))) = lower(trim(coalesce(es.store_code, '')))
        or lower(trim(coalesce(p.store, ''))) = lower(trim(coalesce(es.store_name, '')))
        or lower(trim(coalesce(p.store, ''))) = lower(trim(coalesce(es.display_name, '')))
      );
  end if;

  create index if not exists idx_payroll_records_tenant_month
    on public.payroll_records (tenant_id, month);
end $$;

-- leave_requests
do $$
begin
  if to_regclass('public.leave_requests') is null then
    return;
  end if;
  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'leave_requests' and column_name = 'employee_id'
     ) then
    update public.leave_requests l
    set tenant_id = e.tenant_id
    from public.employees e
    where coalesce(trim(l.tenant_id), '') = ''
      and nullif(trim(e.tenant_id), '') is not null
      and l.employee_id is not null
      and e.id = l.employee_id;
  end if;
end $$;

-- hr_policies / reads — 단일 테넌트 orphan 일괄
do $$
declare
  tenant_cnt int;
  only_tenant text;
begin
  if to_regclass('public.hr_policies') is null then
    return;
  end if;
  if to_regclass('public.tenants') is not null then
    select count(distinct nullif(trim(id), '')) into tenant_cnt from public.tenants;
    if tenant_cnt = 1 then
      select nullif(trim(id), '') into only_tenant from public.tenants limit 1;
      if only_tenant is not null then
        update public.hr_policies
        set tenant_id = only_tenant
        where coalesce(trim(tenant_id), '') = '';
        if to_regclass('public.hr_policy_reads') is not null then
          update public.hr_policy_reads
          set tenant_id = only_tenant
          where coalesce(trim(tenant_id), '') = '';
        end if;
      end if;
    end if;
  end if;
end $$;

-- employee_salary_history
do $$
begin
  if to_regclass('public.employee_salary_history') is null then
    return;
  end if;
  if to_regclass('public.employees') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'employee_salary_history' and column_name = 'employee_id'
     ) then
    update public.employee_salary_history h
    set tenant_id = e.tenant_id
    from public.employees e
    where coalesce(trim(h.tenant_id), '') = ''
      and nullif(trim(e.tenant_id), '') is not null
      and h.employee_id is not null
      and e.id = h.employee_id;
  end if;
end $$;

-- pos_connected_devices (근태 QR)
do $$
begin
  if to_regclass('public.pos_connected_devices') is null then
    return;
  end if;
  if to_regclass('public.erp_stores') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'pos_connected_devices' and column_name = 'store_code'
     ) then
    update public.pos_connected_devices d
    set tenant_id = es.tenant_id
    from public.erp_stores es
    where coalesce(trim(d.tenant_id), '') = ''
      and nullif(trim(es.tenant_id), '') is not null
      and lower(trim(coalesce(d.store_code, ''))) = lower(trim(coalesce(es.store_code, '')));
  end if;
end $$;

-- attendance_log_adjustments ← parent log
do $$
begin
  if to_regclass('public.attendance_log_adjustments') is null
     or to_regclass('public.attendance_logs') is null then
    return;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'attendance_log_adjustments'
      and column_name = 'attendance_log_id'
  ) then
    update public.attendance_log_adjustments adj
    set tenant_id = l.tenant_id
    from public.attendance_logs l
    where coalesce(trim(adj.tenant_id), '') = ''
      and nullif(trim(l.tenant_id), '') is not null
      and adj.attendance_log_id = l.id;
  end if;
end $$;
