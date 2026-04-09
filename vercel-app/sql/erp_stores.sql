-- 매장 마스터: 회계·POS·직원 매장을 store_code 기준으로 통일할 때 사용.
-- 비어 있으면 기존처럼 employees.store 문자열만으로 동작 (getStoreList 폴백).
--
-- 1) Supabase SQL Editor에서 실행
-- 2) store_code 는 pos_orders.store_code 와 동일하게 맞추는 것을 권장
-- 3) display_name / aliases 에 과거 employees.store 표기를 넣어 레거시와 매칭

CREATE TABLE IF NOT EXISTS public.erp_stores (
  store_code text PRIMARY KEY,
  display_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_stores_active_sort_idx
  ON public.erp_stores (is_active, sort_order, display_name);

COMMENT ON TABLE public.erp_stores IS 'ERP/POS 공통 매장 마스터; 비어 있으면 레거시 employees.store 전용 모드';

ALTER TABLE public.erp_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_stores_select_public" ON public.erp_stores;
CREATE POLICY "erp_stores_select_public"
  ON public.erp_stores
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true);

-- 선택: 시드 예시 (실제 코드·이름으로 수정 후 주석 해제)
-- INSERT INTO public.erp_stores (store_code, display_name, aliases, sort_order) VALUES
--   ('office', 'Office', ARRAY['본사','오피스','Office'], 0),
--   ('cm_ekamai', 'CM Ekamai', ARRAY['에까마이','CM Ekamai'], 10)
-- ON CONFLICT (store_code) DO UPDATE SET
--   display_name = EXCLUDED.display_name,
--   aliases = EXCLUDED.aliases,
--   sort_order = EXCLUDED.sort_order,
--   updated_at = now();
