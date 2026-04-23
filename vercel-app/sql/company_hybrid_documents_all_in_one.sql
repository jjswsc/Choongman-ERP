-- =============================================================================
-- 회사 하이브리드 문서 (Drive + Storage) + 문서 카테고리 — 한 번에 붙여넣기
-- =============================================================================
-- 사용법 (Supabase)
--   1. Dashboard → SQL Editor → New query
--   2. 이 파일 전체(Ctrl+A) 복사 후 에디터에 붙여넣기
--   3. Run (또는 Ctrl+Enter)
--
-- 이미 일부만 적용된 DB에도 대부분 안전합니다.
--   - create table if not exists / add column if not exists 사용
--
-- 오류 PGRST205 / "Could not find the table 'public.company_hybrid_documents'
--   (또는 company_hybrid_document_categories) in the schema cache"
--   → 아래 스크립트를 해당 프로젝트에 아직 실행하지 않은 경우입니다. 이 파일을
--   Run 한 뒤에도 동일하면 맨 아래 NOTIFY 한 줄을 다시 실행하거나, Dashboard에서
--   API( PostgREST ) 재시작·스키마 리로드를 시도하세요.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) 문서 + 감사 이벤트
-- ---------------------------------------------------------------------------
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

create index if not exists company_hybrid_documents_store_created_idx
  on public.company_hybrid_documents (store, created_at desc)
  where deleted_at is null;

create index if not exists company_hybrid_documents_related_idx
  on public.company_hybrid_documents (store, related_type, related_id)
  where deleted_at is null;

comment on table public.company_hybrid_documents is
  'Drive 링크·Storage 파일 메타; related_type+related_id로 직원/매장/인테리어 프로젝트 연결.';

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
-- PostgREST: 직접 익명/로그인 정책 없음 → service_role API만 사용.

-- ---------------------------------------------------------------------------
-- 2) 문서 카테고리(매장별) + company_hybrid_documents.category_id
-- ---------------------------------------------------------------------------
create table if not exists public.company_hybrid_document_categories (
  id bigint generated always as identity primary key,
  store text not null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists company_hybrid_document_categories_store_idx
  on public.company_hybrid_document_categories (store, sort_order, id)
  where deleted_at is null;

comment on table public.company_hybrid_document_categories is
  '회사 하이브리드 문서용 매장별 카테고리(계약, 면허, 세무 등).';

alter table public.company_hybrid_documents
  add column if not exists category_id bigint null
  references public.company_hybrid_document_categories (id) on delete set null;

create index if not exists company_hybrid_documents_category_idx
  on public.company_hybrid_documents (store, category_id)
  where deleted_at is null;

alter table public.company_hybrid_document_categories enable row level security;

-- ---------------------------------------------------------------------------
-- 3) PostgREST 스키마 캐시 (테이블 생성 직후 API가 테이블을 못 찾을 때)
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';