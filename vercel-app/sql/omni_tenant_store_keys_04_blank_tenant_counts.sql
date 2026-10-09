-- Omni만. 법인에 안 붙고 빈 tenant_id 로 남은 행. 화면 조회에서는 빠진다.
SELECT 'pos_printer_settings' AS tbl,
       count(*) FILTER (WHERE btrim(coalesce(tenant_id, '')) IN ('', 'default')) AS blank_or_default,
       count(*) AS total
FROM public.pos_printer_settings
UNION ALL
SELECT 'pos_table_layouts',
       count(*) FILTER (WHERE btrim(coalesce(tenant_id, '')) IN ('', 'default')),
       count(*)
FROM public.pos_table_layouts
UNION ALL
SELECT 'pos_qr_order_store_settings',
       count(*) FILTER (WHERE btrim(coalesce(tenant_id, '')) IN ('', 'default')),
       count(*)
FROM public.pos_qr_order_store_settings
UNION ALL
SELECT 'pos_connected_devices',
       count(*) FILTER (WHERE btrim(coalesce(tenant_id, '')) IN ('', 'default')),
       count(*)
FROM public.pos_connected_devices
UNION ALL
SELECT 'payroll_records',
       count(*) FILTER (WHERE btrim(coalesce(tenant_id, '')) IN ('', 'default')),
       count(*)
FROM public.payroll_records
UNION ALL
SELECT 'schedules',
       count(*) FILTER (WHERE btrim(coalesce(tenant_id, '')) IN ('', 'default')),
       count(*)
FROM public.schedules
UNION ALL
SELECT 'pos_menu_store_scopes',
       count(*) FILTER (WHERE btrim(coalesce(tenant_id, '')) IN ('', 'default')),
       count(*)
FROM public.pos_menu_store_scopes
UNION ALL
SELECT 'members',
       count(*) FILTER (WHERE btrim(coalesce(tenant_id, '')) IN ('', 'default')),
       count(*)
FROM public.members
ORDER BY 1;
