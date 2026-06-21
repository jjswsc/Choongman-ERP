-- 충만·Omni 공통: 주방 인쇄 큐 dedupe — Supabase SQL Editor 1회 실행
-- PostgREST ignore-duplicates는 partial unique(dedupe_key)와 맞지 않아 23505 로그가 남음

CREATE OR REPLACE FUNCTION public.enqueue_pos_print_job(
  p_store_code text,
  p_order_id bigint,
  p_order_no text,
  p_job_type text,
  p_station smallint,
  p_status text,
  p_dedupe_key text,
  p_payload_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(btrim(p_dedupe_key), '') = '' THEN
    INSERT INTO public.pos_print_jobs (
      store_code, order_id, order_no, job_type, station, status, dedupe_key, payload_json
    ) VALUES (
      p_store_code, p_order_id, p_order_no, p_job_type, p_station, p_status, NULL, p_payload_json
    );
    RETURN;
  END IF;

  INSERT INTO public.pos_print_jobs (
    store_code, order_id, order_no, job_type, station, status, dedupe_key, payload_json
  ) VALUES (
    p_store_code, p_order_id, p_order_no, p_job_type, p_station, p_status, p_dedupe_key, p_payload_json
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_pos_print_job(
  text, bigint, text, text, smallint, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_pos_print_job(
  text, bigint, text, text, smallint, text, text, jsonb
) TO service_role;
