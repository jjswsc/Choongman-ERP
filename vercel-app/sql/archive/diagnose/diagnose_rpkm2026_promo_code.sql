-- RPKM2026: 회원앱 「มีรหัสคูปองพิเศษ?」 입력 시 invalid_code 진단
-- 이 입력란은 pos_coupons.code 가 아니라 member_coupon_promo_codes.code 입니다.

-- 1) 시크릿 프로모 코드 테이블에 있는가?
SELECT id, code, coupon_code, label, is_active, valid_from, valid_to,
       max_redemptions, max_per_member, redemption_count, tenant_id, updated_at
FROM public.member_coupon_promo_codes
WHERE upper(trim(code)) = 'RPKM2026';

-- 2) POS 쿠폰 마스터에 같은 문자열이 있는지 (여기만 있으면 앱 코드 입력으로는 안 됨)
SELECT code, name, redemption_mode, is_active, valid_from, valid_to,
       portal_visible, portal_claim_mode
FROM public.pos_coupons
WHERE upper(trim(code)) = 'RPKM2026';

-- 3) 테이블 자체가 없으면 위 1) 이 에러 → sql/member_coupon_promo_codes.sql 먼저 적용

-- 4) 활성 시크릿 코드 목록 (참고)
SELECT id, code, coupon_code, is_active, valid_from, valid_to, redemption_count, max_redemptions
FROM public.member_coupon_promo_codes
ORDER BY updated_at DESC NULLS LAST, id DESC
LIMIT 50;
