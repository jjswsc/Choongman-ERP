-- ============================================================
-- pos_menus 백업 / 복구 (Supabase SQL Editor에서 실행)
-- ============================================================
-- 1) "이틀 전" 복구 가능 여부
--    - Supabase는 테이블 단위 시점 복구를 지원하지 않습니다.
--    - Pro 플랜 PITR(Point-in-Time Recovery): DB 전체를 이틀 전 시점으로
--      복구한 뒤, 그 복구본에서 pos_menus만 export → 현재 프로젝트에 다시 넣는
--      방식으로만 가능합니다. (복구는 새 프로젝트 생성 또는 지원 문의)
--    - 이틀 전에 수동으로 만든 백업 테이블(아래 2번)이 있으면, 4번 복구로 되돌릴 수 있습니다.
--
-- 2) 지금 시점 백업 (매일/변경 전 실행 권장)
--    아래에서 백업일(YYYYMMDD)만 바꿔서 실행하세요.
-- ============================================================

-- ---------- 2) 백업: 현재 pos_menus → pos_menus_backup_YYYYMMDD ----------
-- (실행 전 날짜만 수정하세요. 예: 20250317)
DO $$
DECLARE
  backup_suffix TEXT := to_char(NOW() - INTERVAL '0 days', 'YYYYMMDD');  -- 오늘 날짜
  tbl TEXT := 'pos_menus_backup_' || backup_suffix;
  q_create TEXT;
  q_insert  TEXT;
BEGIN
  q_create := format(
    'CREATE TABLE IF NOT EXISTS %I (LIKE public.pos_menus INCLUDING DEFAULTS)',
    tbl
  );
  EXECUTE q_create;
  EXECUTE format('TRUNCATE %I', tbl);
  q_insert := format('INSERT INTO %I SELECT * FROM public.pos_menus', tbl);
  EXECUTE q_insert;
  RAISE NOTICE 'Backup done: % (% rows)', tbl, (SELECT COUNT(*) FROM public.pos_menus);
END $$;

-- 백업 테이블 목록 확인 (필요 시)
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'pos_menus_backup_%' ORDER BY tablename DESC;

-- ---------- 3) 이틀 전 백업 테이블이 있을 때: 해당 날짜 확인 ----------
-- (예: 20250315가 이틀 전 백업이라면)
-- SELECT * FROM pos_menus_backup_20250315 LIMIT 5;

-- ---------- 4) 복구: 백업 테이블 → pos_menus (현재 테이블을 백업으로 덮어씀) ----------
-- 주의: 실행 전 반드시 위 2번으로 "현재 pos_menus"를 다른 백업 테이블로 한 번 더 백업해 두세요.
-- 복구 시 pos_menus를 TRUNCATE CASCADE 하면 pos_menu_options, pos_menu_ingredients,
-- pos_promo_items 등 해당 메뉴를 참조하는 데이터도 함께 삭제됩니다. 복구 후 옵션/재료는
-- 백업이 따로 없으면 비어 있는 상태가 됩니다.
-- 아래에서 복구할 백업 테이블명(날짜)만 바꿔서 실행하세요.

/*
DO $$
DECLARE
  restore_from TEXT := 'pos_menus_backup_20250315';  -- 이틀 전 백업 테이블로 변경
  q_insert TEXT;
BEGIN
  TRUNCATE public.pos_menus RESTART IDENTITY CASCADE;
  q_insert := format('INSERT INTO public.pos_menus SELECT * FROM %I', restore_from);
  EXECUTE q_insert;
  RAISE NOTICE 'Restored pos_menus from %', restore_from;
END $$;
*/
