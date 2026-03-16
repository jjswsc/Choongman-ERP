# 출고·미수금·통장·입고 연계 구조

## 1. 전체 흐름 요약

| 구분 | 출고(Outbound) | 입고(Inbound) | 미수금 | 미지급금 | 통장 |
|------|----------------|---------------|--------|----------|------|
| **발생 경로** | 본사→매장 배송 | 거래처→본사/매장 입고 | 주문/매출 | 발주/입고/매입 대금 | 입출금 |
| **inbound_batches** | ❌ 생성 안 함 | ✅ 생성 | — | — | 연동 대상 |

---

## 2. 입고 배치(inbound_batches)가 생성되는 경로

**오직 한 곳에서만 생성됩니다.**

```
[입고 등록] 페이지 → registerInboundBatch API
```

- **경로**: 관리자 > 입고 > 직매입 또는 발주서에서 입고 등록
- **생성 내용**:
  - `inbound_batches` (입고 배치)
  - `stock_logs` (Inbound, location=매장 또는 입고등록)
  - `payable_transactions` (미지급금, ref_type=Inbound, ref_id=batchId)

**출고(processOrderReceive)는 inbound_batches를 만들지 않습니다.**

- 본사→매장 배송 시:
  - 본사: `stock_logs` Outbound (vendor_target=매장명)
  - 매장: `stock_logs` Inbound (vendor_target='From HQ')
- `vendor_target: 'From HQ'` → 거래처 매입이 아님 → **inbound_batches 없음**, **payable 없음**

---

## 3. 미수금(Receivable) 발생 경로

| 경로 | ref_type | ref_id | 설명 |
|------|----------|--------|------|
| **출고 수령 (인보이스 발행)** | Order | orderId | processOrderReceive **← 미수금 생성 시점** |
| 통장 입금(매출 수령) | Receive | null | addBankTransaction (category=receivable_receive) |
| 수동 입력 | Opening/Receive | null | addBalanceTransaction |

- **미수금은 주문 승인이 아닌 출고 수령 시점**에 생성 (물류·회계 혼동 방지)
- `processOrderReceive` 시 `upsertReceivableFromOrder` 호출 → invoice_no: `IV{yyyymmdd}-{orderId}`
- 출고 관리와 미수금 탭에서 동일한 인보이스 번호 표시

---

## 4. 미지급금(Payable) 발생 경로

| 경로 | ref_type | ref_id | 설명 |
|------|----------|--------|------|
| 발주 승인 | PO | poId | upsertPayableFromPO |
| **입고 등록** | **Inbound** | **batchId** | registerInboundBatch |
| 통장 출금(매입 대금) | Payment | null | addBankTransaction (category=purchase_payment) |
| 수동 입력 | Opening/Payment | null | addBalanceTransaction |

---

## 5. 통장 입고 연동이 동작하는 조건

**통장 출금 + 용도 "매입 대금"(purchase_payment)** 에서만 입고 연동이 가능합니다.

연동 대상: **inbound_batches** 테이블의 배치 목록

```
getInboundBatchesForLink API
  - vendorCode/vendorName: 거래처 매칭
  - storeFilter: 선택된 통장 계좌의 매장 (location 필터)
```

### "해당 거래처의 입고 배치가 없습니다"가 나오는 경우

1. **입고 등록을 하지 않은 경우**
   - 거래처에서 물건을 받았지만, 입고 페이지에서 등록하지 않음
   - 입고 등록 없이는 `inbound_batches`가 생성되지 않음

2. **출고만 사용하는 경우**
   - 본사→매장 배송은 `processOrderReceive`로 처리
   - 이 경로는 inbound_batches를 만들지 않음
   - 매입 대금과 연결할 입고 건이 없음

3. **거래처 코드/이름 불일치**
   - 통장 거래의 `vendorCode`와 inbound_batches의 `vendor_code`/`vendor_name`이 다름
   - vendors 테이블의 code, name, gps_name 기준으로 매칭

4. **매장(location) 불일치**
   - 통장 계좌가 "강남점"인데, 입고 배치 location이 "본사" 또는 "입고등록"인 경우
   - `storeFilter`로 매장별 필터링되므로, 해당 매장 입고만 보임

5. **직매입/지두방 등 별도 흐름**
   - 매장이 거래처와 직접 거래하여 입고 등록을 하지 않는 경우
   - 또는 발주 없이 현금 결제 후 입고를 시스템에 안 넣는 경우

---

## 6. 권장 업무 흐름 (매입 대금 입고 연동 시)

```
1. 발주서 작성·승인 (선택)
2. 거래처에서 물품 수령
3. [입고 등록] - 품목, 수량, 단가, 거래처 입력
   → inbound_batches 생성, 미지급금 발생
4. 통장에서 매입 대금 지급
5. 통장 거래에서 "입고 연동" 클릭 → 해당 입고 배치에 결제액 할당
   → bank_transaction_inbound_links에 연동 저장
```

- 입고 등록이 없으면 입고 연동이 불가능함
- 출고(본사→매장)와 입고(거래처→본사/매장)는 서로 다른 흐름

---

## 7. 참고: stock_logs의 log_type

| log_type | vendor_target | inbound_batches | 설명 |
|----------|---------------|-----------------|------|
| Inbound | 거래처명 | ✅ 있음 | 입고 등록 (registerInboundBatch) |
| Inbound | From HQ | ❌ 없음 | 출고 수령 (processOrderReceive) |
| Outbound | 매장명 | — | 본사 출고 (processOrderReceive) |
