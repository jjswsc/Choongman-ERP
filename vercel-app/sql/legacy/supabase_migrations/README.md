# Supabase 마이그레이션

## 실행 순서 (신규 DB 구축 시)

1. **supabase_schema.sql** - 기본 테이블 (orders, items, employees 등)
2. **001_schema_consolidated.sql** - 통합 스키마 (유니크 제약, 컬럼 추가, 신규 테이블, 시드, 인덱스)

## 파일 설명

| 파일 | 용도 |
|------|------|
| `001_schema_consolidated.sql` | 스키마 전체 통합 (일회성 DELETE/UPDATE 제외) |
| `002_item_vendors.sql` | 품목–거래처 다대다 (001에 포함 가능) |
| `003_employee_salary_history.sql` | 직원 급여 변경 이력 (001에 포함 가능) |

## 일회성 마이그레이션 (이미 실행됐으면 생략)

- **중복 데이터 제거**: `supabase_dedup_once.sql` 또는 `supabase_items_dedup_first.sql`
- **orders.delivery_status 수정**: `UPDATE orders SET delivery_status = '일부배송완료' WHERE ...`
