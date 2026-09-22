-- Omni만. 두 번째 법인이 같은 메뉴코드·같은 매장+직원명으로 막히지 않게 합니다.
-- id 기본키, 프린터/테이블/단말 PK 는 앱 저장 키라 여기서 바꾸지 않습니다.
-- 충만 DB에는 실행하지 마세요.

DO $$
DECLARE
  dup int;
BEGIN
  IF to_regclass('public.pos_menus') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'ux_pos_menus_tenant_code_norm'
     ) THEN
    ALTER TABLE public.pos_menus DROP CONSTRAINT IF EXISTS idx_pos_menus_code;
    DROP INDEX IF EXISTS public.idx_pos_menus_code;
  ELSE
    RAISE NOTICE 'skip menus: ux_pos_menus_tenant_code_norm 이 없어 전역 code 유니크를 유지합니다';
  END IF;

  IF to_regclass('public.employees') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'tenant_id'
     ) THEN
    SELECT count(*) INTO dup
    FROM (
      SELECT coalesce(tenant_id, ''), lower(trim(store)), lower(trim(name))
      FROM public.employees
      GROUP BY 1, 2, 3
      HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'employees 같은 법인·매장·이름이 %건 중복입니다. 유니크를 바꾸기 전에 정리하세요', dup;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_store_name_key
      ON public.employees (coalesce(tenant_id, ''), lower(trim(store)), lower(trim(name)));
    ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_store_name_key;
    DROP INDEX IF EXISTS public.employees_store_name_key;
  END IF;

  IF to_regclass('public.members') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'tenant_id'
     ) THEN
    SELECT count(*) INTO dup
    FROM (
      SELECT coalesce(tenant_id, ''), lower(trim(referral_code))
      FROM public.members
      WHERE referral_code IS NOT NULL AND btrim(referral_code) <> ''
      GROUP BY 1, 2
      HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'members referral_code 법인 안 중복 %건', dup;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_members_tenant_referral_code
      ON public.members (coalesce(tenant_id, ''), lower(trim(referral_code)))
      WHERE referral_code IS NOT NULL AND btrim(referral_code) <> '';
    ALTER TABLE public.members DROP CONSTRAINT IF EXISTS uq_members_referral_code;
    DROP INDEX IF EXISTS public.uq_members_referral_code;
  END IF;
END $$;
