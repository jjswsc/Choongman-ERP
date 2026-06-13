-- ============================================================
-- 본사 창고 출고(Outbound) 중복 stock_logs 정리 — Supabase SQL Editor
--
-- 배경:
--   발주 수령(processOrderReceive)이 중복 실행되면 동일 order_id·품목·수량·일자·단가
--   출고 로그가 2건 이상 쌓여 손익 「본사 창고 출고(매입)」가 과대될 수 있음.
--   앱 집계(hq-outbound-income-total.ts)와 동일 fingerprint 로 중복을 식별하고,
--   id가 가장 작은(먼저 기록된) 행만 남기고 나머지는 is_deleted=true 소프트 삭제.
--
-- 사전 조건:
--   sql/stock_logs_soft_delete_outbound.sql 배포됨 (is_deleted 컬럼·감사 테이블)
--
-- 사용 순서:
--   §0 전 매장 요약 (한 번에 Run — 아래 블록만 복사) → 문제 있는 매장·월 확인
--   §1~§4 는 매장·기간 지정 후 섹션별 Run (한 파일에 여러 SELECT면 마지막 결과만 보임)
--
-- 변경: 각 섹션 cfg 블록의 store_filter / ymd_start / ymd_end 만 수정
--   store_filter: NULL 또는 '' = 전 매장, 'CM MBK' = 해당 매장만
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- §0 전 매장 중복 요약 — Supabase SQL Editor에 이 블록만 붙여넣고 Run
-- (결과 0행 = 해당 기간 전 매장 중복 없음)
-- 기간 변경: cfg 의 ymd_start / ymd_end 만 수정
-- ════════════════════════════════════════════════════════════

