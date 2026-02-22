# 계정과목 비교 분석: Excel Income Statement vs ERP account_subjects

**기준 문서**: `3. Income Statement - EKKAMAI - Sep. 2025.xlsx`  
**ERP 시드**: `supabase_add_account_subjects.sql`

---

## 1. 구조적 차이

| 구분 | Excel (손익계산서) | ERP (account_subjects) |
|------|-------------------|------------------------|
| **형식** | 계층형 라벨 (1. 2. 3. / 1) 2) 3)) | 플랫 과목코드 (4자리) |
| **용도** | 보고·재무제표 출력 | 통장거래·고정비 분류 |
| **수익 항목** | 포함 (GR, Opening Income 등) | 미포함 (비용·이체만) |
| **매출원가** | 포함 | 미포함 |
| **판관비** | Administrative expenses 세부 16개 | 20개 과목 (일부 중복) |

---

## 2. Excel 계정과목 체계 (요약)

### 수익
- 1. Franchise Opening Income (Opening Income, Interior, Others)
- 2. G.R(Gross Revenue): Store sales, Grab/LineMan/Shopee/Food Panda/Robinhood app., service&discount

### 비용(원가)
- 3. Cost of good solds: Beginning Inventory, Cost of Merchandise Purchased, Purchase Incidental Costs, Ending Inventory
- 4. Sales cost: Grab/LineMan/Shopee/Food Panda/Robinhood app. fee, Card fee, service&discount

### 판관비 (6. Administrative expenses)
| Excel (영문) | ERP 매칭 | 비고 |
|--------------|----------|------|
| 1) Wage | 5310 급여 | ✅ 매칭 |
| 2) Employee Benefits | 5330 복리후생 | ✅ 매칭 |
| 3) Vehicles | 5460 교통비 (부분) | ⚠️ 차량비 별도 없음 |
| 4) Travel Expenses | 5460 교통비 | ✅ 매칭 |
| 5) Post & Communication | 5420 통신비, 5470 통신비(전화) | ⚠️ 통신비 2개로 분리됨 |
| 6) Utility | 5430 전기료, 5440 수도광열비 | ⚠️ 세분화됨 |
| 7) Tax and Fee | 5510 세금공과금 | ✅ 매칭 |
| 8) Rental Expenses | 5410 임차료 | ✅ 매칭 |
| 9) Miscellaneous Administrative Expenses | 5520 기타경비 | ✅ 매칭 |
| 10) Insurance Premium | 5490 보험료 | ✅ 매칭 |
| 11) Service costs | ❌ 없음 | **ERP 미포함** |
| 12) Research & Development | ❌ 없음 | **ERP 미포함** |
| 13) Marketing | 5524~5527 홍보/광고/프로모션/SNS | ✅ 매칭 |
| 14) Entertainment | 5450 접대비 | ✅ 매칭 |
| 15) Repair fee | ❌ 없음 | **ERP 미포함** |
| 16) Depreciation | 5500 감가상각비 | ✅ 매칭 |

### 기타
- 8. Other Non-operating Expenses (Short-term Borrowings, Short-term Return 등)
- 9. Other Non-operating Revenues (Bank Interest, Others)
- ERP: 1110 현금이체 (이체만, 손익 제외)

---

## 3. ERP에 있으나 Excel에는 직접 매칭되지 않는 항목

| ERP 코드 | ERP 과목명 | Excel 매칭 |
|----------|------------|------------|
| 5320 | 상여금 | Employee Benefits 하위에 포함 가능 |
| 5420 | 통신비 | Post & Communication (5) |
| 5470 | 통신비(전화) | Post & Communication (5) – 중복 가능성 |
| 5480 | 소모품비 | Miscellaneous (9) 또는 별도 없음 |

---

## 4. Excel에 있으나 ERP에 없는 항목

| Excel 항목 | 유형 | ERP 추가 제안 |
|------------|------|---------------|
| **Service costs** (11) | 판관비 | 5521 용역비 또는 5528 서비스비 |
| **Research & Development** (12) | 판관비 | 5522 연구개발비 |
| **Repair fee** (15) | 판관비 | 5523 수리비 |
| **Vehicles** (3) | 판관비 | 5461 차량유지비 (5460과 분리 시) |
| **Card fee** (Sales cost) | 매출원가 | 4110 카드수수료 (매출원가 과목) |
| **Grab/LineMan/Shopee app. fee** | 매출원가 | 4120 딜리버리수수료 등 |

---

## 5. 명칭/분류 차이

| Excel | ERP | 차이 |
|-------|-----|------|
| Wage | 급여 | 동일 |
| Employee Benefits | 복리후생 | 상여금은 Excel에 명시 없음 (복리후생에 포함 가능) |
| Rental Expenses | 임차료 | 동일 |
| Utility | 전기료+수도광열비 | ERP는 세분화 |
| Post & Communication | 통신비, 통신비(전화) | ERP에 2개 존재 (5420, 5470) – 정리 필요 |
| Miscellaneous Administrative | 기타경비 | 동일 |
| Marketing | 홍보비, 광고비, 프로모션비, SNS마케팅 | ERP가 세분화 |

---

## 6. 권장 조치

### 6.1 ERP에 추가할 계정과목 (시드 INSERT)

```sql
-- 판관비 보완
('5521', '용역비', 'Service costs', 'expense', 'expense', 134),
('5522', '연구개발비', 'R&D', 'expense', 'expense', 135),
('5523', '수리비', 'Repair fee', 'expense', 'expense', 136),
('5461', '차량유지비', 'Vehicles', 'expense', 'expense', 123),
```

### 6.2 통신비 정리

- **5420 통신비** vs **5470 통신비(전화)**: 하나로 통합하거나, 5420=인터넷/데이터, 5470=전화로 명확히 구분할지 결정 필요.

### 6.3 매출원가 과목 (선택)

손익계산서에 매출원가·판매비를 ERP에서 관리하려면:

- 4110 카드수수료, 4120 딜리버리수수료(또는 Grab/LineMan 등)
- 5100 매입원가, 5200 재고변동 등

현재 통장 기반 비용 입력에는 **판관비·고정비** 중심으로 설계되어 있어, 매출원가는 별도 모듈(매입·출고 등) 연동 시 추가 검토.

---

## 7. 요약

| 항목 | Excel | ERP | 조치 |
|------|-------|-----|------|
| 급여·복리·임차·접대·보험·감가·세금·기타 | ✅ | ✅ | 유지 |
| 홍보·광고·마케팅 | ✅ (13 Marketing) | ✅ 세분화 | 유지 |
| 용역비, 연구개발비, 수리비 | ✅ | ❌ | **추가 권장** |
| 차량비 | ✅ (3 Vehicles) | 5460 교통비에 포함 | 필요시 5461 추가 |
| 통신비 | 1개 (5) | 2개 (5420, 5470) | 정의 정리 |
| 매출원가·판매비 | ✅ | ❌ | 향후 모듈 연동 시 검토 |
