-- POS 원가(BOM) 변경 이력 테이블
--
-- 목적:
-- - 원가 계산기 저장/삭제 시 "누가, 언제, 무엇을" 변경했는지 추적
-- - menu_id 변동 이슈 대비 menu_code 스냅샷도 함께 기록
--
-- 실행: Supabase SQL Editor에서 전체 실행

begin;

create table if not exists public.pos_menu_ingredients_audit (
  id bigserial primary key,
  action_type text not null check (action_type in ('insert', 'update', 'delete')),
  changed_at timestamp without time zone not null default timezone('Asia/Bangkok', now()),
  actor_name text null,
  actor_role text null,
  actor_store text null,
  actor_employee_code text null,
  actor_employee_id bigint null,
  menu_id bigint null,
  menu_code text null,
  option_id bigint null,
  ingredient_id bigint null,
  before_row jsonb null,
  after_row jsonb null
);

create index if not exists idx_pos_menu_ingredients_audit_changed_at
  on public.pos_menu_ingredients_audit (changed_at desc);

create index if not exists idx_pos_menu_ingredients_audit_menu_code
  on public.pos_menu_ingredients_audit (menu_code);

create index if not exists idx_pos_menu_ingredients_audit_menu_id
  on public.pos_menu_ingredients_audit (menu_id);

alter table public.pos_menu_ingredients_audit enable row level security;

drop policy if exists "pos_menu_ingredients_audit_allow_public_select" on public.pos_menu_ingredients_audit;
create policy "pos_menu_ingredients_audit_allow_public_select"
  on public.pos_menu_ingredients_audit
  as permissive
  for select
  to public
  using (true);

grant usage on schema public to anon, authenticated;
grant select on table public.pos_menu_ingredients_audit to anon, authenticated;

commit;

-- 확인 예시
-- select action_type, changed_at, actor_name, actor_role, menu_code, ingredient_id
-- from public.pos_menu_ingredients_audit
-- where upper(trim(menu_code)) in ('T001','T002','T003')
-- order by id desc
-- limit 100;
