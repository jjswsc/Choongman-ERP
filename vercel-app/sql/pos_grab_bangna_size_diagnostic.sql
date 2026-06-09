-- ============================================================
-- Grab 사이즈 누락 진단 ONLY — Supabase SQL Editor
--
-- ⚠️ 한 파일에 쿼리가 여러 개면 Supabase는 **마지막 결과만** 보여줍니다.
--    아래 **블록 A / B / C 를 각각 따로** 복사 → Run 하세요.
--
-- 변경: 각 블록 맨 위 cfg 값만 수정
--   grab_short_no  = 'GF-986'
--   bangna_store   = 'CM Bangna'
--   true_store     = 'CM True Digital'
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 블록 A — §2 사이즈·옵션 비교 (이것만 복사해서 Run) ★
-- ════════════════════════════════════════════════════════════

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
    END AS items,
    0 AS pick_priority
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
true_candidates AS (
  SELECT
    o.order_no,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END AS items,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE
            WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
            WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
            ELSE '[]'::jsonb
          END
        ) it
        WHERE coalesce(it->>'name', '') ~* 'CHICKEN|ไก่'
          AND (
            coalesce(it->>'name', '') ~* '\([^)]+\)'
            OR coalesce(it->>'note', '') ~* '(drumette|wing|leg|boneless|순살|뼈|mix|part|size|ไซส์|โดบา|ปีก)'
          )
      ) THEN 1
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE
            WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
            WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
            ELSE '[]'::jsonb
          END
        ) it
        WHERE coalesce(it->>'name', '') ~* 'CHICKEN|ไก่'
      ) THEN 2
      ELSE 3
    END AS pick_priority
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
),
true_pick AS (
  SELECT
    'true_reference'::text AS case_key,
    c.true_store AS store_code,
    tc.order_no,
    tc.created_bkk,
    tc.grab_order_id,
    tc.items,
    tc.pick_priority
  FROM true_candidates tc
  CROSS JOIN cfg c
  ORDER BY tc.pick_priority, tc.created_bkk DESC
  LIMIT 1
),
targets AS (
  SELECT case_key, store_code, order_no, created_bkk, grab_order_id, items, pick_priority
  FROM bangna_pick
  UNION ALL
  SELECT case_key, store_code, order_no, created_bkk, grab_order_id, items, pick_priority
  FROM true_pick
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
  '§2_SIZE'::text AS report_section,
  case_key,
  store_code,
  order_no,
  created_bkk,
  grab_order_id,
  item_name,
  left(item_note, 200) AS item_note_preview,
  option_code,
  option_code1,
  option_codes_json::text AS option_codes,
  (item_name ~* '\([^)]+\)') AS size_in_name,
  (item_note ~* 'optc:') AS has_optc_in_note,
  (item_note ~* 'mods:') AS has_mods_in_note,
  (
    item_name ~* '\([^)]+\)'
    OR item_note ~* '(drumette|wing|leg|boneless|순살|뼈|mix|part|size|ไซส์|โดบา|ปีก)'
    OR coalesce(option_code, '') ~* '(drumette|wing|leg|boneless|size)'
    OR coalesce(option_code1, '') ~* '(drumette|wing|leg|boneless|size)'
  ) AS has_size_signal,
  CASE
    WHEN item_name !~* 'CHICKEN|ไก่' THEN 'not_chicken_line'
    WHEN item_name ~* '\([^)]+\)'
         OR item_note ~* '(drumette|wing|leg|boneless|순살|뼈|mix|part|size|ไซส์|โดบา|ปีก)'
    THEN 'size_present'
    WHEN item_note ~* 'mods:|optc:'
    THEN 'size_missing_side_only'
    ELSE 'size_missing'
  END AS chicken_size_status,
  pick_priority AS true_ref_pick_priority,
  line AS pos_line_json
FROM lines
ORDER BY case_key, item_name;


-- ════════════════════════════════════════════════════════════
-- 블록 B0 — 웹훅 있는지 먼저 확인 (No rows 나왔을 때 **이것부터** Run)
-- ════════════════════════════════════════════════════════════

WITH cfg AS (
  SELECT
    'GF-986'::text AS grab_short_no,
    'CM Bangna'::text AS bangna_store
),
bangna AS (
  SELECT
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    o.order_no,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk
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
wh AS (
  SELECT
    w.order_id,
    w.event_kind,
    (w.received_at AT TIME ZONE 'Asia/Bangkok') AS webhook_received_bkk,
    w.payload_json,
    jsonb_array_length(
      CASE
        WHEN jsonb_typeof(w.payload_json->'items') = 'array' THEN w.payload_json->'items'
        ELSE '[]'::jsonb
      END
    ) AS payload_items_count
  FROM bangna b
  LEFT JOIN public.pos_grab_webhook_events w
    ON w.event_kind = 'submit_order'
   AND w.order_id = b.grab_order_id
  ORDER BY w.received_at DESC NULLS LAST
  LIMIT 1
)
SELECT
  '§B0_CHECK'::text AS report_section,
  b.grab_order_id,
  b.order_no,
  b.created_bkk,
  CASE WHEN w.order_id IS NULL THEN 'webhook_not_found' ELSE 'webhook_found' END AS webhook_status,
  w.webhook_received_bkk,
  coalesce(w.payload_items_count, 0) AS payload_items_count,
  CASE
    WHEN w.order_id IS NULL THEN
      'pos_grab_webhook_events에 submit_order 없음 — 감사 테이블 미배포·저장 실패·order_id 불일치'
    WHEN coalesce(w.payload_items_count, 0) = 0 THEN
      '웹훅 body에 items 없음(흔함). POS 품목은 listOrders API로 채움 → 블록 B1(pos items_json)로 판단'
    ELSE
      'payload에 items 있음 — 블록 B 실행'
  END AS diagnosis_hint,
  left(w.payload_json::text, 500) AS payload_preview
FROM bangna b
LEFT JOIN wh w ON true;


-- ════════════════════════════════════════════════════════════
-- 블록 B1 — POS 저장값만으로 사이즈 판정 (웹훅 없어도 됨) ★
-- ════════════════════════════════════════════════════════════

WITH cfg AS (
  SELECT
    'GF-986'::text AS grab_short_no,
    'CM Bangna'::text AS bangna_store
),
bangna AS (
  SELECT
    o.order_no,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
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
chicken AS (
  SELECT
    b.order_no,
    b.grab_order_id,
    b.created_bkk,
    coalesce(it->>'name', '') AS item_name,
    coalesce(it->>'note', '') AS item_note,
    it AS pos_line_json
  FROM bangna b
  CROSS JOIN LATERAL jsonb_array_elements(b.items) AS it
  WHERE coalesce(it->>'name', '') ~* 'CHICKEN|ไก่'
)
SELECT
  '§B1_POS_ONLY'::text AS report_section,
  order_no,
  grab_order_id,
  created_bkk,
  item_name,
  item_note,
  (item_name ~* '\([^)]+\)') AS size_in_name,
  (item_note ~* 'optc:') AS has_optc,
  (item_note ~* 'mods:') AS has_mods,
  CASE
    WHEN item_note ~* 'size|drumette|wing|leg|순살|뼈|ไซส์|\b[SML]\b'
      OR item_name ~* '\([^)]+\)'
    THEN 'size_present'
    WHEN item_note ~* 'mods:|optc:' AND item_note !~* 'size|drumette|wing|leg|순살|뼈|ไซส์'
    THEN 'size_missing_side_only'
    ELSE 'size_missing'
  END AS size_diagnosis,
  pos_line_json
FROM chicken;


-- ════════════════════════════════════════════════════════════
-- 블록 B — Grab 웹훅 modifier (payload에 items 있을 때만 의미 있음)
-- ════════════════════════════════════════════════════════════

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
    AND (
      coalesce(o.table_name, '') ILIKE '%' || c.grab_short_no || '%'
      OR coalesce(o.memo, '') ILIKE '%' || c.grab_short_no || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT 1
),
true_candidates AS (
  SELECT
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE
            WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
            WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
            ELSE '[]'::jsonb
          END
        ) it
        WHERE coalesce(it->>'name', '') ~* 'CHICKEN|ไก่'
          AND coalesce(it->>'name', '') ~* '\([^)]+\)'
      ) THEN 1
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE
            WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
            WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
            ELSE '[]'::jsonb
          END
        ) it
        WHERE coalesce(it->>'name', '') ~* 'CHICKEN|ไก่'
      ) THEN 2
      ELSE 3
    END AS pick_priority
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.store_code = c.true_store
    AND o.created_at >= (
      date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
      - ((c.true_lookback_days - 1) || ' days')::interval
    ) AT TIME ZONE 'Asia/Bangkok'
    AND (lower(coalesce(o.delivery_app_code, '')) = 'grab' OR o.memo ILIKE '%grab_order:%')
),
true_pick AS (
  SELECT
    'true_reference'::text AS case_key,
    tc.grab_order_id
  FROM true_candidates tc
  ORDER BY tc.pick_priority, tc.created_bkk DESC
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
    t.grab_order_id,
    w.order_id AS webhook_order_id,
    (w.received_at AT TIME ZONE 'Asia/Bangkok') AS webhook_received_bkk,
    w.payload_json
  FROM targets t
  LEFT JOIN public.pos_grab_webhook_events w
    ON w.event_kind = 'submit_order'
   AND w.order_id = t.grab_order_id
  WHERE t.grab_order_id IS NOT NULL
  ORDER BY t.case_key, w.order_id, w.received_at DESC NULLS LAST
),
grab_lines AS (
  SELECT
    wh.case_key,
    wh.grab_order_id,
    wh.webhook_order_id,
    wh.webhook_received_bkk,
    coalesce(it->>'id', '') AS grab_item_id,
    coalesce(it->>'name', it->>'itemName', '') AS grab_item_name,
    it->'modifiers' AS grab_modifiers,
    it->'modifierGroups' AS grab_modifier_groups,
    it AS grab_item_json
  FROM webhook wh
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(wh.payload_json->'items') = 'array' THEN wh.payload_json->'items'
      ELSE '[]'::jsonb
    END
  ) AS it
),
webhook_fallback AS (
  SELECT
    wh.case_key,
    wh.grab_order_id,
    wh.webhook_order_id,
    wh.webhook_received_bkk,
    ''::text AS grab_item_id,
    ''::text AS grab_item_name,
    NULL::jsonb AS grab_modifiers,
    NULL::jsonb AS grab_modifier_groups,
    NULL::jsonb AS grab_item_json
  FROM webhook wh
  WHERE wh.webhook_order_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM grab_lines gl WHERE gl.case_key = wh.case_key)
)
SELECT
  '§3_WEBHOOK'::text AS report_section,
  case_key,
  grab_order_id,
  webhook_order_id,
  webhook_received_bkk,
  grab_item_id,
  grab_item_name,
  grab_modifiers,
  grab_modifier_groups,
  CASE
    WHEN webhook_order_id IS NULL THEN 'webhook_not_found'
    WHEN grab_item_id = '' AND grab_item_name = '' THEN 'webhook_items_empty'
    WHEN grab_modifiers IS NULL AND grab_modifier_groups IS NULL THEN 'no_modifiers_in_webhook'
    WHEN grab_item_json::text ~* 'size|drumette|wing|leg|순살|뼈|ไซส์|L|M|S'
      OR coalesce(grab_modifiers::text, '') ~* 'size|drumette|wing|leg'
      OR coalesce(grab_modifier_groups::text, '') ~* 'size|drumette|wing|leg'
    THEN 'size_signal_in_webhook'
    ELSE 'no_size_signal_in_webhook'
  END AS webhook_size_hint
