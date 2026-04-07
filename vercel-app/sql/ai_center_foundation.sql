-- AI Center foundation schema (Supabase)
-- Run this once in SQL editor before enabling AI Center features.

create table if not exists public.ai_knowledge_chunks (
  id bigserial primary key,
  source text not null default 'internal',
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  store_scope text null default 'All',
  role_scope text null,
  updated_at timestamp without time zone not null default now(),
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_ai_knowledge_chunks_updated_at
  on public.ai_knowledge_chunks (updated_at desc);

create index if not exists idx_ai_knowledge_chunks_store_scope
  on public.ai_knowledge_chunks (store_scope);

create table if not exists public.ai_action_requests (
  id bigserial primary key,
  status text not null check (status in ('pending_approval','approved','rejected','executed','failed')),
  action_type text not null,
  reason text not null,
  payload_json jsonb not null default '{}'::jsonb,
  preview text not null default '',
  requested_by text not null,
  requested_role text not null,
  requested_store text not null default 'All',
  approved_by text null,
  approved_at timestamp without time zone null,
  executed_at timestamp without time zone null,
  execution_result_type text null,
  execution_result_id bigint null,
  error_message text null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);

create index if not exists idx_ai_action_requests_status
  on public.ai_action_requests (status, id desc);

create index if not exists idx_ai_action_requests_store
  on public.ai_action_requests (requested_store, id desc);

create table if not exists public.ai_action_events (
  id bigserial primary key,
  request_id bigint not null references public.ai_action_requests(id) on delete cascade,
  event_type text not null,
  actor_name text not null,
  actor_role text not null,
  detail text null,
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_ai_action_events_request_id
  on public.ai_action_events (request_id, id asc);

create table if not exists public.ai_notice_drafts (
  id bigserial primary key,
  title text not null,
  content text not null,
  target_store text not null default 'All',
  source text not null default 'ai_center',
  created_by text not null,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.ai_followup_tasks (
  id bigserial primary key,
  title text not null,
  description text not null default '',
  owner text null,
  store_scope text not null default 'All',
  due_date date null,
  status text not null check (status in ('todo','in_progress','done','cancelled')) default 'todo',
  source text not null default 'ai_center',
  created_by text not null,
  updated_by text null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone null
);

create table if not exists public.ai_usage_logs (
  id bigserial primary key,
  route text not null,
  model text null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  success boolean not null default true,
  latency_ms integer null,
  note text null,
  user_name text not null,
  user_role text not null,
  user_store text not null default 'All',
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_ai_usage_logs_created_at
  on public.ai_usage_logs (created_at desc);

create table if not exists public.external_store_profiles (
  id bigserial primary key,
  store_name text not null unique,
  lat double precision null,
  lon double precision null,
  country_code text not null default 'TH',
  timezone text not null default 'Asia/Bangkok',
  enabled boolean not null default true,
  note text null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone null
);

create table if not exists public.external_context_daily (
  id bigserial primary key,
  date_bkk date not null,
  store_name text not null,
  weather_code integer null,
  weather_text text null,
  temp_min_c double precision null,
  temp_max_c double precision null,
  rain_mm double precision null,
  rain_prob integer null,
  humidity_avg integer null,
  wind_max_kmh double precision null,
  is_holiday boolean not null default false,
  holiday_name text null,
  event_tags text[] not null default '{}',
  source text not null default 'open-meteo+nager',
  fetched_at timestamp without time zone not null default now(),
  unique(date_bkk, store_name)
);

create index if not exists idx_external_context_daily_store_date
  on public.external_context_daily (store_name, date_bkk desc);

