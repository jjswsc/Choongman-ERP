-- ============================================================
-- vendors.balance → payable_transactions 기초잔액 마이그레이션
-- 1회만 실행. 기존 vendors.balance 값을 매입처 미지급금 기초잔액으로 이전
-- 실행 전: payable_transactions 테이블이 있어야 함 (supabase_receivable_payable.sql)
-- ============================================================

-- 매입처(type에 buy/sales/both 중 매입 포함) 또는 balance가 있는 거래처
INSERT INTO payable_transactions (vendor_code, amount, ref_type, ref_id, trans_date, memo)
SELECT
  code,
  COALESCE(balance, 0),
  'Opening',
  NULL,
  TO_CHAR(NOW(), 'YYYY-MM-DD'),
  '기초잔액'
FROM vendors
WHERE COALESCE(balance, 0) != 0
  AND NOT EXISTS (
    SELECT 1 FROM payable_transactions pt
    WHERE pt.vendor_code = vendors.code AND pt.ref_type = 'Opening' AND pt.ref_id IS NULL
  );

-- 마이그레이션 후 vendors.balance 초기화 (선택 실행)
-- UPDATE vendors SET balance = 0 WHERE balance != 0;
