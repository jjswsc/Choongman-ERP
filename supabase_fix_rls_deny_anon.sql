-- ============================================================
-- Supabase 보안 조치: anon 키로의 직접 DB 접근 차단
-- 
-- 배경: "Allow all for anon" 등 USING(true) 정책으로
--       anon 키만으로 전체 데이터 접근이 가능했던 취약점 해결.
--
-- 적용 후: 서버는 SUPABASE_SERVICE_ROLE_KEY 사용 (RLS 우회)
--         anon 키로 직접 호출 시 접근 거부됨.
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

DO $$
DECLARE
  r RECORD;
  dropped_count INT := 0;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    AND policyname LIKE 'Allow all%'
  ) LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      dropped_count := dropped_count + 1;
      RAISE NOTICE 'Dropped: %.% (%)', r.schemaname, r.tablename, r.policyname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to drop % on %.%: %', r.policyname, r.schemaname, r.tablename, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Total policies dropped: %', dropped_count;
END $$;
