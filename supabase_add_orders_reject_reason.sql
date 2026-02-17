-- 주문 거절 사유 컬럼 추가 (주문승인에서 거절 시 사유 입력, 모바일 주문 내역에서 확인)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_reason TEXT DEFAULT '';
