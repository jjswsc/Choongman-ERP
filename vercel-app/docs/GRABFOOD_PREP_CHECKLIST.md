# GrabFood 연동 사전 준비 체크리스트 (v1)

이 문서는 Grab 담당자 미팅 전까지 우리 팀이 선행 가능한 작업을 정리한 실행 문서다.
기준 문서는 GrabFood POS Integration Guide 1.1.3 이다.

- 기준 문서: [GrabFood Partner API (POS) Integration Guide v1.1.3](https://developer.grab.com/docs/grabfood/api/v1-1-3)
- 시간 기준: 방콕시간(Asia/Bangkok, UTC+7)

---

## 1) 1차 스코프 고정 (Essential API 중심)

### 포함 (v1)
- 인증
  - Grab OAuth 발급(우리 서버 -> Grab)
  - Partner OAuth 토큰 웹훅(Grab -> 우리 서버)
- Grab -> 우리 웹훅(필수)
  - Submit order
  - Push order state
  - Get food menu
  - Menu sync state webhook
  - Push integration status webhook
  - Push Grab menu webhook
- 우리 -> Grab 호출(필수 우선)
  - Create self-serve journey
  - Update menu notification
  - Update menu record
  - List orders
  - Cancel order
  - Mark order ready
  - Get store status
  - Pause store

### 제외 (v1)
- STO(Scan To Order) 계열
- Loyalty(Native/Webview) 계열
- Campaign 계열

### 운영 목표 (문서 기준)
- 파트너 웹훅 응답: 10초 이내
- 오류율: 1% 미만
- 주문 수신/상태 푸시 누락: 0% 목표

---

## 2) ID 매핑 정책 (고정 규칙)

## 매장/주문 매핑
- `grabMerchantID`(Grab) <-> `partnerMerchantID`(우리 POS 매장 ID) 를 영구 매핑한다.
- 매핑은 절대 덮어쓰지 않고 이력 관리한다(변경 시 종료일/신규행 방식).
- `orderID`는 글로벌 유니크 키로 취급한다.
- `shortOrderNumber`는 표시용으로만 사용한다(조회/중복판단 키로 사용 금지).

## 메뉴 ID 정책
- category/item/modifier/modifierGroup ID는 재사용을 기본 원칙으로 한다.
- 불필요한 ID 변경 금지(동기화량 증가, 충돌, 재매핑 위험).
- 이미지 URL도 실제 이미지 변경 시에만 변경한다.

## 멱등 키 정책
- 주문 수신 멱등키: `orderID`
- 메뉴 동기화 상태 멱등키: `requestID`
- 메뉴 작업 추적 키: `jobID`

---

## 3) 인증/재시도/레이트리밋 정책

## OAuth 토큰
- Grab OAuth 토큰은 캐시 재사용한다.
- 만료 전에 불필요한 재발급 금지.
- 401 응답일 때만 즉시 1회 재발급 후 재호출한다.

## 재시도 기본값
- 대상: 네트워크 에러, 429, 5xx
- 방식: exponential backoff + jitter
- 권장 시퀀스: 500ms -> 1000ms -> 2000ms -> 4000ms (최대 4회)
- 4xx(400/403/404/409)는 재시도하지 않고 즉시 실패 분류한다.

## 분산 락/빈도 제한 대응
- 메뉴 알림(`menu notification`) 동일 요청 락 기본 120초 고려
- 메뉴 레코드 업데이트 동일 요청 락 기본 10초 고려
- 동일 merchantID + 동일 payload 해시는 짧은 TTL 캐시로 중복 호출 방지

---

## 4) 파트너 웹훅 계약(현재 라우트 기준)

아래 경로는 현재 코드베이스에 이미 존재하는 기본 라우트다.

| 용도 | Method | 경로 |
|---|---|---|
| Partner OAuth token | `POST` | `/api/webhooks/grab/oauth/token` |
| Submit order | `POST` | `/api/webhooks/grab/orders` |
| Push order state | `PUT` | `/api/webhooks/grab/order/state` |
| Get menu | `GET` | `/api/webhooks/grab/merchant/menu` |
| Menu sync state | `POST` | `/api/webhooks/grab/menu-sync-state` |
| Push integration status | `POST` | `/api/webhooks/grab/pushIntegrationStatus` |
| Push Grab menu | `POST` | `/api/webhooks/grab/pushGrabMenu` |

## 웹훅 응답 규칙
- 성공 수신: 2xx 반환(문서 권장 204 중심)
- JSON 파싱 실패: 400
- 인증 실패: 401
- 내부 예외: 5xx
- Grab 요청 ID 헤더(`x-request-id`, `x-grabkit-grab-requestid`) 반드시 로그 저장

## 필수 로그 필드
- endpoint kind
- merchantID / partnerMerchantID
- orderID / shortOrderNumber
- state(주문 상태 웹훅)
- requestID / jobID(메뉴 동기화 웹훅)
- 응답 status, 처리시간(ms), 재시도 횟수

---

## 5) 미팅 전 산출물 체크 (실행 순서)

1. API 계약서(내부): 필드 매핑 + 오류 코드 매핑 + 멱등 규칙
2. ID 매핑 정책 문서: 매장/주문/메뉴 ID 고정 원칙
3. 인증/재시도 정책: 토큰 캐시 + 백오프 표준
4. 웹훅 운영 가이드: 2xx 기준, 실패 분류, 로그 필드
5. 테스트 매트릭스: 정상/중복/순서역전/429/5xx/타임아웃

---

## 6) 담당자 미팅 질문 리스트 (확정 필요)

## 프로젝트/환경
- Self-Serve Onboarding 프로젝트 상태와 권한(Staging/Production)
- 파트너 코드/프로젝트 단위 레이트리밋 기준
- 국가/통화/세금 정책(특히 exponent, tax-inclusive 설정)

## 보안/인증
- 파트너 웹훅 인증 권장 방식(Bearer only vs 추가 서명)
- 고정 IP 화이트리스트 적용 범위(Prod/Staging)
- 웹훅 타임아웃 연장 가능 여부와 재시도 횟수 변화

## 기능 스코프
- Auto acceptance 기본 정책(국가/상점별 예외 유무)
- Edit order v2 권장 여부
- v1 범위에서 STO/Loyalty/Campaign 제외에 대한 리스크

## 롤아웃/운영
- 파일럿 매장 수와 성공 기준
- 장애 시 에스컬레이션 채널(Slack/이메일/TAM)
- 운영 중 필수 모니터링 지표/대시보드 기준

---

## 7) 바로 착수 가능한 구현 백로그 (미팅 전)

- 공통 Grab HTTP 클라이언트(토큰 캐시, 401 재발급, 429/5xx 백오프)
- Outbound API 래퍼(우선 8개 essential endpoint)
- 웹훅 idempotency 저장소(`orderID`, `requestID`, `jobID`)
- 재처리 큐(dead-letter) 또는 수동 재처리 관리 절차
- 샌드박스 E2E 테스트 스크립트(주문 수신 -> 상태 푸시 -> 취소/조회)

---

## 8) 현재 반영된 코드 포인트

- 공통 Outbound 클라이언트:
  - `vercel-app/lib/grab-openapi.ts`
  - 제공 기능:
    - OAuth 토큰 캐시 (`getGrabAccessToken`)
    - 401 시 1회 강제 재발급
    - 429/5xx 및 네트워크 오류 백오프 재시도 (`grabRequest`, `grabJsonRequest`)
- Endpoint 래퍼:
  - `vercel-app/lib/grab-partner-api.ts`
  - 포함 API:
    - `grabCreateSelfServeJourney`
    - `grabUpdateMenuNotification`
    - `grabUpdateMenuRecord`
    - `grabListOrdersByDate`, `grabListOrdersByIds`
    - `grabCancelOrder`
    - `grabMarkOrderReady`
    - `grabGetStoreStatus`
    - `grabPauseStore`
- 서버 라우트 연결:
  - `vercel-app/app/api/grab/createSelfServeJourney/route.ts`
  - `vercel-app/app/api/grab/updateMenuNotification/route.ts`
  - `vercel-app/app/api/grab/updateMenuRecord/route.ts`
  - `vercel-app/app/api/grab/listOrders/route.ts`
  - `vercel-app/app/api/grab/cancelOrder/route.ts`
  - `vercel-app/app/api/grab/markOrderReady/route.ts`
  - `vercel-app/app/api/grab/getStoreStatus/route.ts`
  - `vercel-app/app/api/grab/pauseStore/route.ts`
- 웹훅 멱등 처리:
  - `vercel-app/lib/grab-webhook-idempotency.ts`
  - 적용 라우트:
    - `vercel-app/app/api/webhooks/grab/orders/route.ts`
    - `vercel-app/app/api/webhooks/grab/order/state/route.ts`
    - `vercel-app/app/api/webhooks/grab/menu-sync-state/route.ts`
    - `vercel-app/app/api/webhooks/grab/pushIntegrationStatus/route.ts`
    - `vercel-app/app/api/webhooks/grab/pushGrabMenu/route.ts`
  - DB 스키마:
    - `vercel-app/sql/pos_grab_webhook_events.sql`

### 환경변수(서버)
- `GRAB_CLIENT_ID`
- `GRAB_CLIENT_SECRET`
- `GRAB_API_ENV` (`staging` | `production`)
- Grab → 파트너 `/oauth/token` 검증용(Developer Portal OAuth client와 별도 자격증명):
  - `GRAB_INBOUND_OAUTH_CLIENT_ID`
  - `GRAB_INBOUND_OAUTH_CLIENT_SECRET`
  - 레거시(기존 코드/문서): `GRAB_OAUTH_CLIENT_ID`, `GRAB_OAUTH_CLIENT_SECRET` (위 값이 없을 때만 fallback)
- Grab 웹훅 `Authorization: Bearer ...` 검증용(우리 `/oauth/token`에서 발급한 access_token과 동일해야 함):
  - 권장: `GRAB_PARTNER_WEBHOOK_JWT_SECRET` (HS256 서명용 비밀값; 길고 랜덤한 문자열)
  - 레거시: `GRAB_PARTNER_ISSUED_ACCESS_TOKEN` (구명칭; HS256 secret로도 사용 가능. opaque 고정 bearer 모드도 호환)
- 선택:
  - `GRAB_PARTNER_API_BASE_URL` (기본 `partner-api.grab.com` override)
  - `GRAB_AUTH_BASE_URL` (기본 `https://api.grab.com` override)

