# 인테리어 ERP 계획서

## 1. 현황 분석 요약

### 1.1 프로젝트당 사용 중인 엑셀 파일 (6종)

| 파일명 | 용도 | 핵심 데이터 |
|--------|------|-------------|
| **Expense.xlsx** | 지출·결제 내역 | Quote(견적), Paid(결제), Balance(잔액), 회차별 결제일/금액, 업체명 |
| **Direct purchase M&E.xlsx** | 직매입 품목 | item, Description, Qty, price, sum, Sipplier, Remark/Status |
| **Kitchen Huamark.xlsx** | 주방 설비 (매장별) | Item, size, Supplier, Zone, price(Thai), จำนวน |
| **Kitchen-Future Park.xlsx** | 주방 설비 (매장별) | 동일 구조 |
| **Master Schedule CM Future Park Rangsit.xlsx** | 공정표/일정 | 작업 번호, 작업 상세, 일별 진행 |
| **SPECIFICATION.xlsx** | 자재·마감재 사양서 | Description, Code, Size, Supplier, Location |

### 1.2 회계 연동 포인트

| 소스 | 연동 항목 | ERP 활용 |
|------|-----------|----------|
| Expense | Quote, Paid, Balance, 결제일, 업체명 | 프로젝트별 예산·실적, 결제 추적 |
| Direct purchase | price, sum, 공급업체, Status | 직매입 비용, 발주·결제 상태 |
| Kitchen | price(Thai), จำนวน, Supplier | 주방 설비 원가·자산 |
| SPECIFICATION | Code, Supplier | 품목·거래처 마스터 구축 |

---

## 2. ERP 연동 방향

- **인테리어 ↔ 회계만 연동** (물류·POS·인사와 분리)
- **프로젝트 단위 관리** (프로젝트 = 점포/사업장)
- 기존 `bank_transactions`, `payable_transactions`, `vendors`와 연동

---

## 3. DB 스키마 제안

### 3.1 인테리어 프로젝트 마스터

```sql
-- 인테리어 프로젝트 (점포·사업장별)
CREATE TABLE interior_projects (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,           -- 예: FP-RANGSIT, HUAMARK
  name TEXT NOT NULL,                  -- 예: CM Future Park Rangsit
  location TEXT DEFAULT '',            -- 주소/위치
  status TEXT DEFAULT 'active',        -- active, completed, hold
  budget_total NUMERIC(12,2) DEFAULT 0,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 프로젝트별 비용 항목 (Expense 시트 대체)

```sql
-- 프로젝트 비용 항목 (Expense 시트)
CREATE TABLE interior_expense_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,               -- interior, M&E, dumbwaiter, GAS, Kitchen 등
  description TEXT NOT NULL,           -- 업체/작업명
  vendor_code TEXT DEFAULT '',         -- vendors.code
  quote NUMERIC(12,2) DEFAULT 0,      -- 견적/계약 금액
  paid NUMERIC(12,2) DEFAULT 0,       -- 누적 결제액
  balance NUMERIC(12,2) DEFAULT 0,    -- 잔액
  payment_schedule JSONB DEFAULT '[]', -- [{ratio, date, amount}, ...]
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 직매입 품목 (Direct purchase 대체)

```sql
-- 직매입 품목 (Direct purchase M&E 시트)
CREATE TABLE interior_direct_purchases (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,               -- M&E, Interior, Kitchen, Air condition
  item_no INT DEFAULT 0,
  description TEXT NOT NULL,
  qty NUMERIC(10,2) DEFAULT 1,
  unit TEXT DEFAULT 'set',
  price NUMERIC(12,2) DEFAULT 0,
  sum_amount NUMERIC(12,2) DEFAULT 0,
  supplier_code TEXT DEFAULT '',       -- vendors.code
  status TEXT DEFAULT 'pending',       -- pending, quoted, ordered, paid
  remark TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 주방 설비 (Kitchen 시트 대체)

```sql
-- 주방 설비 목록 (Kitchen Huamark / Kitchen-Future Park)
CREATE TABLE interior_kitchen_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  item_name_kr TEXT DEFAULT '',
  item_name_en TEXT DEFAULT '',
  size_mm TEXT DEFAULT '',              -- 1500*700*850
  supplier_code TEXT DEFAULT '',
  zone TEXT DEFAULT '',                -- Counter, Kitchen
  price NUMERIC(12,2) DEFAULT 0,
  quantity NUMERIC(10,2) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 사양서 (SPECIFICATION 대체)

