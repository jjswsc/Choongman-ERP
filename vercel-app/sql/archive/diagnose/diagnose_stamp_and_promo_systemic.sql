-- 전체 점검: 스탬프 마일스톤 + 시크릿 프로모 코드 누락
-- (오늘 이슈와 같은 「설정은 했는데 앱에서 안 됨」 패턴)

-- A) 스탬프 마일스톤: 쿠폰 없거나 member_issue 아님 (10/10 고착 위험)
SELECT
  m.id AS milestone_id,
  m.stamp_count,
  m.coupon_code,
  m.reward_type,
  m.is_active AS milestone_active,
  c.id AS pos_coupon_id,
  c.is_active AS coupon_active,
  c.redemption_mode,
  CASE
    WHEN m.reward_type = 'points' THEN 'ok_points'
    WHEN nullif(btrim(m.coupon_code), '') IS NULL THEN 'missing_coupon_code'
    WHEN c.id IS NULL THEN 'coupon_not_found'
    WHEN c.is_active IS FALSE THEN 'coupon_inactive'
    WHEN lower(trim(coalesce(c.redemption_mode, ''))) <> 'member_issue' THEN 'not_member_issue'
    ELSE 'ok'
  END AS status
FROM public.member_stamp_milestones m
LEFT JOIN public.pos_coupons c
  ON upper(trim(c.code)) = upper(trim(m.coupon_code))
WHERE m.is_active = true
ORDER BY m.sort_order, m.stamp_count;

-- B) 시크릿 프로모: 등록된 코드 상태
SELECT
  p.id,
  p.code AS secret_code,
  p.coupon_code,
  p.is_active AS promo_active,
  p.valid_from,
  p.valid_to,
  p.redemption_count,
  p.max_redemptions,
  p.max_per_member,
  c.id AS pos_coupon_id,
  c.is_active AS coupon_active,
  c.redemption_mode,
  CASE
    WHEN c.id IS NULL THEN 'linked_coupon_missing'
    WHEN c.is_active IS FALSE THEN 'linked_coupon_inactive'
    WHEN lower(trim(coalesce(c.redemption_mode, ''))) <> 'member_issue' THEN 'linked_not_member_issue'
    WHEN p.is_active IS FALSE THEN 'promo_inactive'
    ELSE 'ok'
  END AS status
FROM public.member_coupon_promo_codes p
LEFT JOIN public.pos_coupons c
  ON upper(trim(c.code)) = upper(trim(p.coupon_code))
ORDER BY p.id;

-- C) 의심: 회원발급 쿠폰인데 시크릿 프로모가 없는 것
--    (카탈로그 셀프클레임 free/points 는 제외 — 그건 「รับได้」로 받음)
SELECT
  c.code,
  c.name,
  c.redemption_mode,
  c.is_active,
  c.valid_from,
  c.valid_to,
  c.portal_visible,
  c.portal_claim_mode
FROM public.pos_coupons c
WHERE coalesce(c.is_active, true) = true
  AND lower(trim(coalesce(c.redemption_mode, ''))) = 'member_issue'
  AND lower(trim(coalesce(c.portal_claim_mode, 'none'))) = 'none'
  AND NOT EXISTS (
    SELECT 1
    FROM public.member_coupon_promo_codes p
    WHERE upper(trim(p.coupon_code)) = upper(trim(c.code))
       OR upper(trim(p.code)) = upper(trim(c.code))
  )
ORDER BY c.code;

-- D) 최근 스탬프 쿠폰 지급 실패 (고착 회원 후보)
SELECT f.id, f.member_id, mem.member_no, f.coupon_code, f.error_message, f.created_at
FROM public.member_stamp_issue_logs f
LEFT JOIN public.members mem ON mem.id = f.member_id
ORDER BY f.created_at DESC
LIMIT 30;

-- E) 현재 10/10 고착 가능 회원 (잔액 ≥ 10, 최근 실패 있거나 reward 없음 — 참고용)
SELECT
  mem.member_no,
  mem.stamp_card_balance,
  mem.stamp_card_sequence,
  (
    SELECT count(*) FROM public.member_stamp_reward_issues r
    WHERE r.member_id = mem.id AND r.card_sequence = mem.stamp_card_sequence
  ) AS rewards_this_card,
  (
    SELECT max(f.created_at) FROM public.member_stamp_issue_logs f
    WHERE f.member_id = mem.id
  ) AS last_issue_fail_at
FROM public.members mem
WHERE coalesce(mem.stamp_card_balance, 0) >= 10
ORDER BY mem.stamp_card_balance DESC, mem.member_no
LIMIT 50;
