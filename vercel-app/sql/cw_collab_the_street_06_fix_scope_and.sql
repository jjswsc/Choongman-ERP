-- 적용 — CW(261005) scope 교집합 버그 수정
-- 문제: mains 에 Korean/Side 가 있어도 scopeCategoryKeys 가 Chicken::* 만이면
--       메뉴는 mains∩categories AND 로 판정 → Korean 삼겹살 콤보도 할인 0.
-- SEOUL 쿠้ม 세트는 Promotion 이라 기본 제외 → Promotion 대분류도 함께 추가.
-- 영업 중 안전: marketing_campaigns 만 수정.
-- 적용 후: 아래 검증 SELECT 는 별도 파일 07 을 Run. POS 새로고침 후 협업 할인 재선택.

UPDATE marketing_campaigns
SET collab_detail =
  jsonb_set(
    jsonb_set(
      COALESCE(collab_detail, '{}'::jsonb),
      '{scopeCategoryKeys}',
      '[]'::jsonb,
      true
    ),
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
WHERE campaign_no::text = '261005'
  AND id = 68
  AND collab_management IS TRUE;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('cw_collab_the_street_06_fix_scope_and.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
