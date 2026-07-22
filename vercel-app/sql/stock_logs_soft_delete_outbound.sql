-- 출고(Outbound/Force*) 소프트 삭제 지원
-- - stock_logs 행은 물리 삭제 대신 is_deleted=true 로 비활성화
-- - 삭제 감사를 위해 outbound_delete_events 저장
-- - delete API에서 호출할 RPC(트랜잭션) 제공
CREATE TABLE IF NOT EXISTS public.outbound_delete_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mode TEXT NOT NULL,
  reason TEXT NULL,
  request_key TEXT NULL,
  deleted_by TEXT NULL,
  order_id BIGINT NULL,
  reference_no TEXT NULL,
  stock_log_ids JSONB NULL,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  conflict_message TEXT NULL,
  result_json JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_outbound_delete_events_created
  ON public.outbound_delete_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_delete_events_order
  ON public.outbound_delete_events(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_delete_events_reference
  ON public.outbound_delete_events(reference_no)
  WHERE reference_no IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.stock_logs') IS NULL THEN
    RAISE NOTICE 'public.stock_logs table does not exist. Skip stock_logs soft-delete migration.';
    RETURN;
  END IF;

  -- Omni 등 부분 스키마: 소프트삭제 인덱스/RPC가 참조하는 선행 컬럼
  ALTER TABLE public.stock_logs
    ADD COLUMN IF NOT EXISTS reference_no TEXT NULL;

  ALTER TABLE public.stock_logs
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS delete_tx_id TEXT NULL;

  COMMENT ON COLUMN public.stock_logs.reference_no IS
    'Tax invoice / internal reference (e.g. 강제출고 시 일괄 입력)';
  COMMENT ON COLUMN public.stock_logs.is_deleted IS
    '소프트 삭제 여부. true면 집계/조회/정산 기본 대상에서 제외';
  COMMENT ON COLUMN public.stock_logs.deleted_at IS
    '소프트 삭제 처리 시각(Bangkok 기준 시각 문자열을 timestamptz로 저장)';
  COMMENT ON COLUMN public.stock_logs.deleted_by IS
    '삭제 요청 사용자(이메일/이름/ID 등)';
  COMMENT ON COLUMN public.stock_logs.delete_reason IS
    '삭제 사유';
  COMMENT ON COLUMN public.stock_logs.delete_tx_id IS
    '삭제 트랜잭션 추적 키(요청 idempotency key 또는 UUID)';

  CREATE INDEX IF NOT EXISTS idx_stock_logs_active_log_type_date
    ON public.stock_logs(log_type, is_deleted, log_date DESC);

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_logs' AND column_name = 'order_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_stock_logs_active_order
      ON public.stock_logs(order_id, is_deleted, log_date DESC)
      WHERE order_id IS NOT NULL;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_stock_logs_active_reference
    ON public.stock_logs(reference_no, is_deleted, log_date DESC)
    WHERE reference_no IS NOT NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.stock_logs') IS NULL THEN
    RAISE NOTICE 'public.stock_logs table does not exist. Skip soft_delete_outbound_logs function.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.soft_delete_outbound_logs(
      p_mode TEXT,
      p_reason TEXT DEFAULT NULL,
      p_deleted_by TEXT DEFAULT NULL,
      p_request_key TEXT DEFAULT NULL,
      p_order_id BIGINT DEFAULT NULL,
      p_reference_no TEXT DEFAULT NULL,
      p_stock_log_ids BIGINT[] DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      v_mode TEXT := lower(trim(coalesce(p_mode, '')));
      v_now TIMESTAMPTZ := NOW();
      v_deleted_count INTEGER := 0;
      v_order_ids BIGINT[] := ARRAY[]::BIGINT[];
      v_force_outbound_ids BIGINT[] := ARRAY[]::BIGINT[];
      v_stores TEXT[] := ARRAY[]::TEXT[];
      v_event_id BIGINT := NULL;
      v_result JSONB;
    BEGIN
      IF v_mode NOT IN ('order', 'force') THEN
        RAISE EXCEPTION 'p_mode must be order|force';
      END IF;

      IF v_mode = 'order' THEN
        IF coalesce(p_order_id, 0) <= 0 THEN
          RAISE EXCEPTION 'order mode requires p_order_id';
        END IF;
      ELSE
        IF (p_reference_no IS NULL OR btrim(p_reference_no) = '')
           AND (p_stock_log_ids IS NULL OR cardinality(p_stock_log_ids) = 0) THEN
          RAISE EXCEPTION 'force mode requires p_reference_no or p_stock_log_ids';
        END IF;
      END IF;

      CREATE TEMP TABLE tmp_outbound_delete_target (
        id BIGINT PRIMARY KEY
      ) ON COMMIT DROP;

      IF v_mode = 'order' THEN
        INSERT INTO tmp_outbound_delete_target(id)
        SELECT s.id
        FROM public.stock_logs s
        WHERE s.log_type = 'Outbound'
          AND s.order_id = p_order_id
          AND coalesce(s.is_deleted, false) = false;
      ELSE
        INSERT INTO tmp_outbound_delete_target(id)
        SELECT s.id
        FROM public.stock_logs s
        WHERE coalesce(s.is_deleted, false) = false
          AND (
            (s.log_type IN ('ForceOutbound', 'ForcePush') AND p_reference_no IS NOT NULL AND btrim(p_reference_no) <> '' AND s.reference_no = p_reference_no)
            OR
            (p_stock_log_ids IS NOT NULL AND cardinality(p_stock_log_ids) > 0 AND s.id = ANY(p_stock_log_ids))
          );
      END IF;

      SELECT count(*)::INTEGER INTO v_deleted_count FROM tmp_outbound_delete_target;
      IF v_deleted_count <= 0 THEN
        v_result := jsonb_build_object(
          'ok', true,
          'deleted_count', 0,
          'order_ids', '[]'::jsonb,
          'force_outbound_ids', '[]'::jsonb,
          'stores', '[]'::jsonb
        );
        INSERT INTO public.outbound_delete_events(
          mode, reason, request_key, deleted_by, order_id, reference_no, stock_log_ids, deleted_count, result_json
        )
        VALUES (
          v_mode,
          p_reason,
          p_request_key,
          p_deleted_by,
          p_order_id,
          p_reference_no,
          CASE WHEN p_stock_log_ids IS NULL THEN NULL ELSE to_jsonb(p_stock_log_ids) END,
          0,
          v_result
        );
        RETURN v_result;
      END IF;

      SELECT ARRAY(
        SELECT DISTINCT s.order_id
        FROM public.stock_logs s
        JOIN tmp_outbound_delete_target t ON t.id = s.id
        WHERE s.order_id IS NOT NULL
        ORDER BY s.order_id
      ) INTO v_order_ids;

      SELECT ARRAY(
        SELECT DISTINCT s.id
        FROM public.stock_logs s
        JOIN tmp_outbound_delete_target t ON t.id = s.id
        WHERE s.log_type = 'ForceOutbound'
        ORDER BY s.id
      ) INTO v_force_outbound_ids;

      SELECT ARRAY(
        SELECT DISTINCT btrim(coalesce(s.vendor_target, ''))
        FROM public.stock_logs s
        JOIN tmp_outbound_delete_target t ON t.id = s.id
        WHERE btrim(coalesce(s.vendor_target, '')) <> ''
        ORDER BY btrim(coalesce(s.vendor_target, ''))
      ) INTO v_stores;

      UPDATE public.stock_logs s
      SET
        is_deleted = true,
        deleted_at = v_now,
        deleted_by = p_deleted_by,
        delete_reason = p_reason,
        delete_tx_id = nullif(btrim(coalesce(p_request_key, '')), '')
      FROM tmp_outbound_delete_target t
      WHERE s.id = t.id;

      v_result := jsonb_build_object(
        'ok', true,
        'deleted_count', v_deleted_count,
        'order_ids', to_jsonb(coalesce(v_order_ids, ARRAY[]::BIGINT[])),
        'force_outbound_ids', to_jsonb(coalesce(v_force_outbound_ids, ARRAY[]::BIGINT[])),
        'stores', to_jsonb(coalesce(v_stores, ARRAY[]::TEXT[]))
      );

      INSERT INTO public.outbound_delete_events(
        mode, reason, request_key, deleted_by, order_id, reference_no, stock_log_ids, deleted_count, result_json
      )
      VALUES (
        v_mode,
        p_reason,
        p_request_key,
        p_deleted_by,
        p_order_id,
        p_reference_no,
        CASE WHEN p_stock_log_ids IS NULL THEN NULL ELSE to_jsonb(p_stock_log_ids) END,
        v_deleted_count,
        v_result
      )
      RETURNING id INTO v_event_id;

      RETURN v_result || jsonb_build_object('event_id', v_event_id);
    END
    $body$;
  $fn$;
END
$$;
