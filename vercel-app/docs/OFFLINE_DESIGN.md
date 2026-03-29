# 오프라인 저장 기능 설계서

> 인터넷이 끊겼을 때도 데이터가 안전하게 저장되고, 복구 시 자동 동기화되는 기능 설계

---

## 1. 목표

| 구분 | 설명 |
|------|------|
| **핵심 시나리오** | 매장 POS에서 주문 중 인터넷 끊김 → 주문 저장 실패 방지 |
| **기대 동작** | ① 로컬에 즉시 저장 ② 영수증 출력 가능 ③ 복구 후 서버 자동 동기화 |
| **범위** | Phase 1: POS 주문 → Phase 2: POS 결산 → Phase 3: 선택적 확장 |

---

## 2. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                        클라이언트 (브라우저)                        │
├─────────────────────────────────────────────────────────────────┤
│  UI (POS, 결산 등)                                                 │
│       │                                                          │
│       ▼                                                          │
│  apiFetch / savePosOrder 등                                       │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────┐                                         │
│  │   Offline Queue     │  ← 네트워크 실패 시 요청 적재               │
│  │   (IndexedDB)       │                                         │
│  └─────────┬───────────┘                                         │
│            │                                                      │
│            ▼  (온라인 시)                                          │
│  ┌─────────────────────┐                                         │
│  │   Sync Worker        │  ← 대기 중인 요청 순차 전송                │
│  └─────────┬───────────┘                                         │
└────────────┼─────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────┐
    │  API (서버)     │
    └────────────────┘
```

---

## 3. 단계별 구현 계획

### Phase 1: 오프라인 큐 기반 구조 + POS 주문

**목표:** POS 주문(`savePosOrder`)이 오프라인 시에도 로컬 저장 후 자동 동기화

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1-1 | IndexedDB 스키마·유틸 설계 | `lib/offline/db.ts` |
| 1-2 | 요청 큐 저장·조회 함수 | `lib/offline/queue.ts` |
| 1-3 | 네트워크 상태 감지 | `lib/offline/network.ts` |
| 1-4 | `savePosOrder` 오프라인 래퍼 | `lib/offline/pos-order-sync.ts` |
| 1-5 | 온라인 복구 시 큐 재전송 | 동일 모듈 내 `syncPending()` |
| 1-6 | UI: 온라인/오프라인·대기 중 건수 표시 | POS 헤더 배너 |

**저장 구조 (IndexedDB)**

```
DB: cm_offline
├── pending_requests (Object Store)
│   ├── id: string (uuid)
│   ├── api: string ('/api/savePosOrder')
│   ├── method: string ('POST')
│   ├── body: string (JSON)
│   ├── createdAt: number (timestamp)
│   ├── retryCount: number
│   ├── lastTriedAt?: number
│   ├── lastError?: string
│   └── metadata?: { localOrderNo?: string }
└── pos_order_local (Object Store) - 로컬에서 생성한 주문 정보
    ├── localId: string (uuid)
    ├── orderNo: string (동기화 후 서버에서 받은 값)
    ├── payload: object
    ├── createdAt: number
    └── synced: boolean
