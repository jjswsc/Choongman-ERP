-- 영업 중 pos_orders UPDATE 없음. 세무 장부 전표 종류만 수정.
-- 배달 채널 정산은 입금(RV) — 지급(PP)으로 복제된 건을 바로잡음.

UPDATE public.journal_entries
SET voucher_kind = 'receipt'
WHERE source_type = 'pos_channel_settlement'
  AND coalesce(voucher_kind, '') <> 'receipt'
  AND accounting_date >= '2026-07-01';
