-- ============================================================
-- 치킨 메뉴: S+순살 옵션 제거 (기본가 = S 순살 기준, 옵션 목록에서 제외)
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- 
-- ※ 실행 전 백업 권장
-- ※ POS에 '기본 (S 순살)' 버튼이 추가된 후 실행
-- ============================================================

-- 1. 삭제 대상: Chicken 메뉴 중 option_step_values가 S+순살인 옵션
--    (size='S' AND (bone='순살' OR part='순살'))
WITH to_delete AS (
  SELECT o.id, o.menu_id
  FROM pos_menu_options o
  JOIN pos_menus m ON m.id = o.menu_id
  WHERE (m.category_main = 'Chicken' OR m.category_main IS NULL AND m.category ILIKE '%chicken%')
    AND o.option_step_values IS NOT NULL
    AND (
      (o.option_step_values->>'size' = 'S' AND (o.option_step_values->>'bone' = '순살' OR o.option_step_values->>'part' = '순살'))
      OR (o.name ILIKE '%S%순살%' AND (o.price_modifier IS NULL OR o.price_modifier = 0))
    )
)
-- 2. 재료 연결을 메뉴 기본(option_id=null)으로 이동
UPDATE pos_menu_ingredients i
SET option_id = NULL
FROM to_delete d
WHERE i.option_id = d.id;

-- 3. 프로모 연결 해제 (option_id=null)
UPDATE pos_promos p
SET option_id = NULL
FROM to_delete d
WHERE p.option_id = d.id;

-- 4. S+순살 옵션 삭제
DELETE FROM pos_menu_options
WHERE id IN (
  SELECT o.id
  FROM pos_menu_options o
  JOIN pos_menus m ON m.id = o.menu_id
  WHERE (m.category_main = 'Chicken' OR (m.category_main IS NULL AND m.category ILIKE '%chicken%'))
    AND o.option_step_values IS NOT NULL
    AND (
      (o.option_step_values->>'size' = 'S' AND (o.option_step_values->>'bone' = '순살' OR o.option_step_values->>'part' = '순살'))
      OR (o.name ILIKE '%S%순살%' AND (o.price_modifier IS NULL OR o.price_modifier = 0))
    )
);
