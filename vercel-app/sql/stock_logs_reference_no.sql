-- 강제 출고 등 stock_logs 행에 세금계산서·내부 참조번호 저장
ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS reference_no TEXT NULL;

COMMENT ON COLUMN stock_logs.reference_no IS
  'Tax invoice / internal reference (e.g. 강제출고 시 일괄 입력)';