```sql
-- 자재·마감재 사양서
CREATE TABLE interior_specifications (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  code TEXT DEFAULT '',
  size TEXT DEFAULT '',
  supplier_code TEXT DEFAULT '',
  location TEXT DEFAULT '',            -- 시공 위치
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.6 프로젝트 일정 (Master Schedule 대체)

```sql
-- WBS/일정 (Master Schedule)
CREATE TABLE interior_schedule_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  item_no INT DEFAULT 0,
  work_detail TEXT NOT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  day_progress JSONB DEFAULT '{}',      -- {d1: 'Y', d2: 'N', ...}
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.7 도면·견적서 업로드

```sql
-- 도면 및 견적서 파일
CREATE TABLE interior_project_files (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,              -- blueprint(도면), estimate(견적서)
  file_name TEXT NOT NULL,              -- 원본 파일명
  file_path TEXT NOT NULL,              -- 스토리지 경로 (Supabase Storage 등)
  file_size INT DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. 회계 연동 설계

### 4.1 연동 흐름

```
인테리어 비용 입력
    ↓
interior_expense_items.paid / interior_direct_purchases.status
    ↓
bank_transactions (실제 출금)
  - category: 'interior'
  - memo: project_code + 항목명
  - (선택) ref_type='interior_expense', ref_id=id
    ↓
payable_transactions (미지급금)
  - ref_type: 'Interior'
  - ref_id: interior_expense_items.id
  - vendor_code: vendors.code
```

### 4.2 기존 테이블 확장

| 테이블 | 확장 내용 |
|--------|-----------|
| `bank_transactions` | `ref_type='interior_expense'`, `ref_id` (interior_expense_items.id) |
| `payable_transactions` | `ref_type='Interior'`, `ref_id` |
| `vendors` | 인테리어 업체(vendor_code) 등록·조회 |

---

## 5. UI/메뉴 구조 제안

### 5.1 사이드바 추가

```
7. 인테리어 관리 (신규)
   - 프로젝트 목록
   - 일정 (Schedule)          ← 프로젝트 목록 바로 다음
   - 비용/결제                ← 탭: 비용, 직매입
   - 도면·견적서              ← 업로드·다운로드
   - 주방 설비 (Kitchen)
   - 사양서 (Specification)
```

### 5.2 페이지 구조

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/admin/interior` | 프로젝트 목록 | 프로젝트 등록·조회·필터 |
| `/admin/interior/[projectId]/schedule` | 일정 | 공정표 (프로젝트 선택 후) |
| `/admin/interior/[projectId]/expense` | 비용/결제 | **탭 1: 비용** (Expense 시트) · **탭 2: 직매입** (M&E, Interior, Kitchen, Air condition) |
| `/admin/interior/[projectId]/files` | 도면·견적서 | 도면/견적서 업로드·다운로드 |
| `/admin/interior/[projectId]/kitchen` | 주방 설비 | Kitchen Huamark/Future Park형 목록 |
| `/admin/interior/[projectId]/specification` | 사양서 | 자재·마감재 목록 |

### 5.3 비용/결제 탭 구성

- **탭 1 · 비용**: `interior_expense_items` — 견적(Quote), 결제(Paid), 잔액(Balance), 회차별 결제
- **탭 2 · 직매입**: `interior_direct_purchases` — M&E, Interior, Kitchen, Air condition 카테고리별 목록

### 5.4 도면·견적서 업로드

- 프로젝트 상세 또는 별도 메뉴에서 **도면** / **견적서** 파일 업로드
- Supabase Storage 또는 동일 스토리지 사용
- 파일 유형: PDF, 이미지, DWG 등

### 5.5 회계 연동 UI

- 비용/직매입 탭에서 **결제** 버튼 → `bank_transactions` 등록 팝업
- `receivable-payable`(미수금 관리)에서 `ref_type='Interior'` 조회·필터
- 프로젝트별 비용 요약 → 손익계산서/회계 리포트 연동

---

## 6. 구현 단계 제안

### Phase 1: 기반 구축 (1~2주)

