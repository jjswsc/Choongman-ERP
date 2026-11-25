-- PO 청구 비율 버전(적용 시작일). 매장·effective_from 당 1행.
-- 영업 중 실행 가능(pos_orders Realtime 미사용).
-- 다음 파일: po_billing_rate_versions_02_backfill.sql

CREATE TABLE IF NOT EXISTS public.po_billing_rate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL,
  effective_from date NOT NULL,
  royalty_pct numeric NOT NULL DEFAULT 0,
  delivery_gp_pct numeric NOT NULL DEFAULT 0,
  grab_gp_pct numeric NOT NULL DEFAULT 0,
  label_royalty text,
  label_delivery_gp text,
  label_grab_gp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT po_billing_rate_versions_store_from_uq UNIQUE (store_name, effective_from)
);

COMMENT ON TABLE public.po_billing_rate_versions IS
  'PO 로얄티·배달 GP·Grab GP 청구 비율 버전. 일자 D의 비율 = effective_from <= D 중 최신';
COMMENT ON COLUMN public.po_billing_rate_versions.effective_from IS
  '방콕 달력 적용 시작일(YYYY-MM-DD). 종료는 다음 버전의 effective_from으로 암묵 결정';

CREATE INDEX IF NOT EXISTS po_billing_rate_versions_store_from_idx
  ON public.po_billing_rate_versions (store_name, effective_from DESC);

ALTER TABLE IF EXISTS public.po_billing_settings
  ADD COLUMN IF NOT EXISTS effective_from date;

COMMENT ON COLUMN public.po_billing_settings.effective_from IS
  '현재 스냅샷에 반영된 버전 적용 시작일(오늘 방콕 기준 유효 버전)';

ALTER TABLE public.po_billing_rate_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all po_billing_rate_versions" ON public.po_billing_rate_versions;
CREATE POLICY "Allow all po_billing_rate_versions"
  ON public.po_billing_rate_versions
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('po_billing_rate_versions_01_table.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
