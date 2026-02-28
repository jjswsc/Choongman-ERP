-- ============================================================
-- Choongman ERP - 테스트 데이터 정리 (정식 운영 전)
-- 실행 전 반드시 백업 권장: Supabase > Database > Backups
-- ============================================================
-- 【주의】 아래 순서대로 실행하세요. FK/참조 관계로 삭제 순서가 중요할 수 있습니다.
-- ============================================================

-- ============================================================
-- 1. 【삭제】 트랜잭션/이력 데이터 (테스트 기간 동안 생성된 것)
-- ============================================================

-- 주문
TRUNCATE TABLE orders CASCADE;

-- 발주서 (본사→거래처)
TRUNCATE TABLE purchase_orders CASCADE;

-- 재고 이력
TRUNCATE TABLE stock_logs CASCADE;

-- 입고 배치
TRUNCATE TABLE inbound_batches CASCADE;

-- 출퇴근 로그
TRUNCATE TABLE attendance_logs CASCADE;

-- 휴가 신청
TRUNCATE TABLE leave_requests CASCADE;

-- 공지 + 읽음 상태
TRUNCATE TABLE notice_reads CASCADE;
TRUNCATE TABLE notices CASCADE;

-- 업무일지
TRUNCATE TABLE work_logs CASCADE;

-- 점검 방문 + 점검 결과
TRUNCATE TABLE check_results CASCADE;
TRUNCATE TABLE store_visits CASCADE;

-- 은행 거래 (거래 이력만 삭제, bank_accounts는 유지)
TRUNCATE TABLE bank_transaction_inbound_links CASCADE;
TRUNCATE TABLE bank_transactions CASCADE;

-- 패티캐시 거래
TRUNCATE TABLE petty_cash_transactions CASCADE;

-- 미수/미지급 거래
TRUNCATE TABLE receivable_transactions CASCADE;
TRUNCATE TABLE payable_transactions CASCADE;

-- POS 주문/정산/재고 차감
TRUNCATE TABLE pos_stock_deductions CASCADE;
TRUNCATE TABLE pos_settlements CASCADE;
TRUNCATE TABLE pos_orders CASCADE;

-- 컴플레인 일지
TRUNCATE TABLE complaint_logs CASCADE;

-- 평가 결과
TRUNCATE TABLE evaluation_results CASCADE;

-- 급여 계산/기록 (테스트 급여 삭제)
TRUNCATE TABLE payroll_records CASCADE;

-- e-Tax 제출 이력 (있다면)
-- TRUNCATE TABLE e_tax_submissions CASCADE;

-- ============================================================
-- 2. 【선택】 푸시 토큰 - 테스트 계정만 삭제할 경우
-- 전 직원이 새로 등록할 예정이면 TRUNCATE, 일부만 쓰면 주석 처리
-- ============================================================
-- TRUNCATE TABLE push_tokens CASCADE;

-- ============================================================
-- 3. 【유지】 그대로 가져가는 데이터 (삭제하지 않음)
-- ============================================================
-- - items (품목)
-- - vendors (거래처)
-- - employees (직원)
-- - store_settings (매장별 품목 설정)
-- - warehouse_locations (창고)
-- - schedules (스케줄)
-- - public_holidays (공휴일)
-- - system_settings (알림 등 시스템 설정)
-- - bank_accounts (은행 계좌)
-- - account_subjects (계정 과목)
-- - fixed_expenses (고정비)
-- - pos_menus, pos_menu_options, pos_menu_ingredients (POS 메뉴)
-- - pos_table_layouts, pos_printer_settings
-- - pos_coupons, pos_promos
-- - bank_memo_rules, bank_memo_mapping_rules
-- - checklist_items, evaluation_items (점검/평가 항목)
-- - menu_permissions (메뉴 권한)
-- - invoices (인보이스)
-- ============================================================
