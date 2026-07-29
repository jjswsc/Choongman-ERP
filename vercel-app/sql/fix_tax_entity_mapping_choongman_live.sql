-- 충만 실데이터 기준 법인 엔티티/매장 매핑 생성
-- 대상: store_tax_filing_profiles 에 존재하지만 tax_entity_stores 에 없는 매장
-- 기준: tax_id(사업자번호)별로 1개 entity_code 생성 후 store_code를 매핑

-- 1) 충만 대상 매장 목록을 임시 CTE로 고정
with target_stores as (
  select unnest(array[
    'CM Asoke',
    'CM Bangna',
    'CM Ekkamai',
    'CM Future Park',
    'CM Huamak',
    'CM MBK',
    'CM Office',
    'CM Phuket',
    'CM Seacon Srinakarin',
    'CM Silom',
    'CM The street',
    'CM True Digital',
    'CM Union Mall'
  ]) as store_code
),
base as (
  select
    p.store_code,
    p.tax_id,
    p.taxpayer_name,
    ('choongman-' || p.tax_id) as entity_code
  from public.store_tax_filing_profiles p
  join target_stores t on t.store_code = p.store_code
  where coalesce(p.tax_id, '') <> ''
)

-- 2) tax_entities upsert (사업자번호 단위)
insert into public.tax_entities (
  entity_code,
  entity_name,
  tax_id,
  tenant_id,
  is_active,
  updated_at,
  updated_by
)
select
  b.entity_code,
  max(coalesce(nullif(b.taxpayer_name, ''), b.tax_id)) as entity_name,
  b.tax_id,
  'default' as tenant_id,
  true as is_active,
  now() as updated_at,
  'system:mapping-init' as updated_by
from base b
group by b.entity_code, b.tax_id
on conflict (entity_code) do update set
  entity_name = excluded.entity_name,
  tax_id = excluded.tax_id,
  is_active = true,
  updated_at = now(),
  updated_by = 'system:mapping-init';

-- 3) tax_entity_stores upsert (매장 연결)
with target_stores as (
  select unnest(array[
    'CM Asoke',
    'CM Bangna',
    'CM Ekkamai',
    'CM Future Park',
    'CM Huamak',
    'CM MBK',
    'CM Office',
    'CM Phuket',
    'CM Seacon Srinakarin',
    'CM Silom',
    'CM The street',
    'CM True Digital',
    'CM Union Mall'
  ]) as store_code
),
base as (
  select
    p.store_code,
    p.tax_id,
    ('choongman-' || p.tax_id) as entity_code
  from public.store_tax_filing_profiles p
  join target_stores t on t.store_code = p.store_code
  where coalesce(p.tax_id, '') <> ''
)
insert into public.tax_entity_stores (
  entity_code,
  store_code,
  updated_at,
  updated_by
)
select
  b.entity_code,
  b.store_code,
  now(),
  'system:mapping-init'
from base b
on conflict (entity_code, store_code) do update set
  updated_at = now(),
  updated_by = 'system:mapping-init';

-- 4) 결과 검증
select
  te.entity_code,
  te.tax_id,
  count(tes.store_code) as mapped_store_count,
  array_agg(tes.store_code order by tes.store_code) as stores
from public.tax_entities te
join public.tax_entity_stores tes
  on tes.entity_code = te.entity_code
where te.entity_code like 'choongman-%'
group by te.entity_code, te.tax_id
order by te.entity_code;
