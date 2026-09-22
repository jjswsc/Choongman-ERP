-- Omni만. 충만 DB에는 실행하지 마세요.
-- 앱을 먼저 배포한 뒤에 실행하세요. 이 SQL을 먼저 돌리면 프린터·테이블·QR·단말 저장이 실패합니다.
-- pos_orders 는 수정하지 않습니다. 결제 영수증 자동인쇄와 무관합니다.
-- 01 미리보기가 0건일 때만 실행하세요.

DO $$
DECLARE
  amb int;
  dup int;
BEGIN
  IF to_regclass('public.erp_stores') IS NULL THEN
    RAISE EXCEPTION 'erp_stores 가 없습니다';
  END IF;

  SELECT count(*) INTO amb
  FROM (
    SELECT lower(btrim(store_code))
    FROM public.erp_stores
    WHERE nullif(btrim(tenant_id), '') IS NOT NULL
      AND nullif(btrim(store_code), '') IS NOT NULL
    GROUP BY 1
    HAVING count(DISTINCT tenant_id) > 1
  ) d;
  IF amb > 0 THEN
    RAISE EXCEPTION 'erp_stores 매장코드가 법인 여러 개에 걸렸습니다 (%건). 01 미리보기를 보고 정리하세요', amb;
  END IF;

  -- 프린터
  IF to_regclass('public.pos_printer_settings') IS NOT NULL THEN
    ALTER TABLE public.pos_printer_settings ADD COLUMN IF NOT EXISTS tenant_id text;
    UPDATE public.pos_printer_settings x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND lower(btrim(es.store_code)) = lower(btrim(x.store_code));
    UPDATE public.pos_printer_settings
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.pos_printer_settings ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.pos_printer_settings ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, store_code FROM public.pos_printer_settings
      GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'pos_printer_settings 법인+매장 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.pos_printer_settings'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) ILIKE '%tenant_id%store_code%'
    ) THEN
      ALTER TABLE public.pos_printer_settings DROP CONSTRAINT IF EXISTS pos_printer_settings_pkey;
      ALTER TABLE public.pos_printer_settings
        ADD CONSTRAINT pos_printer_settings_pkey PRIMARY KEY (tenant_id, store_code);
    END IF;
  END IF;

  -- 테이블 배치
  IF to_regclass('public.pos_table_layouts') IS NOT NULL THEN
    ALTER TABLE public.pos_table_layouts ADD COLUMN IF NOT EXISTS tenant_id text;
    UPDATE public.pos_table_layouts x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND lower(btrim(es.store_code)) = lower(btrim(x.store_code));
    UPDATE public.pos_table_layouts
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.pos_table_layouts ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.pos_table_layouts ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, store_code FROM public.pos_table_layouts
      GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'pos_table_layouts 법인+매장 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.pos_table_layouts'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) ILIKE '%tenant_id%store_code%'
    ) THEN
      ALTER TABLE public.pos_table_layouts DROP CONSTRAINT IF EXISTS pos_table_layouts_pkey;
      ALTER TABLE public.pos_table_layouts
        ADD CONSTRAINT pos_table_layouts_pkey PRIMARY KEY (tenant_id, store_code);
    END IF;
  END IF;

  -- QR 매장 설정
  IF to_regclass('public.pos_qr_order_store_settings') IS NOT NULL THEN
    ALTER TABLE public.pos_qr_order_store_settings ADD COLUMN IF NOT EXISTS tenant_id text;
    UPDATE public.pos_qr_order_store_settings x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND lower(btrim(es.store_code)) = lower(btrim(x.store_code));
    UPDATE public.pos_qr_order_store_settings
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.pos_qr_order_store_settings ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.pos_qr_order_store_settings ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, store_code FROM public.pos_qr_order_store_settings
      GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'pos_qr_order_store_settings 법인+매장 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.pos_qr_order_store_settings'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) ILIKE '%tenant_id%store_code%'
    ) THEN
      ALTER TABLE public.pos_qr_order_store_settings DROP CONSTRAINT IF EXISTS pos_qr_order_store_settings_pkey;
      ALTER TABLE public.pos_qr_order_store_settings
        ADD CONSTRAINT pos_qr_order_store_settings_pkey PRIMARY KEY (tenant_id, store_code);
    END IF;
  END IF;

  -- 단말
  IF to_regclass('public.pos_connected_devices') IS NOT NULL THEN
    ALTER TABLE public.pos_connected_devices ADD COLUMN IF NOT EXISTS tenant_id text;
    UPDATE public.pos_connected_devices x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND lower(btrim(es.store_code)) = lower(btrim(x.store_code));
    UPDATE public.pos_connected_devices
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.pos_connected_devices ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.pos_connected_devices ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, store_code, device_token FROM public.pos_connected_devices
      GROUP BY 1, 2, 3 HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'pos_connected_devices 법인+매장+단말 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.pos_connected_devices'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) ILIKE '%tenant_id%store_code%device_token%'
    ) THEN
      ALTER TABLE public.pos_connected_devices DROP CONSTRAINT IF EXISTS pos_connected_devices_pkey;
      ALTER TABLE public.pos_connected_devices
        ADD CONSTRAINT pos_connected_devices_pkey PRIMARY KEY (tenant_id, store_code, device_token);
    END IF;
  END IF;

  -- 세무 매장 프로필
  IF to_regclass('public.store_tax_filing_profiles') IS NOT NULL THEN
    ALTER TABLE public.store_tax_filing_profiles ADD COLUMN IF NOT EXISTS tenant_id text;
    UPDATE public.store_tax_filing_profiles x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND lower(btrim(es.store_code)) = lower(btrim(x.store_code));
    UPDATE public.store_tax_filing_profiles
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.store_tax_filing_profiles ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.store_tax_filing_profiles ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, store_code FROM public.store_tax_filing_profiles
      GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'store_tax_filing_profiles 법인+매장 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.store_tax_filing_profiles'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) ILIKE '%tenant_id%store_code%'
    ) THEN
      ALTER TABLE public.store_tax_filing_profiles DROP CONSTRAINT IF EXISTS store_tax_filing_profiles_pkey;
      ALTER TABLE public.store_tax_filing_profiles
        ADD CONSTRAINT store_tax_filing_profiles_pkey PRIMARY KEY (tenant_id, store_code);
    END IF;
  END IF;

  -- 세무 법인·매장 연결. tax_entities 의 entity_code PK 는 유지합니다.
  IF to_regclass('public.tax_entities') IS NOT NULL THEN
    ALTER TABLE public.tax_entities ADD COLUMN IF NOT EXISTS tenant_id text;
    SELECT count(*) INTO amb FROM (
      SELECT e.entity_code
      FROM public.tax_entities e
      JOIN public.tax_entity_stores l ON l.entity_code = e.entity_code
      JOIN public.erp_stores es ON lower(btrim(es.store_code)) = lower(btrim(l.store_code))
      WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
      GROUP BY e.entity_code
      HAVING count(DISTINCT es.tenant_id) > 1
    ) d;
    IF amb > 0 THEN
      RAISE EXCEPTION 'tax_entities 한 법인이 매장 테넌트 여러 개에 연결됨 %건', amb;
    END IF;
    UPDATE public.tax_entities e
    SET tenant_id = es.tenant_id
    FROM public.tax_entity_stores l
    JOIN public.erp_stores es ON lower(btrim(es.store_code)) = lower(btrim(l.store_code))
    WHERE e.entity_code = l.entity_code
      AND coalesce(btrim(e.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL;
  END IF;

  IF to_regclass('public.tax_entity_stores') IS NOT NULL THEN
    ALTER TABLE public.tax_entity_stores ADD COLUMN IF NOT EXISTS tenant_id text;
    UPDATE public.tax_entity_stores x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND lower(btrim(es.store_code)) = lower(btrim(x.store_code));
    UPDATE public.tax_entity_stores x
    SET tenant_id = e.tenant_id
    FROM public.tax_entities e
    WHERE x.entity_code = e.entity_code
      AND coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(e.tenant_id), '') IS NOT NULL
      AND btrim(e.tenant_id) <> 'default';
    UPDATE public.tax_entity_stores
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.tax_entity_stores ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.tax_entity_stores ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, entity_code, store_code FROM public.tax_entity_stores
      GROUP BY 1, 2, 3 HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'tax_entity_stores 법인+엔티티+매장 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.tax_entity_stores'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) ILIKE '%tenant_id%entity_code%store_code%'
    ) THEN
      ALTER TABLE public.tax_entity_stores DROP CONSTRAINT IF EXISTS tax_entity_stores_pkey;
      ALTER TABLE public.tax_entity_stores
        ADD CONSTRAINT tax_entity_stores_pkey PRIMARY KEY (tenant_id, entity_code, store_code);
    END IF;
  END IF;

  -- 급여. 제약은 인덱스가 아니라 CONSTRAINT 로 지웁니다.
  IF to_regclass('public.payroll_records') IS NOT NULL THEN
    ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS tenant_id text;
    SELECT count(*) INTO amb FROM public.payroll_records x
    WHERE (
      SELECT count(DISTINCT es.tenant_id)
      FROM public.erp_stores es
      WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
        AND (
          lower(btrim(es.store_code)) = lower(btrim(x.store))
          OR lower(btrim(coalesce(es.display_name, ''))) = lower(btrim(x.store))
        )
    ) > 1;
    IF amb > 0 THEN
      RAISE EXCEPTION 'payroll_records 매장명이 법인 여러 개에 걸림 %건', amb;
    END IF;
    UPDATE public.payroll_records x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND (
        lower(btrim(es.store_code)) = lower(btrim(x.store))
        OR lower(btrim(coalesce(es.display_name, ''))) = lower(btrim(x.store))
      );
    UPDATE public.payroll_records
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.payroll_records ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.payroll_records ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, month, store, name FROM public.payroll_records
      GROUP BY 1, 2, 3, 4 HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'payroll_records 법인+월+매장+이름 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.payroll_records'::regclass
        AND conname = 'payroll_records_tenant_month_store_name_key'
    ) THEN
      ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_month_store_name_key;
      DROP INDEX IF EXISTS public.payroll_records_month_store_name_key;
      ALTER TABLE public.payroll_records
        ADD CONSTRAINT payroll_records_tenant_month_store_name_key
        UNIQUE (tenant_id, month, store, name);
    END IF;
  END IF;

  -- 스케줄
  IF to_regclass('public.schedules') IS NOT NULL THEN
    ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS tenant_id text;
    SELECT count(*) INTO amb FROM public.schedules x
    WHERE (
      SELECT count(DISTINCT es.tenant_id)
      FROM public.erp_stores es
      WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
        AND (
          lower(btrim(es.store_code)) = lower(btrim(x.store_name))
          OR lower(btrim(coalesce(es.display_name, ''))) = lower(btrim(x.store_name))
        )
    ) > 1;
    IF amb > 0 THEN
      RAISE EXCEPTION 'schedules 매장명이 법인 여러 개에 걸림 %건', amb;
    END IF;
    UPDATE public.schedules x
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(btrim(x.tenant_id), '') IN ('', 'default')
      AND nullif(btrim(es.tenant_id), '') IS NOT NULL
      AND (
        lower(btrim(es.store_code)) = lower(btrim(x.store_name))
        OR lower(btrim(coalesce(es.display_name, ''))) = lower(btrim(x.store_name))
      );
    UPDATE public.schedules
    SET tenant_id = ''
    WHERE tenant_id IS NULL OR btrim(tenant_id) IN ('', 'default');
    ALTER TABLE public.schedules ALTER COLUMN tenant_id SET DEFAULT '';
    ALTER TABLE public.schedules ALTER COLUMN tenant_id SET NOT NULL;
    SELECT count(*) INTO dup FROM (
      SELECT tenant_id, schedule_date, store_name, name FROM public.schedules
      GROUP BY 1, 2, 3, 4 HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'schedules 법인+날짜+매장+이름 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.schedules'::regclass
        AND conname = 'schedules_tenant_date_store_name_key'
    ) THEN
      ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_date_store_name_key;
      DROP INDEX IF EXISTS public.schedules_date_store_name_key;
      ALTER TABLE public.schedules
        ADD CONSTRAINT schedules_tenant_date_store_name_key
        UNIQUE (tenant_id, schedule_date, store_name, name);
    END IF;
  END IF;

  -- 회원번호. id 기본키는 유지합니다.
  IF to_regclass('public.members') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'tenant_id'
     ) THEN
    UPDATE public.members
    SET tenant_id = ''
    WHERE tenant_id IS NULL;
    SELECT count(*) INTO dup FROM (
      SELECT coalesce(tenant_id, ''), member_no
      FROM public.members
      WHERE member_no IS NOT NULL
      GROUP BY 1, 2
      HAVING count(*) > 1
    ) d;
    IF dup > 0 THEN
      RAISE EXCEPTION 'members 법인+회원번호 중복 %건', dup;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.members'::regclass
        AND conname = 'members_tenant_member_no_key'
    ) THEN
      ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_member_no_key;
      DROP INDEX IF EXISTS public.members_member_no_key;
      CREATE UNIQUE INDEX members_tenant_member_no_key
        ON public.members (tenant_id, member_no);
    END IF;
  END IF;
END $$;
