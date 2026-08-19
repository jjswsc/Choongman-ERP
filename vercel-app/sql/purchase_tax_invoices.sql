-- 매입 세금계산서 등록함 (PP.30 ภาษีซื้อ 정본)
-- 지출 등록과 분리. 입고 배치는 invoice_received + invoice_no 일 때 1행 동기화.
-- vat_ledger_entries 에는 memo [AUTO:PURCHASE_TAX_INV:{id}] 로 반영.

CREATE TABLE IF NOT EXISTS public.purchase_tax_invoices (
  id BIGSERIAL PRIMARY KEY,
  store_name TEXT NOT NULL,
  buyer_tax_id TEXT NOT NULL,
  tax_month TEXT NOT NULL,
  doc_date DATE NOT NULL,
  invoice_no TEXT NOT NULL,
  seller_name TEXT NOT NULL,
  seller_tax_id TEXT NOT NULL,
  seller_branch TEXT NOT NULL DEFAULT 'สำนักงานใหญ่',
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'inbound_batch', 'pdf')),
  inbound_batch_id BIGINT NULL,
  attachment_urls TEXT NULL,
  memo TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NULL
);

COMMENT ON TABLE public.purchase_tax_invoices IS
  'ใบกำกับภาษีซื้อ register. PP.30 input VAT source of truth (syncs vat_ledger_entries).';
COMMENT ON COLUMN public.purchase_tax_invoices.buyer_tax_id IS
  '납세 주체 13자리 (store_tax_filing_profiles.tax_id). HQ vs เอกมัย 구분.';
COMMENT ON COLUMN public.purchase_tax_invoices.tax_month IS
  'YYYY-MM from doc_date (invoice date), not expense date.';
COMMENT ON COLUMN public.purchase_tax_invoices.seller_branch IS
  'สำนักงานใหญ่ or สาขา 00001';
COMMENT ON COLUMN public.purchase_tax_invoices.source IS
  'manual | inbound_batch | pdf';
COMMENT ON COLUMN public.purchase_tax_invoices.attachment_urls IS
  'JSON string array of scan URLs (optional).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_tax_invoices_entity_inv_seller
  ON public.purchase_tax_invoices (buyer_tax_id, invoice_no, seller_tax_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_tax_invoices_inbound_batch
  ON public.purchase_tax_invoices (inbound_batch_id)
  WHERE inbound_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_tax_invoices_tax_month_store
  ON public.purchase_tax_invoices (tax_month, store_name);

CREATE INDEX IF NOT EXISTS idx_purchase_tax_invoices_buyer_month
  ON public.purchase_tax_invoices (buyer_tax_id, tax_month);

ALTER TABLE public.purchase_tax_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all purchase_tax_invoices" ON public.purchase_tax_invoices;
CREATE POLICY "Allow all purchase_tax_invoices"
  ON public.purchase_tax_invoices
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.purchase_tax_invoices TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.purchase_tax_invoices_id_seq TO anon, authenticated, service_role;
