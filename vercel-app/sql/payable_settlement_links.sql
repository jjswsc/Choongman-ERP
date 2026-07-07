-- 매입채무 수동 연결: 입고(발생) N건 ↔ 지급 M건 (합산 금액 일치)
-- Supabase SQL Editor에서 1회 실행

CREATE TABLE IF NOT EXISTS public.payable_settlement_links (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES public.payable_transactions(id) ON DELETE CASCADE,
  accrual_id BIGINT NOT NULL REFERENCES public.payable_transactions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payable_settlement_links_payment_accrual_unique UNIQUE (payment_id, accrual_id)
);

CREATE INDEX IF NOT EXISTS idx_payable_settlement_links_payment_id
  ON public.payable_settlement_links(payment_id);

CREATE INDEX IF NOT EXISTS idx_payable_settlement_links_accrual_id
  ON public.payable_settlement_links(accrual_id);

COMMENT ON TABLE public.payable_settlement_links IS
  '미지급금 화면 수동 짝짓기 — Payment payable_transactions.id ↔ Inbound/PO/Opening accrual id';
