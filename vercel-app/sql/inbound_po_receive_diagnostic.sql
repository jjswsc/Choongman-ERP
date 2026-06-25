-- =============================================================================
-- 입고(PO 연동) vs 재고 불일치 점검
-- 증상: 재고는 늘었는데 ERP 입고 내역(History)에 안 보임
--
-- 흔한 원인
--   1) 입고일(log_date)이 PO 작성일로 저장됨 → History 기간 필터에 안 걸림
--   2) location 이 입고등록(HQ)이 아님 → 매장 필터 HQ Warehouse 에 안 걸림
--   3) registerInboundBatch 가 아닌 경로(재고조정·From HQ 수령)로만 재고 반영
--
-- Supabase SQL Editor — params 의 po_no / vendor_name / 기간만 바꾼 뒤 ①→⑤ 순서로 Run
-- =============================================================================

WITH params AS (
  SELECT
    'PO-20260610-4226'::text AS po_no,           -- ▼ PO 번호
  'DESIRE DESIGN LIMITED PARTNERSHIP'::text AS vendor_hint,  -- ▼ 거래처(부분 일치)
    DATE '2026-06-01' AS hist_start,             -- ▼ 입고 내역 UI 조회 시작
    DATE '2026-06-25' AS hist_end                -- ▼ 입고 내역 UI 조회 종료
)

-- =============================================================================
-- ① 발주(PO) 존재·상태
-- =============================================================================
SELECT
  po.id,
  po.po_no,
  po.status,
  po.vendor_name,
  po.location_name,
  po.total,
  po.vat,
  left(po.created_at::text, 10) AS po_created_ymd,
  po.created_at
FROM public.purchase_orders po
CROSS JOIN params p
WHERE po.po_no = p.po_no
   OR po.id = NULLIF(regexp_replace(p.po_no, '\D', '', 'g'), '')::bigint;

-- =============================================================================
-- ② inbound_batches — registerInboundBatch 로 입고했으면 1건 이상
-- =============================================================================
SELECT
  ib.id AS batch_id,
  ib.location,
  ib.vendor_name,
  ib.vendor_code,
  ib.batch_date,
  ib.total_amount,
  ib.po_no,
  ib.invoice_no,
  ib.purchase_order_id,
  ib.created_at
FROM public.inbound_batches ib
CROSS JOIN params p
WHERE ib.po_no = p.po_no
   OR ib.purchase_order_id IN (
     SELECT po.id FROM public.purchase_orders po WHERE po.po_no = p.po_no
   )
ORDER BY ib.id DESC;

