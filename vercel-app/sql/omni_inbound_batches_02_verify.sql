-- Omni: inbound_batches 생성 확인 (01 실행 후)
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 기대: inbound_batches 에 tenant_id, po_no, source_currency, fx_rate 가 보여야 함
--       payable_transactions 에 ref_type, ref_id, tenant_id 가 보여야 함

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('inbound_batches', 'payable_transactions')
  AND column_name IN (
    'id',
    'location',
    'vendor_name',
    'vendor_code',
    'batch_date',
    'total_amount',
    'purchase_order_id',
    'invoice_no',
    'invoice_received',
    'po_no',
    'source_currency',
    'fx_rate',
    'tenant_id',
    'ref_type',
    'ref_id',
    'trans_date',
    'amount'
  )
ORDER BY table_name, column_name;
