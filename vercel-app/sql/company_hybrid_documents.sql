-- 하이브리드 회사 문서: Google Drive 링크 + Supabase Storage 바이너리 메타
-- Supabase SQL Editor에서 테넌트 DB에 한 번 적용. RLS는 API가 service_role로만 접근하는 모델(anon/authenticated 직접 조회 불가).

create table if not exists public.company_hybrid_documents (
  id bigint generated always as identity primary key,
  store text not null,
  related_type text not null
    check (related_type in ('none', 'employee', 'store', 'interior_project')),
  related_id text null,
  doc_type text null,
  title text not null,
  source text not null check (source in ('drive', 'supabase')),
  external_url text null,
  public_url text null,
  storage_path text null,
  file_name text null,
  file_size bigint null,
  mime text null,
  valid_from date null,
  valid_to date null,
  note text null,
  created_by_name text null,
  created_by_store text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

-- 공문 등 확장 메타(기존 DB는 company_hybrid_documents_metadata.sql 로 추가)
alter table public.company_hybrid_documents
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists company_hybrid_documents_store_created_idx
  on public.company_hybrid_documents (store, created_at desc)
  where deleted_at is null;

create index if not exists company_hybrid_documents_related_idx
  on public.company_hybrid_documents (store, related_type, related_id)
  where deleted_at is null;

comment on table public.company_hybrid_documents is
  'Drive 링크·Storage 파일 메타; related_type+related_id로 직원/매장/인테리어 프로젝트 연결.';

-- 감사(등록/수정/삭제/열람 기록; 열람은 API에서 선택적 기록)
create table if not exists public.company_hybrid_document_events (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.company_hybrid_documents (id) on delete cascade,
  action text not null check (action in ('create', 'update', 'delete', 'view')),
  store text not null,
  actor_name text null,
  actor_store text null,
  detail jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists company_hybrid_document_events_doc_idx
  on public.company_hybrid_document_events (document_id, created_at desc);

alter table public.company_hybrid_documents enable row level security;
alter table public.company_hybrid_document_events enable row level security;

-- PostgREST: 정책 없음 → 익명/로그인 사용자는 직접 REST 불가. service_role은 RLS 우회.