WITH cfg AS (
  SELECT
    NULL::text AS store_filter,
    '2024-01-01'::date AS ymd_start,
    (date_trunc('month', (now() AT TIME ZONE 'Asia/Bangkok')::date) + interval '1 month' - interval '1 day')::date AS ymd_end
),
hq_outbound AS (
  SELECT
    sl.id,
    btrim(coalesce(sl.vendor_target, '')) AS store_name,
    btrim(sl.item_code) AS item_code,
    abs(coalesce(sl.qty, 0)::numeric) AS qty_abs,
    to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS ym_bkk,
    round(coalesce(sl.invoice_unit_price::numeric, 0), 2) AS unit_price_r2,
    concat_ws(
      '|',
      sl.order_id::text,
      btrim(sl.item_code),
      abs(coalesce(sl.qty, 0)::numeric)::text,
      to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'),
      round(coalesce(sl.invoice_unit_price::numeric, 0), 2)::text
    ) AS dedupe_key
  FROM public.stock_logs sl
  CROSS JOIN cfg c
  WHERE sl.log_type = 'Outbound'
    AND coalesce(sl.is_deleted, false) = false
    AND sl.order_id IS NOT NULL
    AND sl.order_id > 0
    AND btrim(coalesce(sl.item_code, '')) <> ''
    AND abs(coalesce(sl.qty, 0)) > 0
    AND (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date BETWEEN c.ymd_start AND c.ymd_end
    AND lower(btrim(coalesce(sl.location, ''))) IN (
      '본사', 'office', '오피스', '본점', '입고등록', 'cm office'
    )
    AND (
      c.store_filter IS NULL
      OR btrim(c.store_filter) = ''
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE c.store_filter
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE '%' || c.store_filter || '%'
    )
),
ranked AS (
  SELECT
    h.*,
    row_number() OVER (PARTITION BY h.dedupe_key ORDER BY h.id ASC) AS rn,
    count(*) OVER (PARTITION BY h.dedupe_key) AS dup_group_size
  FROM hq_outbound h
),
dup_only AS (
  SELECT *
  FROM ranked
  WHERE dup_group_size > 1 AND rn > 1
),
by_store_month AS (
  SELECT
    store_name,
    ym_bkk,
    count(*) AS duplicate_rows_to_soft_delete,
    count(DISTINCT dedupe_key) AS duplicate_groups,
    round(sum(qty_abs * unit_price_r2), 2) AS est_excess_amount_thb
  FROM dup_only
  GROUP BY store_name, ym_bkk
),
grand AS (
  SELECT
    '【전체 합계】'::text AS store_name,
    '—'::text AS ym_bkk,
    coalesce(sum(duplicate_rows_to_soft_delete), 0)::bigint AS duplicate_rows_to_soft_delete,
    coalesce(sum(duplicate_groups), 0)::bigint AS duplicate_groups,
    round(coalesce(sum(est_excess_amount_thb), 0), 2) AS est_excess_amount_thb
  FROM by_store_month
)
SELECT
  u.store_name,
  u.ym_bkk,
  u.duplicate_rows_to_soft_delete,
  u.duplicate_groups,
  u.est_excess_amount_thb,
  u.row_kind
FROM (
  SELECT
    store_name,
    ym_bkk,
    duplicate_rows_to_soft_delete,
    duplicate_groups,
    est_excess_amount_thb,
    'detail'::text AS row_kind
  FROM by_store_month
  UNION ALL
  SELECT
    store_name,
    ym_bkk,
    duplicate_rows_to_soft_delete,
    duplicate_groups,
    est_excess_amount_thb,
    'grand_total'::text AS row_kind
  FROM grand
) u
ORDER BY
  CASE WHEN u.row_kind = 'grand_total' THEN 1 ELSE 0 END,
  u.est_excess_amount_thb DESC NULLS LAST,
  u.store_name,
  u.ym_bkk;


-- ── PASTE START — §1 중복 출고 행 목록 (삭제 대상) ─────────────

WITH cfg AS (
  SELECT
    'CM MBK'::text AS store_filter,       -- NULL 또는 '' = 전 매장
    '2026-05-01'::date AS ymd_start,
    '2026-05-31'::date AS ymd_end
),
hq_outbound AS (
  SELECT
    sl.id,
    sl.order_id,
    sl.vendor_target,
    btrim(sl.item_code) AS item_code,
    abs(coalesce(sl.qty, 0)::numeric) AS qty_abs,
    to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS log_ymd_bkk,
    round(coalesce(sl.invoice_unit_price::numeric, 0), 2) AS unit_price_r2,
    sl.log_date,
    sl.location,
    sl.invoice_unit_price,
    concat_ws(
      '|',
      sl.order_id::text,
      btrim(sl.item_code),
      abs(coalesce(sl.qty, 0)::numeric)::text,
      to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'),
      round(coalesce(sl.invoice_unit_price::numeric, 0), 2)::text
    ) AS dedupe_key
  FROM public.stock_logs sl
  CROSS JOIN cfg c
  WHERE sl.log_type = 'Outbound'
    AND coalesce(sl.is_deleted, false) = false
    AND sl.order_id IS NOT NULL
    AND sl.order_id > 0
    AND btrim(coalesce(sl.item_code, '')) <> ''
    AND abs(coalesce(sl.qty, 0)) > 0
    AND (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date BETWEEN c.ymd_start AND c.ymd_end
    AND lower(btrim(coalesce(sl.location, ''))) IN (
      '본사', 'office', '오피스', '본점', '입고등록', 'cm office'
    )
    AND (
      c.store_filter IS NULL
      OR btrim(c.store_filter) = ''
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE c.store_filter
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE '%' || c.store_filter || '%'
    )
),
ranked AS (
  SELECT
    h.*,
    min(h.id) OVER (PARTITION BY h.dedupe_key) AS keeper_id,
    row_number() OVER (PARTITION BY h.dedupe_key ORDER BY h.id ASC) AS rn,
    count(*) OVER (PARTITION BY h.dedupe_key) AS dup_group_size
  FROM hq_outbound h
)
SELECT
  r.id AS delete_candidate_id,
  r.keeper_id,
  r.dedupe_key,
  r.order_id,
  r.vendor_target AS store_name,
  r.log_ymd_bkk,
  r.item_code,
  r.qty_abs,
  r.unit_price_r2,
  round(r.qty_abs * r.unit_price_r2, 2) AS line_amount_est,
  r.dup_group_size,
  r.rn AS rank_in_group
FROM ranked r
WHERE r.dup_group_size > 1
  AND r.rn > 1
ORDER BY r.log_ymd_bkk DESC, r.order_id, r.item_code, r.id;


-- ── PASTE START — §1b 영향 발주 ID (미수금·배송상태 점검용) ───

WITH cfg AS (
  SELECT
    'CM MBK'::text AS store_filter,
    '2026-05-01'::date AS ymd_start,
    '2026-05-31'::date AS ymd_end
),
hq_outbound AS (
  SELECT
    sl.id,
    sl.order_id,
    concat_ws(
      '|',
      sl.order_id::text,
      btrim(sl.item_code),
      abs(coalesce(sl.qty, 0)::numeric)::text,
      to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'),
      round(coalesce(sl.invoice_unit_price::numeric, 0), 2)::text
    ) AS dedupe_key
  FROM public.stock_logs sl
  CROSS JOIN cfg c
  WHERE sl.log_type = 'Outbound'
    AND coalesce(sl.is_deleted, false) = false
    AND sl.order_id IS NOT NULL
    AND sl.order_id > 0
    AND (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date BETWEEN c.ymd_start AND c.ymd_end
    AND lower(btrim(coalesce(sl.location, ''))) IN (
      '본사', 'office', '오피스', '본점', '입고등록', 'cm office'
    )
    AND (
      c.store_filter IS NULL OR btrim(c.store_filter) = ''
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE c.store_filter
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE '%' || c.store_filter || '%'
    )
),
ranked AS (
  SELECT
    h.order_id,
    h.dedupe_key,
    row_number() OVER (PARTITION BY h.dedupe_key ORDER BY h.id ASC) AS rn,
    count(*) OVER (PARTITION BY h.dedupe_key) AS dup_group_size
  FROM hq_outbound h
)
SELECT DISTINCT r.order_id
FROM ranked r
WHERE r.dup_group_size > 1 AND r.rn > 1
ORDER BY r.order_id;


-- ── PASTE START — §2 요약 (매장·월·건수·추정 과대금액) ───────

WITH cfg AS (
  SELECT
    'CM MBK'::text AS store_filter,
    '2026-05-01'::date AS ymd_start,
    '2026-05-31'::date AS ymd_end
),
hq_outbound AS (
  SELECT
    sl.id,
    sl.order_id,
    btrim(coalesce(sl.vendor_target, '')) AS store_name,
    btrim(sl.item_code) AS item_code,
    abs(coalesce(sl.qty, 0)::numeric) AS qty_abs,
    to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS ym_bkk,
    round(coalesce(sl.invoice_unit_price::numeric, 0), 2) AS unit_price_r2,
    concat_ws(
      '|',
      sl.order_id::text,
      btrim(sl.item_code),
      abs(coalesce(sl.qty, 0)::numeric)::text,
      to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'),
      round(coalesce(sl.invoice_unit_price::numeric, 0), 2)::text
    ) AS dedupe_key
  FROM public.stock_logs sl
  CROSS JOIN cfg c
  WHERE sl.log_type = 'Outbound'
    AND coalesce(sl.is_deleted, false) = false
    AND sl.order_id IS NOT NULL
    AND sl.order_id > 0
    AND btrim(coalesce(sl.item_code, '')) <> ''
    AND abs(coalesce(sl.qty, 0)) > 0
    AND (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date BETWEEN c.ymd_start AND c.ymd_end
    AND lower(btrim(coalesce(sl.location, ''))) IN (
      '본사', 'office', '오피스', '본점', '입고등록', 'cm office'
    )
    AND (
      c.store_filter IS NULL
      OR btrim(c.store_filter) = ''
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE c.store_filter
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE '%' || c.store_filter || '%'
    )
),
ranked AS (
  SELECT
    h.*,
    row_number() OVER (PARTITION BY h.dedupe_key ORDER BY h.id ASC) AS rn,
    count(*) OVER (PARTITION BY h.dedupe_key) AS dup_group_size
  FROM hq_outbound h
),
dup_only AS (
  SELECT *
  FROM ranked
  WHERE dup_group_size > 1 AND rn > 1
)
SELECT
  store_name,
  ym_bkk,
  count(*) AS duplicate_rows_to_soft_delete,
  count(DISTINCT dedupe_key) AS duplicate_groups,
  round(sum(qty_abs * unit_price_r2), 2) AS est_excess_amount_thb
FROM dup_only
GROUP BY store_name, ym_bkk
ORDER BY est_excess_amount_thb DESC NULLS LAST, store_name, ym_bkk;


-- ── PASTE START — §3 소프트 삭제 (§1·§2 확인 후에만 Run) ─────
-- ⚠️ 되돌리려면 is_deleted=false 로 수동 복구. 반드시 §1 결과를 먼저 확인하세요.

/*
BEGIN;

WITH cfg AS (
  SELECT
    'CM MBK'::text AS store_filter,
    '2026-05-01'::date AS ymd_start,
    '2026-05-31'::date AS ymd_end,
    'hq_outbound_dedupe_2026-05-mbk'::text AS delete_tx_id
),
hq_outbound AS (
  SELECT
    sl.id,
    concat_ws(
      '|',
      sl.order_id::text,
      btrim(sl.item_code),
      abs(coalesce(sl.qty, 0)::numeric)::text,
      to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'),
      round(coalesce(sl.invoice_unit_price::numeric, 0), 2)::text
    ) AS dedupe_key
  FROM public.stock_logs sl
  CROSS JOIN cfg c
  WHERE sl.log_type = 'Outbound'
    AND coalesce(sl.is_deleted, false) = false
    AND sl.order_id IS NOT NULL
    AND sl.order_id > 0
    AND btrim(coalesce(sl.item_code, '')) <> ''
    AND abs(coalesce(sl.qty, 0)) > 0
    AND (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date BETWEEN c.ymd_start AND c.ymd_end
    AND lower(btrim(coalesce(sl.location, ''))) IN (
      '본사', 'office', '오피스', '본점', '입고등록', 'cm office'
    )
    AND (
      c.store_filter IS NULL
      OR btrim(c.store_filter) = ''
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE c.store_filter
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE '%' || c.store_filter || '%'
    )
),
ranked AS (
  SELECT
    h.id,
    h.dedupe_key,
    row_number() OVER (PARTITION BY h.dedupe_key ORDER BY h.id ASC) AS rn,
    count(*) OVER (PARTITION BY h.dedupe_key) AS dup_group_size
  FROM hq_outbound h
),
delete_targets AS (
  SELECT r.id
  FROM ranked r
  WHERE r.dup_group_size > 1 AND r.rn > 1
),
updated AS (
  UPDATE public.stock_logs sl
  SET
    is_deleted = true,
    deleted_at = NOW(),
    deleted_by = 'sql:hq_outbound_duplicate_cleanup',
    delete_reason = 'duplicate HQ outbound (order receive double-log); keeper=min(id) per fingerprint',
    delete_tx_id = (SELECT delete_tx_id FROM cfg LIMIT 1)
  FROM delete_targets d
  WHERE sl.id = d.id
  RETURNING sl.id
)
INSERT INTO public.outbound_delete_events (
  mode,
  reason,
  request_key,
  deleted_by,
  order_id,
  reference_no,
  stock_log_ids,
  deleted_count,
  result_json
)
SELECT
  'force',
  'hq_outbound_duplicate_cleanup',
  (SELECT delete_tx_id FROM cfg LIMIT 1),
  'sql:hq_outbound_duplicate_cleanup',
  NULL,
  NULL,
  to_jsonb(array_agg(u.id ORDER BY u.id)),
  count(*)::integer,
  jsonb_build_object(
    'ok', true,
    'source', 'hq_outbound_duplicate_cleanup.sql',
    'store_filter', (SELECT store_filter FROM cfg LIMIT 1),
    'ymd_start', (SELECT ymd_start::text FROM cfg LIMIT 1),
    'ymd_end', (SELECT ymd_end::text FROM cfg LIMIT 1),
    'deleted_stock_log_ids', to_jsonb(array_agg(u.id ORDER BY u.id))
  )
FROM updated u
HAVING count(*) > 0;

COMMIT;
*/


-- ── PASTE START — §4 삭제 후 검증 (§3 실행 뒤 — 중복 0건이어야 함) ─

WITH cfg AS (
  SELECT
    'CM MBK'::text AS store_filter,
    '2026-05-01'::date AS ymd_start,
    '2026-05-31'::date AS ymd_end
),
hq_outbound AS (
  SELECT
    sl.id,
    concat_ws(
      '|',
      sl.order_id::text,
      btrim(sl.item_code),
      abs(coalesce(sl.qty, 0)::numeric)::text,
      to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD'),
      round(coalesce(sl.invoice_unit_price::numeric, 0), 2)::text
    ) AS dedupe_key
  FROM public.stock_logs sl
  CROSS JOIN cfg c
  WHERE sl.log_type = 'Outbound'
    AND coalesce(sl.is_deleted, false) = false
    AND sl.order_id IS NOT NULL
    AND sl.order_id > 0
    AND btrim(coalesce(sl.item_code, '')) <> ''
    AND abs(coalesce(sl.qty, 0)) > 0
    AND (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date BETWEEN c.ymd_start AND c.ymd_end
    AND lower(btrim(coalesce(sl.location, ''))) IN (
      '본사', 'office', '오피스', '본점', '입고등록', 'cm office'
    )
    AND (
      c.store_filter IS NULL
      OR btrim(c.store_filter) = ''
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE c.store_filter
      OR btrim(coalesce(sl.vendor_target, '')) ILIKE '%' || c.store_filter || '%'
    )
),
dup_groups AS (
  SELECT dedupe_key, count(*) AS cnt
  FROM hq_outbound
  GROUP BY dedupe_key
  HAVING count(*) > 1
)
SELECT
  count(*) AS remaining_duplicate_groups,
  coalesce(sum(d.cnt - 1), 0) AS remaining_extra_rows
FROM dup_groups d;
