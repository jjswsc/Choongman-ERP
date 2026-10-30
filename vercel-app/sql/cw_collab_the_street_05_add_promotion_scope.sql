-- 적용 — CW 협업 scope 에 Promotion 대분류 추가 (프로모/세트 메뉴 할인 허용)
-- 실행 전: cw_collab_the_street_03_scope_check.sql · 04_menu_category_check.sql 로
--   promo_scope_check = 'likely: promo/set…' 이고 메뉴 category_main=Promotion 인지 확인.
-- 영업 중 안전: marketing_campaigns 만 수정 (pos_orders Realtime 무관).
-- 적용 후 POS 새로고침 → 협업 할인 다시 선택.

UPDATE marketing_campaigns
SET collab_detail = jsonb_set(
  COALESCE(collab_detail, '{}'::jsonb),
  '{scopeMainCategories}',
  (
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x), '[]'::jsonb)
    FROM (
      SELECT DISTINCT trim(both FROM v) AS x
      FROM (
        SELECT jsonb_array_elements_text(
          COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb)
        ) AS v
        UNION ALL
        SELECT 'Promotion'
      ) s
      WHERE trim(both FROM v) <> ''
    ) d
  ),
  true
)
WHERE (
    campaign_no::text = '261005'
    OR id = 68
  )
  AND collab_management IS TRUE
  AND NOT (
    COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb) ? 'Promotion'
    OR COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb) ? '프로모션'
  );

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('cw_collab_the_street_05_add_promotion_scope.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
