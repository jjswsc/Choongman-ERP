# AI 센터 — 매장 운영 지표 정의 (1단계)

> **상태:** 초안 — 대표 확인 후 2단계(RPC)에 반영  
> **0단계 DB:** `ai_center_foundation.sql` 적용 완료 (8테이블 ok)

## 1. 첫 번째 지표 (MVP)

**이름:** 매장별 **매출 대비 본사 창고 출고(매입) 비율**

| 항목 | 정의 |
|------|------|
| **분모 (매출)** | 가맹: `pos_orders` 완료 `total` 합(본사·오피스 store_code 테스트 POS는 **매출 관리 제외**). **본사 손익 매출**은 물류 `stock_logs` 출고 |
| **분자 (본사 매입)** | 해당 매장으로의 **본사 창고 출고** 금액 (`sumHqOutboundPurchaseFromOffice` — 손익계산서 「본사 창고 출고(매입)」과 동일) |
| **비율** | `분자 ÷ 분모 × 100` (%). 분모 0이면 비율 null, 매출만 표시 |
| **기간** | 방콕 **달력일** `start` ~ `end` (YYYY-MM-DD). AI 질의 시 `applyAiDateRangePolicy` 상한 적용 (본사·회계 90일, 매장 45일) |
| **매출 영업일** | `posSalesByStore` / `sumCompletedPosSalesTotal` 과 동일 — 매장별 POS 영업일 설정 반영 |
| **포함 주문 상태** | `completed`, `paid`, `ready` (POS 매출 API와 동일) |

### 의도적으로 **넣지 않는** 것 (1차)

- 승인 발주(`orders` Approved)만의 합계 — 손익 화면의 **참고값**(`approvedOrdersTotal`)이며, 비율 분자로 쓰지 않음
- 직접 입고·통장 매입지급·경비 — 손익 「매입」 전체가 아니라 **본사 출고 한 줄**만
- 본사(Office) 스토어 자체 손익 — 가맹/매장 분석 대상에서 제외

### ERP 화면과 맞추는 곳

| 화면 | 대응 |
|------|------|
| 매출 관리 | `/api/posSalesByStore` → `total` 합 |
| 손익계산서 (매장) | `computeIncomeStatementReport` → `purchaseHqOutboundBasis.outboundTotal`, `sales` |

---

## 2. 권한·매장 스코프

`lib/ai/policy.ts` 와 동일:

| 역할 | 매장 | 기간 상한 |
|------|------|-----------|
| 본사·회계 | 요청 매장 또는 전체(`All`) | 90일 |
| 매장장·가맹 | **자기 매장만** (요청 무시) | 45일 |

AI 도메인(예정): `store_ops_metrics` — 본사·회계만 (매출·매입 민감)

---

## 3. 확인 질문 (대표 체크)

아래에 **예/아니오**만 정해 주시면 2단계 RPC 스펙을 고정합니다.

1. **분모**를 POS `total`(세금·서비스 포함 매출액)으로 할까요, `subtotal`(공급가)로 할까요?  
   - 초안: **`total`** (매출 관리·`sumCompletedPosSalesTotal` 와 동일)

2. **분자**를 손익의 「본사 창고 출고」만으로 할까요?  
   - 초안: **예** (`stock_logs` 기반 출고)

3. **기간**을 달력일로 할까요, 손익의 `yearMonth` 한 달 단위만 할까요?  
   - 초안: **달력일 start~end** (AI 질문에 “이번 달”“최근 30일” 대응)

4. **전 매장 비교**는 본사·회계만 볼 수 있게 할까요?  
   - 초안: **예**

---

## 4. 다음 단계 (2단계 예고)

- Supabase RPC `get_ai_store_hq_purchase_ratio(p_start, p_end, p_stores[])`
- `lib/ai/store-ops-advisor.ts` + `/api/ai/ask` 연동

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-22 | 1단계 초안 (0-1 DB 통과 후) |
