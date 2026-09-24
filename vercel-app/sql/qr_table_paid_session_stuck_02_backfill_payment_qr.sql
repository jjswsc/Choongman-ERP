-- 영업 중·POS 켜진 상태 실행 금지 (Realtime·세션 배지 갱신만, 영수증 재인쇄는 status 이미 paid면 보통 없음)
-- payment_qr 잔액 백필: 채널 합 < total 인 paid QR 테이블 주문
UPDATE public.pos_orders o
SET
  payment_qr = round(
    (
      coalesce(o.payment_qr, 0)
      + greatest(
          0,
          coalesce(o.total, 0)
          - (
              coalesce(o.payment_cash, 0)
              + coalesce(o.payment_card, 0)
              + coalesce(o.payment_qr, 0)
              + coalesce(o.payment_other, 0)
            )
        )
    )::numeric,
    2
  ),
  updated_at = now()
WHERE o.created_by LIKE 'qr_table:%'
  AND lower(coalesce(o.status, '')) IN ('paid', 'completed')
  AND (
    coalesce(o.payment_cash, 0)
    + coalesce(o.payment_card, 0)
    + coalesce(o.payment_qr, 0)
    + coalesce(o.payment_other, 0)
  ) + 0.005 < coalesce(o.total, 0);
