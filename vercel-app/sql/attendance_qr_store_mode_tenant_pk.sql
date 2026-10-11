-- 출퇴근 QR 모드(고정 / 2시간 변경)를 회사별로 따로 저장
-- 기존 기본키가 store_code 하나뿐이라, 같은 매장코드를 쓰는 다른 회사가 저장하면
-- 그 행을 덮어써서 우리 회사 설정이 사라지고 기본값(2시간 변경)으로 돌아갔음.
--
-- 앱(attendance-qr-mode-server.ts 수정본)을 먼저 배포한 뒤 실행하세요.
-- pos_orders 는 건드리지 않습니다. 영업 중 실행해도 영수증·주방 자동인쇄와 무관합니다.
-- 실행 후 설정이 사라진 매장은 POS 설정 → 출퇴근 QR 에서 「고정」을 다시 눌러 저장해야 합니다.

DO $$
DECLARE
  dup int;
BEGIN
  IF to_regclass('public.attendance_qr_store_settings') IS NULL THEN
    RAISE NOTICE 'attendance_qr_store_settings 가 없습니다. attendance_qr_store_mode.sql 을 먼저 실행하세요';
    RETURN;
  END IF;

  ALTER TABLE public.attendance_qr_store_settings
    ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT '';

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'erp_stores' AND column_name = 'tenant_id'
  ) THEN
    UPDATE public.attendance_qr_store_settings s
    SET tenant_id = m.tenant_id
    FROM (
      SELECT lower(btrim(store_code)) AS code, min(tenant_id) AS tenant_id
      FROM public.erp_stores
      WHERE nullif(btrim(tenant_id), '') IS NOT NULL
        AND nullif(btrim(store_code), '') IS NOT NULL
      GROUP BY 1
      HAVING count(DISTINCT tenant_id) = 1
    ) m
    WHERE coalesce(btrim(s.tenant_id), '') IN ('', 'default')
      AND lower(btrim(s.store_code)) = m.code;
  END IF;

  UPDATE public.attendance_qr_store_settings
  SET tenant_id = ''
  WHERE tenant_id IS NULL OR btrim(tenant_id) = 'default';

  SELECT count(*) INTO dup FROM (
    SELECT tenant_id, store_code FROM public.attendance_qr_store_settings
    GROUP BY 1, 2 HAVING count(*) > 1
  ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'attendance_qr_store_settings 회사+매장 중복 %건', dup;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.attendance_qr_store_settings'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) ILIKE '%tenant_id%store_code%'
  ) THEN
    ALTER TABLE public.attendance_qr_store_settings
      DROP CONSTRAINT IF EXISTS attendance_qr_store_settings_pkey;
    ALTER TABLE public.attendance_qr_store_settings
      ADD CONSTRAINT attendance_qr_store_settings_pkey PRIMARY KEY (tenant_id, store_code);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('attendance_qr_store_mode_tenant_pk.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
