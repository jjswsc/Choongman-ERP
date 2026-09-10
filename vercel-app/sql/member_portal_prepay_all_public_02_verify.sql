-- 선결제 공개 매장 설정 확인 (all_public = true 이어야 일반 매장 QR)

SELECT key, value_json, updated_at
FROM public.system_settings
WHERE key IN (
    'member_portal_prepay_enabled',
    'member_portal_prepay_store_codes',
    'member_portal_prepay_all_public_stores'
  )
  OR key LIKE 'member_portal_prepay_enabled:%'
  OR key LIKE 'member_portal_prepay_store_codes:%'
  OR key LIKE 'member_portal_prepay_all_public_stores:%'
ORDER BY key;
