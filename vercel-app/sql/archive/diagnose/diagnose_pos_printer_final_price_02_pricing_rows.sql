-- Omni 진단: pos_printer_settings 의 서비스비·반올림·법인 값 (변경 없음)
-- 공유 매장코드(예: 1000)면 행이 1개만 있어도 여러 법인이 같은 행을 읽고/덮어쓸 수 있음.

SELECT
  coalesce(nullif(btrim(p.tenant_id), ''), '(blank)') AS tenant_id,
  p.store_code,
  p.service_rate,
  p.service_mode,
  p.vat_rate,
  p.vat_mode,
  p.fee_stack_mode,
  p.payment_total_rounding_mode,
  p.updated_at AT TIME ZONE 'Asia/Bangkok' AS updated_at_bkk
FROM public.pos_printer_settings p
WHERE lower(btrim(p.store_code)) IN (
  SELECT lower(btrim(es.store_code))
  FROM public.erp_stores es
  WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
    AND nullif(btrim(es.store_code), '') IS NOT NULL
  GROUP BY lower(btrim(es.store_code))
  HAVING count(DISTINCT es.tenant_id) > 1
)
OR lower(btrim(coalesce(p.tenant_id, ''))) IN ('banjoo')
ORDER BY p.store_code, p.tenant_id;
