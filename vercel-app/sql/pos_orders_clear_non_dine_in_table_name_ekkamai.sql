-- pos_orders: 에까마이 매장에서 dine_in 이외 주문의 table_name 정리
-- 목적:
-- 1) 배달/포장 주문에 남아있는 table_name을 제거해 테이블 이동 점유 충돌 재발을 방지
-- 2) 실행 전/후 건수를 확인할 수 있게 미리보기 + 업데이트 + 검증 조회 제공
--
-- 사용 방법:
-- A. params CTE의 v_store_keyword 값을 실제 매장 코드 표기에 맞게 확인 (기본: 'ekkamai')
-- B. 1)~3) 조회 결과를 먼저 검토
-- C. 검토 후 4) UPDATE 실행
-- D. 5) 검증 조회로 잔여 건수 확인

begin;

-- 1) 대상 미리보기 (최근 200건)
with params as (
  select
    'ekkamai'::text as v_store_keyword
)
select
  id,
  order_no,
  store_code,
  order_type,
  table_name,
  status,
  created_at
from public.pos_orders o
cross join params p
where coalesce(trim(o.table_name), '') <> ''
  and lower(coalesce(o.order_type, '')) <> 'dine_in'
  and lower(coalesce(o.store_code, '')) like '%' || lower(p.v_store_keyword) || '%'
order by created_at desc nulls last, id desc
limit 200;

-- 2) 대상 건수
with params as (
  select
    'ekkamai'::text as v_store_keyword
)
select
  count(*) as rows_to_clear
from public.pos_orders o
cross join params p
where coalesce(trim(o.table_name), '') <> ''
  and lower(coalesce(o.order_type, '')) <> 'dine_in'
  and lower(coalesce(o.store_code, '')) like '%' || lower(p.v_store_keyword) || '%';

-- 3) order_type 별 분포 확인
with params as (
  select
    'ekkamai'::text as v_store_keyword
)
select
  lower(coalesce(o.order_type, '(null)')) as order_type,
  count(*) as cnt
from public.pos_orders o
cross join params p
where coalesce(trim(o.table_name), '') <> ''
  and lower(coalesce(o.order_type, '')) <> 'dine_in'
  and lower(coalesce(o.store_code, '')) like '%' || lower(p.v_store_keyword) || '%'
group by 1
order by cnt desc, order_type asc;

-- 4) 실제 정리 (dine_in 이외 주문의 table_name 비움)
with params as (
  select
    'ekkamai'::text as v_store_keyword
)
update public.pos_orders o
set table_name = ''
from params p
where coalesce(trim(o.table_name), '') <> ''
  and lower(coalesce(o.order_type, '')) <> 'dine_in'
  and lower(coalesce(o.store_code, '')) like '%' || lower(p.v_store_keyword) || '%';

-- 5) 정리 후 잔여 건수 확인
with params as (
  select
    'ekkamai'::text as v_store_keyword
)
select
  count(*) as remaining_rows
from public.pos_orders o
cross join params p
where coalesce(trim(o.table_name), '') <> ''
  and lower(coalesce(o.order_type, '')) <> 'dine_in'
  and lower(coalesce(o.store_code, '')) like '%' || lower(p.v_store_keyword) || '%';

commit;

