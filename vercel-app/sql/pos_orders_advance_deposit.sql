-- 보류. 주문+메뉴 선주문은 주방 Realtime 자동인쇄와 묶여 사용하지 않음.
-- 예약금은 pos_deposit_ledger만 사용. 이 파일은 실행하지 마세요.
-- 앱 select에서도 이 컬럼을 빼 두었음(충만 42703 폭주 방지). 기능 재개 시에만 DDL.
--
-- POS 선주문·손님 선수금(มัดจำ) 조회용 컬럼
-- 과거 주문 backfill 없음. 영업 중 pos_orders 대량 UPDATE 금지.

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_advance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS deposit_amt numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_tender text,
  ADD COLUMN IF NOT EXISTS deposit_policy text,
  ADD COLUMN IF NOT EXISTS deposit_cancel_hours integer,
  ADD COLUMN IF NOT EXISTS advance_checked_in_at timestamptz;

COMMENT ON COLUMN public.pos_orders.scheduled_at IS '선주문 방문/픽업 시각(방콕). is_advance와 함께 사용.';
COMMENT ON COLUMN public.pos_orders.is_advance IS '선주문(มัดจำ) 여부. pending이어도 홀 테이블을 점유하지 않음.';
COMMENT ON COLUMN public.pos_orders.guest_phone IS '선주문 손님 전화(비회원). 회원은 member_id 우선.';
COMMENT ON COLUMN public.pos_orders.guest_name IS '선주문 손님 이름.';
COMMENT ON COLUMN public.pos_orders.deposit_amt IS '현재 보유 선수금(수령-적용-환불-몰수). payment_*와 분리.';
COMMENT ON COLUMN public.pos_orders.deposit_tender IS '선수금 수령 수단: cash | qr | transfer.';
COMMENT ON COLUMN public.pos_orders.deposit_policy IS '환불 정책: refundable | non_refundable | staff_choice.';
COMMENT ON COLUMN public.pos_orders.deposit_cancel_hours IS '방문 N시간 전 이후 기본 미환불. NULL이면 24.';
COMMENT ON COLUMN public.pos_orders.advance_checked_in_at IS '체크인 시각. 이후 주방 출력·테이블 배정.';

CREATE INDEX IF NOT EXISTS pos_orders_advance_pending_idx
  ON public.pos_orders (store_code, is_advance, status)
  WHERE is_advance = true;

CREATE INDEX IF NOT EXISTS pos_orders_guest_phone_idx
  ON public.pos_orders (guest_phone)
  WHERE guest_phone IS NOT NULL AND guest_phone <> '';
