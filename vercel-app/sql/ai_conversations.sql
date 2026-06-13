-- AI Center — 대화 히스토리 (사용자별 최근 Q&A)

create table if not exists public.ai_conversations (
  id bigserial primary key,
  user_name text not null,
  user_role text not null default '',
  user_store text not null default 'All',
  title text not null default '',
  last_intent text null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);

create index if not exists idx_ai_conversations_user_updated
  on public.ai_conversations (user_name, user_store, updated_at desc);

create table if not exists public.ai_conversation_messages (
  id bigserial primary key,
  conversation_id bigint not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  intent text null,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_ai_conversation_messages_conv
  on public.ai_conversation_messages (conversation_id, id asc);
