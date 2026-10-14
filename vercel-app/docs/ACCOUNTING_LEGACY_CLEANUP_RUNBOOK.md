# 레거시 회계 데이터 정리 Runbook

전제: [회계 장부 운영 SOP](ACCOUNTING_LEDGER_SOP.md), 방콕시간 기준 마감월을 팀에서 지정한 뒤 진행.

## 1. 사전 점검 (Supabase SQL Editor)

`sql/accounting_legacy_cleanup_checks.sql` 실행 — 이중 매출 입금, 채널 정산 충돌, 음수 미수 등 목록 확인.

## 2. POS 입금 `revenue_*` → 채널 정산 또는 매출 수령

1. 통장 거래 화면에서 해당 입금 행 용도 변경.
2. 카드·배달·수수료 분리: **채널 정산** (GROSS/FEE/NET) + 통장 연결.
3. 가맹 B2B 수금만: **`receivable_receive`** + 매장.
4. 저장 시 자동분개 재생성(`updateBankTransaction`).

## 3. 채널 정산 + `receivable_receive` 동시 연결

- 둘 중 하나만 유지: 정산 레코드 삭제·재분개 또는 통장 용도 변경.
- 시스템은 신규 저장 시 `BANK_RECEIVABLE_RECEIVE_CONFLICT` / `BANK_ALREADY_LINKED_SETTLEMENT`로 차단.

## 4. 지출 이중 (발생 + 통장 expense + 지출 지급)

1. `expense_accruals` + `payable_transactions`(expense_accrual_id) 확인.
2. 통장이 `expense`로 이미 분개된 경우 지출 관리 연결 해제.
3. 올바른 경로: 발생 승인 → 통장 `transfer` 등 + 지출 관리 지급(2110→현금만).

## 5. 레거시 `Receive` (bank_transaction_id null)

- 통장 용도 변경 시 `deleteReceivableFromBankReceive` 2차 정리 동작.
- 수동: `receivable_transactions`에서 `ref_type=Receive`, `bank_transaction_id is null`, memo `통장 수령%` 중복 행 삭제.

## 6. 마감 후 검증

- 재무제표 → **장부 대사** 탭: 차이 ≈ 0, 이슈 목록 비움.
- `sql/outbound_soft_delete_integrity_checks.sql` 재실행.

## 7. GL RPC 배포

`sql/get_gl_balance_by_store_as_of.sql`을 배포한다(조회 전용, 영업 중 실행 가능). 앱(`lib/gl-balance-as-of.ts`)은 이 RPC를 먼저 쓰고, DB는 매장명별 차·대 합계만 돌려주며 매장 매칭·잔액 부호는 앱이 select 폴백과 같은 기준으로 처리한다. 미배포 시 분개 헤더 전체를 페이지로 읽어 JS로 합산하므로 재무상태표·장부 대사가 느리다.

구 `sql/get_gl_balance_as_of.sql`은 매장명 없는 분개를 모든 매장에 포함하고 2150(차입금) 부호가 달라 폴백과 숫자가 다르다 — 새로 배포하지 않는다.
