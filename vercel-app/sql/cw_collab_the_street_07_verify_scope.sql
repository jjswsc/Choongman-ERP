-- 검증 — CW(261005) scope 수정 후 확인 (UPDATE 없음)
-- 기대: scope_mains 에 Chicken, Korean, Side, Promotion
--       scope_category_keys = []
--       promo_scope_check = ok

SELECT
  id,
  campaign_no,
  topic,
  collab_detail -> 'scopeMainCategories' AS scope_mains,
  collab_detail -> 'scopeCategoryKeys' AS scope_category_keys,
  CASE
    WHEN COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb) ? 'Promotion'
      THEN 'ok: Promotion in scope mains'
    ELSE 'fail: Promotion missing'
  END AS promo_scope_check,
  CASE
    WHEN jsonb_array_length(COALESCE(collab_detail -> 'scopeCategoryKeys', '[]'::jsonb)) = 0
      THEN 'ok: category keys cleared (mains-only)'
    ELSE 'warn: category keys still set (AND with mains)'
  END AS category_keys_check
FROM marketing_campaigns
WHERE campaign_no::text = '261005'
   OR id = 68;
