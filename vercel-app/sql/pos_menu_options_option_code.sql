-- POS 메뉴 옵션 고유 코드(option_code) 도입
-- 목표: 메뉴별 고유 코드 형태(예: C001-1)를 저장/조회 표준으로 사용

ALTER TABLE pos_menu_options
ADD COLUMN IF NOT EXISTS option_code text;

-- 기존 옵션코드를 메뉴별 순번으로 재정렬해 중복 없이 백필
-- (중복/누락/정렬 꼬임 데이터가 있어도 안전하게 재생성)
WITH numbered AS (
  SELECT
    pmo.id,
    concat(
      COALESCE(NULLIF(btrim(pm.code), ''), concat('M', pmo.menu_id::text)),
      '-',
      ROW_NUMBER() OVER (
        PARTITION BY pmo.menu_id
        ORDER BY COALESCE(pmo.sort_order, 0), pmo.id
      )::text
    ) AS next_option_code
  FROM pos_menu_options pmo
  JOIN pos_menus pm ON pm.id = pmo.menu_id
)
UPDATE pos_menu_options pmo
SET option_code = numbered.next_option_code
FROM numbered
WHERE numbered.id = pmo.id;

-- 인덱스 재생성 (기존 실패/부분 생성 이력 정리)
DROP INDEX IF EXISTS uq_pos_menu_options_menu_id_option_code;

-- 메뉴별 고유 보장 (NULL/빈값은 허용: 구버전 호환)
CREATE UNIQUE INDEX uq_pos_menu_options_menu_id_option_code
ON pos_menu_options(menu_id, option_code)
WHERE option_code IS NOT NULL AND btrim(option_code) <> '';

COMMENT ON COLUMN pos_menu_options.option_code IS '메뉴별 고유 옵션 코드 (예: C001-1)';

-- 운영 규칙 메모:
-- 신규/복사 저장은 API에서 menu_id 단위 고유성을 재검증하고
-- 충돌 시 menu_code-{next_suffix}로 자동 재매핑한다.
