-- 기존 po_billing_settings → 버전 1건 백필(effective_from = 2000-01-01).
-- 01_table.sql 실행 후 Run. 이미 버전이 있는 매장은 건너뜀(ON CONFLICT DO NOTHING).

INSERT INTO public.po_billing_rate_versions (
  store_name,
  effective_from,
  royalty_pct,
  delivery_gp_pct,
  grab_gp_pct,
  label_royalty,
  label_delivery_gp,
  label_grab_gp,
  created_at
)
SELECT
  trim(s.store_name),
  DATE '2000-01-01',
  COALESCE(s.royalty_pct, 0),
  COALESCE(s.delivery_gp_pct, 0),
  COALESCE(s.grab_gp_pct, 0),
  s.label_royalty,
  s.label_delivery_gp,
  s.label_grab_gp,
  COALESCE(s.updated_at, now())
FROM public.po_billing_settings s
WHERE trim(COALESCE(s.store_name, '')) <> ''
ON CONFLICT (store_name, effective_from) DO NOTHING;

UPDATE public.po_billing_settings s
SET effective_from = COALESCE(
  (
    SELECT v.effective_from
    FROM public.po_billing_rate_versions v
    WHERE v.store_name = s.store_name
      AND v.effective_from <= (timezone('Asia/Bangkok', now()))::date
    ORDER BY v.effective_from DESC
    LIMIT 1
  ),
  DATE '2000-01-01'
)
WHERE trim(COALESCE(s.store_name, '')) <> '';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('po_billing_rate_versions_02_backfill.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