-- =============================================================================
-- ③ stock_logs — 거래처 입고(Inbound, From HQ 제외) = 입고 내역 API 와 동일 조건
-- =============================================================================
SELECT
  sl.id,
  sl.log_type,
  sl.location,
  sl.vendor_target,
  sl.item_code,
  sl.item_name,
  sl.qty,
  sl.unit_cost,
  sl.inbound_batch_id,
  sl.log_date,
  (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date AS bangkok_inbound_date,
  sl.is_deleted
FROM public.stock_logs sl
CROSS JOIN params p
WHERE sl.log_type = 'Inbound'
  AND coalesce(sl.vendor_target, '') <> 'From HQ'
  AND (
    sl.inbound_batch_id IN (
      SELECT ib.id
      FROM public.inbound_batches ib
      WHERE ib.po_no = p.po_no
         OR ib.purchase_order_id IN (
           SELECT po.id FROM public.purchase_orders po WHERE po.po_no = p.po_no
         )
    )
    OR sl.vendor_target ILIKE '%' || left(p.vendor_hint, 20) || '%'
  )
ORDER BY sl.log_date DESC, sl.id DESC;

-- =============================================================================
-- ④ History UI 필터 시뮬레이션 (getInboundHistory 와 유사)
--    · log_type=Inbound, vendor_target<>From HQ
--    · 방콕 입고일이 hist_start~hist_end
--    · location = 입고등록(HQ Warehouse) 만 보려면 아래 location_filter 주석 해제
-- =============================================================================
SELECT
  sl.id,
  sl.location,
  sl.vendor_target,
  sl.item_code,
  sl.qty,
  (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date AS bangkok_date,
  sl.inbound_batch_id,
  ib.po_no
FROM public.stock_logs sl
LEFT JOIN public.inbound_batches ib ON ib.id = sl.inbound_batch_id
CROSS JOIN params p
WHERE sl.log_type = 'Inbound'
  AND coalesce(sl.vendor_target, '') <> 'From HQ'
  AND coalesce(sl.is_deleted, false) = false
  AND (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date >= p.hist_start
  AND (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date <= p.hist_end
  AND sl.vendor_target ILIKE '%' || left(p.vendor_hint, 20) || '%'
  -- AND sl.location = '입고등록'   -- HQ Warehouse 필터 (필요 시 주석 해제)
ORDER BY sl.log_date DESC;

-- ④-b 같은 PO 인데 기간 밖(PO 작성일 근처)에만 있는 입고 → 날짜 불일치 의심
SELECT
  sl.id,
  sl.location,
  (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date AS bangkok_date,
  sl.item_code,
  sl.qty,
  ib.po_no,
  '기간 밖 — History 22~25일 조회에 안 나올 수 있음' AS note
FROM public.stock_logs sl
JOIN public.inbound_batches ib ON ib.id = sl.inbound_batch_id
CROSS JOIN params p
WHERE ib.po_no = p.po_no
  AND sl.log_type = 'Inbound'
  AND (
    (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date < p.hist_start
    OR (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date > p.hist_end
  );

-- =============================================================================
-- ⑤ 재고만 늘고 입고 내역 없을 때 — 다른 log_type 점검
-- =============================================================================
SELECT
  sl.log_type,
  sl.location,
  sl.vendor_target,
  count(*) AS row_cnt,
  sum(sl.qty) AS sum_qty
FROM public.stock_logs sl
CROSS JOIN params p
WHERE sl.log_date >= (p.hist_start::timestamp AT TIME ZONE 'Asia/Bangkok')
  AND sl.log_date < ((p.hist_end + 1)::timestamp AT TIME ZONE 'Asia/Bangkok')
  AND (
    sl.vendor_target ILIKE '%' || left(p.vendor_hint, 20) || '%'
    OR sl.inbound_batch_id IN (
      SELECT ib.id FROM public.inbound_batches ib WHERE ib.po_no = p.po_no
    )
  )
GROUP BY sl.log_type, sl.location, sl.vendor_target
ORDER BY row_cnt DESC;

-- Adjustment = 재고 조정만, Inbound + From HQ = 매장 본사출고 수령(거래처 입고 아님)

-- =============================================================================
-- ⑥ 미지급(Inbound) — 입고 배치와 짝
-- =============================================================================
SELECT
  pt.id,
  pt.vendor_code,
  pt.amount,
  pt.trans_date,
  pt.ref_type,
  pt.ref_id AS inbound_batch_id,
  pt.memo
FROM public.payable_transactions pt
CROSS JOIN params p
WHERE pt.ref_type = 'Inbound'
  AND pt.ref_id IN (
    SELECT ib.id
    FROM public.inbound_batches ib
    WHERE ib.po_no = p.po_no
       OR ib.purchase_order_id IN (
         SELECT po.id FROM public.purchase_orders po WHERE po.po_no = p.po_no
       )
  )
ORDER BY pt.id;

-- =============================================================================
-- 해석 요약 (수동)
-- =============================================================================
-- ② 0건 + ③ Inbound 0건 + ⑤ Adjustment 있음  → 재고 조정으로만 반영됨
-- ②·③ 있음 + ④ 0건 + ④-b 있음               → 입고일이 UI 기간 밖 (PO일 자동입력 의심)
-- ②·③ 있음 + ④ 0건 + location ≠ 입고등록     → HQ Warehouse 필터에 안 걸림
-- ② 0건 + ⑤ Inbound From HQ                   → 매장 수령(본사배송), 거래처 입고 아님
-- ②·③·④ 정상                                  → UI 캐시/권한/거래처 드롭다운 재검색
