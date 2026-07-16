-- ============================================================
-- omni_pos_connected_devices.sql
-- Omni: PGRST205 Could not find the table 'public.pos_connected_devices'
--
-- 적용: Omni Supabase SQL Editor → 전체 실행
-- (scripts/pos_connected_devices.sql 과 동일 + Omni용 anon/authenticated GRANT·정책)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_connected_devices (
  store_code text NOT NULL,
  device_token text NOT NULL,
  role text NOT NULL DEFAULT 'order'
    CHECK (role IN ('main', 'order', 'attendance_display')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  display_label text,
  client_hint text,
  PRIMARY KEY (store_code, device_token)
);

COMMENT ON TABLE public.pos_connected_devices IS
  'POS 터미널 접속 기기 (메인/주문/출퇴근 QR). last_seen_at으로 접속 여부 갱신';
COMMENT ON COLUMN public.pos_connected_devices.role IS
  'main: 메인 POS, order: 주문 단말, attendance_display: 출퇴근 QR 표시 전용';
COMMENT ON COLUMN public.pos_connected_devices.display_label IS
  '관리자가 지정한 표시 이름(선택). 목록에서 기기 구분용';
COMMENT ON COLUMN public.pos_connected_devices.client_hint IS
  '단말이 보낸 식별 힌트(UA·OS 등). 접속 시 자동 갱신';

-- 예전 스키마 호환
ALTER TABLE public.pos_connected_devices ADD COLUMN IF NOT EXISTS display_label text;
ALTER TABLE public.pos_connected_devices ADD COLUMN IF NOT EXISTS client_hint text;

ALTER TABLE public.pos_connected_devices DROP CONSTRAINT IF EXISTS pos_connected_devices_role_check;
ALTER TABLE public.pos_connected_devices
  ADD CONSTRAINT pos_connected_devices_role_check
  CHECK (role IN ('main', 'order', 'attendance_display'));

ALTER TABLE public.pos_connected_devices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pos_connected_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pos_connected_devices TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pos_connected_devices TO anon, authenticated;

DROP POLICY IF EXISTS "pos_connected_devices_allow_public" ON public.pos_connected_devices;
CREATE POLICY "pos_connected_devices_allow_public"
  ON public.pos_connected_devices
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 확인
SELECT to_regclass('public.pos_connected_devices') AS pos_connected_devices_exists;
