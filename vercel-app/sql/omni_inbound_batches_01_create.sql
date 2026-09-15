-- Omni: Inbound Save (PGRST205 inbound_batches)
-- 증상: Could not find the table 'public.inbound_batches' in the schema cache
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 않는 것을 권장합니다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inbound_batches (
  id BIGSERIAL PRIMARY KEY,
  location TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  vendor_code TEXT DEFAULT NULL,
  batch_date DATE NOT NULL,
  total_amount NUMERIC(14,3) DEFAULT 0,
  purchase_order_id BIGINT DEFAULT NULL,
  invoice_no TEXT DEFAULT NULL,
  invoice_photo_url TEXT DEFAULT NULL,
  invoice_received BOOLEAN DEFAULT false,
  po_no TEXT DEFAULT NULL,
  source_currency TEXT NOT NULL DEFAULT 'THB',
  fx_rate NUMERIC(18, 6) DEFAULT NULL,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS vendor_code TEXT;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS batch_date DATE;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,3) DEFAULT 0;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS purchase_order_id BIGINT;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT false;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS po_no TEXT;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS source_currency TEXT NOT NULL DEFAULT 'THB';
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(18, 6);
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.inbound_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_inbound_batches_location ON public.inbound_batches(location);
CREATE INDEX IF NOT EXISTS idx_inbound_batches_vendor ON public.inbound_batches(vendor_code);
CREATE INDEX IF NOT EXISTS idx_inbound_batches_date ON public.inbound_batches(batch_date);
CREATE INDEX IF NOT EXISTS idx_inbound_batches_po ON public.inbound_batches(purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_batches_tenant_id ON public.inbound_batches(tenant_id);

COMMENT ON TABLE public.inbound_batches IS
  '입고 배치 (Inbound Save 1회 = 1행). Omni는 tenant_id 단위로 격리';
COMMENT ON COLUMN public.inbound_batches.source_currency IS '입고 입력 통화: THB(기본) | KRW';
COMMENT ON COLUMN public.inbound_batches.fx_rate IS 'KRW 입고 시 환율: 1 THB당 KRW (바트단가 = 원화단가 / fx_rate)';

DO $$
BEGIN
  IF to_regclass('public.stock_logs') IS NULL THEN
    RAISE NOTICE 'skip stock_logs: table not found';
    RETURN;
  END IF;

  ALTER TABLE public.stock_logs
    ADD COLUMN IF NOT EXISTS inbound_batch_id BIGINT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,3) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS source_unit_cost NUMERIC(18,3) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

  COMMENT ON COLUMN public.stock_logs.inbound_batch_id IS '입고 배치 ID (inbound_batches.id)';
  COMMENT ON COLUMN public.stock_logs.unit_cost IS '입고·이동 시 줄 단가. NULL이면 items.cost 사용';
  COMMENT ON COLUMN public.stock_logs.source_unit_cost IS 'KRW 입고 시 원화 단가. THB 입고는 null';

  CREATE INDEX IF NOT EXISTS idx_stock_logs_inbound_batch
    ON public.stock_logs(inbound_batch_id)
    WHERE inbound_batch_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_stock_logs_tenant_id ON public.stock_logs(tenant_id);
END $$;

CREATE TABLE IF NOT EXISTS public.payable_transactions (
  id BIGSERIAL PRIMARY KEY,
  vendor_code TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  ref_type TEXT NOT NULL DEFAULT 'PO',
  ref_id BIGINT DEFAULT NULL,
  trans_date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payable_transactions ADD COLUMN IF NOT EXISTS tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_payable_vendor ON public.payable_transactions(vendor_code);
CREATE INDEX IF NOT EXISTS idx_payable_ref ON public.payable_transactions(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_payable_date ON public.payable_transactions(trans_date);
CREATE INDEX IF NOT EXISTS idx_payable_transactions_tenant_id
  ON public.payable_transactions(tenant_id);

COMMENT ON TABLE public.payable_transactions IS
  '매입 미지급. 입고 Save 시 ref_type=Inbound, ref_id=inbound_batches.id';

ALTER TABLE public.inbound_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payable_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inbound_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inbound_batches TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payable_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payable_transactions TO postgres;

DO $$
BEGIN
  IF to_regclass('public.inbound_batches_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.inbound_batches_id_seq TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.inbound_batches_id_seq TO postgres';
  END IF;
  IF to_regclass('public.payable_transactions_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.payable_transactions_id_seq TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.payable_transactions_id_seq TO postgres';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
