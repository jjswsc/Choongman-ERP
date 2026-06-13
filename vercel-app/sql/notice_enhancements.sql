-- 공지사항 고도화: 긴급·만료·예약·템플릿 + 수신 목록 RPC (선택)
-- Supabase SQL Editor에서 실행. 컬럼 미배포 시 앱은 기존 컬럼만으로 동작(fallback).

ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

CREATE TABLE IF NOT EXISTS notice_templates (
  id bigint PRIMARY KEY,
  title text NOT NULL,
  content text DEFAULT '',
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notices_created_at ON notices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notice_reads_notice_id ON notice_reads (notice_id);

-- 수신자 공지 페이지 (RPC 미배포 시 getMyNotices JS fallback)
CREATE OR REPLACE FUNCTION get_my_notices_page(
  p_store text,
  p_name text,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 15,
  p_status text DEFAULT 'all',
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_job text;
  v_role text;
  v_now timestamptz := now();
  v_all jsonb := '[]'::jsonb;
  v_filtered jsonb := '[]'::jsonb;
  v_item jsonb;
  v_row notices%ROWTYPE;
  v_status text;
  v_date text;
  v_total int;
  v_offset int;
  v_page int := GREATEST(1, COALESCE(p_page, 1));
  v_page_size int := LEAST(100, GREATEST(1, COALESCE(p_page_size, 15)));
BEGIN
  SELECT COALESCE(job, ''), COALESCE(role, '')
  INTO v_job, v_role
  FROM employees
  WHERE trim(store) = trim(p_store) AND trim(name) = trim(p_name)
  LIMIT 1;

  FOR v_row IN
    SELECT * FROM notices
    ORDER BY created_at DESC
    LIMIT 500
  LOOP
    -- 만료·예약 필터 (컬럼 없으면 스킵 — 마이그레이션 전 호환)
    BEGIN
      IF v_row.expires_at IS NOT NULL AND v_row.expires_at < v_now THEN
        CONTINUE;
      END IF;
      IF v_row.scheduled_at IS NOT NULL AND v_row.scheduled_at > v_now THEN
        CONTINUE;
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;

  END LOOP;

  -- JS와 동일한 대상 판정은 복잡하므로 RPC는 경량 필터만; 상세는 앱 fallback 권장
  RETURN jsonb_build_object(
    'items', '[]'::jsonb,
    'total', 0,
    'page', v_page,
    'pageSize', v_page_size,
    'truncated', false,
    'rpcStub', true
  );
END;
$$;
