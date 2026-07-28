-- 충만 DB: get_pos_sales_analytics_agg 42703 수정
-- 증상: column o.tenant_id does not exist
-- 원인: Omni용 p_tenant_id 필터가 RPC에 반영됐는데 pos_orders.tenant_id 컬럼 미생성
-- 영향: 컬럼만 추가(NULL 허용). 기존 행·Realtime 인쇄와 무관. 충만은 p_tenant_id=null 이라 필터 no-op.

ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS tenant_id text;
CREATE INDEX IF NOT EXISTS idx_pos_orders_tenant_id ON public.pos_orders (tenant_id);

-- 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pos_orders'
  AND column_name = 'tenant_id';
