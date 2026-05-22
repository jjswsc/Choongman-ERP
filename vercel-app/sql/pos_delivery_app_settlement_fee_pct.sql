-- 배달앱 플랫폼 정산 수수료(%): 매장 매출 중 앱이 차감·익일 NET 입금 (본사 PO 배달 GP와 별도)

ALTER TABLE IF EXISTS public.pos_delivery_app_policies
  ADD COLUMN IF NOT EXISTS settlement_fee_pct NUMERIC(5, 2) NULL;

COMMENT ON COLUMN public.pos_delivery_app_policies.settlement_fee_pct IS
  '플랫폼 정산 수수료(%). GROSS 대비 FEE 예상·대사용. NULL이면 앱별 기본(Grab 20/LINE 18/Shopee 13). 본사 po_billing_settings 와 무관.';
