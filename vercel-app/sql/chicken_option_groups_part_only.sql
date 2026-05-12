-- 치킨 메뉴(code starts with 'c')의 옵션 단계를 part 단일로 통일
-- 실행 전/후 확인:
-- 1) SELECT code, option_selection_groups, option_selection_config FROM pos_menus WHERE lower(code) LIKE 'c%';
-- 2) 관리자 > POS 메뉴 > 옵션 구성에서 [단계 저장] 없이도 치킨은 part만 보이는지 확인

UPDATE public.pos_menus
SET
  option_selection_groups = '["part"]'::jsonb,
  option_selection_config = jsonb_build_array(
    jsonb_build_object(
      'key', 'part',
      'label', COALESCE(
        (
          SELECT NULLIF(cfg->>'label', '')
          FROM jsonb_array_elements(COALESCE(pos_menus.option_selection_config, '[]'::jsonb)) cfg
          WHERE lower(COALESCE(cfg->>'key', '')) = 'part'
          LIMIT 1
        ),
        'part'
      ),
      'audience', COALESCE(
        (
          SELECT CASE
            WHEN lower(COALESCE(cfg->>'audience', '')) IN ('all', 'hall', 'delivery')
              THEN lower(cfg->>'audience')
            ELSE NULL
          END
          FROM jsonb_array_elements(COALESCE(pos_menus.option_selection_config, '[]'::jsonb)) cfg
          WHERE lower(COALESCE(cfg->>'key', '')) = 'part'
          LIMIT 1
        ),
        'all'
      ),
      'required', COALESCE(
        (
          SELECT (COALESCE(cfg->>'required', 'true'))::boolean
          FROM jsonb_array_elements(COALESCE(pos_menus.option_selection_config, '[]'::jsonb)) cfg
          WHERE lower(COALESCE(cfg->>'key', '')) = 'part'
          LIMIT 1
        ),
        true
      ),
      'minSelect', COALESCE(
        (
          SELECT GREATEST(0, COALESCE((cfg->>'minSelect')::int, 1))
          FROM jsonb_array_elements(COALESCE(pos_menus.option_selection_config, '[]'::jsonb)) cfg
          WHERE lower(COALESCE(cfg->>'key', '')) = 'part'
          LIMIT 1
        ),
        1
      ),
      'maxSelect', COALESCE(
        (
          SELECT GREATEST(1, COALESCE((cfg->>'maxSelect')::int, 1))
          FROM jsonb_array_elements(COALESCE(pos_menus.option_selection_config, '[]'::jsonb)) cfg
          WHERE lower(COALESCE(cfg->>'key', '')) = 'part'
          LIMIT 1
        ),
        1
      )
    )
  )
WHERE lower(COALESCE(code, '')) LIKE 'c%';
