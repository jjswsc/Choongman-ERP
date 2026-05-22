# 회계 장부 운영 SOP — 미수금·통장·패티·지출 (중복 방지)

관련 문서: [출고·미수금·통장·입고 연계](BANK_INBOUND_RECEIVABLE_FLOW.md)

**원칙**: 한 경제적 사건 = 한 처리 경로. 발생(매출·비용·채권·채무)은 한 번, 현금 이동은 한 번.

---

## 1. 세 층 구조

| 층 | 테이블 | 용도 |
|----|--------|------|
| 현금 증빙 | `bank_transactions`, `petty_cash_transactions` | 실제 입출금 |
| 운영 보조원장 | `receivable_transactions`, `payable_transactions` | 거래처·매장별 채권/채무 추적 |
| 총계정 분개 | `journal_entries` / `journal_lines` | 재무상태표 미수(1130)·미지급(2110), POS·통장 자동분개 |

재무상태표 미수·미지급은 **분개 잔액(1130/2110)** 기준. 보조원장은 상세·대사용.

---

## 2. 가맹 B2B 미수금

1. **발생**: 출고 수령(인보이스) 시 `Order` 미수 — 주문 승인만으로 미수 생성하지 않음.
2. **수금**: 통장 입금 분류 **`receivable_receive`(매출 수령)** + 매장 지정.
3. **금지**: 동일 입금을 `revenue_delivery` / `revenue_card` 등으로 분류 (매출 4110 이중).
4. **대사**: `bank_transaction_id`당 `Receive` 보조원장 1행.

---

## 3. POS 매장 (카드·배달·QR)

1. **매출**: 주문 완료 시 자동분개 — 현금 1010, 카드/배달 **1130**.
2. **정산**: **채널 정산**(`pos_channel_settlements`) — GROSS = FEE + NET, NET 입금 + 수수료로 1130 소거.
3. **통장 연결**: 정산 저장 시 `bank_transaction_id` 연결.
4. **금지**: 같은 통장 입금에 채널 정산 + `receivable_receive` 동시 사용.
5. **`receivable_receive`**: B2B 수금·수수료 없는 단순 입금에만. 카드/배달 정산 입금은 채널 정산만.

---

## 4. 지출·미지급

| 시나리오 | 발생 | 지급 | 분개 |
|----------|------|------|------|
| 지출 발생 승인 | `expense_accruals` | — | Dr 비용 Cr 2110 |
| 지출 관리 지급 | — | 통장 연결 또는 패티 | Dr 2110 Cr 현금 |
| 통장 즉시 비용 | — | 출금 `expense`/`fixed` | Dr 비용 Cr 현금 (지출 발생 없이) |
| 매입 대금 | 입고/발주 → 미지급 | `purchase_payment` + 입고 연동 | Dr 2110 Cr 현금 |

**이중 지급 방지**

- 지출 발생 → 지급: 통장 출금은 `transfer`/`unclassified` 등(저장 시 손익 분개 없음) + 지출 관리 **통장 연결 지급만**.
- 통장을 이미 `expense`로 저장한 줄을 지출 관리에서 다시 연결하지 않음.
- `purchase_payment`와 지출 관리 매입 지급을 동시에 쓰지 않음.

---

## 5. 월말 마감 체크리스트 (방콕 기준)

- [ ] 재무제표(`/admin/financial-statements`) → **장부 대사** 탭: 보조원장 vs 분개 1130/2110 차이 확인
- [ ] 시산표 1130 잔액 vs 미처리 채널 정산 목록
- [ ] `receivable_transactions` 음수 매장 — `sql/outbound_soft_delete_integrity_checks.sql` §3
- [ ] 지출 발생 `approved` 잔액 vs `payable_transactions` (expense_accrual_id)
- [ ] 통장 `purchase_payment` 입고 연동 누락 — [BANK_INBOUND_RECEIVABLE_FLOW.md](BANK_INBOUND_RECEIVABLE_FLOW.md) §5–6
- [ ] 통장 `revenue_*` 입금(이중 매출 위험) — 대사 화면 또는 `sql/accounting_legacy_cleanup_checks.sql`
- [ ] `balanceCheckDiff` ≠ 0 → 미분개 통장 출금(`transfer`, `loan`, `advance`, `correction`) 확인

---

## 6. 레거시 정리

과거 이중 분개·잘못된 입금 분류는 [ACCOUNTING_LEGACY_CLEANUP_RUNBOOK.md](ACCOUNTING_LEGACY_CLEANUP_RUNBOOK.md) 참고.
