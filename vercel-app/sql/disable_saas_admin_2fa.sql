-- Omni: admin 2FA(TOTP) 기능 폐기 — 정책 플래그 OFF
-- 앱 코드에서 2FA enforce/UI는 제거됨. DB 컬럼(require_2fa_admin, employees.totp_*)은 호환용으로 남김.
-- 영업 중 실행 가능(pos_orders UPDATE 없음).

UPDATE public.tenant_policy_settings
SET require_2fa_admin = false
WHERE require_2fa_admin IS DISTINCT FROM false;