1. `interior_projects` 테이블 생성
2. `/admin/interior` 프로젝트 목록 페이지
3. 프로젝트 CRUD

### Phase 2: 비용·직매입 (2~3주)

1. `interior_expense_items`, `interior_direct_purchases` 테이블
2. Expense 탭 UI (견적, 결제, 잔액)
3. Direct purchase 탭 UI (M&E, Interior, Kitchen, Air condition)
4. 엑셀 임포트(선택)

### Phase 3: 회계 연동 (1~2주)

1. `bank_transactions`에 `ref_type`, `ref_id` 확장
2. 결제 시 `bank_transactions` / `payable_transactions` 연동
3. 미수금 관리에서 인테리어 항목 필터

### Phase 4: 일정·도면·견적서 (1~2주)

1. `interior_schedule_items` + 일정 UI (프로젝트 목록 다음)
2. `interior_project_files` + 도면·견적서 업로드 UI
3. Kitchen·사양서 UI

---

## 7. 엑셀 임포트 전략 (선택)

- **1차**: 수동 입력 위주로 UI 구축
- **2차**: CSV/엑셀 업로드 → `interior_expense_items`, `interior_direct_purchases` 등에 매핑
- 매핑 규칙: 컬럼명 → DB 필드 매핑 JSON 설정

---

## 8. 권한·접근

- 기존 `menu_permissions`에 `interior` 권한 추가
- 오피스/본사만 수정, 매장은 조회만 (또는 프로젝트별 역할)

---

## 9. 작업 진행 계획 (실행 순서)

### Step 0: 사전 준비 (1일)
- [ ] Supabase 스키마 SQL 파일 작성 (`supabase_interior.sql`)
- [ ] Supabase SQL Editor에서 실행·테이블 확인

### Step 1: 스키마·API·사이드바 (2~3일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 1-1 | `interior_projects` 테이블 SQL 작성 | `supabase_interior.sql` |
| 1-2 | 프로젝트 CRUD API | `getInteriorProjects`, `saveInteriorProject`, `deleteInteriorProject` |
| 1-3 | admin-sidebar에 인테리어 메뉴 추가 | `admin-sidebar.tsx` |
| 1-4 | `/admin/interior` 프로젝트 목록 페이지 | `app/admin/interior/page.tsx` |
| 1-5 | 프로젝트 등록/수정 다이얼로그 | `components/interior/project-form-dialog.tsx` |

**체크포인트**: 프로젝트 추가·목록 조회·삭제 동작 확인

### Step 2: 프로젝트 레이아웃·일정 (2~3일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 2-1 | `interior_schedule_items` 테이블 SQL | `supabase_interior.sql` (추가) |
| 2-2 | 프로젝트 선택 시 레이아웃 (Tabs 또는 서브네비) | `interior/[projectId]/layout.tsx` |
| 2-3 | 일정 API·UI | `getInteriorSchedule`, `saveInteriorScheduleItem`, `interior/schedule/page.tsx` |
| 2-4 | 프로젝트 목록 → 프로젝트 선택 → 일정 진입 흐름 | 라우팅 확정 |

**체크포인트**: 프로젝트 클릭 시 일정 탭 이동·일정 CRUD 동작

### Step 3: 비용/결제 (비용 + 직매입 탭) (3~4일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 3-1 | `interior_expense_items`, `interior_direct_purchases` SQL | `supabase_interior.sql` (추가) |
| 3-2 | 비용·직매입 API | `getInteriorExpenseItems`, `saveInteriorExpenseItem`, `getInteriorDirectPurchases`, `saveInteriorDirectPurchase` |
| 3-3 | `/admin/interior/[projectId]/expense` 페이지 | `expense/page.tsx` |
| 3-4 | 탭 1: 비용 UI (견적, 결제, 잔액, 회차) | `InteriorExpenseTab` |
| 3-5 | 탭 2: 직매입 UI (M&E, Interior, Kitchen, Air condition) | `InteriorDirectPurchaseTab` |

**체크포인트**: 비용 항목·직매입 품목 추가·수정·삭제, 탭 전환

