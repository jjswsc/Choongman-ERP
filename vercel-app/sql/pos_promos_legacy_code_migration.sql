-- 레거시 POS 프로모션 코드(P0001 등) → 캠페인 고유번호 기반 `{base}-S01` 형식으로 이관 (선택 실행)
--
-- ★ 먼저 아래 0) 블록을 실행하세요. (에러 42703: column marketing_campaign_id does not exist → 컬럼 미적용 DB)
-- 이후 관리자 앱에서 프로모션을 캠페인에 연결해 marketing_campaign_id 가 채워진 행만 이 스크립트 대상이 됩니다.
-- 실행 전 Supabase 백업 권장. pos_menus 미러 메뉴가 code를 참조하면 앱/배치로 동기화 필요할 수 있음.

-- 0) 컬럼 추가 (이미 있으면 스킵) — sql/pos_promo_extensions.sql 과 동일
ALTER TABLE public.pos_promos
  ADD COLUMN IF NOT EXISTS marketing_campaign_id bigint;

COMMENT ON COLUMN public.pos_promos.marketing_campaign_id IS
  'marketing_campaigns.id (선택). FK는 필요 시 별도 추가.';

-- 1) 미리보기: 바꿀 후보와 충돌 여부
WITH legacy AS (
  SELECT
    p.id,
    p.code AS old_code,
    p.marketing_campaign_id,
    COALESCE(
      NULLIF(
        regexp_replace(
          regexp_replace(trim(c.campaign_no), '[^A-Za-z0-9_-]', '_', 'g'),
          '_+',
          '_',
          'g'
        ),
        ''
      ),
      'C' || c.id::text
    ) AS base
  FROM public.pos_promos p
  INNER JOIN public.marketing_campaigns c ON c.id = p.marketing_campaign_id
  WHERE p.marketing_campaign_id IS NOT NULL
    AND p.code ~* '^P[0-9]+$'
),
ranked AS (
  SELECT
    id,
    old_code,
    marketing_campaign_id,
    base,
    row_number() OVER (PARTITION BY marketing_campaign_id ORDER BY id) AS rn
  FROM legacy
),
suggested AS (
  SELECT
    id,
    old_code,
    base || '-S' || lpad(rn::text, 2, '0') AS new_code
  FROM ranked
)
SELECT
  s.id,
  s.old_code,
  s.new_code,
  EXISTS (SELECT 1 FROM public.pos_promos p2 WHERE p2.code = s.new_code AND p2.id <> s.id) AS new_code_taken_by_other_row
FROM suggested s
ORDER BY s.id;

-- 2) 실제 반영 (충돌 없는 행만). 아래 주석을 해제하고 트랜잭션 안에서 실행하세요.
/*
BEGIN;

WITH legacy AS (
  SELECT
    p.id,
    p.code AS old_code,
    p.marketing_campaign_id,
    COALESCE(
      NULLIF(
        regexp_replace(
          regexp_replace(trim(c.campaign_no), '[^A-Za-z0-9_-]', '_', 'g'),
          '_+',
          '_',
          'g'
        ),
        ''
      ),
      'C' || c.id::text
    ) AS base
  FROM public.pos_promos p
  INNER JOIN public.marketing_campaigns c ON c.id = p.marketing_campaign_id
  WHERE p.marketing_campaign_id IS NOT NULL
    AND p.code ~* '^P[0-9]+$'
),
ranked AS (
  SELECT
    id,
    old_code,
    base,
    row_number() OVER (PARTITION BY marketing_campaign_id ORDER BY id) AS rn
  FROM legacy
),
suggested AS (
  SELECT
    id,
    base || '-S' || lpad(rn::text, 2, '0') AS new_code
  FROM ranked
),
safe AS (
  SELECT s.id, s.new_code
  FROM suggested s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.pos_promos p2 WHERE p2.code = s.new_code AND p2.id <> s.id
  )
)
UPDATE public.pos_promos p
SET code = x.new_code
FROM safe x
WHERE p.id = x.id;

COMMIT;
*/