```

---

### Phase 2: POS 결산 오프라인 지원

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 2-1 | `savePosSettlement` 큐 등록 | queue에 결산 API 추가 |
| 2-2 | 결산 화면 오프라인 배너 | 결산 페이지 |
| 2-3 | 동기화 순서: 주문 → 결산 | queue 우선순위 또는 의존성 필드 |

---

### Phase 3: 공통 오프라인 Fetch 래퍼 (선택)

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 3-1 | `apiFetch` 래핑: 실패 시 큐 적재 | `lib/api/fetch-offline.ts` |
| 3-2 | 큐 가능 API 화이트리스트 | 설정으로 관리 |
| 3-3 | 재시도 정책 (지수 백오프) | queue 로직 |

---

### Phase 4: 읽기 캐시 (선택, 후순위)

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 4-1 | POS 메뉴·프린터 설정 캐시 | IndexedDB `pos_cache` |
| 4-2 | 오프라인 시 캐시 조회 | getPosMenus 등 래퍼 |
| 4-3 | 캐시 만료·버전 관리 | TTL, 버전 필드 |

---

## 4. 상세 설계

### 4.1 네트워크 감지

`navigator.onLine` 만으로는 실제 서버 장애를 완전히 구분할 수 없다.  
현재는 아래 2단계 신호를 함께 사용한다.

- 1차: 브라우저 신호 (`navigator.onLine`)
- 2차: 최근 API 실패 횟수 기반 `degraded` (짧은 시간 연속 실패 시 캐시 우선 모드)

즉, "오프라인" + "degraded" 모두 읽기 fallback 트리거로 본다.

### 4.2 큐 항목 형식

```typescript
interface PendingRequest {
  id: string
  api: string
  method: string
  body?: string
  headers?: Record<string, string>
  createdAt: number
  retryCount: number
  lastError?: string
  metadata?: {
    localOrderNo?: string  // POS: 로컬에서 부여한 임시 주문번호
  }
}
```

### 4.3 POS 주문 오프라인 플로우

1. **정상(온라인)**  
   `savePosOrder` → apiFetch → 성공 → 영수증, todaySales 갱신

2. **오프라인**  
   - `savePosOrder` 호출  
   - apiFetch 시도 → 네트워크 에러  
   - `pending_requests`에 요청 저장  
   - `pos_order_local`에 로컬 주문 저장 (orderNo: `LOCAL-{timestamp}`)  
   - UI에 "오프라인 저장됨. 복구 후 자동 전송됩니다" 표시  
   - 영수증은 로컬 데이터로 출력 (가능)

3. **온라인 복구**  
   - `online` 이벤트 수신  
   - `syncPending()` 호출 → 큐에서 순차 전송  
   - 성공 시 `pos_order_local.synced = true`, `orderNo` 업데이트  
   - 실패 시 `retryCount++`, 다음 주기 또는 수동 재시도

### 4.4 충돌·중복 방지

| 상황 | 대응 |
|------|------|
| 동일 주문 2회 전송 | `localOrderNo` 또는 요청 body 해시로 서버 측 멱등성 검사 (선택) |
| 결산이 주문보다 먼저 동기화 | 큐 순서: `savePosOrder` → `savePosSettlement` 유지 |
| 토큰 만료 후 동기화 | 401 시 재로그인 유도, 해당 요청은 큐 유지 후 수동 재시도 |

---

## 5. UI/UX 가이드

| 상태 | 표시 |
|------|------|
| 온라인 | (기본, 배너 없음 또는 "연결됨" 작은 표시) |
| 오프라인 | 상단 배너: "오프라인 모드 - 주문이 로컬에 저장됩니다" |
| 동기화 중 | "동기화 중... (N건 대기)" |
| 동기화 완료 | 일시 토스트 "대기 중인 주문 동기화 완료" |
| 동기화 실패 | "일부 전송 실패. [재시도] 버튼" |

---

## 6. 파일 구조 (Phase 1 기준)

```
vercel-app/
├── lib/
│   ├── offline/
│   │   ├── db.ts          # IndexedDB 초기화, 스키마
│   │   ├── queue.ts       # 큐 추가/조회/삭제
│   │   ├── network.ts     # 온라인 상태
│   │   ├── sync.ts        # syncPending, 재전송 로직
│   │   └── index.ts       # 통합 export
│   └── api/
│       └── fetch.ts       # (기존 유지, 오프라인은 호출부에서 처리)
├── app/
│   └── pos/
│       └── page.tsx       # savePosOrder 오프라인 래퍼 사용, 배너 추가
└── components/
    └── offline-banner.tsx # 공통 오프라인/동기화 배너
