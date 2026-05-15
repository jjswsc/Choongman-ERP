-- POS 주문 감사로그 표준 테이블
-- 요구사항: 누가/언제/무엇을/이전값→변경값 + 관리자 검색(직원, 주문번호, 기간)

create table if not exists public.pos_order_audit_logs (
  id bigserial primary key,
  changed_at timestamptz not null default now(),
  order_id bigint not null,
  order_no text null,
  store_code text null,
  action_type text not null,
  changed_by text null,
  changed_by_role text null,
  changed_by_store text null,
  changed_by_employee_code text null,
  changed_by_employee_id bigint null,
  change_source text null,
  reason text null,
  before_json jsonb null,
  after_json jsonb null,
  changed_fields_json jsonb null
);

create index if not exists idx_pos_order_audit_changed_at
  on public.pos_order_audit_logs (changed_at desc);

create index if not exists idx_pos_order_audit_order_no
  on public.pos_order_audit_logs (order_no, changed_at desc);

create index if not exists idx_pos_order_audit_order_id
  on public.pos_order_audit_logs (order_id, changed_at desc);

create index if not exists idx_pos_order_audit_employee
  on public.pos_order_audit_logs (changed_by_employee_code, changed_at desc);

create index if not exists idx_pos_order_audit_changed_by
  on public.pos_order_audit_logs (changed_by, changed_at desc);

alter table public.pos_order_audit_logs enable row level security;

drop policy if exists "Allow all pos_order_audit_logs" on public.pos_order_audit_logs;
create policy "Allow all pos_order_audit_logs"
on public.pos_order_audit_logs
for all
using (true)
with check (true);
