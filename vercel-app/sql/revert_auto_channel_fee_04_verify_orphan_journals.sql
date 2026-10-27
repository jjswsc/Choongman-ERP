-- 검증(선택) — 이것만 복사 → Run
-- 정산 행이 없는 pos_channel_settlement 분개 잔여 여부 (0이어야 함).

SELECT
  count(*) AS orphan_channel_settlement_journals
FROM public.journal_entries je
WHERE je.source_type = 'pos_channel_settlement'
  AND NOT EXISTS (
    SELECT 1
    FROM public.pos_channel_settlements pcs
    WHERE pcs.id = je.source_id
  );
