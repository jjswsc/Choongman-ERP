-- Omni: items 품목 저장 컬럼 확인 (01 실행 후)
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 기대: purchase_source 포함 아래 컬럼이 모두 보여야 함

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'items'
  AND column_name IN (
    'purchase_source',
    'outbound_location',
    'spec',
    'unit',
    'total_quantity',
    'description',
    'stock_base_unit',
    'stock_unit_options',
    'standard_units',
    'account_subject_id',
    'order_disabled',
    'sort_order',
    'tenant_id'
  )
ORDER BY column_name;
