# POS 메인화면 구성 설계안 (Upsolution 스타일)

> 로그인 후 업솔루션처럼 타일 그리드 메인 화면을 두고, 선택한 기능으로 이동하는 방식

## 1. 현재 vs 목표

| 구분 | 현재 (CM ERP) | 목표 (Upsolution 스타일) |
|------|---------------|--------------------------|
| **로그인 후** | 바로 주문 화면 `/pos` | **메인 화면** (타일 그리드) |
| **화면 전환** | - | 타일 클릭 → 해당 기능 화면 |
| **구성** | 고정 | 매장/권한별로 표시 타일 선택 가능 (추후) |

## 2. Upsolution 타일 → CM ERP 매핑

| Upsolution | CM ERP 매핑 | 경로/기능 |
|------------|-------------|-----------|
| **홀 서빙** | 매장 주문 | `/pos/order` (dine_in) |
| **배달** | 배달 주문 | `/pos/order` (delivery) |
| **포장** | (별도 또는 통합) | `/pos/order` (takeout) |
| **영수증 관리** | 주문 조회·재출력 | `/admin/pos-orders` 또는 POS 전용 |
| **주문목록조회** | 최근 주문·재주문 | `/pos/order` 내 "재주문" 또는 별도 |
| **영업준비** | 오프라인 동기화, 오늘 첫 시작 | `lib/offline` sync 또는 placeholder |
| **영업마감** | 결산 | `/admin/pos-settlement` |
| **근태관리** | 출퇴근 | `/attendance` 또는 `/admin/attendance` |
| **시재 입금** | 경비 입금 | `/admin/petty-cash` (입금) |
| **시재 출금** | 경비 출금 | `/admin/petty-cash` (출금) |
| **안전모드** | (선택) 제한 모드 | 추후 |
| **돈통** | (선택) 시재 확인 | 추후 |
| **운영 관리** | Admin 이동 | `/admin` |
| **영업속보** | 오늘 매출 요약 | `/pos` 또는 메인 타일에 위젯 |
| **프로그램 재시작** | 새로고침 | `window.location.reload()` |

## 3. 추천 타일 구성 (1차)

**필수 (치킨 매장 기준)**
- 매장 주문 (홀 서빙) — 크게
- 포장
- 배달
- 영업마감 (결산)
- 영수증/주문 조회
- 영업속보 (오늘 매출)

**권한에 따라 표시**
- 근태관리 (staff 이상)
- 시재 입금/출금 (매니저 이상 + petty-cash)
- 운영 관리 (Admin, 매니저 이상)

**선택**
- 영업준비 (동기화 확인)
- 프로그램 재시작

## 4. 구현 방향

### 4-1. 라우팅 변경

```
/pos                    → 메인 화면 (타일 그리드) ← 신규
/pos/order              → 기존 주문 화면 (page.tsx 이동)
/admin/pos-settlement   → 그대로
/admin/pos-orders       → 그대로
```

### 4-2. 신규 파일

- `app/pos/page.tsx` → `app/pos/main/page.tsx` 또는
- `app/pos/page.tsx`를 메인 화면으로 변경, 기존 내용 → `app/pos/order/page.tsx`

### 4-3. 메인 화면 UI

- Upsolution 스타일: 그리드 레이아웃
- 타일: 아이콘 + 라벨, 클릭 시 해당 경로로 이동
- 색상: 주문(주황/빨강), 결산/관리(보라/파랑) 등 구분
- 반응형: 태블릿 터치에 맞게 큰 버튼

### 4-4. 설정 (추후)

- `pos_main_screen_items` 테이블: 매장·권한별 표시 타일
- 관리자에서 "메인 화면에 표시할 메뉴" 체크박스로 편집

## 5. 구현 단계

| 단계 | 내용 | 예상 작업 |
|------|------|-----------|
| **1단계** | 메인 화면 페이지 + 고정 타일 | 1~2일 |
| **2단계** | 타일 클릭 시 정확한 화면/파라미터 연결 | 0.5일 |
| **3단계** | 권한별 타일 표시/숨김 | 0.5일 |
| **4단계** | (선택) DB 저장, 관리자에서 편집 | 2~3일 |

---

## 6. 타일 컴포넌트 예시 구조

```tsx
// 타일 데이터
const TILES = [
  { id: 'order-dine', label: '매장 주문', icon: UtensilsCrossed, href: '/pos/order?type=dine_in', color: 'amber', size: 'large' },
  { id: 'order-takeout', label: '포장', icon: Package, href: '/pos/order?type=takeout', color: 'amber' },
  { id: 'order-delivery', label: '배달', icon: Truck, href: '/pos/order?type=delivery', color: 'orange' },
  { id: 'settlement', label: '영업마감', icon: Wallet, href: '/admin/pos-settlement', color: 'violet' },
  { id: 'orders', label: '주문 조회', icon: FileText, href: '/admin/pos-orders', color: 'slate' },
  { id: 'attendance', label: '근태', icon: Clock, href: '/attendance', color: 'violet' },
  { id: 'admin', label: '운영 관리', icon: Settings, href: '/admin', color: 'slate' },
  { id: 'refresh', label: '새로고침', icon: RefreshCw, action: () => window.location.reload(), color: 'slate' },
]
```

이 구조를 기준으로 구현을 진행하면 Upsolution과 유사한 메인 화면을 만들 수 있습니다.
