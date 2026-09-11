-- Omni: item_categories 현재 목록 확인
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run

SELECT id, name, sort_order, tenant_id
FROM public.item_categories
ORDER BY tenant_id NULLS FIRST, sort_order, name, id;
