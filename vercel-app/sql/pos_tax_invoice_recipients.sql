-- 세금계산서 수취인 마스터 (POS 검색·관리자 CRUD)
-- Supabase SQL Editor에서 실행. Vercel API는 service_role로 접근(RLS 우회 가능).

create table if not exists public.pos_tax_invoice_recipients (
  id uuid primary key default gen_random_uuid(),
  store_code text not null,
  member_id bigint null,
  member_no text null,
  customer_type text not null check (customer_type in ('person', 'company')),
  name text not null default '',
  tax_id text not null default '',
  branch_no text not null default '',
  phone text not null default '',
  phone_normalized text not null default '',
  email text not null default '',
  address text not null default '',
  is_active boolean not null default true,
  notes text null,
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz null
);

create index if not exists idx_ptir_store_last_used
  on public.pos_tax_invoice_recipients (store_code, last_used_at desc nulls last)
  where is_active = true;

create index if not exists idx_ptir_store_phone_norm
  on public.pos_tax_invoice_recipients (store_code, phone_normalized)
  where is_active = true;

create index if not exists idx_ptir_store_tax_branch
  on public.pos_tax_invoice_recipients (store_code, tax_id, branch_no)
  where is_active = true;

create index if not exists idx_ptir_store_member_no
  on public.pos_tax_invoice_recipients (store_code, member_no)
  where is_active = true and member_no is not null;

comment on table public.pos_tax_invoice_recipients is 'POS 세금계산서 수취인 프로필(회원/비회원). 검색·중복 완화용 마스터.';

alter table public.pos_tax_invoice_recipients enable row level security;

drop policy if exists "ptir_allow_all_anon" on public.pos_tax_invoice_recipients;
create policy "ptir_allow_all_anon"
  on public.pos_tax_invoice_recipients
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "ptir_allow_all_authenticated" on public.pos_tax_invoice_recipients;
create policy "ptir_allow_all_authenticated"
  on public.pos_tax_invoice_recipients
  for all
  to authenticated
  using (true)
  with check (true);
