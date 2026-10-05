-- Meta 광고 계정을 올바른 계정으로 변경
-- 잘못된 계정: act_2914989841856437 → 올바른: act_1942945006154396
-- last_sync 를 비워 잘못된 캠페인 목록이 남지 않게 함

UPDATE public.marketing_meta_connections
SET
  ad_account_id = 'act_1942945006154396',
  last_synced_at = NULL,
  last_sync_json = '{}'::jsonb,
  updated_at = NOW()
WHERE replace(coalesce(ad_account_id, ''), 'act_', '') = '2914989841856437';
