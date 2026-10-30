-- 검증 — CW(261005) Promotion 제외 확인 (UPDATE 없음)
-- 기대: scope_mains = Chicken, Korean, Side (Promotion 없음)
--       scope_category_keys = []
--       promo_excluded = ok

SELECT
  id,
  campaign_no,
  topic,
  collab_detail -> 'scopeMainCategories' AS scope_mains,
  collab_detail -> 'scopeCategoryKeys' AS scope_category_keys,
  CASE
    WHEN COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb) ? 'Promotion'
      OR COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb) ? '프로모션'
      THEN 'fail: Promotion still in scope'
    ELSE 'ok: Promotion excluded'
  END AS promo_excluded,
  CASE
    WHEN jsonb_array_length(COALESCE(collab_detail -> 'scopeCategoryKeys', '[]'::jsonb)) = 0
      THEN 'ok: category keys empty (Korean/Side mains work)'
    ELSE 'warn: category keys set again'
  END AS category_keys_check
FROM marketing_campaigns
WHERE campaign_no::text = '261005'
   OR id = 68;
