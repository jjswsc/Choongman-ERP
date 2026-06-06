-- Grab 타겟가 캠페인 시작·종료 시각 (방콕 HH:mm, nullable)
-- valid_from / valid_to 날짜와 조합해 Grab conditions.startTime / endTime 계산에 사용

ALTER TABLE public.pos_promos
  ADD COLUMN IF NOT EXISTS grab_campaign_start_time_bkk varchar(5),
  ADD COLUMN IF NOT EXISTS grab_campaign_end_time_bkk varchar(5);

COMMENT ON COLUMN public.pos_promos.grab_campaign_start_time_bkk IS
  'Grab 캠페인 시작 시각(방콕 HH:mm). null이면 valid_from 당일 00:00 BKK';
COMMENT ON COLUMN public.pos_promos.grab_campaign_end_time_bkk IS
  'Grab 캠페인 종료 시각(방콕 HH:mm). null이면 valid_to 당일 23:59:59 BKK';
