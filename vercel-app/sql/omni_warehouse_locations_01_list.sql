-- Omni: warehouse_locations 현재 목록 확인
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 마세요.

SELECT id, name, location_code, address, sort_order, tenant_id
FROM public.warehouse_locations
ORDER BY tenant_id NULLS FIRST, sort_order, name, id;
