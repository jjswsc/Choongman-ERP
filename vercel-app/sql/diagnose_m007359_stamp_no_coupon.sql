-- M007359: 스탬프 10/10인데 쿠폰 없음 진단
-- 증상: stamp_card_balance = cardSlots 인데 member_coupon_issues(issued) 없음
-- 원인 후보: 마일스톤 쿠폰 발급 실패 → 리셋 보류 (member_stamp_issue_logs)

-- 0) 회원
SELECT id, member_no, stamp_card_balance, stamp_card_sequence,
       stamp_card_started_at, point_balance, status, tenant_id
FROM public.members
WHERE upper(trim(member_no)) = 'M007359';

-- 1) 현재 정책
SELECT key, value_json, updated_at
FROM public.system_settings
WHERE key LIKE 'member_stamp_policy%'
ORDER BY key;

-- 2) 활성 마일스톤
SELECT id, stamp_count, reward_type, reward_points, coupon_code,
       label_th, label_en, is_active, sort_order
FROM public.member_stamp_milestones
WHERE is_active = true
ORDER BY sort_order, stamp_count;

-- 3) 마일스톤 쿠폰 마스터 유효성 (redemption_mode = member_issue 가 핵심)
SELECT m.stamp_count, m.coupon_code, m.reward_type,
       c.id AS pos_coupon_id, c.is_active, c.redemption_mode, c.valid_from, c.valid_to,
       c.portal_visible, c.portal_claim_mode
FROM public.member_stamp_milestones m
LEFT JOIN public.pos_coupons c
  ON upper(trim(c.code)) = upper(trim(m.coupon_code))
WHERE m.is_active = true
ORDER BY m.stamp_count;

-- 4) 스탬프 원장 (최근)
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT l.*
FROM public.member_stamp_ledger l
JOIN mm ON l.member_id = mm.id
ORDER BY l.created_at DESC, l.id DESC
LIMIT 50;

-- 5) 보상 지급 기록 vs 실패 로그
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT 'reward_issues' AS kind, r.id, r.milestone_id, r.card_sequence,
       r.coupon_code, r.coupon_issue_id, r.created_at, NULL::text AS error_message
FROM public.member_stamp_reward_issues r
JOIN mm ON r.member_id = mm.id
UNION ALL
SELECT 'issue_fail', f.id, f.milestone_id, NULL, f.coupon_code, NULL, f.created_at, f.error_message
FROM public.member_stamp_issue_logs f
JOIN mm ON f.member_id = mm.id
ORDER BY created_at DESC;

-- 6) 지갑 쿠폰 (พร้อมใช้ = status issued)
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT i.id, i.coupon_code, i.status, i.issued_at, i.expires_at, i.used_at, i.order_id
FROM public.member_coupon_issues i
JOIN mm ON i.member_id = mm.id
ORDER BY i.id DESC
LIMIT 50;

-- 7) “รับได้” 카운트용 (셀프클레임 오퍼 — 스탬프 보상과 별개)
SELECT code, name, redemption_mode, portal_visible, portal_claim_mode,
       portal_point_cost, is_active, valid_from, valid_to
FROM public.pos_coupons
WHERE portal_visible = true
  AND lower(trim(coalesce(portal_claim_mode, 'none'))) IN ('free', 'points')
  AND coalesce(is_active, true) = true
ORDER BY portal_sort_order NULLS LAST, code;
