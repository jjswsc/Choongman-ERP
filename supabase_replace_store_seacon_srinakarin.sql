-- 매장명 수정: "CM Seacon Srinak" → "CM Seacon Srinakarin"
-- Supabase SQL Editor에서 실행

UPDATE schedules SET store_name = 'CM Seacon Srinakarin' WHERE store_name = 'CM Seacon Srinak';
UPDATE orders SET store_name = 'CM Seacon Srinakarin' WHERE store_name = 'CM Seacon Srinak';
UPDATE attendance_logs SET store_name = 'CM Seacon Srinakarin' WHERE store_name = 'CM Seacon Srinak';
UPDATE leave_requests SET store = 'CM Seacon Srinakarin' WHERE store = 'CM Seacon Srinak';
UPDATE store_visits SET store_name = 'CM Seacon Srinakarin' WHERE store_name = 'CM Seacon Srinak';
UPDATE check_results SET store_name = 'CM Seacon Srinakarin' WHERE store_name = 'CM Seacon Srinak';
UPDATE evaluation_results SET store_name = 'CM Seacon Srinakarin' WHERE store_name = 'CM Seacon Srinak';
UPDATE complaint_logs SET store_name = 'CM Seacon Srinakarin' WHERE store_name = 'CM Seacon Srinak';
UPDATE employees SET store = 'CM Seacon Srinakarin' WHERE store = 'CM Seacon Srinak';
UPDATE payroll_records SET store = 'CM Seacon Srinakarin' WHERE store = 'CM Seacon Srinak';
UPDATE store_settings SET store = 'CM Seacon Srinakarin' WHERE store = 'CM Seacon Srinak';
UPDATE menu_permissions SET store = 'CM Seacon Srinakarin' WHERE store = 'CM Seacon Srinak';
UPDATE notice_reads SET store = 'CM Seacon Srinakarin' WHERE store = 'CM Seacon Srinak';
UPDATE stock_logs SET location = 'CM Seacon Srinakarin' WHERE location = 'CM Seacon Srinak';
UPDATE invoices SET target = 'CM Seacon Srinakarin' WHERE target = 'CM Seacon Srinak';
