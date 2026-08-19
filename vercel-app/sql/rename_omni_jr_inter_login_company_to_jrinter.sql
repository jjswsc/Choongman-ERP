-- JR Inter 로그인 회사·대리점 ID를 jrinter 로 변경 + 비밀번호 1234
-- ⚠️ Omni Supabase에서만 실행. 충만 DB 금지.
-- 로그인: 회사 jrinter · 이름 admin · 비밀번호 1234

BEGIN;

INSERT INTO public.saas_partners (id, name, default_margin_pct, is_active)
VALUES ('jrinter', 'JR Inter', 15, true)
ON CONFLICT (id) DO UPDATE
SET
  is_active = true,
  updated_at = now();

UPDATE public.saas_partners AS dest
SET
  name = src.name,
  default_margin_pct = src.default_margin_pct,
  updated_at = now()
FROM public.saas_partners AS src
WHERE dest.id = 'jrinter'
  AND src.id = 'jr-inter';

UPDATE public.saas_partner_users
SET partner_id = 'jrinter'
WHERE partner_id = 'jr-inter';

DO $$
BEGIN
  IF to_regclass('public.tenant_partner_assignments') IS NOT NULL THEN
    UPDATE public.tenant_partner_assignments
    SET partner_id = 'jrinter'
    WHERE partner_id = 'jr-inter';
  END IF;
  IF to_regclass('public.saas_partner_margin_rules') IS NOT NULL THEN
    UPDATE public.saas_partner_margin_rules
    SET partner_id = 'jrinter'
    WHERE partner_id = 'jr-inter';
  END IF;
  IF to_regclass('public.saas_partner_settlements') IS NOT NULL THEN
    UPDATE public.saas_partner_settlements
    SET partner_id = 'jrinter'
    WHERE partner_id = 'jr-inter';
  END IF;
END $$;

UPDATE public.employees
SET
  company = 'jrinter',
  password = '$2b$10$pTOZEBMGirq4G1Qs40r2z.9i.flpbN30yUDs7/yd4rVslesSMcKsO',
  role = 'Manager',
  job = 'manager'
WHERE trim(store) = 'Partner'
  AND trim(name) = 'admin';

DELETE FROM public.saas_partners
WHERE id = 'jr-inter';

COMMIT;
