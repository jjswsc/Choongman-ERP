-- Seacon 손님 QR에서 Good Morning Deal 미러 메뉴 즉시 숨김
-- · 대상: name에 Good Morning / Morning Deal 포함 + is_active
-- · 영향: CM Seacon Srinakarin 등 Seacon Srinakarin QR만 (POS·다른 매장 무관)
-- · pos_orders UPDATE 없음 — 영업 중 실행 가능
-- · 선행: seacon_qr_hide_good_morning_01_preview.sql 결과 확인

DO $$
DECLARE
  v_ids bigint[];
  v_updated int := 0;
BEGIN
  IF to_regclass('public.pos_qr_order_store_settings') IS NULL THEN
    RAISE EXCEPTION 'pos_qr_order_store_settings 없음';
  END IF;

  SELECT coalesce(array_agg(m.id ORDER BY m.id), '{}'::bigint[])
  INTO v_ids
  FROM public.pos_menus m
  WHERE m.is_active IS DISTINCT FROM false
    AND (
      m.name ILIKE '%Good Morning%'
      OR m.name ILIKE '%Morning Deal%'
    );

  IF coalesce(cardinality(v_ids), 0) = 0 THEN
    RAISE NOTICE 'Good Morning Deal 메뉴를 찾지 못했습니다. 01_preview 결과를 확인하세요.';
    RETURN;
  END IF;

  UPDATE public.pos_qr_order_store_settings s
  SET
    hidden_menu_ids = (
      SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::bigint[])
      FROM unnest(coalesce(s.hidden_menu_ids, '{}'::bigint[]) || v_ids) AS x
    ),
    updated_at = now()
  WHERE s.store_code ILIKE 'CM Seacon%'
     OR s.store_code ILIKE '%Seacon Srinakarin%';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Seacon Srinakarin pos_qr_order_store_settings 행이 없습니다. 02_qr_settings_preview 를 먼저 확인하세요.';
  END IF;
  RAISE NOTICE 'Seacon QR 숨김 반영: store_rows=%, menu_ids=%', v_updated, v_ids;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('seacon_qr_hide_good_morning_03_apply_hide.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
