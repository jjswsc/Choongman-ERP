-- 스탬프 10칸 보상 쿠폰 생성 + 마일스톤 코드 01 → GDFSTAMP 교정
-- 원인: member_stamp_milestones.coupon_code = '01' 인데 pos_coupons 에 없음
--        → 발급 실패 → 10/10 고착 (쿠폰 없음)
-- Supabase SQL Editor에서 실행하세요.
-- 참고: 이 DB의 pos_coupons 에는 tenant_id 컬럼이 없습니다.

-- 1) GDFSTAMP 없으면 생성 (할인/범위는 GDF100P 우선 복사)
INSERT INTO public.pos_coupons (
  code,
  name,
  discount_type,
  discount_value,
  valid_from,
  valid_to,
  is_active,
  redemption_mode,
  min_order_amt,
  max_per_order
)
SELECT
  'GDFSTAMP',
  'Stamp Reward · Golden Fried Chicken (S)',
  coalesce(src.discount_type, 'fixed'),
  coalesce(nullif(src.discount_value, 0), 199),
  coalesce(src.valid_from, date '2026-01-01'),
  coalesce(src.valid_to, date '2027-12-31'),
  true,
  'member_issue',
  coalesce(src.min_order_amt, 0),
  coalesce(src.max_per_order, 1)
FROM (SELECT 1) AS _
LEFT JOIN (
  SELECT discount_type, discount_value, valid_from, valid_to, min_order_amt, max_per_order
  FROM public.pos_coupons
  WHERE upper(trim(code)) = 'GDF100P'
  LIMIT 1
) src ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.pos_coupons c WHERE upper(trim(c.code)) = 'GDFSTAMP'
);

-- 1b) 가능하면 GDF100P 의 품목범위·benefit 복사 (tenant_id 없음)
UPDATE public.pos_coupons AS t
SET
  benefit_kind = coalesce(t.benefit_kind, s.benefit_kind),
  item_scope_json = coalesce(t.item_scope_json, s.item_scope_json),
  max_discount_amt = coalesce(t.max_discount_amt, s.max_discount_amt),
  stack_mode = coalesce(t.stack_mode, s.stack_mode),
  discount_value = CASE
    WHEN coalesce(t.discount_value, 0) = 0 THEN coalesce(nullif(s.discount_value, 0), t.discount_value)
    ELSE t.discount_value
  END
FROM public.pos_coupons AS s
WHERE upper(trim(t.code)) = 'GDFSTAMP'
  AND upper(trim(s.code)) = 'GDF100P';

-- 1c) 발급 가능·셀프클레임 비노출로 고정
UPDATE public.pos_coupons
SET
  is_active = true,
  redemption_mode = 'member_issue',
  portal_visible = false,
  portal_claim_mode = 'none',
  portal_point_cost = 0,
  name = coalesce(nullif(btrim(name), ''), 'Stamp Reward · Golden Fried Chicken (S)')
WHERE upper(trim(code)) = 'GDFSTAMP';

-- 2) 마일스톤 쿠폰 코드 교정 (01 → GDFSTAMP)
UPDATE public.member_stamp_milestones
SET
  coupon_code = 'GDFSTAMP',
  updated_at = (now() at time zone 'Asia/Bangkok')
WHERE is_active = true
  AND upper(trim(coupon_code)) = '01';

-- 3) 확인
SELECT code, name, redemption_mode, is_active, discount_type, discount_value,
       portal_visible, portal_claim_mode
FROM public.pos_coupons
WHERE upper(trim(code)) IN ('GDFSTAMP', 'GDF100P', '01')
ORDER BY code;

SELECT id, stamp_count, coupon_code, reward_type, is_active, label_th, label_en
FROM public.member_stamp_milestones
WHERE is_active = true
ORDER BY sort_order, stamp_count;

-- 4) 이후: M007359 가 회원앱 「สิทธิพิเศษ」을 다시 열면
--    10/10 threshold 재시도 → GDFSTAMP 지급 → 카드 리셋됩니다.
