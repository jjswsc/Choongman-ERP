-- 인사 규정 초안을 게시(직원 화면에 보이게)
-- 반드시 01 미리보기 후, 내용이 맞을 때만 실행하세요.
-- POS 주문 Realtime과는 무관합니다.

UPDATE public.hr_policies
SET is_active = true
WHERE is_active = false;
