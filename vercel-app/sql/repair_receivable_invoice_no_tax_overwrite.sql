-- Tax Invoice 문서번호(IV.YYYYMMDD-NNN)가 미수금 invoice_no/memo에 잘못 저장된 건을
-- 출고 Invoice(IV{YYYYMMDD}-{orderId} / IVF{YYYYMMDD}-{stockLogId})로 복구.
-- Supabase SQL Editor에서 실행.
--
-- Preview (복구 대상 확인):
-- SELECT id, ref_type, ref_id, trans_date, invoice_no, memo
-- FROM receivable_transactions
-- WHERE invoice_no ~ '^IV\.\d{8}-\d+$'
--    OR memo ~ 'IV\.\d{8}-\d+';

BEGIN;

-- Order: IV{날짜}-{orderId}, memo도 동일
UPDATE receivable_transactions
SET
  invoice_no = 'IV' || to_char(trans_date::date, 'YYYYMMDD') || '-' || ref_id::text,
  memo = 'IV' || to_char(trans_date::date, 'YYYYMMDD') || '-' || ref_id::text
WHERE ref_type = 'Order'
  AND ref_id IS NOT NULL
  AND ref_id > 0
  AND trans_date IS NOT NULL
  AND (
    invoice_no ~ '^IV\.\d{8}-\d+$'
    OR memo ~ 'IV\.\d{8}-\d+'
    OR invoice_no IS NULL
    OR btrim(invoice_no) = ''
  );

-- ForceOutbound: IVF{날짜}-{stockLogId}
UPDATE receivable_transactions
SET
  invoice_no = 'IVF' || to_char(trans_date::date, 'YYYYMMDD') || '-' || ref_id::text,
  memo = '강제출고 IVF' || to_char(trans_date::date, 'YYYYMMDD') || '-' || ref_id::text
WHERE ref_type = 'ForceOutbound'
  AND ref_id IS NOT NULL
  AND ref_id > 0
  AND trans_date IS NOT NULL
  AND (
    invoice_no ~ '^IV\.\d{8}-\d+$'
    OR memo ~ 'IV\.\d{8}-\d+'
    OR invoice_no IS NULL
    OR btrim(invoice_no) = ''
  );

-- AccountingPO: APO{날짜}-{poId} (Tax Invoice 형으로 덮인 경우만)
UPDATE receivable_transactions
SET
  invoice_no = 'APO' || to_char(trans_date::date, 'YYYYMMDD') || '-' || ref_id::text
WHERE ref_type = 'AccountingPO'
  AND ref_id IS NOT NULL
  AND ref_id > 0
  AND trans_date IS NOT NULL
  AND invoice_no ~ '^IV\.\d{8}-\d+$';

COMMIT;

-- 검증:
-- SELECT invoice_no, count(*) FROM receivable_transactions
-- WHERE invoice_no ~ '^IV\.\d{8}-\d+$'
-- GROUP BY 1;
-- → 0 rows 여야 정상 (Tax Invoice 번호는 invoice_settings override에만 존재)
