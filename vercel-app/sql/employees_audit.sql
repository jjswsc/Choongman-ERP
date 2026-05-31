-- 직원 등록·수정·삭제(퇴사 처리) 입력 이력
--
-- 목적:
-- - 직원 폼 저장/삭제 시 "누가, 언제, 무엇을" 변경했는지 추적
-- - password 등 민감 필드는 앱에서 저장 전 제외
--
-- 실행: Supabase SQL Editor에서 전체 실행

begin;

create table if not exists public.employees_audit (
  id bigserial primary key,
  action_type text not null check (action_type in ('insert', 'update', 'delete')),
  changed_at timestamp without time zone not null default timezone('Asia/Bangkok', now()),
  actor_name text null,
  actor_role text null,
  actor_store text null,
  actor_employee_code text null,
  actor_employee_id bigint null,
  employee_id bigint null,
  employee_code text null,
  employee_name text null,
  employee_store text null,
  change_reason text null,
  before_row jsonb null,
  after_row jsonb null
);

create index if not exists idx_employees_audit_changed_at
  on public.employees_audit (changed_at desc);

create index if not exists idx_employees_audit_employee_id
  on public.employees_audit (employee_id, changed_at desc);

create index if not exists idx_employees_audit_employee_store
  on public.employees_audit (employee_store, changed_at desc);

alter table public.employees_audit enable row level security;

drop policy if exists "employees_audit_allow_public_select" on public.employees_audit;
create policy "employees_audit_allow_public_select"
  on public.employees_audit
  as permissive
  for select
  to public
  using (true);

grant usage on schema public to anon, authenticated;
grant select on table public.employees_audit to anon, authenticated;

commit;

-- 확인 예시
-- select action_type, changed_at, actor_name, employee_name, employee_store
-- from public.employees_audit
-- order by id desc
-- limit 50;
