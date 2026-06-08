-- Grab partner ID 껍데기(1040/1042/1043)·비운영 test/HQ erp_stores 정리
-- Supabase SQL Editor: 아래 「▼ 복사 시작」~「▲ 복사 끝」 전체 선택 후 Run (한 번에)
--
-- ▼ 복사 시작

-- 1) 정식 매장 aliases에 partner ID 추가
WITH g(partner_id, canon_code) AS (
  VALUES
    ('1040'::text, 'CM True Digital'),
    ('1042', 'CM Silom'),
    ('1043', 'CM Ekkamai')
),
pairs AS (
  SELECT g.partner_id AS shell_code, g.canon_code
  FROM g
  JOIN public.erp_stores shell ON shell.store_code = g.partner_id
  JOIN public.erp_stores canon ON canon.store_code = g.canon_code
  WHERE shell.is_active IS DISTINCT FROM false
    AND canon.is_active IS DISTINCT FROM false
)
UPDATE public.erp_stores e
SET
  aliases = (
    SELECT array(
      SELECT DISTINCT trim(x)
      FROM unnest(array_cat(coalesce(e.aliases, '{}'::text[]), array[p.shell_code])) AS t(x)
      WHERE trim(coalesce(x, '')) <> ''
      ORDER BY trim(x)
    )
  ),
  updated_at = now()
FROM pairs p
WHERE e.store_code = p.canon_code
  AND NOT (coalesce(e.aliases, '{}'::text[]) @> array[p.shell_code]);

-- 2) Grab partner ID 껍데기 비활성화
WITH g(partner_id, canon_code) AS (
  VALUES
    ('1040'::text, 'CM True Digital'),
    ('1042', 'CM Silom'),
    ('1043', 'CM Ekkamai')
)
UPDATE public.erp_stores shell
SET is_active = false, updated_at = now()
FROM g
JOIN public.erp_stores canon ON canon.store_code = g.canon_code
WHERE shell.store_code = g.partner_id
  AND shell.is_active IS DISTINCT FROM false
  AND canon.is_active IS DISTINCT FROM false;

-- 3) test·HQ 등 비운영 샌드박스 매장 비활성화 (CM Office 등 본사 POS 시연용은 유지)
UPDATE public.erp_stores
SET is_active = false, updated_at = now()
WHERE is_active IS DISTINCT FROM false
  AND lower(trim(store_code)) IN ('test', 'hq');

-- 확인
SELECT store_code, display_name, is_active, aliases
FROM public.erp_stores
WHERE store_code IN ('1040', '1042', '1043', 'CM True Digital', 'CM Silom', 'CM Ekkamai', 'test', 'HQ', 'hq')
   OR store_code ~ '^\d{3,6}$'
ORDER BY is_active DESC, display_name, store_code;

-- ▲ 복사 끝
