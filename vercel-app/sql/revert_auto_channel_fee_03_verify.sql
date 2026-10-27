-- 검증 — 이것만 복사 → Run
-- 잔여 auto 채널 수수료 정산 건수 (0이어야 함).

SELECT
  count(*) AS remaining_auto_settlements
FROM public.pos_channel_settlements pcs
WHERE lower(btrim(COALESCE(pcs.fee_source, ''))) IN (
  'auto_bank_chip',
  'auto_bank_chip_cover',
  'auto_bank_chip_rematch'
);
