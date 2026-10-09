-- 실데이터 검증: 충만/Omni 공통 법인-매장 매핑 점검
-- 실행 순서:
-- 1) tax_entities_and_store_mapping.sql 먼저 실행
-- 2) 아래 쿼리 실행 후 결과 확인

-- [A] 테이블 건수
select
  (select count(*) from public.erp_stores where coalesce(is_active, true) = true) as active_erp_stores,
  (select count(*) from public.store_tax_filing_profiles) as filing_profiles,
  (select count(*) from public.tax_entities) as tax_entities,
  (select count(*) from public.tax_entity_stores) as tax_entity_store_links;

-- [B] tax_id 기준으로 매장 묶음 현황 (법인 후보)
select
  p.tax_id,
  count(*) as store_count,
  array_agg(p.store_code order by p.store_code) as stores
from public.store_tax_filing_profiles p
where coalesce(p.tax_id, '') <> ''
group by p.tax_id
order by store_count desc, p.tax_id;

-- [C] 활성 매장 중 store_tax_filing_profiles 누락 매장
select
  s.store_code,
  s.display_name
from public.erp_stores s
left join public.store_tax_filing_profiles p
  on p.store_code = s.store_code
where coalesce(s.is_active, true) = true
  and p.store_code is null
order by s.store_code;

-- [D] 신고프로필은 있는데 tax_entity_stores 매핑이 없는 매장
select
  p.store_code,
  p.tax_id,
  p.taxpayer_name
from public.store_tax_filing_profiles p
left join public.tax_entity_stores tes
  on tes.store_code = p.store_code
where tes.store_code is null
order by p.store_code;

-- [E] tax_entity_stores는 있는데 tax_entities 본체가 없는 고아 매핑
select
  tes.entity_code,
  tes.store_code
from public.tax_entity_stores tes
left join public.tax_entities te
  on te.entity_code = tes.entity_code
where te.entity_code is null
order by tes.entity_code, tes.store_code;

-- [F] 동일 tax_id가 여러 entity_code로 찢어진 경우 (주의)
select
  te.tax_id,
  count(distinct te.entity_code) as entity_count,
  array_agg(distinct te.entity_code order by te.entity_code) as entities
from public.tax_entities te
where coalesce(te.tax_id, '') <> ''
group by te.tax_id
having count(distinct te.entity_code) > 1
order by entity_count desc, te.tax_id;

-- [G] 엔티티별 매장 수 + 합산 확인용
select
  te.entity_code,
  te.entity_name,
  te.tax_id,
  count(tes.store_code) as mapped_store_count,
  array_agg(tes.store_code order by tes.store_code) filter (where tes.store_code is not null) as stores
from public.tax_entities te
left join public.tax_entity_stores tes
  on tes.entity_code = te.entity_code
group by te.entity_code, te.entity_name, te.tax_id
order by te.entity_code;
