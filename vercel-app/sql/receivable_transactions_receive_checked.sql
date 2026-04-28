-- 미수금 관리: 주문 행별 수금 확인(수동 체크) — Supabase SQL Editor에서 실행
ALTER TABLE receivable_transactions
  ADD COLUMN IF NOT EXISTS receive_checked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN receivable_transactions.receive_checked IS '미수금 화면에서 주문·강제출고(ref_type=Order|ForceOutbound) 건의 대금 수령 확인(수동). 회계 표시용.';
