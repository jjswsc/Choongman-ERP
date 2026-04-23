-- 문서 카테고리(매장별) + company_hybrid_documents.category_id
-- company_hybrid_documents.sql 적용 후 실행.

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

-- 기존 테이블이 이미 있을 수 있음: 컬럼만 추가
alter table public.company_hybrid_documents
  add column if not exists category_id bigint null
  references public.company_hybrid_document_categories (id) on delete set null;

create index if not exists company_hybrid_documents_category_idx
  on public.company_hybrid_documents (store, category_id)
  where deleted_at is null;

alter table public.company_hybrid_document_categories enable row level security;
