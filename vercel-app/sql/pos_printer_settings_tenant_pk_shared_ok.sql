-- Omni만. 충만 DB에는 실행하지 마세요.
-- Final Price·프린터 설정을 (tenant_id, store_code) 로 분리한다.
-- 같은 매장코드(예: banjoo·marubkk_01 → 1000)를 쓰는 법인이 서로 덮어쓰지 않게 함.
--
-- omni_tenant_store_keys_02_apply.sql 은 erp_stores 공유 코드가 있으면 전체 중단하므로,
-- 프린터 설정만 이 파일로 적용한다 (공유 코드 허용 + 법인별 행 복제).
--
-- 앱 getPosPrinterSettings tenant 필터 수정본을 배포한 뒤 실행하세요.
-- pos_orders 미수정. 영업 중 실행해도 영수증·주방 자동인쇄 Realtime 과 무관합니다.
-- 실행 후 설정이 비어 보이면 해당 법인에서 Final Price 를 한 번 다시 저장하세요.

DO $$
DECLARE
  dup int;
  cols text;
  r record;
  src_store text;
BEGIN
  IF to_regclass('public.pos_printer_settings') IS NULL THEN
    RAISE NOTICE 'pos_printer_settings 가 없습니다';
    RETURN;
  END IF;

  ALTER TABLE public.pos_printer_settings
    ADD COLUMN IF NOT EXISTS tenant_id text;

  UPDATE public.pos_printer_settings
  SET tenant_id = ''
  WHERE tenant_id IS NULL OR btrim(tenant_id) = 'default';

  -- 매장코드가 법인 1곳에만 있으면 그 법인으로 채움
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'erp_stores' AND column_name = 'tenant_id'
  ) THEN
    UPDATE public.pos_printer_settings s
    SET tenant_id = m.tenant_id
    FROM (
      SELECT lower(btrim(store_code)) AS code, min(tenant_id) AS tenant_id
      FROM public.erp_stores
      WHERE nullif(btrim(tenant_id), '') IS NOT NULL
        AND nullif(btrim(store_code), '') IS NOT NULL
      GROUP BY 1
      HAVING count(DISTINCT tenant_id) = 1
    ) m
    WHERE coalesce(btrim(s.tenant_id), '') = ''
      AND lower(btrim(s.store_code)) = m.code;
  END IF;

  -- store_code 단독 PK/UNIQUE 제거 (공유 매장코드에 법인별 행을 둘 수 있게)
  ALTER TABLE public.pos_printer_settings
    DROP CONSTRAINT IF EXISTS pos_printer_settings_pkey;
  ALTER TABLE public.pos_printer_settings
    DROP CONSTRAINT IF EXISTS pos_printer_settings_store_code_key;

  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'pos_printer_settings'
    AND c.column_name <> 'tenant_id';

  IF cols IS NULL OR btrim(cols) = '' THEN
    RAISE EXCEPTION 'pos_printer_settings 컬럼 목록을 읽지 못했습니다';
  END IF;

  -- 공유 매장코드: 기존 행을 템플릿으로 각 법인 행을 만듦
  IF to_regclass('public.erp_stores') IS NOT NULL AND cols IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT
        nullif(btrim(es.tenant_id), '') AS tenant_id,
        btrim(es.store_code) AS store_code
      FROM public.erp_stores es
      WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
        AND nullif(btrim(es.store_code), '') IS NOT NULL
        AND lower(btrim(es.store_code)) IN (
          SELECT lower(btrim(store_code))
          FROM public.erp_stores
          WHERE nullif(btrim(tenant_id), '') IS NOT NULL
            AND nullif(btrim(store_code), '') IS NOT NULL
          GROUP BY 1
          HAVING count(DISTINCT tenant_id) > 1
        )
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.pos_printer_settings p
        WHERE lower(btrim(p.store_code)) = lower(btrim(r.store_code))
          AND btrim(coalesce(p.tenant_id, '')) = r.tenant_id
      ) THEN
        CONTINUE;
      END IF;

      SELECT p.store_code
      INTO src_store
      FROM public.pos_printer_settings p
      WHERE lower(btrim(p.store_code)) = lower(btrim(r.store_code))
      ORDER BY
        CASE
          WHEN btrim(coalesce(p.tenant_id, '')) = r.tenant_id THEN 0
          WHEN coalesce(btrim(p.tenant_id), '') = '' THEN 1
          ELSE 2
        END,
        p.updated_at DESC NULLS LAST
      LIMIT 1;

      IF src_store IS NULL THEN
        CONTINUE;
      END IF;

      EXECUTE format(
        $ins$
        INSERT INTO public.pos_printer_settings (tenant_id, %s)
        SELECT %L, %s
        FROM public.pos_printer_settings p
        WHERE lower(btrim(p.store_code)) = lower(btrim(%L))
        ORDER BY
          CASE
            WHEN btrim(coalesce(p.tenant_id, '')) = %L THEN 0
            WHEN coalesce(btrim(p.tenant_id), '') = '' THEN 1
            ELSE 2
          END,
          p.updated_at DESC NULLS LAST
        LIMIT 1
        $ins$,
        cols,
        r.tenant_id,
        cols,
        r.store_code,
        r.tenant_id
      );
    END LOOP;
  END IF;

  -- 공유 코드에 법인 행이 생겼으면 빈 tenant 템플릿 행 제거
  DELETE FROM public.pos_printer_settings p
  WHERE coalesce(btrim(p.tenant_id), '') = ''
    AND EXISTS (
      SELECT 1
      FROM public.pos_printer_settings x
      WHERE lower(btrim(x.store_code)) = lower(btrim(p.store_code))
        AND nullif(btrim(x.tenant_id), '') IS NOT NULL
    );

  ALTER TABLE public.pos_printer_settings
    ALTER COLUMN tenant_id SET DEFAULT '';
  UPDATE public.pos_printer_settings
  SET tenant_id = ''
  WHERE tenant_id IS NULL;
  ALTER TABLE public.pos_printer_settings
    ALTER COLUMN tenant_id SET NOT NULL;

  SELECT count(*) INTO dup FROM (
    SELECT tenant_id, store_code
    FROM public.pos_printer_settings
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'pos_printer_settings 법인+매장 중복 %건 — 수동 정리 후 다시 실행', dup;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pos_printer_settings'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) ILIKE '%tenant_id%store_code%'
  ) THEN
    ALTER TABLE public.pos_printer_settings
      ADD CONSTRAINT pos_printer_settings_pkey PRIMARY KEY (tenant_id, store_code);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_printer_settings_tenant_pk_shared_ok.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
