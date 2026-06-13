-- SaaS 청구·인보이스용 회사 정보 (대리점 · 고객사)
-- saas_partner_reseller.sql / saas_base_schema.sql 이후 실행

alter table if exists public.tenants
  add column if not exists owner_name text,
  add column if not exists phone text,
  add column if not exists legal_name text,
  add column if not exists tax_id text,
  add column if not exists billing_address text,
  add column if not exists billing_email text;

alter table if exists public.saas_partners
  add column if not exists legal_name text,
  add column if not exists tax_id text,
  add column if not exists billing_address text;

comment on column public.tenants.legal_name is '세금계산서·청구서 법인명(표시명과 다를 수 있음)';
comment on column public.tenants.tax_id is '태국 Tax ID 13자리 등';
comment on column public.saas_partners.legal_name is '대리점 법인명(청구·정산)';
