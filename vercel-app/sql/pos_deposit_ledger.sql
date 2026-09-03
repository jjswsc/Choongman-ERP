-- POS 손님 예약금(มัดจำ) 원장. 잔액 진실 소스.
-- 주문(pos_orders)을 만들지 않음 — 주방·홀 자동인쇄와 분리.
-- Supabase SQL Editor에서 이것만 복사 → Run

CREATE TABLE IF NOT EXISTS public.pos_deposit_ledger (
  id bigserial PRIMARY KEY,
  tenant_id text,
  store_code text NOT NULL DEFAULT '',
  pos_order_id bigint,
  member_id bigint,
  guest_phone text,
  guest_name text,
  kind text NOT NULL,
  amount numeric(12,2) NOT NULL,
  tender text,
  memo text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_deposit_ledger
  ALTER COLUMN pos_order_id DROP NOT NULL;

ALTER TABLE public.pos_deposit_ledger
  ADD COLUMN IF NOT EXISTS guest_name text;

COMMENT ON TABLE public.pos_deposit_ledger IS '손님 예약금 원장. kind=receive|apply|refund|forfeit. 회원 또는 이름+전화.';
COMMENT ON COLUMN public.pos_deposit_ledger.kind IS 'receive(+) apply/refund/forfeit(-). 금액은 항상 양수.';
COMMENT ON COLUMN public.pos_deposit_ledger.amount IS '양수. 부호는 kind로 해석.';
COMMENT ON COLUMN public.pos_deposit_ledger.pos_order_id IS '수령 시 NULL. 방문 결제 적용(apply) 때 해당 주문 id.';
COMMENT ON COLUMN public.pos_deposit_ledger.guest_name IS '비회원 이름. 회원은 member_id 우선.';

CREATE INDEX IF NOT EXISTS pos_deposit_ledger_order_idx
  ON public.pos_deposit_ledger (pos_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_deposit_ledger_store_idx
  ON public.pos_deposit_ledger (store_code, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_deposit_ledger_member_idx
  ON public.pos_deposit_ledger (member_id, created_at DESC)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pos_deposit_ledger_phone_idx
  ON public.pos_deposit_ledger (guest_phone, created_at DESC)
  WHERE guest_phone IS NOT NULL AND guest_phone <> '';

ALTER TABLE public.pos_deposit_ledger
  DROP CONSTRAINT IF EXISTS pos_deposit_ledger_kind_chk;

ALTER TABLE public.pos_deposit_ledger
  ADD CONSTRAINT pos_deposit_ledger_kind_chk
  CHECK (kind IN ('receive', 'apply', 'refund', 'forfeit'));

ALTER TABLE public.pos_deposit_ledger
  DROP CONSTRAINT IF EXISTS pos_deposit_ledger_amount_chk;

ALTER TABLE public.pos_deposit_ledger
  ADD CONSTRAINT pos_deposit_ledger_amount_chk
  CHECK (amount > 0);