FROM (
  SELECT * FROM grab_lines WHERE grab_item_name <> ''
  UNION ALL
  SELECT * FROM webhook_fallback
) combined
ORDER BY case_key, grab_item_name;


-- ════════════════════════════════════════════════════════════
-- 블록 C — 치킨 줄만 요약 (블록 A 결과가 많을 때, **따로** Run)
-- ════════════════════════════════════════════════════════════

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
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END AS items,
    0 AS pick_priority
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
true_candidates AS (
  SELECT
    o.order_no,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END AS items,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE
            WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
            WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
            ELSE '[]'::jsonb
          END
        ) it
        WHERE coalesce(it->>'name', '') ~* 'CHICKEN|ไก่'
          AND coalesce(it->>'name', '') ~* '\([^)]+\)'
      ) THEN 1
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE
            WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
            WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
            ELSE '[]'::jsonb
          END
        ) it
        WHERE coalesce(it->>'name', '') ~* 'CHICKEN|ไก่'
      ) THEN 2
      ELSE 3
    END AS pick_priority
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.store_code = c.true_store
    AND o.created_at >= (
      date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
      - ((c.true_lookback_days - 1) || ' days')::interval
    ) AT TIME ZONE 'Asia/Bangkok'
    AND (lower(coalesce(o.delivery_app_code, '')) = 'grab' OR o.memo ILIKE '%grab_order:%')
),
true_pick AS (
  SELECT
    'true_reference'::text AS case_key,
    c.true_store AS store_code,
    tc.order_no,
    tc.items,
    tc.pick_priority
  FROM true_candidates tc
  CROSS JOIN cfg c
  ORDER BY tc.pick_priority, tc.created_bkk DESC
  LIMIT 1
),
lines AS (
  SELECT
    t.case_key,
    t.store_code,
    t.order_no,
    t.pick_priority,
    coalesce(it->>'name', '') AS item_name,
    coalesce(it->>'note', '') AS item_note,
    coalesce(it->>'optionCode', it->>'option_code', '') AS option_code
  FROM (SELECT * FROM bangna_pick UNION ALL SELECT * FROM true_pick) t
  CROSS JOIN LATERAL jsonb_array_elements(t.items) AS it
  WHERE coalesce(it->>'name', '') ~* 'CHICKEN|ไก่'
)
SELECT
  '§2_CHICKEN_ONLY'::text AS report_section,
  case_key,
  store_code,
  order_no,
  item_name,
  left(item_note, 200) AS item_note_preview,
  option_code,
  pick_priority AS true_ref_pick_priority,
  CASE
    WHEN item_name ~* '\([^)]+\)'
         OR item_note ~* '(drumette|wing|leg|boneless|순살|뼈|mix|part|size|ไซส์|โดบา|ปีก)'
    THEN '✅ size_present'
    WHEN item_note ~* 'mods:|optc:'
    THEN '❌ size_missing_side_only'
    ELSE '❌ size_missing'
  END AS chicken_size_status
FROM lines
ORDER BY case_key;


-- ============================================================
-- 결과 읽는 법
-- ============================================================
-- 블록 A/C → chicken_size_status
--   size_present            = 이름 (M-Drumette) 또는 note에 사이즈 키워드
--   size_missing_side_only  = 사이드만(optc/mods) 있고 사이즈 없음 ← GF-986 해당
--   size_missing            = 사이즈·사이드 모두 없음
--   true_ref_pick_priority  = 1:사이즈있는치킨 2:치킨만 3:그외Grab
--
-- 블록 B0 → webhook_status / payload_items_count (No rows 원인)
-- 블록 B1 → size_diagnosis (웹훅 없어도 POS만으로 사이즈 판정) ★
-- 블록 B  → webhook_size_hint (payload에 items 있을 때만)
