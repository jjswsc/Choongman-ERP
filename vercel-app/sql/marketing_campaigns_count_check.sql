-- Supabase SQL Editor: 등록된 마케팅 캠페인 개수·샘플 확인
SELECT count(*) AS campaign_count FROM public.marketing_campaigns;
SELECT id, campaign_no, topic, status, start_date, end_date
FROM public.marketing_campaigns
ORDER BY id DESC
LIMIT 30;
