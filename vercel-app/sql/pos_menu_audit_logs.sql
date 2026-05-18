create table if not exists public.pos_menu_audit_logs (
  id bigserial primary key,
  menu_id bigint not null,
  menu_code text null,
  action_type text not null default 'update',
  changed_by text null,
  changed_by_role text null,
  changed_by_store text null,
  changed_by_employee_code text null,
  changed_by_employee_id bigint null,
  change_source text null,
  reason text null,
  before_json jsonb null,
  after_json jsonb null,
  changed_fields_json jsonb null,
  detail_json jsonb null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_pos_menu_audit_logs_menu_id
  on public.pos_menu_audit_logs (menu_id, changed_at desc);

create index if not exists idx_pos_menu_audit_logs_changed_at
  on public.pos_menu_audit_logs (changed_at desc);
