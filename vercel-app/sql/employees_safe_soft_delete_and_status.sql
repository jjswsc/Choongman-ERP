-- 직원 관리 안전 업그레이드 (무중단/하위호환)
-- 적용 순서:
-- 1) 본 파일 실행
-- 2) 필요 시 하단 CONCURRENTLY 인덱스 별도 실행

begin;

alter table if exists public.employees
  add column if not exists employment_status text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists delete_reason text;

update public.employees
set employment_status = case
  when coalesce(trim(employment_status), '') <> '' then employment_status
  when resign_date is not null then 'resigned'
  else 'active'
end;

alter table if exists public.employees
  alter column employment_status set default 'active';

-- 제약이 이미 있을 때(재실행) 42710으로 실패하지 않도록: 이중 EXISTS 판정 + 42710 예외
do $$
  declare
    cname constant text := 'employees_employment_status_chk';
    have_chk boolean;
  begin
    have_chk :=
      exists (
        select 1
        from information_schema.table_constraints tc
        where tc.constraint_type = 'CHECK'
          and tc.constraint_schema = 'public'
          and tc.table_name = 'employees'
          and tc.constraint_name = cname
      )
      or exists (
        select 1
        from pg_constraint c
        where c.conname = cname
          and c.conrelid = 'public.employees'::regclass
      );

    if not have_chk then
      begin
        alter table public.employees
          add constraint employees_employment_status_chk
          check (employment_status in ('active', 'leave', 'resigned', 'suspended'))
          not valid;
        have_chk := true;
      exception
        when sqlstate '42710' then
          raise notice 'Constraint % already on employees; skip add.', cname;
          have_chk := true;
      end;
    end if;

    if have_chk then
      alter table public.employees
        validate constraint employees_employment_status_chk;
    end if;
  end
$$;

create table if not exists public.employee_change_logs (
  id bigserial primary key,
  employee_id bigint not null,
  field_name text not null,
  old_value text,
  new_value text,
  changed_by text,
  change_reason text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_employee_change_logs_employee_id
  on public.employee_change_logs(employee_id, changed_at desc);

commit;

-- 운영 중 락 최소화를 위해 아래 인덱스는 트랜잭션 밖에서 별도 실행 권장
-- create index concurrently if not exists idx_employees_store_status_job on public.employees(store, employment_status, job);
-- create index concurrently if not exists idx_employees_name_lower on public.employees(lower(name));
-- create index concurrently if not exists idx_employees_nick_lower on public.employees(lower(nick));
-- create index concurrently if not exists idx_employees_employee_code on public.employees(employee_code);
