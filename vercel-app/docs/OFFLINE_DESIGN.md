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
│   └── lastError?: string
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

```typescript
// lib/offline/network.ts
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

export function useOnlineStatus(callback?: (online: boolean) => void): boolean {
  const [online, setOnline] = useState(() => isOnline())
  useEffect(() => {
    const onOnline = () => { setOnline(true); callback?.(true) }
    const onOffline = () => { setOnline(false); callback?.(false) }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [callback])
  return online
}
```

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
| 멱등성 키 | `X-Idempotency-Key: {localOrderId}` 헤더로 중복 요청 무시 가능 |
| 주문번호 | 오프라인 주문은 서버 저장 시 서버에서 생성. 로컬 `LOCAL-xxx`는 임시용 |

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

*작성일: 2025-02*
