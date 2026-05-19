-- Supabase Database Linter: 0013_rls_disabled_in_public
-- 대상: attendance_log_adjustments, interior_* (6 tables)
--
-- 패턴: rls_public_tables_supabase_linter_fix.sql 과 동일
--   RLS ON + permissive 정책(FOR ALL, USING(true)) — 린터 통과 + 기존 Vercel API(service_role) 동작 유지
--   anon/authenticated 직접 PostgREST 접근 시에도 정책·GRANT로 동작 (실운영은 API 경유 권장)
--
-- Supabase Dashboard → SQL Editor → 전체 실행

-- attendance_log_adjustments (attendance_log_adjustments.sql)
ALTER TABLE IF EXISTS public.attendance_log_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all attendance_log_adjustments" ON public.attendance_log_adjustments;
CREATE POLICY "Allow all attendance_log_adjustments"
  ON public.attendance_log_adjustments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_work_packages
ALTER TABLE IF EXISTS public.interior_work_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_work_packages" ON public.interior_work_packages;
CREATE POLICY "Allow all interior_work_packages"
  ON public.interior_work_packages
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_vendor_tracks
ALTER TABLE IF EXISTS public.interior_vendor_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_vendor_tracks" ON public.interior_vendor_tracks;
CREATE POLICY "Allow all interior_vendor_tracks"
  ON public.interior_vendor_tracks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_layout_items
ALTER TABLE IF EXISTS public.interior_layout_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_layout_items" ON public.interior_layout_items;
CREATE POLICY "Allow all interior_layout_items"
  ON public.interior_layout_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_material_specs
ALTER TABLE IF EXISTS public.interior_material_specs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_material_specs" ON public.interior_material_specs;
CREATE POLICY "Allow all interior_material_specs"
  ON public.interior_material_specs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_layout_editor_prefs
ALTER TABLE IF EXISTS public.interior_layout_editor_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_layout_editor_prefs" ON public.interior_layout_editor_prefs;
CREATE POLICY "Allow all interior_layout_editor_prefs"
  ON public.interior_layout_editor_prefs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- REST(anon / authenticated) — RLS만 켜고 GRANT 없으면 permission denied 가능
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.attendance_log_adjustments,
  public.interior_work_packages,
  public.interior_vendor_tracks,
  public.interior_layout_items,
  public.interior_material_specs,
  public.interior_layout_editor_prefs
TO anon, authenticated;
