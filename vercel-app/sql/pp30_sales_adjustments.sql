-- PP30 매출액 채널별 조정 설정
-- 매장·과세월 단위로 결제 채널 제외/비율 조정
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS pp30_sales_adjustments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  store_name TEXT NOT NULL,
  tax_month TEXT NOT NULL,
  exclude_cash BOOLEAN NOT NULL DEFAULT false,
  exclude_card BOOLEAN NOT NULL DEFAULT false,
  exclude_qr BOOLEAN NOT NULL DEFAULT false,
  exclude_delivery_app BOOLEAN NOT NULL DEFAULT false,
  exclude_other BOOLEAN NOT NULL DEFAULT false,
  cash_ratio NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  card_ratio NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  qr_ratio NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  delivery_ratio NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  other_ratio NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  memo TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  CONSTRAINT pp30_sales_adj_unique UNIQUE(tenant_id, store_name, tax_month),
  CONSTRAINT pp30_sales_adj_ratios CHECK (
    cash_ratio BETWEEN 0 AND 1
    AND card_ratio BETWEEN 0 AND 1
    AND qr_ratio BETWEEN 0 AND 1
    AND delivery_ratio BETWEEN 0 AND 1
    AND other_ratio BETWEEN 0 AND 1
  )
);

ALTER TABLE pp30_sales_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp30_sales_adjustments_all"
  ON pp30_sales_adjustments FOR ALL
  USING (true) WITH CHECK (true);

COMMENT ON TABLE pp30_sales_adjustments IS 'PP30 매출액 채널별 조정 — 제외 토글 + 비율(0~1). 조정 후 매출은 일별 비례 배분.';
