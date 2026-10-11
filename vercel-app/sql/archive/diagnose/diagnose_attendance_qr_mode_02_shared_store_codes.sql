-- 출퇴근 QR 키오스크를 등록한 매장코드 중, 회사 2곳 이상이 같은 코드를 쓰는 경우
-- 여기 나온 매장은 attendance_qr_store_mode_tenant_pk.sql 적용 전까지 고정/2시간 설정이 서로 덮어써짐
-- 조회 전용 (변경 없음)

SELECT
  lower(btrim(d.store_code)) AS store_code,
  count(DISTINCT d.tenant_id) AS tenant_count,
  string_agg(DISTINCT d.tenant_id, ', ') AS tenant_ids,
  string_agg(DISTINCT coalesce(d.display_label, ''), ' | ') AS kiosk_labels
FROM public.pos_connected_devices d
WHERE d.role = 'attendance_display'
GROUP BY 1
HAVING count(DISTINCT d.tenant_id) > 1
ORDER BY 2 DESC, 1;
