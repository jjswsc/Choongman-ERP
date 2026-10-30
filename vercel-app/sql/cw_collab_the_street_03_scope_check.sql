-- 1/2 조회 — CW 협업(campaign_no 261005 / The Street) 할인 대상 scope
-- 이것만 복사 → Run. UPDATE 없음.
-- 해석:
--   scope_mains / scope_category_keys 에 Promotion 이 없으면
--   POS 는 프로모션·세트 메뉴를 기본 제외 → 할인 0 + "ไม่มีรายการในตะกร้า…" 경고.
--   scope 가 전부 비어 있어도 프로모션은 제외된다.

SELECT
  id,
  campaign_no,
  topic,
  collab_detail -> 'scopeMainCategories' AS scope_mains,
  collab_detail -> 'scopeCategoryKeys' AS scope_category_keys,
  collab_detail -> 'scopeMenuIds' AS scope_menu_ids,
  collab_detail ->> 'scopeChicken' AS legacy_chicken,
  collab_detail ->> 'scopeKorean' AS legacy_korean,
  collab_detail ->> 'posDiscountType' AS pos_discount_type,
  (collab_detail ->> 'posDiscountValue')::numeric AS pos_discount_value,
  CASE
    WHEN COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb) ? 'Promotion'
      OR COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb) ? '프로모션'
      THEN 'ok: Promotion in scope mains'
    WHEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        COALESCE(collab_detail -> 'scopeCategoryKeys', '[]'::jsonb)
      ) AS k(key)
      WHERE lower(split_part(k.key, '::', 1)) IN ('promotion', '프로모션')
    )
      THEN 'ok: Promotion in scope category keys'
    ELSE 'likely: promo/set lines excluded (add Promotion to scope)'
  END AS promo_scope_check
FROM marketing_campaigns
WHERE campaign_no::text = '261005'
   OR id = 68
   OR topic ILIKE '%พนักงานตึก%CW%'
   OR topic ILIKE '%CW%Tower%'
ORDER BY id;
