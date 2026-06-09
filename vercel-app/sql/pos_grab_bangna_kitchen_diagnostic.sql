-- ============================================================
-- Grab Bangna 주방 미출력·사이즈 누락 진단 — Supabase SQL Editor
--
-- 목적:
--   1) Bangna #GF-986 vs True Digital 최근 Grab 1건 — POS 저장 품목·옵션 비교
--   2) submit_order 웹훅 payload — Grab modifier 원본 비교
--   3) CM Bangna / CM True Digital — 메인 POS·자동인쇄·수락모드·접속기기
--
-- 사용: ⚠️ Supabase는 여러 SELECT를 한 번에 Run 하면 **마지막 결과만** 표시됩니다.
--       사이즈만 보려면 → pos_grab_bangna_size_diagnostic.sql 의 **블록 A** 만 Run.
--       전체 진단은 아래 §1~§5 를 **섹션마다 따로** 복사 → Run.
--
-- 변경: cfg 블록의 grab_short_no / true_store / bangna_store 만 수정
-- ============================================================


-- ── PASTE START — §1 주문 헤더 비교 ───────────────────────────

WITH cfg AS (
  SELECT
    'GF-986'::text AS grab_short_no,           -- Bangna 문제 주문 (Grab #)
    'CM Bangna'::text AS bangna_store,
    'CM True Digital'::text AS true_store,
    3 AS true_lookback_days                     -- True 비교용 최근 N일
),
bangna_pick AS (
  SELECT
    'bangna_case'::text AS case_key,
    c.bangna_store AS store_code,
    o.id,
    o.order_no,
    o.table_name,
    o.status,
    o.delivery_app_code,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    o.memo,
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END AS items
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.store_code = c.bangna_store
    AND (
      coalesce(o.table_name, '') ILIKE '%' || c.grab_short_no || '%'
      OR coalesce(o.memo, '') ILIKE '%' || c.grab_short_no || '%'
      OR coalesce(o.order_no, '') ILIKE '%' || replace(c.grab_short_no, 'GF-', '') || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT 1
),
true_pick AS (
  SELECT
    'true_reference'::text AS case_key,
    c.true_store AS store_code,
    o.id,
    o.order_no,
    o.table_name,
    o.status,
    o.delivery_app_code,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    o.memo,
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END AS items
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.store_code = c.true_store
    AND o.created_at >= (
      date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
      - ((c.true_lookback_days - 1) || ' days')::interval
    ) AT TIME ZONE 'Asia/Bangkok'
    AND (
      lower(coalesce(o.delivery_app_code, '')) = 'grab'
      OR o.memo ILIKE '%grab_order:%'
      OR coalesce(o.table_name, '') ILIKE '%Grab #%'
    )
    AND jsonb_array_length(
      CASE
        WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
        WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
        ELSE '[]'::jsonb
      END
    ) > 0
  ORDER BY o.created_at DESC
  LIMIT 1
),
targets AS (
  SELECT * FROM bangna_pick
  UNION ALL
  SELECT * FROM true_pick
)
SELECT
  case_key,
  store_code,
  id AS pos_order_id,
  order_no,
  table_name,
  status,
  delivery_app_code,
  created_bkk,
  grab_order_id,
  jsonb_array_length(items) AS item_line_count,
  left(memo, 120) AS memo_preview,
  CASE
    WHEN jsonb_array_length(items) = 0 THEN 'items_empty — 자동인쇄 스킵 가능'
    WHEN status = 'pending' THEN 'pending — auto 매장도 webhook 직후 cooking 기대'
    WHEN status = 'cooking' THEN 'cooking — auto 수락 정상'
    ELSE status
  END AS status_hint
FROM targets
ORDER BY case_key;


-- ── PASTE — §2 품목·옵션 줄 비교 (사이즈·optc·mods) ───────────

WITH cfg AS (
  SELECT
    'GF-986'::text AS grab_short_no,
    'CM Bangna'::text AS bangna_store,
    'CM True Digital'::text AS true_store,
    3 AS true_lookback_days
),
bangna_pick AS (
  SELECT
    'bangna_case'::text AS case_key,
    c.bangna_store AS store_code,
    o.order_no,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END AS items
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.store_code = c.bangna_store
    AND (
      coalesce(o.table_name, '') ILIKE '%' || c.grab_short_no || '%'
      OR coalesce(o.memo, '') ILIKE '%' || c.grab_short_no || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT 1
),
true_pick AS (
  SELECT
    'true_reference'::text AS case_key,
    c.true_store AS store_code,
    o.order_no,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END AS items
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.store_code = c.true_store
    AND o.created_at >= (
      date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
      - ((c.true_lookback_days - 1) || ' days')::interval
    ) AT TIME ZONE 'Asia/Bangkok'
    AND (
      lower(coalesce(o.delivery_app_code, '')) = 'grab'
      OR o.memo ILIKE '%grab_order:%'
    )
  ORDER BY o.created_at DESC
  LIMIT 1
),
targets AS (
  SELECT * FROM bangna_pick
  UNION ALL
  SELECT * FROM true_pick
),
lines AS (
  SELECT
    t.*,
    it AS line,
    coalesce(it->>'id', '') AS line_id,
    coalesce(it->>'name', '') AS item_name,
    coalesce(it->>'note', '') AS item_note,
    coalesce(it->>'optionCode', it->>'option_code', '') AS option_code,
    coalesce(it->>'optionCode1', it->>'option_code1', '') AS option_code1,
    coalesce(it->'optionCodes', it->'option_codes', '[]'::jsonb) AS option_codes_json
  FROM targets t
  CROSS JOIN LATERAL jsonb_array_elements(t.items) AS it
)
SELECT
  case_key,
  store_code,
  order_no,
  created_bkk,
  grab_order_id,
  line_id,
  item_name,
  left(item_note, 160) AS item_note_preview,
  option_code,
  option_code1,
  option_codes_json::text AS option_codes,
  (item_name ~* '\([^)]+\)') AS size_in_name,
  (item_note ~* 'optc:') AS has_optc_in_note,
  (item_note ~* 'mods:') AS has_mods_in_note,
  CASE
    WHEN item_name ~* 'SOY SAUCE CHICKEN|YANGNYEOM|GARLIC|FRIED CHICKEN|CHICKEN'
         AND NOT item_name ~* '\([^)]+\)'
         AND NOT item_note ~* 'optc:'
         AND coalesce(option_code, '') = ''
         AND coalesce(option_code1, '') = ''
    THEN 'size_missing_in_pos'
    WHEN item_name ~* 'SOY SAUCE CHICKEN|YANGNYEOM|GARLIC|FRIED CHICKEN|CHICKEN'
         AND (item_name ~* '\([^)]+\)' OR item_note ~* 'optc:' OR option_code <> '' OR option_code1 <> '')
    THEN 'size_or_opt_present'
    ELSE 'not_chicken_or_ok'
  END AS chicken_size_status,
  line AS pos_line_json
FROM lines
ORDER BY case_key, item_name;


-- ── PASTE — §3 Grab submit_order 웹훅 modifier 원본 ───────────

WITH cfg AS (
  SELECT
    'GF-986'::text AS grab_short_no,
    'CM Bangna'::text AS bangna_store,
    'CM True Digital'::text AS true_store,
    3 AS true_lookback_days
),
bangna_pick AS (
  SELECT
    'bangna_case'::text AS case_key,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.store_code = c.bangna_store
    AND (coalesce(o.table_name, '') ILIKE '%' || c.grab_short_no || '%' OR o.memo ILIKE '%' || c.grab_short_no || '%')
  ORDER BY o.created_at DESC
  LIMIT 1
),
true_pick AS (
  SELECT
    'true_reference'::text AS case_key,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.store_code = c.true_store
    AND o.created_at >= (
      date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
      - ((c.true_lookback_days - 1) || ' days')::interval
    ) AT TIME ZONE 'Asia/Bangkok'
    AND (lower(coalesce(o.delivery_app_code, '')) = 'grab' OR o.memo ILIKE '%grab_order:%')
  ORDER BY o.created_at DESC
  LIMIT 1
),
targets AS (
  SELECT * FROM bangna_pick
  UNION ALL
  SELECT * FROM true_pick
),
webhook AS (
  SELECT DISTINCT ON (t.case_key, w.order_id)
    t.case_key,
    w.order_id,
    w.merchant_id,
    w.partner_merchant_id,
    (w.received_at AT TIME ZONE 'Asia/Bangkok') AS webhook_received_bkk,
    w.payload_json
  FROM targets t
  JOIN public.pos_grab_webhook_events w
    ON w.event_kind = 'submit_order'
   AND w.order_id = t.grab_order_id
  WHERE t.grab_order_id IS NOT NULL
  ORDER BY t.case_key, w.order_id, w.received_at DESC
),
grab_lines AS (
  SELECT
    wh.*,
    it AS grab_item,
    coalesce(it->>'id', '') AS grab_item_id,
    coalesce(it->>'name', it->>'itemName', '') AS grab_item_name,
    it->'modifiers' AS grab_modifiers,
    it->'modifierGroups' AS grab_modifier_groups
  FROM webhook wh
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(wh.payload_json->'items', '[]'::jsonb)) AS it
)
SELECT
  case_key,
  order_id AS grab_order_id,
  merchant_id,
  partner_merchant_id,
  webhook_received_bkk,
  grab_item_id,
  grab_item_name,
  grab_modifiers,
  grab_modifier_groups,
  CASE
    WHEN grab_modifiers IS NULL AND grab_modifier_groups IS NULL THEN 'no_modifiers_in_webhook'
    WHEN grab_item::text ~* 'size|drumette|wing|leg|순살|뼈|ไซส์|L|M|S'
      OR coalesce(grab_modifiers::text, '') ~* 'size|drumette|wing|leg'
      OR coalesce(grab_modifier_groups::text, '') ~* 'size|drumette|wing|leg'
    THEN 'size_signal_in_webhook'
    ELSE 'no_size_signal_in_webhook'
  END AS webhook_size_hint
FROM grab_lines
WHERE grab_item_name ~* 'CHICKEN|ไก่|SOY SAUCE|YANGNYEOM|GARLIC'
   OR grab_item::text ~* 'CHICKEN|SOY SAUCE|YANGNYEOM'
ORDER BY case_key, grab_item_name;


-- ── PASTE — §4 매장 운영: 수락모드·자동인쇄·메인 POS ─────────

WITH cfg AS (
  SELECT
    'CM Bangna'::text AS bangna_store,
    'CM True Digital'::text AS true_store
),
stores AS (
  SELECT unnest(ARRAY[bangna_store, true_store]) AS store_code FROM cfg
)
SELECT
  s.store_code,
  coalesce(p.order_acceptance_mode, '(no row)') AS grab_acceptance_mode,
  coalesce(p.auto_accept_enabled::text, '(no row)') AS grab_auto_accept_enabled,
  coalesce(ps.auto_print_receipt_on_order::text, '(no row)') AS auto_print_receipt_on_order,
  coalesce(ps.auto_print_kitchen_slip_on_order::text, '(no row)') AS auto_print_kitchen_slip_on_order,
  coalesce(ps.main_device_token, '(null)') AS legacy_main_device_token,
  coalesce(ps.kitchen_slip_show_line_notes::text, '(no row)') AS kitchen_show_line_notes,
  ps.kitchen_slip_option_group_print::text AS kitchen_option_group_print,
  (
    SELECT count(*)::int
    FROM public.pos_connected_devices d
    WHERE d.store_code = s.store_code AND d.role = 'main'
  ) AS main_device_count,
  (
    SELECT count(*)::int
    FROM public.pos_connected_devices d
    WHERE d.store_code = s.store_code
      AND d.last_seen_at >= now() - interval '15 minutes'
  ) AS devices_seen_last_15m,
  CASE
    WHEN NOT coalesce(ps.auto_print_kitchen_slip_on_order, false) THEN '주방 자동인쇄 OFF'
    WHEN (
      SELECT count(*)
      FROM public.pos_connected_devices d
      WHERE d.store_code = s.store_code AND d.role = 'main'
        AND d.last_seen_at >= now() - interval '15 minutes'
    ) = 0
    THEN '메인 POS 하트비트 없음(15분) — 자동인쇄 안 됨'
    WHEN coalesce(p.order_acceptance_mode, 'manual') = 'auto' THEN 'auto 수락 + 설정 OK면 Realtime 인쇄 기대'
    ELSE 'manual 수락'
  END AS ops_hint
FROM stores s
LEFT JOIN public.pos_delivery_app_policies p
  ON p.store_code = s.store_code AND p.app_code = 'grab'
LEFT JOIN public.pos_printer_settings ps
  ON ps.store_code = s.store_code
ORDER BY s.store_code;


-- ── PASTE — §5 접속 기기 목록 (메인/주문·마지막 하트비트) ───────

WITH cfg AS (
  SELECT
    'CM Bangna'::text AS bangna_store,
    'CM True Digital'::text AS true_store
)
SELECT
  d.store_code,
  d.role,
  left(d.device_token, 12) || '…' AS device_token_preview,
  coalesce(nullif(btrim(d.display_label), ''), '(이름 없음)') AS display_label,
  left(coalesce(d.client_hint, ''), 80) AS client_hint_preview,
  (d.last_seen_at AT TIME ZONE 'Asia/Bangkok') AS last_seen_bkk,
  round(extract(epoch FROM (now() - d.last_seen_at)) / 60.0, 1) AS minutes_since_heartbeat,
  CASE
    WHEN d.role = 'main' AND d.last_seen_at >= now() - interval '15 minutes' THEN '메인 POS 활성'
    WHEN d.role = 'main' THEN '메인 지정됐으나 하트비트 끊김'
    WHEN d.last_seen_at >= now() - interval '15 minutes' THEN '주문 단말 활성'
    ELSE '오프라인(15분+)'
  END AS device_status_hint,
  (d.device_token = ps.main_device_token) AS matches_legacy_main_token
FROM public.pos_connected_devices d
CROSS JOIN cfg c
LEFT JOIN public.pos_printer_settings ps ON ps.store_code = d.store_code
WHERE d.store_code IN (c.bangna_store, c.true_store)
ORDER BY d.store_code, d.role DESC, d.last_seen_at DESC;


-- ── PASTE END ────────────────────────────────────────────────


-- ============================================================
-- 결과 읽는 법 (요약)
-- ============================================================
-- §1  Bangna GF-986 / True 참조 주문이 짝으로 잡혔는지, item_line_count>0 인지
-- §2  chicken_size_status = size_missing_in_pos → POS 저장 단계부터 사이즈 없음
--      true_reference 는 size_or_opt_present 인데 bangna만 missing → 매장·연동 시점 차이
-- §3  webhook_size_hint = no_size_signal_in_webhook → Grab payload 자체에 사이즈 없음
-- §4  main_device_count=0 또는 devices_seen_last_15m=0 → 주방 자동인쇄 불가
-- §5  role=main + last_seen_bkk 최근인 기기가 Bangna에 있는지 확인
