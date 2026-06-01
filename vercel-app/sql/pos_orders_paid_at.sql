-- pos_orders.paid_at: 최초 결제 완료 시각 (주문 접수 created_at 과 구분)
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN public.pos_orders.paid_at IS
  'POS 최초 결제 완료 시각(방콕 저장). 주문 접수(created_at)와 별도.';

-- updated_at 컬럼·트리거가 없는 레거시 DB 보강
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_set_updated_at ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_set_updated_at
BEFORE UPDATE ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- 기존 데이터: updated_at 이 접수보다 늦으면 결제 시각으로 추정
UPDATE public.pos_orders o
SET paid_at = COALESCE(
  NULLIF(o.linkpos_responded_at::text, '')::timestamptz,
  o.updated_at
)
WHERE o.paid_at IS NULL
  AND o.updated_at IS NOT NULL
  AND o.created_at IS NOT NULL
  AND o.updated_at > o.created_at
  AND (
    LOWER(COALESCE(o.status, '')) IN ('paid', 'completed')
    OR (
      COALESCE(o.payment_cash, 0)
      + COALESCE(o.payment_card, 0)
      + COALESCE(o.payment_qr, 0)
      + COALESCE(o.payment_other, 0)
      + COALESCE(o.payment_delivery_app, 0)
    ) > 0.005
  );

-- 동시 접수·결제(포장 등): updated_at ≈ created_at 이면 접수 시각을 결제 시각으로
UPDATE public.pos_orders o
SET paid_at = o.created_at
WHERE o.paid_at IS NULL
  AND o.created_at IS NOT NULL
  AND LOWER(COALESCE(o.status, '')) IN ('paid', 'completed')
  AND (
    COALESCE(o.payment_cash, 0)
    + COALESCE(o.payment_card, 0)
    + COALESCE(o.payment_qr, 0)
    + COALESCE(o.payment_other, 0)
    + COALESCE(o.payment_delivery_app, 0)
  ) > 0.005;
