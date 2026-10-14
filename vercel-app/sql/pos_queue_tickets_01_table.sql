-- POS 자리 대기 번호표 (waitlist) — 신규 테이블·RPC만 생성 (pos_orders 미변경, 영업 중 실행 가능)
-- 번호는 매장·영업일(방콕 기준 POS 영업일 YYYYMMDD)마다 1부터.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_queue_tickets (
  id bigserial PRIMARY KEY,
  store_code text NOT NULL,
  tenant_id text NULL,
  business_ymd text NOT NULL CHECK (business_ymd ~ '^[0-9]{8}$'),
  queue_no integer NOT NULL CHECK (queue_no > 0),
  party_size smallint NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 50),
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'called', 'seated', 'cancelled', 'no_show')),
  member_id bigint NULL,
  guest_phone text NULL,
  guest_name text NULL,
  note text NULL,
  public_token text NOT NULL UNIQUE,
  call_count smallint NOT NULL DEFAULT 0,
  called_at timestamptz NULL,
  seated_at timestamptz NULL,
  closed_at timestamptz NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_code, business_ymd, queue_no)
);

CREATE INDEX IF NOT EXISTS pos_queue_tickets_store_day_status_idx
  ON public.pos_queue_tickets (store_code, business_ymd, status);

CREATE TABLE IF NOT EXISTS public.pos_queue_counters (
  store_code text NOT NULL,
  business_ymd text NOT NULL CHECK (business_ymd ~ '^[0-9]{8}$'),
  last_no integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_code, business_ymd)
);

-- 공개 REST(anon) 직접 조회 차단 — 서버(service_role) API로만 접근
ALTER TABLE public.pos_queue_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_queue_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.allocate_pos_queue_no(
  p_store_code text,
  p_business_ymd text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store text;
  v_ymd text;
  v_next integer;
BEGIN
  v_store := trim(coalesce(p_store_code, ''));
  IF v_store = '' THEN
    RAISE EXCEPTION 'store_code required';
  END IF;
  v_ymd := regexp_replace(coalesce(p_business_ymd, ''), '[^0-9]', '', 'g');
  IF length(v_ymd) <> 8 THEN
    RAISE EXCEPTION 'invalid business ymd: %', coalesce(p_business_ymd, '');
  END IF;

  INSERT INTO public.pos_queue_counters AS c (store_code, business_ymd, last_no, updated_at)
  VALUES (v_store, v_ymd, 1, now())
  ON CONFLICT (store_code, business_ymd)
  DO UPDATE SET last_no = c.last_no + 1, updated_at = now()
  RETURNING last_no INTO v_next;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_pos_queue_no(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_pos_queue_no(text, text) TO service_role;

COMMIT;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_queue_tickets_01_table.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
