-- 매장 수리 티켓 거래처 코드 정규화 (코드 우선)
ALTER TABLE IF EXISTS public.store_repair_tickets
  ADD COLUMN IF NOT EXISTS vendor_code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_store_repair_tickets_vendor_code
  ON public.store_repair_tickets (vendor_code);
