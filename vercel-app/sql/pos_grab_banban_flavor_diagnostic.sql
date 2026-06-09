-- ============================================================
-- Grab Banban 맛 누락 진단 — Supabase SQL Editor
--
-- 사용: 아래 ── PASTE START ── ~ ── PASTE END ── 전체 복사 → Run (1번)
--
-- 매장 변경: PASTE 블록 안에서 store_filter 값만 수정
--   예) 'CM True Digital'  /  'CM Silom'  /  NULL (전 매장)
-- ============================================================


-- ── PASTE START ──────────────────────────────────────────────

WITH cfg AS (
  SELECT
    'CM True Digital'::text AS store_filter,  -- NULL 이면 전 매장
    7 AS lookback_days,
    true AS only_missing_flavors              -- false = 정상+누락 전체
),
orders AS (
  SELECT
    o.id,
    o.order_no,
    o.store_code,
    o.table_name,
    o.memo,
    o.status,
    (o.created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
    substring(o.memo FROM 'grab_order:([A-Za-z0-9._:-]+)') AS grab_order_id,
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END AS items
  FROM public.pos_orders o
  CROSS JOIN cfg c
  WHERE o.created_at >= (
    date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
    - ((c.lookback_days - 1) || ' days')::interval
  ) AT TIME ZONE 'Asia/Bangkok'
    AND (c.store_filter IS NULL OR o.store_code = c.store_filter)
    AND (
      lower(coalesce(o.delivery_app_code, '')) = 'grab'
      OR o.memo ILIKE '%grab_order:%'
      OR coalesce(o.table_name, '') ILIKE '%Grab #%'
    )
),
lines AS (
  SELECT
    ord.*,
    it AS line,
    coalesce(it->>'id', '') AS line_id,
    coalesce(it->>'name', '') AS item_name,
    coalesce(it->>'note', '') AS item_note,
    coalesce(it->>'menuId', it->>'menu_id') AS menu_id,
    coalesce(it->>'menuId1', it->>'menu_id1') AS menu_id1,
    coalesce(it->>'menuId2', it->>'menu_id2') AS menu_id2,
    (
      coalesce(it->>'name', '') ~* '\([^)]+\s/\s[^)]+\)'
      OR coalesce(it->>'note', '') ~* 'banbanFlavors:'
      OR (
        coalesce(it->>'menuId1', it->>'menu_id1', '') <> ''
        AND coalesce(it->>'menuId2', it->>'menu_id2', '') <> ''
        AND coalesce(it->>'menuId1', it->>'menu_id1', '')
          <> coalesce(it->>'menuId2', it->>'menu_id2', '')
      )
    ) AS flavors_ok
  FROM orders ord
  CROSS JOIN LATERAL jsonb_array_elements(ord.items) AS it
  WHERE coalesce(it->>'name', '') ~* 'banban|반반'
),
webhook AS (
  SELECT DISTINCT ON (w.order_id)
    w.order_id,
    w.payload_json,
    (w.received_at AT TIME ZONE 'Asia/Bangkok') AS webhook_received_bkk
  FROM public.pos_grab_webhook_events w
  WHERE w.event_kind = 'submit_order'
  ORDER BY w.order_id, w.received_at DESC
),
webhook_banban AS (
  SELECT
    wh.order_id,
    wh.webhook_received_bkk,
    it AS grab_item,
    it->>'id' AS grab_item_id,
    it->>'name' AS grab_item_name,
    it->'modifiers' AS grab_modifiers,
    it->'modifierGroups' AS grab_modifier_groups,
    (it::text ~* 'banban[-_][12]') AS wh_has_banban_slot_id,
    (it::text ~* 'f[-_][0-9]+') AS wh_has_flavor_menu_id,
    (it::text ~* 'banbanFlavors:') AS wh_has_banban_flavors_token
  FROM webhook wh
  CROSS JOIN LATERAL jsonb_array_elements(
    coalesce(wh.payload_json->'items', '[]'::jsonb)
  ) AS it
  WHERE coalesce(it->>'name', '') ~* 'banban|반반'
     OR it::text ~* 'banban[-_][12]'
)
SELECT
  l.order_no,
  l.store_code,
  l.table_name,
  l.grab_order_id,
  l.created_bkk,
  l.status,
  l.item_name,
  left(l.item_note, 100) AS item_note_preview,
  l.menu_id,
  l.menu_id1,
  l.menu_id2,
  CASE WHEN l.flavors_ok THEN 'ok_saved' ELSE 'missing_flavors' END AS pos_flavor_status,
  wb.webhook_received_bkk,
  wb.grab_item_id,
  wb.grab_item_name,
  wb.wh_has_banban_slot_id,
  wb.wh_has_flavor_menu_id,
  CASE
    WHEN l.flavors_ok THEN '저장 OK'
    WHEN wb.order_id IS NULL THEN 'webhook 없음 — §3b order_id 확인'
    WHEN wb.wh_has_banban_slot_id OR wb.wh_has_flavor_menu_id THEN 'Grab payload 있음 → 파싱 버그 의심'
    ELSE 'Grab payload에 맛 id 없음 → 메뉴 sync / Grab 선택값 의심'
  END AS diagnosis_hint,
  wb.grab_modifiers,
  wb.grab_modifier_groups,
  l.line AS pos_line_json
FROM lines l
CROSS JOIN cfg c
LEFT JOIN webhook_banban wb ON wb.order_id = l.grab_order_id
WHERE NOT c.only_missing_flavors OR NOT l.flavors_ok
ORDER BY l.created_bkk DESC, l.order_no;


-- ── PASTE END ────────────────────────────────────────────────


-- ============================================================
-- (선택) 매장별 7일 집계 — 위와 **따로** Run (또는 아래만 복사)
-- ============================================================
/*
SELECT
  store_code,
  count(*) AS banban_lines_total,
  count(*) FILTER (WHERE NOT flavors_ok) AS missing_flavors,
  count(*) FILTER (WHERE flavors_ok) AS flavors_saved,
  round(100.0 * count(*) FILTER (WHERE NOT flavors_ok) / nullif(count(*), 0), 1) AS missing_pct
FROM (
  SELECT
    o.store_code,
    (
      coalesce(it->>'name', '') ~* '\([^)]+\s/\s[^)]+\)'
      OR coalesce(it->>'note', '') ~* 'banbanFlavors:'
      OR (
        coalesce(it->>'menuId1', it->>'menu_id1', '') <> ''
        AND coalesce(it->>'menuId2', it->>'menu_id2', '') <> ''
        AND coalesce(it->>'menuId1', it->>'menu_id1', '')
          <> coalesce(it->>'menuId2', it->>'menu_id2', '')
      )
    ) AS flavors_ok
  FROM public.pos_orders o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
      WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
      ELSE '[]'::jsonb
    END
  ) AS it
  WHERE o.created_at >= (
    date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') - interval '6 days'
  ) AT TIME ZONE 'Asia/Bangkok'
    AND (lower(coalesce(o.delivery_app_code, '')) = 'grab' OR o.memo ILIKE '%grab_order:%')
    AND coalesce(it->>'name', '') ~* 'banban|반반'
) x
GROUP BY store_code
HAVING count(*) > 0
ORDER BY missing_flavors DESC, store_code;
*/
