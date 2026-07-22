-- 전 매장 카드 결제 = 수기(단말 승인 생략)
-- 앱 코드 LINKPOS_FORCE_MANUAL_CARD=true 와 맞춤. 시콘 등 단말 연동 ON 된 매장도 수기로 복구.
-- Supabase SQL Editor에서 실행.

UPDATE pos_printer_settings
SET linkpos_skip_terminal_for_card = true
WHERE linkpos_skip_terminal_for_card IS DISTINCT FROM true;

-- 확인
SELECT store_code, linkpos_skip_terminal_for_card
FROM pos_printer_settings
ORDER BY store_code;
