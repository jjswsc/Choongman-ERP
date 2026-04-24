# SQL 인덱스 가이드

이 문서는 `vercel-app/sql` 아래 SQL 파일을 **빠르게 찾기 위한 인덱스**입니다.
기존 SQL 파일을 이동/개명하지 않고, 탐색성과 유지보수성을 높이는 목적입니다.

## 1) 빠른 탐색 순서

1. 먼저 도메인(회계/인사/POS/마케팅/SaaS/물류)을 정합니다.
2. 그 다음 파일 유형(스키마/정책/RPC/일괄 스크립트)을 고릅니다.
3. 마지막으로 파일명 키워드로 좁힙니다. (`*_rpc.sql`, `*_rls_policies.sql`, `*_all_in_one.sql`)

## 2) 파일 유형 규칙

- `*_all_in_one.sql`: 여러 변경을 한 번에 적용하는 번들 스크립트
- `*_one_shot.sql`: 1회성 대규모 적용 스크립트
- `*_rpc.sql`: 함수(RPC) 추가/수정
- `*_rls_policies.sql`: RLS 정책 관련
- `*_foundation.sql`, `*_schema.sql`, `*_bootstrap.sql`: 기반 스키마/초기화

## 3) 도메인별 인덱스

| 도메인 | 주요 키워드 | 대표 파일 예시 |
|---|---|---|
| 회계/세무 | `accounting`, `tax`, `kt20k`, `vat`, `wht`, `account_subjects` | `accounting_identity_keys.sql`, `accounting_tax_upgrade_one_shot.sql`, `accounting_kt20k_summary_rpc.sql`, `tax_ledger_filing_status.sql`, `items_account_subject_id.sql` |
| POS/결제/프린터 | `pos_`, `linkpos`, `printer`, `settlements`, `customer_display`, `grab` | `pos_linkpos_payments.sql`, `pos_printer_kitchen_routes.sql`, `pos_printer_settings_rls_policies.sql`, `pos_settlements_other_breakdown.sql`, `pos_grab_store_integrations.sql`, `pos_grab_webhook_events.sql` |
| 인사/근태/급여 | `employees`, `attendance`, `payroll`, `hr_policies`, `leave` | `employees_employee_code_leave_employee_id.sql`, `attendance_employee_id_hardening.sql`, `attendance_schedule_employee_keys.sql`, `payroll_records_employee_keys.sql`, `hr_policies_hr_policy_reads.sql` |
| 물류/재고/출고 | `logistics`, `stock_logs`, `outbound`, `inbound` | `logistics_integrity_monitoring_batch.sql`, `logistics_hardening_and_monitoring_all_in_one.sql`, `stock_logs_soft_delete_outbound.sql`, `stock_logs_supabase_ram_indexes.sql`, `outbound_soft_delete_integrity_checks.sql` |
| 마케팅 | `marketing_` | `marketing_campaign_hub_extensions.sql`, `marketing_campaigns_rls_policies.sql`, `marketing_material_deployments.sql`, `marketing_material_gifts.sql`, `marketing_ads_content_detail.sql` |
| 멤버십/매장운영 | `members`, `store_repair`, `company_hybrid_documents` | `members_identity_source_convention.sql`, `store_repair_schema_all.sql`, `store_repair_tickets.sql`, `company_hybrid_documents.sql`, `company_hybrid_documents_all_in_one.sql` |
| SaaS/멀티테넌트 | `saas_` | `saas_base_schema.sql`, `saas_tenant_bootstrap.sql`, `saas_admin_control_plane.sql`, `saas_employees_add_nick.sql` |
| 공통 운영/안정성 | `idempotency`, `linter`, `public_tables` | `api_request_idempotency_keys.sql`, `pos_orders_idempotency_key_hash.sql`, `supabase_linter_function_search_path_fix.sql`, `rls_public_tables_supabase_linter_fix.sql` |

## 4) 실제 작업 시 권장 규칙

- 신규 SQL 파일명은 목적이 보이도록 명사형으로 작성합니다.
  - 예: `accounting_identity_keys.sql`, `pos_dual_monitor_idle_media.sql`
- 정책/함수/일괄 스크립트는 suffix를 유지합니다.
  - 정책: `*_rls_policies.sql`
  - 함수: `*_rpc.sql`
  - 일괄: `*_all_in_one.sql`, `*_one_shot.sql`
- 1회성 보정 SQL도 파일을 남기고, 적용 범위/주의점을 상단 주석에 기록합니다.

## 5) SQL 변경 체크리스트

- 테이블/컬럼/인덱스 생성 전 `IF NOT EXISTS` 고려
- 함수 변경 시 `CREATE OR REPLACE FUNCTION` 사용 여부 점검
- RLS 변경 시 대상 role(`anon`, `authenticated`, `service_role`) 확인
- 성능 이슈 가능 쿼리는 인덱스 영향 확인
- 운영 적용 전 스테이징에서 최소 1회 실행

## 6) 자주 사용하는 검색 패턴

- POS 관련: `pos_*.sql`
- 회계/세무: `accounting*.sql`, `*tax*.sql`, `*vat*.sql`
- 정책 파일: `*_rls_policies.sql`
- RPC 파일: `*_rpc.sql`
- 번들 파일: `*_all_in_one.sql`, `*_one_shot.sql`

## 7) 참고 문서

- DB 개요 및 주요 테이블: [`DATABASE.md`](./DATABASE.md)
- 전체 코드/기능 맵: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- 파일 정리 원칙: [`FILE-ORGANIZATION-GUIDE-KO.md`](./FILE-ORGANIZATION-GUIDE-KO.md)
