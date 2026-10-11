-- 출퇴근 QR 모드 저장 행 — 어느 회사(tenant_id)가 마지막으로 저장했는지
-- erp_tenants_for_code 에 회사가 2개 이상이면, 같은 매장코드를 여러 회사가 써서 서로 덮어쓴 것
-- 조회 전용 (변경 없음)

SELECT
  s.store_code,
  s.tenant_id AS saved_tenant_id,
  s.mode,
  (s.updated_at AT TIME ZONE 'Asia/Bangkok') AS updated_at_bkk,
  (
    SELECT string_agg(DISTINCT es.tenant_id, ', ')
    FROM public.erp_stores es
    WHERE lower(btrim(es.store_code)) = lower(btrim(s.store_code))
  ) AS erp_tenants_for_code,
  (
    SELECT string_agg(DISTINCT d.tenant_id, ', ')
    FROM public.pos_connected_devices d
    WHERE d.role = 'attendance_display'
      AND lower(btrim(d.store_code)) = lower(btrim(s.store_code))
  ) AS qr_kiosk_tenants_for_code
FROM public.attendance_qr_store_settings s
ORDER BY s.updated_at DESC;
