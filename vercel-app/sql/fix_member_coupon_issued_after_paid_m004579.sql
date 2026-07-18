-- 긴급: 결제했는데도 회원 앱에 CMV100P 가 "사용 가능"으로 남은 건 수동 소진
-- 대상 예: 회원 M004579 / 2026-07-18 테이블8 주문(쿠폰 CMV100P -100)
--
-- 배포 전에도 이 SQL로 즉시 막을 수 있습니다.
-- 배포 후에는 앱을 다시 열면 주문 이력으로 자동 재동기화됩니다.

-- 1) 회원·발급 건 확인
SELECT
  m.id AS member_id,
  m.member_no,
  i.id AS issue_id,
  i.coupon_code,
  i.status,
  i.issued_at,
  i.used_at,
  i.order_id
FROM public.members m
JOIN public.member_coupon_issues i ON i.member_id = m.id
WHERE upper(trim(m.member_no)) = 'M004579'
  AND upper(trim(i.coupon_code)) = 'CMV100P'
ORDER BY i.id DESC;

-- 2) 오늘 해당 쿠폰이 들어간 결제 주문 찾기
SELECT
  o.id AS order_id,
  o.order_no,
  o.store_code,
  o.member_no,
  o.coupon_code,
  o.coupon_discount_amt,
  o.paid_at,
  o.total,
  o.status
FROM public.pos_orders o
WHERE upper(trim(coalesce(o.member_no, ''))) = 'M004579'
  AND (
    upper(coalesce(o.coupon_code, '')) LIKE '%CMV100P%'
    OR coalesce(o.applied_coupons::text, '') ILIKE '%CMV100P%'
  )
  AND o.paid_at IS NOT NULL
ORDER BY o.id DESC
LIMIT 20;

-- 3) issued 로 남은 CMV100P 를 해당 주문에 used 처리
--    아래 order_id 는 2) 결과의 실제 id 로 바꿔 실행하세요.
WITH target_member AS (
  SELECT id FROM public.members WHERE upper(trim(member_no)) = 'M004579' LIMIT 1
),
target_order AS (
  SELECT id
  FROM public.pos_orders
  WHERE upper(trim(coalesce(member_no, ''))) = 'M004579'
    AND (
      upper(coalesce(coupon_code, '')) LIKE '%CMV100P%'
      OR coalesce(applied_coupons::text, '') ILIKE '%CMV100P%'
    )
    AND paid_at IS NOT NULL
  ORDER BY id DESC
  LIMIT 1
)
UPDATE public.member_coupon_issues i
SET
  status = 'used',
  used_at = coalesce(i.used_at, timezone('Asia/Bangkok', now())::timestamp),
  order_id = (SELECT id FROM target_order)
FROM target_member m
WHERE i.member_id = m.id
  AND upper(trim(i.coupon_code)) = 'CMV100P'
  AND lower(trim(i.status)) = 'issued'
  AND EXISTS (SELECT 1 FROM target_order);
