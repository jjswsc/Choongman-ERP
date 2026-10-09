-- 마일스톤이 STAMP10 인지 확인 + POS 마스터 유효성 + M007359 재시도 가능 여부
-- Supabase SQL Editor에서 실행

-- 1) STAMP10 / GDFSTAMP 쿠폰 마스터
SELECT code, name, redemption_mode, is_active, discount_type, discount_value,
       portal_visible, portal_claim_mode, valid_from, valid_to
FROM public.pos_coupons
WHERE upper(trim(code)) IN ('STAMP10', 'GDFSTAMP', '01')
ORDER BY code;

-- 2) 활성 마일스톤
SELECT id, stamp_count, coupon_code, reward_type, is_active, label_th, label_en
FROM public.member_stamp_milestones
WHERE is_active = true
ORDER BY sort_order, stamp_count;

-- 3) M007359 잔액·지갑
SELECT id, member_no, stamp_card_balance, stamp_card_sequence
FROM public.members
WHERE upper(trim(member_no)) = 'M007359';

WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT i.id, i.coupon_code, i.status, i.issued_at, i.expires_at
FROM public.member_coupon_issues i
JOIN mm ON i.member_id = mm.id
WHERE upper(trim(i.coupon_code)) IN ('STAMP10', 'GDFSTAMP', '01')
ORDER BY i.id DESC
LIMIT 20;

-- 4) 최근 실패 로그
WITH mm AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M007359' LIMIT 1
)
SELECT f.id, f.coupon_code, f.error_message, f.created_at
FROM public.member_stamp_issue_logs f
JOIN mm ON f.member_id = mm.id
ORDER BY f.created_at DESC
LIMIT 10;
