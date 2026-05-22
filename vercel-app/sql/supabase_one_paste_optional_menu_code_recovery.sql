-- ============================================================
-- supabase_one_paste_optional_menu_code_recovery.sql
-- ⚠️ 메인 one-paste 가 아님. DB 상태 확인 후에만 실행.
--
-- 용도: K001~K003 / T001~T003 코드가 잘못 매핑된 특정 DB 복구
-- 실행 전: pos_menus id·code 가 아래 주석의 전제와 맞는지 SQL Editor에서 확인
--
-- 메인 일괄 스크립트:
--   sql/supabase_one_paste_accounting_and_pos_printer_cut_clean.sql
-- ============================================================

-- ---------- K001/K002/K003 도시락 코드 복구 (id 1,2,3 ↔ 69,67,68 전제) ----------
-- 사전 확인: select id, code, name from pos_menus where id in (1,2,3,67,68,69) order by id;

BEGIN;

WITH mapping AS (
  SELECT 1::BIGINT AS wrong_id, 69::BIGINT AS correct_id, 'K001'::TEXT AS canonical_code
  UNION ALL SELECT 2, 67, 'K002'
  UNION ALL SELECT 3, 68, 'K003'
)
INSERT INTO pos_menu_store_scopes (menu_id, store_code, enabled)
SELECT m.correct_id, s.store_code, TRUE
FROM mapping m
JOIN pos_menu_store_scopes s ON s.menu_id = m.wrong_id
WHERE trim(COALESCE(s.store_code, '')) <> ''
  AND s.enabled IS DISTINCT FROM FALSE
ON CONFLICT (store_code, menu_id) DO UPDATE SET enabled = TRUE;

WITH mapping AS (
  SELECT 1::BIGINT AS wrong_id, 69::BIGINT AS correct_id, 'K001'::TEXT AS canonical_code
  UNION ALL SELECT 2, 67, 'K002'
  UNION ALL SELECT 3, 68, 'K003'
)
UPDATE pos_menus pm
SET code = concat('RECOVER_TMP_', pm.id)
FROM mapping m
WHERE pm.id = m.wrong_id;

WITH mapping AS (
  SELECT 1::BIGINT AS wrong_id, 69::BIGINT AS correct_id, 'K001'::TEXT AS canonical_code
  UNION ALL SELECT 2, 67, 'K002'
  UNION ALL SELECT 3, 68, 'K003'
)
UPDATE pos_menus pm
SET code = m.canonical_code, is_active = TRUE
FROM mapping m
WHERE pm.id = m.correct_id;

COMMIT;

-- ---------- T001~T003 떡볶이 코드 (id 1,2,3 이 RECOVER_TMP_* 상태일 때) ----------
-- 사전 확인: select id, code, name from pos_menus where id in (1,2,3) or upper(code) in ('T001','T002','T003');

BEGIN;

WITH mapping AS (
  SELECT 1::BIGINT AS menu_id, 'T001'::TEXT AS target_code
  UNION ALL SELECT 2, 'T002'
  UNION ALL SELECT 3, 'T003'
),
conflict AS (
  SELECT m.menu_id, m.target_code, pm.id AS conflict_id
  FROM mapping m
  JOIN pos_menus pm ON lower(trim(pm.code)) = lower(trim(m.target_code)) AND pm.id <> m.menu_id
)
UPDATE pos_menus pm
SET code = concat('RECOVER_T_CONFLICT_', pm.id)
FROM conflict c
WHERE pm.id = c.conflict_id;

WITH mapping AS (
  SELECT 1::BIGINT AS menu_id, 'T001'::TEXT AS target_code
  UNION ALL SELECT 2, 'T002'
  UNION ALL SELECT 3, 'T003'
)
UPDATE pos_menus pm
SET code = m.target_code, is_active = TRUE
FROM mapping m
WHERE pm.id = m.menu_id;

COMMIT;

-- 이후 권장: sql/pos_menu_option_code_prefix_autofix.sql (메인 one-paste §7에 포함됨)
