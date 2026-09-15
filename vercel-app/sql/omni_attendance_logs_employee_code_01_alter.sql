-- Omni: 직원 코드 스냅샷 (employee_id 미적용 DB에서도 이름 외 보조 매칭)
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS employee_code text;
