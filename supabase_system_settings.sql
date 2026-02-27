-- 시스템 설정 (알림 on/off 등)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 알림 설정 기본값 (1=활성, 0=비활성)
INSERT INTO system_settings (key, value_json) VALUES
  ('push_notice_enabled', '1'::jsonb),
  ('push_order_approval_enabled', '1'::jsonb)
ON CONFLICT (key) DO NOTHING;
