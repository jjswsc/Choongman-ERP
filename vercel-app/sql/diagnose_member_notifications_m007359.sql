-- 멤버 알림(벨 + LINE 포인트/스탬프) 점검 — M007359
-- 방콕시간 기준. Supabase SQL Editor에 붙여넣어 실행.
-- 앱 벨은 인앱 테이블이 없음 → 이 SQL은 LINE·원장·설정만 확인.
-- 참고: members.line_oa_friend 는 scripts/members_line_crm_schema.sql 마이그레이션
--       미적용 DB가 있어 이 진단 SQL에서는 사용하지 않음. OA 친구 여부는
--       member_identities(provider=line) 유무로 판단.
-- 스키마: member_identities → linked_at/last_seen_at
--         member_events → processed_at (created_at 없음)

-- 0) 회원 기본 (line_oa_friend 컬럼 없음 → 제외)
SELECT id, member_no, name, full_name, point_balance, tier_code,
       stamp_card_balance, stamp_card_sequence, status, tenant_id
FROM public.members
WHERE upper(trim(member_no)) = 'M007359';

-- 0b) line_oa_friend 컬럼 존재 여부 (정보용)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'members'
  AND column_name IN ('line_oa_friend', 'line_oa_friend_at');

-- 1) LINE 연동 (포인트·스탬프 공통 전제)
SELECT m.id AS member_id, m.member_no,
       i.id AS identity_id, i.provider, i.provider_user_id, i.status AS identity_status,
       i.linked_at, i.last_seen_at
FROM public.members m
LEFT JOIN public.member_identities i
  ON i.member_id = m.id AND i.provider = 'line'
WHERE upper(trim(m.member_no)) = 'M007359';

-- 2) LINE 포인트 알림 전역 설정 (키 없으면 코드 기본값 = ON)
SELECT key, value_json, updated_at
FROM public.system_settings
WHERE key = 'member_point_line_notify_enabled';

-- 3) 스탬프 정책 (lineNotifyEnabled 포함, 기본 ON)
SELECT key, value_json, updated_at
FROM public.system_settings
WHERE key LIKE 'member_stamp_policy%'
ORDER BY key;

-- 4) 최근 포인트 원장 vs LINE 발송 이벤트 (이벤트 시각 = processed_at)
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT l.id AS ledger_id,
       l.order_id,
       l.kind,
       l.points,
       l.created_at AS ledger_at,
       e.event_id,
       e.event_type,
       e.status AS notify_status,
       e.processed_at AS notify_at,
       CASE
         WHEN e.id IS NOT NULL THEN 'line_marked_sent'
         WHEN l.kind = 'earn' AND coalesce(l.points, 0) > 0 THEN 'earn_no_notify_event'
         WHEN l.kind = 'use' THEN 'use_check_notify'
         ELSE 'n/a'
       END AS audit_flag
FROM public.member_points_ledger l
JOIN mm ON l.member_id = mm.id
LEFT JOIN public.member_events e
  ON e.event_id = 'point_line_notify:order:' || l.order_id::text
WHERE l.kind IN ('earn', 'use')
ORDER BY l.created_at DESC
LIMIT 30;

-- 5) 포인트 LINE 이벤트만 (원장 없이 테스트 푸시 등)
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT e.id, e.event_id, e.event_type, e.status, e.payload, e.processed_at
FROM public.member_events e
JOIN mm ON e.member_id = mm.id
WHERE e.event_type = 'point_line_notify'
   OR e.event_id LIKE 'point_line_notify:%'
ORDER BY e.processed_at DESC
LIMIT 30;

-- 6) 최근 스탬프 원장
--    ※ 스탬프 LINE은 member_events에 안 남김 → “보냈는지” DB 증명 불가, 적립 여부만 확인
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT l.id, l.order_id, l.kind, l.store_code, l.stamp_ymd,
       l.card_sequence, l.balance_after, l.note, l.created_at
FROM public.member_stamp_ledger l
JOIN mm ON l.member_id = mm.id
ORDER BY l.created_at DESC
LIMIT 30;

-- 7) 요약: 적립은 있는데 포인트 LINE 이벤트가 없는 주문 (최근 30 earn)
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
),
earns AS (
  SELECT l.order_id, l.points, l.created_at
  FROM public.member_points_ledger l
  JOIN mm ON l.member_id = mm.id
  WHERE l.kind = 'earn' AND coalesce(l.points, 0) > 0 AND l.order_id IS NOT NULL
  ORDER BY l.created_at DESC
  LIMIT 30
)
SELECT e.order_id, e.points, e.created_at AS earn_at,
       ev.event_id, ev.processed_at AS notify_at
FROM earns e
LEFT JOIN public.member_events ev
  ON ev.event_id = 'point_line_notify:order:' || e.order_id::text
WHERE ev.id IS NULL
ORDER BY e.created_at DESC;
