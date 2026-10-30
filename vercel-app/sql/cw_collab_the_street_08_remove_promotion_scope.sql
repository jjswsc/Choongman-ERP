-- 적용 — CW(261005) scope 에서 Promotion 제거 (프로모/세트는 협업 할인 제외)
-- Korean·Side 는 mains 유지, category keys 는 [] 유지 (Chicken::* AND 함정 재발 방지).
-- 영업 중 안전: marketing_campaigns 만 수정.

UPDATE marketing_campaigns
SET collab_detail = jsonb_set(
  COALESCE(collab_detail, '{}'::jsonb),
  '{scopeMainCategories}',
  (
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x), '[]'::jsonb)
    FROM (
      SELECT DISTINCT trim(both FROM v) AS x
      FROM jsonb_array_elements_text(
        COALESCE(collab_detail -> 'scopeMainCategories', '[]'::jsonb)
      ) AS t(v)
      WHERE trim(both FROM v) <> ''
        AND lower(trim(both FROM v)) NOT IN ('promotion', '프로모션')
    ) d
  ),
  true
)
WHERE campaign_no::text = '261005'
  AND id = 68
  AND collab_management IS TRUE;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('cw_collab_the_street_08_remove_promotion_scope.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
