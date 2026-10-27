-- 미리보기 — 이것만 복사 → Run
-- 자동 채널 수수료 정산(auto_bank_chip*) 월·채널별 건수·금액.
-- pos_orders 미수정. manual_confirmed / csv_import 제외.
-- 적용은 revert_auto_channel_fee_02_apply.sql (심야·마감 후).

SELECT
  lower(btrim(COALESCE(pcs.fee_source, ''))) AS fee_source,
  to_char(pcs.settle_date, 'YYYY-MM') AS year_month,
  pcs.channel,
  count(*) AS settlement_count,
  round(sum(pcs.fee_amt)::numeric, 2) AS fee_sum,
  round(sum(pcs.gross_amt)::numeric, 2) AS gross_sum,
  round(sum(pcs.net_amt)::numeric, 2) AS net_sum
FROM public.pos_channel_settlements pcs
WHERE lower(btrim(COALESCE(pcs.fee_source, ''))) IN (
  'auto_bank_chip',
  'auto_bank_chip_cover',
  'auto_bank_chip_rematch'
)
GROUP BY 1, 2, 3
ORDER BY 2 DESC, 1, 3;
