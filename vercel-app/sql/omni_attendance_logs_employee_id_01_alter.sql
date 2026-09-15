-- Omni: attendance_logs.employee_id 가 없으면 Clock-in QR 조회가 실패한다.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES employees (id) ON DELETE SET NULL;
