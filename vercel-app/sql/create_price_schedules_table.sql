-- 가격 예약(지정 시각 자동 반영) 테이블
create table if not exists public.price_schedules (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('item', 'pos_menu')),
  entity_id text not null,
  entity_display_name text null,
  field_name text not null,
  current_value numeric null,
  scheduled_value numeric not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled', 'failed')),
  effective_at timestamptz not null,
  created_by text null,
  created_at timestamptz not null default now(),
  applied_at timestamptz null,
  cancelled_at timestamptz null,
  failed_reason text null,
  category text null,
  category_main text null
);

create index if not exists idx_price_schedules_status_effective_at
  on public.price_schedules (status, effective_at);

create index if not exists idx_price_schedules_entity
  on public.price_schedules (entity_type, entity_id);
