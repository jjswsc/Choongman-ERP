-- =============================================================================
-- Omni: pos_orders.tenant_id 가 비어 Realtime(tenant_id 필터)에 안 걸리는 주문 보정
-- =============================================================================
-- 배경: QR 테이블오더 등에서 tenant_id 없이 INSERT 되면 메인 POS Realtime이
--       이벤트를 못 받고 12~15초 폴링에만 의존 → 메뉴 반영 지연.
--
-- ⚠ 영업 중·POS 켜진 상태 실행 금지 (Realtime UPDATE → 자동인쇄 오인 가능)
--    심야·매장 마감 후, 미리보기 → UPDATE 순으로 실행.
-- =============================================================================

-- 1) 미리보기: tenant_id 비어 있고 erp_stores에 tenant가 있는 미결제·당일성 주문
SELECT
  o.id,
  o.store_code,
  o.order_no,
  o.status,
  o.created_by,
  o.tenant_id AS order_tenant_id,
  s.tenant_id AS store_tenant_id,
  o.created_at
FROM pos_orders o
JOIN erp_stores s ON s.store_code = o.store_code
WHERE (o.tenant_id IS NULL OR btrim(o.tenant_id::text) = '')
  AND s.tenant_id IS NOT NULL
  AND btrim(s.tenant_id::text) <> ''
  AND lower(trim(coalesce(o.status, ''))) NOT IN ('paid', 'completed', 'cancelled', 'canceled')
ORDER BY o.id DESC
LIMIT 200;

-- 2) 반영 (미결제·미완료만 — 과거 paid 대량 UPDATE 금지)
-- UPDATE pos_orders o
-- SET tenant_id = s.tenant_id,
--     updated_at = (now() AT TIME ZONE 'Asia/Bangkok')
-- FROM erp_stores s
-- WHERE s.store_code = o.store_code
--   AND (o.tenant_id IS NULL OR btrim(o.tenant_id::text) = '')
--   AND s.tenant_id IS NOT NULL
--   AND btrim(s.tenant_id::text) <> ''
--   AND lower(trim(coalesce(o.status, ''))) NOT IN ('paid', 'completed', 'cancelled', 'canceled');
