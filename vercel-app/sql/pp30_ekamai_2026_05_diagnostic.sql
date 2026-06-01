-- PP30(ภ.พ.30) — Ekkamai / Ekamai 2026년 5월 진단
-- Supabase SQL Editor에서 실행. tax_month·매장 키워드는 필요 시 수정.

-- ============================================================
-- 0) 파라미터
-- ============================================================
-- v_tax_month: '2026-05' (2025년 5월이면 '2025-05')
-- v_store_kw:  ekkamai / ekamai / 에까마이 등 ilike 검색용

-- ============================================================
-- 1) erp_stores — Ekkamai 마스터 등록 여부 (없으면 PP30 매칭 실패 가능)
-- ============================================================
select
  store_code,
  display_name,
  aliases,
  is_active,
  sort_order
from public.erp_stores
where lower(replace(replace(trim(store_code), '-', ''), ' ', '')) like '%ekkamai%'
   or lower(replace(replace(trim(store_code), '-', ''), ' ', '')) like '%ekamai%'
   or lower(trim(display_name)) like '%ekkamai%'
   or lower(trim(display_name)) like '%ekamai%'
   or exists (
     select 1
     from unnest(coalesce(aliases, '{}'::text[])) a(alias)
     where lower(trim(alias)) like '%ekkamai%'
        or lower(trim(alias)) like '%ekamai%'
        or trim(alias) like '%에까마이%'
   )
order by sort_order, store_code;

-- ============================================================
-- 2) POS 5월 완료 매출 (VAT 매출 원장 소스)
-- ============================================================
with params as (
  select
    '2026-05'::text as tax_month,
    'ekkamai'::text as store_kw
),
bounds as (
  select
    (tax_month || '-01')::date as month_start,
    (date_trunc('month', (tax_month || '-01')::date) + interval '1 month' - interval '1 day')::date as month_end,
    store_kw
  from params
)
select
  po.store_code,
  po.status,
  count(*) as order_cnt,
  round(sum(coalesce(po.total, 0))::numeric, 2) as total_gross,
  round(sum(coalesce(po.vat, 0))::numeric, 2) as total_vat
from public.pos_orders po
cross join bounds b
where po.created_at >= (b.month_start::text || 'T00:00:00+07:00')::timestamptz
  and po.created_at < ((b.month_end + 1)::text || 'T00:00:00+07:00')::timestamptz
  and lower(replace(replace(trim(coalesce(po.store_code, '')), '-', ''), ' ', '')) like '%' || b.store_kw || '%'
group by po.store_code, po.status
order by po.store_code, po.status;

-- 완료·paid·ready만 (PP30 매출 자동 반영 대상)
with params as (
  select '2026-05'::text as tax_month, 'ekkamai'::text as store_kw
),
bounds as (
  select
    (tax_month || '-01')::date as month_start,
    (date_trunc('month', (tax_month || '-01')::date) + interval '1 month' - interval '1 day')::date as month_end,
    store_kw
  from params
)
select
  count(*) as completed_orders,
  round(sum(coalesce(po.total, 0))::numeric, 2) as completed_total,
  round(sum(coalesce(po.vat, 0))::numeric, 2) as completed_vat
from public.pos_orders po
cross join bounds b
where po.created_at >= (b.month_start::text || 'T00:00:00+07:00')::timestamptz
  and po.created_at < ((b.month_end + 1)::text || 'T00:00:00+07:00')::timestamptz
  and lower(replace(replace(trim(coalesce(po.store_code, '')), '-', ''), ' ', '')) like '%' || b.store_kw || '%'
  and lower(trim(coalesce(po.status, ''))) in ('completed', 'paid', 'ready');

-- ============================================================
-- 3) VAT 원장 5월 — Ekkamai 관련 store_name 전체 (PP30 조회 결과)
-- ============================================================
select
  direction,
  coalesce(nullif(trim(store_name), ''), '(공란)') as store_name,
  count(*) as row_cnt,
  round(sum(coalesce(net_amount, 0))::numeric, 2) as net_sum,
  round(sum(coalesce(vat_amount, 0))::numeric, 2) as vat_sum
from public.vat_ledger_entries
where tax_month = '2026-05'
  and (
    lower(replace(replace(trim(coalesce(store_name, '')), '-', ''), ' ', '')) like '%ekkamai%'
    or lower(replace(replace(trim(coalesce(store_name, '')), '-', ''), ' ', '')) like '%ekamai%'
    or trim(coalesce(store_name, '')) like '%에까마이%'
    or trim(coalesce(store_name, '')) = ''
  )
group by direction, coalesce(nullif(trim(store_name), ''), '(공란)')
order by direction, store_name;

-- store_name 공란 + AUTO 태그 (매칭 실패·백필 대상)
select
  id,
  doc_date,
  direction,
  net_amount,
  vat_amount,
  counterparty_name,
  left(coalesce(memo, ''), 120) as memo_preview
