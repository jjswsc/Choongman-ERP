# CM ERP 데이터베이스

Supabase (PostgreSQL) 사용. 다른 개발자가 수정·확장 시 참고용 문서입니다.

## 1. 스키마 적용 순서

1. **supabase_schema.sql** - 기본 테이블 생성
2. **supabase_migration_consolidated.sql** - 중복 제거, 유니크 제약, 추가 테이블/컬럼

※ 위치: 프로젝트 루트 (`c:\CM_ERP\`)

## 2. 주요 테이블 (기능별)

### 발주·주문

| 테이블 | 설명 |
|--------|------|
| `orders` | 매장 발주. cart_json에 품목 목록. status: Pending/Approved/Rejected |
| `purchase_orders` | 본사 → 거래처 발주. cart_json, subtotal, vat, total |
| `warehouse_locations` | 출고지(창고) 목록. Jidubang, S&J 등 |

### 재고·입출고

| 테이블 | 설명 |
|--------|------|
| `stock_logs` | 입출고 이력. location, item_code, qty, log_type(Order/Force 등) |
| `store_settings` | 매장별 품목 적정재고 (item_code, min_qty 등) |

### 품목·거래처

| 테이블 | 설명 |
|--------|------|
| `items` | 품목. code(유니크), outbound_location(출고지) |
| `vendors` | 거래처. code(유니크), type(sales/both 등), gps_name(매장명) |

### POS

| 테이블 | 설명 |
|--------|------|
| `pos_menus` | 메뉴. code, name, category, price, sold_out_date |
| `pos_menu_options` | 메뉴 옵션 (menu_id FK) |
| `pos_menu_ingredients` | 메뉴별 원자재 (menu_id, item_code, quantity) |
| `pos_orders` | 주문. order_no, items_json, status |
| `pos_table_layouts` | 테이블 배치 (store_code PK) |
| `pos_printer_settings` | 프린터 설정 (store_code PK) |

### 인사·급여

| 테이블 | 설명 |
|--------|------|
| `employees` | 직원. store, name(유니크), annual_leave_days, grade 등 |
| `payroll_records` | 급여 명세. month, store, name(유니크 조합) |
| `leave_requests` | 휴가 신청. store, name, leave_date |
| `attendance_logs` | 출퇴근 로그. store_name, name, log_at |
| `schedules` | 스케줄. schedule_date, store_name, name |

### 매장·점검

| 테이블 | 설명 |
|--------|------|
| `store_visits` | 매장 방문. visit_date, name, store_name, visit_type |
| `checklist_items` | 점검 항목 (item_id FK) |
| `check_results` | 점검 결과. check_date, store_name |

### 기타

| 테이블 | 설명 |
|--------|------|
| `notices` | 공지 |
| `notice_reads` | 공지 확인 여부 |
| `work_logs` | 업무일지 |
| `public_holidays` | 공휴일 |
| `menu_permissions` | 메뉴 접근 권한 (store, name) |
| `invoices` | 인보이스 |
| `evaluation_items` | 평가 항목 |
| `evaluation_results` | 평가 결과 |
| `complaint_logs` | 불만 접수 |
| `petty_cash_transactions` | 경비 거래 |

## 3. 주요 관계

```
items.outbound_location  → warehouse_locations.location_code (논리적)
orders.store_name       → vendors.gps_name 또는 store (매장)
stock_logs.order_id     → orders.id (nullable)
pos_menu_ingredients.item_code → items.code
purchase_orders.location_code   → warehouse_locations.location_code
```

## 4. 마이그레이션·스크립트

| 파일 | 용도 |
|------|------|
| `supabase_schema.sql` | 최초 스키마 |
| `supabase_migration_consolidated.sql` | 통합 마이그레이션 (중복 제거, 유니크, 컬럼 추가) |
| `supabase_items_outbound_location.sql` | items.outbound_location 관련 |
| `scripts/items_outbound_location_updates.sql` | 품목 출고지 CSV 반영 |
| `scripts/import_pos_menus_grab.sql` | POS 메뉴 시드 (Grab 메뉴) |

## 5. 유니크 제약 (중요)

마이그레이션에서 추가된 유니크:

- `items.code`
- `vendors.code`
- `schedules`: (schedule_date, store_name, name)
- `leave_requests`: (store, name, leave_date)
- `employees`: (store, name)
- `payroll_records`: (month, store, name)
- `menu_permissions`: (store, name)
- `pos_menus`: code

중복 삽입 시 `23505 (duplicate key)` 오류. 마이그레이션 주석의 "23505 오류 시" 안내 참고.

## 6. 인덱스

주요 인덱스:

- `idx_items_code`, `idx_items_outbound_location`
- `idx_orders_status`, `idx_orders_order_date`
- `idx_stock_logs_location`, `idx_stock_logs_item_code`, `idx_stock_logs_log_date`
- `idx_pos_orders_order_no`, `idx_pos_orders_created`, `idx_pos_orders_status`
- `idx_attendance_logs_store_name_log_at`
- `idx_leave_requests_store_name_date`
- `idx_stock_logs_location_log_date`

성능 이슈 시 쿼리 plan 확인 후 인덱스 추가 검토.