```

---

## 7. 서버 측 고려사항 (선택)

| 항목 | 내용 |
|------|------|
| 멱등성 키 | 큐 동기화 시 `X-Idempotency-Key` 전송 (`metadata.localOrderNo` 우선, 없으면 queue id) |
| 서버 중복 방지 | `savePosOrder`는 동일 키 재수신 시 최근 성공 결과를 즉시 반환 (중복 insert 방지) |
| 재시도 정책 | 지수 백오프(2s, 4s, 8s...) + 최대 간격 5분, 최대 재시도 횟수 초과 건은 큐에 남겨 수동 점검 |
| 주문번호 | 오프라인 응답의 `LOCAL-xxx`는 임시 번호, 서버 저장 후 `order_no`가 기준 |

---

## 8. 제약사항

| 구분 | 설명 |
|------|------|
| 쿠폰 검증 | 오프라인 시 `validatePosCoupon` 불가 → 쿠폰 사용 비활성화 또는 오프라인 시 안내 |
| 재고 차감 | 오프라인 주문은 동기화 시점에 차감 (자동 차감 설정 시) |
| 결산 | 오프라인 결산 입력 가능, 복구 후 전송. 당일 마감은 온라인 필요 |

---

## 9. 구현 순서 요약

1. **Phase 1-1 ~ 1-2**: IndexedDB + 큐 기본
2. **Phase 1-3 ~ 1-4**: 네트워크 감지 + savePosOrder 오프라인 처리
3. **Phase 1-5 ~ 1-6**: 동기화 + UI 배너
4. Phase 2, 3, 4는 Phase 1 검증 후 진행

---

## 10. Phase 5: 매출/영수증/영업/시재 오프라인 전용 화면 (검토)

### 10.1 배경
관리자 페이지(`/admin/...`)는 API 의존도가 높아 오프라인 시 활용이 어렵다.  
**매출관리, 영수증 관리, 영업관리, 시재 관리** 4개 영역은 인터넷 장애 시에도 약 1주일치 데이터를 로컬에서 조회·입력할 수 있도록 별도 화면 구성을 검토한다.

### 10.2 대상 영역
| 영역 | 현재 이동 경로 | 오프라인 요구 |
|------|----------------|---------------|
| 매출관리 | /admin/sales-management | 기간별 매출 요약, 엑셀 업로드 내역 등 로컬 캐시 기반 조회 |
| 영수증 관리 | /admin/pos-orders | 최근 ~1주일 주문/영수증 로컬 저장 후 목록·인쇄 |
| 영업관리 | /pos/settlement | 영업시작/마감, 결산 입력(이미 오프라인 큐 지원) |
| 시재 관리 | /admin/petty-cash, /pos/settlement | 입금/출금/돈통 시제 등 로컬 입력·조회 |

### 10.3 제안: POS 전용 오프라인 화면
- **경로**: `/pos/local/` 하위 (예: `/pos/local/sales`, `/pos/local/receipts`, `/pos/local/settlement`, `/pos/local/cash`)
- **레이아웃**: POS 레이아웃 유지, 관리자 사이드바 없음
- **데이터 소스**:
  - 온라인: API 호출 + 응답을 IndexedDB에 캐시 (최근 N일)
  - 오프라인: IndexedDB 캐시만 조회
- **보관 기간**: 로컬 캐시 TTL 약 7일 (설정 가능)

### 10.4 IndexedDB 확장 스키마 (검토)
```
cm_offline (기존) + 
├── pos_local_sales    # 매출 요약 캐시 (일별/기간)
├── pos_local_orders   # 주문/영수증 캐시 (최근 7일)
├── pos_local_settlement # 결산 입력 캐시 (이미 큐 연동)
└── pos_local_cash     # 시재 입출금 이력 캐시
```

### 10.5 라우팅 정책
- POS 첫 화면 타일 클릭 시:
  - 온라인 → 기존 관리자/결산 페이지 or 로컬 페이지
  - 오프라인 → **반드시 `/pos/local/*`** 로만 이동 (관리자 페이지는 접근 차단)

---

*작성일: 2025-02*
