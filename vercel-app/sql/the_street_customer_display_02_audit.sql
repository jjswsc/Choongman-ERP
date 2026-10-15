-- 2/2 조회 — The Street 프린터·손님 화면 설정 변경 이력 (최근 20건)
-- 이것만 복사 → Run. UPDATE 없음.
-- changed_keys_json 에 dual_monitor_enabled / kbank_skip_api_for_qr / pos_qr_display_mode 가 있으면
-- 그 시각·저장한 사람 때문에 손님 화면 QR이 꺼진 것.

SELECT
  changed_at AT TIME ZONE 'Asia/Bangkok' AS changed_at_bkk,
  store_code,
  changed_by,
  changed_role,
  changed_keys_json
FROM pos_printer_settings_audit_logs
WHERE store_code IN ('CM The Street', 'CM The street', 'CM The Street Ratchada', '1050')
   OR store_code ILIKE '%The Street%'
ORDER BY changed_at DESC
LIMIT 20;
