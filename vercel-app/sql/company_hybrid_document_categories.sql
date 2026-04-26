-- 문서 카테고리(매장별) + company_hybrid_documents.category_id
-- company_hybrid_documents.sql 적용 후 실행.

create table if not exists public.company_hybrid_document_categories (
  id bigint generated always as identity primary key,
  store text not null,
  name text not null,
  sort_order int not null default 0,
  parent_category_id bigint null
    references public.company_hybrid_document_categories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

alter table public.company_hybrid_document_categories
  add column if not exists parent_category_id bigint null
  references public.company_hybrid_document_categories (id) on delete set null;

create index if not exists company_hybrid_document_categories_store_idx
  on public.company_hybrid_document_categories (store, sort_order, id)
  where deleted_at is null;

create index if not exists company_hybrid_document_categories_parent_idx
  on public.company_hybrid_document_categories (store, parent_category_id, sort_order, id)
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

-- 기본 하위 카테고리 시드(공지, 매뉴얼):
-- 1) 기존 자동 생성명 '하위 카테고리'를 '공지'로 정리
-- 2) 매장별 최상위 카테고리(부모) 중 가장 앞선 1개를 찾아, '공지/매뉴얼' 없을 때만 생성
update public.company_hybrid_document_categories
set name = '공지', updated_at = now()
where deleted_at is null
  and parent_category_id is not null
  and name = '하위 카테고리';

update public.company_hybrid_document_categories
set sort_order = 10, updated_at = now()
where deleted_at is null
  and parent_category_id is not null
  and name = '공지'
  and coalesce(sort_order, 0) <> 10;

update public.company_hybrid_document_categories
set sort_order = 20, updated_at = now()
where deleted_at is null
  and parent_category_id is not null
  and name = '매뉴얼'
  and coalesce(sort_order, 0) <> 20;

with root_per_store as (
  select distinct on (store)
    id as parent_id,
    store
  from public.company_hybrid_document_categories
  where deleted_at is null
    and parent_category_id is null
  order by store, sort_order asc, id asc
),
seed_names as (
  select '공지'::text as name, 10::int as sort_order
  union all
  select '매뉴얼'::text as name, 20::int as sort_order
)
insert into public.company_hybrid_document_categories (
  store,
  name,
  sort_order,
  parent_category_id,
  created_at,
  updated_at
)
select
  r.store,
  s.name,
  s.sort_order,
  r.parent_id,
  now(),
  now()
from root_per_store r
cross join seed_names s
where not exists (
  select 1
  from public.company_hybrid_document_categories c
  where c.deleted_at is null
    and c.store = r.store
    and c.parent_category_id = r.parent_id
    and c.name = s.name
);
