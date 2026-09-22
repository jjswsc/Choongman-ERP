-- Omni만. 충만 DB에는 실행하지 마세요.
-- 앱 배포 후, 02 키 변경 다음에 실행하세요.
-- pos_orders 는 수정하지 않습니다.

DO $$
DECLARE
  dup int;
BEGIN
  IF to_regclass('public.pos_menu_store_scopes') IS NOT NULL THEN
    ALTER TABLE public.pos_menu_store_scopes ADD COLUMN IF NOT EXISTS tenant_id text;
    UPDATE public.pos_menu_store_scopes x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND lower(btrim(es.store_code)) = lower(btrim(x.store_code));
    UPDATE public.pos_menu_store_scopes
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.pos_menu_store_scopes ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.pos_menu_store_scopes ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, store_code, menu_id
      FROM public.pos_menu_store_scopes
      GROUP BY 1, 2, 3
      HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'pos_menu_store_scopes 법인+매장+메뉴 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.pos_menu_store_scopes'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) ILIKE '%tenant_id%store_code%menu_id%'
    ) THEN
      ALTER TABLE public.pos_menu_store_scopes DROP CONSTRAINT IF EXISTS pos_menu_store_scopes_pkey;
      ALTER TABLE public.pos_menu_store_scopes
        ADD CONSTRAINT pos_menu_store_scopes_pkey PRIMARY KEY (tenant_id, store_code, menu_id);
    END IF;
  END IF;

  IF to_regclass('public.tax_entities') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tax_entities' AND column_name = 'tenant_id'
     ) THEN
    UPDATE public.tax_entities
    SET tenant_id = ''
    WHERE tenant_id IS NULL;
    SELECT count(*) INTO dup FROM (
      SELECT coalesce(tenant_id, ''), entity_code
      FROM public.tax_entities
      GROUP BY 1, 2
      HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'tax_entities 법인+코드 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.tax_entities'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) ILIKE '%tenant_id%entity_code%'
    ) THEN
      ALTER TABLE public.tax_entities DROP CONSTRAINT IF EXISTS tax_entities_pkey;
      ALTER TABLE public.tax_entities ALTER COLUMN tenant_id SET DEFAULT '';
      ALTER TABLE public.tax_entities ALTER COLUMN tenant_id SET NOT NULL;
      ALTER TABLE public.tax_entities
        ADD CONSTRAINT tax_entities_pkey PRIMARY KEY (tenant_id, entity_code);
    END IF;
  END IF;

  IF to_regclass('public.tenants') IS NOT NULL THEN
    SELECT count(*) INTO dup FROM (
      SELECT lower(btrim(company_name))
      FROM public.tenants
      WHERE nullif(btrim(company_name), '') IS NOT NULL
      GROUP BY 1
      HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'tenants 회사명이 겹칩니다 %건. 이름을 나눈 뒤 다시 실행하세요', dup;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_company_name_norm
      ON public.tenants (lower(btrim(company_name)))
      WHERE nullif(btrim(company_name), '') IS NOT NULL;
  END IF;
END $$;
