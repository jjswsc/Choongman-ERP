-- 2/3 반영 — Future Park 고아 pending 2건만 cancelled
-- 대상 id: 111966 (테이블 4), 111971 (테이블 2)
-- 미리보기에서 pending·payment 0 확인된 뒤에만 실행.
-- JSON 결과([ 로 시작)를 붙여넣지 말 것. 이 SQL만 복사 → Run.

BEGIN;

WITH params AS (
  SELECT
    (
      '[ORDER_CANCELLED '
      || to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      || '] duplicate key-in table 2/4 HQ cancel'
    )::text AS stamp,
    'duplicate key-in table 2/4 HQ cancel'::text AS reason
),
target AS (
  SELECT
    o.id,
    o.order_no,
    o.store_code,
    o.status,
    COALESCE(o.memo, '') AS memo
  FROM public.pos_orders o
  WHERE o.id IN (111966, 111971)
    AND o.order_no IN (
      'CMFUTUREPARK-20260916-002',
      'CMFUTUREPARK-20260916-003'
    )
    AND o.store_code = 'CM Future Park'
    AND lower(btrim(COALESCE(o.status, ''))) = 'pending'
  FOR UPDATE
),
upd AS (
  UPDATE public.pos_orders o
  SET
    status = 'cancelled',
    memo = CASE
      WHEN length(btrim(t.memo)) = 0 THEN p.stamp
      ELSE t.memo || chr(10) || p.stamp
    END
  FROM target t
  CROSS JOIN params p
  WHERE o.id = t.id
  RETURNING
    o.id,
    o.order_no,
    o.store_code,
    t.status AS prev_status,
    o.status AS next_status,
    t.memo AS prev_memo,
    o.memo AS next_memo
),
ins_audit AS (
  INSERT INTO public.pos_order_audit_logs (
    order_id,
    order_no,
    store_code,
    action_type,
    changed_by,
    changed_by_role,
    change_source,
    reason,
    before_json,
    after_json,
    changed_fields_json,
    changed_at
  )
  SELECT
    u.id,
    u.order_no,
    u.store_code,
    'update_status',
    'HQ',
    'hq',
    'sql_editor',
    p.reason,
    jsonb_build_object('status', u.prev_status, 'memo', u.prev_memo),
    jsonb_build_object('status', u.next_status, 'memo', u.next_memo),
    jsonb_build_array(
      jsonb_build_object('field', 'status', 'before', u.prev_status, 'after', u.next_status)
    ),
    now()
  FROM upd u
  CROSS JOIN params p
  RETURNING order_id
),
ins_event AS (
  INSERT INTO public.pos_order_events (
    order_id,
    order_no,
    store_code,
    event_type,
    actor_name,
    actor_role,
    source,
    reason,
    before_json,
    after_json,
    changed_fields_json,
    event_at
  )
  SELECT
    u.id,
    u.order_no,
    u.store_code,
    'update_status',
    'HQ',
    'hq',
    'sql_editor',
    p.reason,
    jsonb_build_object('status', u.prev_status, 'memo', u.prev_memo),
    jsonb_build_object('status', u.next_status, 'memo', u.next_memo),
    jsonb_build_array(
      jsonb_build_object('field', 'status', 'before', u.prev_status, 'after', u.next_status)
    ),
    now()
  FROM upd u
  CROSS JOIN params p
  RETURNING order_id
)
SELECT
  (SELECT count(*) FROM upd) AS cancelled_count,
  (SELECT count(*) FROM ins_audit) AS audit_count,
  (SELECT count(*) FROM ins_event) AS event_count;

COMMIT;