from public.vat_ledger_entries
where tax_month = '2026-05'
  and trim(coalesce(store_name, '')) = ''
  and (
    memo ilike '%[AUTO:POS_ORDER:%'
    or memo ilike '%[AUTO:STOCK_LOG:%'
    or memo ilike '%[AUTO:EXPENSE_ACCRUAL:%'
  )
order by doc_date, id
limit 50;

-- ============================================================
-- 4) 입고(stock_logs) 5월 — Ekkamai location (매입 VAT 소스)
-- ============================================================
with bounds as (
  select
    '2026-05-01'::date as month_start,
    '2026-05-31'::date as month_end
)
select
  sl.location,
  sl.log_type,
  sl.vendor_target,
  count(*) as log_cnt
from public.stock_logs sl
cross join bounds b
where sl.log_date >= b.month_start
  and sl.log_date < (b.month_end + 1)
  and sl.log_type in ('Inbound', 'ForcePush', 'Outbound', 'ForceOutbound')
  and (
    lower(replace(replace(trim(coalesce(sl.location, '')), '-', ''), ' ', '')) like '%ekkamai%'
    or lower(replace(replace(trim(coalesce(sl.location, '')), '-', ''), ' ', '')) like '%ekamai%'
    or trim(coalesce(sl.location, '')) like '%에까마이%'
    or lower(replace(replace(trim(coalesce(sl.vendor_target, '')), '-', ''), ' ', '')) like '%ekkamai%'
  )
group by sl.location, sl.log_type, sl.vendor_target
order by sl.location, sl.log_type;

-- 본사→매장 HQ 입고 (PP30 매입 자동 반영: HQ 출고 짝 필요)
select
  sl.id,
  sl.log_date,
  sl.location,
  sl.vendor_target,
  sl.item_code,
  sl.qty,
  sl.reference_no
from public.stock_logs sl
where sl.log_date >= '2026-05-01'
  and sl.log_date < '2026-06-01'
  and sl.log_type in ('Inbound', 'ForcePush')
  and (
    lower(replace(replace(trim(coalesce(sl.location, '')), '-', ''), ' ', '')) like '%ekkamai%'
    or lower(replace(replace(trim(coalesce(sl.location, '')), '-', ''), ' ', '')) like '%ekamai%'
  )
  and trim(coalesce(sl.vendor_target, '')) in ('From HQ', 'HQ')
order by sl.log_date, sl.id
limit 30;

-- ============================================================
-- 5) 분개(journal) 5월 — 재무제표는 보이는데 PP30만 비는지 비교
-- ============================================================
select
  coalesce(nullif(trim(je.store_name), ''), '(공란)') as store_name,
  count(distinct je.id) as entry_cnt,
  round(sum(case when jl.side = 'debit' then abs(coalesce(jl.amount, 0)) else 0 end)::numeric, 2) as debit_sum,
  round(sum(case when jl.side = 'credit' then abs(coalesce(jl.amount, 0)) else 0 end)::numeric, 2) as credit_sum
from public.journal_entries je
join public.journal_lines jl on jl.journal_entry_id = je.id
where je.accounting_date >= '2026-05-01'
  and je.accounting_date <= '2026-05-31'
  and (
    lower(replace(replace(trim(coalesce(je.store_name, '')), '-', ''), ' ', '')) like '%ekkamai%'
    or lower(replace(replace(trim(coalesce(je.store_name, '')), '-', ''), ' ', '')) like '%ekamai%'
    or trim(coalesce(je.store_name, '')) like '%에까마이%'
  )
group by coalesce(nullif(trim(je.store_name), ''), '(공란)')
order by store_name;

-- ============================================================
-- 6) employees.store — 드롭다운·직원 매장 표기
-- ============================================================
select distinct trim(store) as employee_store, count(*) as headcount
from public.employees
where trim(coalesce(store, '')) <> ''
  and (
    lower(replace(replace(trim(store), '-', ''), ' ', '')) like '%ekkamai%'
    or lower(replace(replace(trim(store), '-', ''), ' ', '')) like '%ekamai%'
    or trim(store) like '%에까마이%'
  )
group by trim(store)
order by employee_store;

-- ============================================================
-- 7) 해석 가이드
-- ============================================================
-- A) (2) completed_orders > 0 인데 (3) output row_cnt = 0
--    → PP30 검색 시 VAT 자동 동기화 필요 / 배포 후 「검색」 재실행
-- B) (3) store_name 이 POS store_code 와 다름 (예: CM Ekkamai vs Ekkamai)
--    → erp_stores aliases 등록 또는 이번 코드 수정(매칭 폴백) 배포
-- C) (3) store_name 공란 행 다수
--    → backfill·enrich 로직 배포 후 해당 월·매장으로 PP30 검색 1회
-- D) (4) HQ 입고 있는데 (3) input 없음
--    → 본사 출고 짝(reference_no) 없으면 매입 자동 반영 제외(의도된 동작)
-- E) (5) 분개 있음 + (3) VAT 없음
--    → 재무 마감 분개만 있고 VAT 원장 미생성 — POS/입고/지출 원천 확인