### Step 4: 도면·견적서 업로드 (2일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 4-1 | `interior_project_files` SQL | `supabase_interior.sql` (추가) |
| 4-2 | Supabase Storage 버킷 설정 (interior-files) | Supabase 대시보드 |
| 4-3 | 파일 업로드/다운로드 API | `uploadInteriorFile`, `getInteriorFiles`, `deleteInteriorFile` |
| 4-4 | `/admin/interior/[projectId]/files` 페이지 | `files/page.tsx` |
| 4-5 | 도면/견적서 구분 업로드 UI | FileUpload 컴포넌트 |

**체크포인트**: 파일 업로드·목록·다운로드·삭제

### Step 5: 회계 연동 (2일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 5-1 | `bank_transactions`에 `ref_type`, `ref_id` 컬럼 추가 (없을 경우) | `supabase_interior_bank_ref.sql` |
| 5-2 | 비용 항목 결제 시 `bank_transactions` 연동 | `expense` 탭에 결제 버튼·팝업 |
| 5-3 | `payable_transactions` ref_type='Interior' 연동 | 결제 시 미지급금 생성/차감 |
| 5-4 | 미수금 관리 화면에 Interior 필터 (선택) | `receivable-payable` 수정 |

**체크포인트**: 결제 버튼 → bank_transactions 등록 → 잔액 반영

### Step 6: 주방 설비·사양서 (2~3일)

| 순서 | 작업 | 산출물 |
|------|------|--------|
| 6-1 | `interior_kitchen_items`, `interior_specifications` SQL | `supabase_interior.sql` (추가) |
| 6-2 | Kitchen·사양서 API | `getInteriorKitchenItems`, `saveInteriorKitchenItem`, `getInteriorSpecifications`, `saveInteriorSpecification` |
| 6-3 | `/admin/interior/[projectId]/kitchen` 페이지 | `kitchen/page.tsx` |
| 6-4 | `/admin/interior/[projectId]/specification` 페이지 | `specification/page.tsx` |

**체크포인트**: 주방 설비·사양서 CRUD, vendors 연동

---

## 10. 파일 구조 (예상)

```
vercel-app/
├── app/admin/interior/
│   ├── page.tsx                    # 프로젝트 목록
│   └── [projectId]/
│       ├── layout.tsx               # 프로젝트 하위 공통 레이아웃
│       ├── schedule/page.tsx        # 일정
│       ├── expense/page.tsx         # 비용/결제 (탭: 비용, 직매입)
│       ├── files/page.tsx           # 도면·견적서
│       ├── kitchen/page.tsx         # 주방 설비
│       └── specification/page.tsx   # 사양서
├── app/api/
│   ├── getInteriorProjects/route.ts
│   ├── saveInteriorProject/route.ts
│   ├── getInteriorSchedule/route.ts
│   ├── saveInteriorScheduleItem/route.ts
│   ├── getInteriorExpenseItems/route.ts
│   ├── saveInteriorExpenseItem/route.ts
│   ├── getInteriorDirectPurchases/route.ts
│   ├── saveInteriorDirectPurchase/route.ts
│   ├── getInteriorFiles/route.ts
│   ├── uploadInteriorFile/route.ts
│   ├── getInteriorKitchenItems/route.ts
│   ├── saveInteriorKitchenItem/route.ts
│   ├── getInteriorSpecifications/route.ts
│   └── saveInteriorSpecification/route.ts
├── components/interior/
│   ├── project-form-dialog.tsx
│   ├── project-list-table.tsx
│   ├── interior-expense-tab.tsx
│   ├── interior-direct-purchase-tab.tsx
│   ├── interior-schedule-tab.tsx
│   └── interior-file-upload.tsx
└── lib/api-client.ts                # API 클라이언트 함수 추가

c:\CM_ERP/
├── supabase_interior.sql            # 인테리어 테이블 일괄
└── supabase_interior_bank_ref.sql   # bank_transactions 확장 (필요시)
```

---

## 11. 권장 작업 순서 요약

1. **Week 1**: Step 0 + Step 1 (스키마, API, 프로젝트 목록, 사이드바)
2. **Week 2**: Step 2 + Step 3 (일정, 비용/직매입 탭)
3. **Week 3**: Step 4 + Step 5 (도면·견적서, 회계 연동)
4. **Week 4**: Step 6 (주방 설비, 사양서)

---

## 12. 다음 단계

1. Step 0 `supabase_interior.sql` 작성 완료
2. Step 1-1 ~ 1-5 순차 진행
