# KBTG LINKPOS 1차 테스트 매트릭스

## 공통 전제
- 대상: Hypercom (Hybrid: Local Bridge 우선, Server Relay fallback)
- 거래: Sale(20), Void(26), Settlement(50)
- 핵심 식별자: `R1`(local_tx_id, unique)
- 시간 기준: 방콕시간

## 기능 시나리오
- `SALE-01`: 카드 결제 승인(00) -> 주문 저장 성공 -> `pos_orders.linkpos_*` 반영
- `SALE-02`: 카드 결제 거절(ND) -> 주문 저장 차단 -> 사용자 경고 노출
- `SALE-03`: 로컬 브리지 실패 후 서버 fallback 승인 -> 주문 저장 성공
- `VOID-01`: 승인 거래 취소 성공(00) -> 상태/이력 반영
- `SETT-01`: 단일 NII 정산 성공 -> 응답 파싱 및 상태 반영
- `SETT-02`: 전체 HOST(999) 정산 성공 -> `ZZ` 상태 문자열 처리

## 장애/복구 시나리오
- `NET-01`: 로컬 브리지 타임아웃 -> 서버 fallback 동작
- `NET-02`: 서버 relay 미설정 -> 실패 반환 + 사용자 메시지
- `NET-03`: relay 5xx -> 실패 반환 + 시도 로그 저장
- `PARSE-01`: 응답 프레임 LRC 오류 -> `parse_error` 처리

## 멱등/중복 방지
- `IDEMP-01`: 동일 `R1` 재요청(이미 승인) -> 기존 승인 결과 재사용
- `IDEMP-02`: 동일 `R1` 중복 insert -> unique 충돌, 중복 결제 방지
- `IDEMP-03`: 오프라인 재전송 시 동일 `R1` 유지 -> 추가 승인 미발생

## 데이터 검증
- `DATA-01`: `pos_payment_attempts`에 request/response, 응답코드, trace 저장
- `DATA-02`: `pos_orders.linkpos_*` 컬럼에 승인 메타 저장
- `DATA-03`: 카드번호/민감정보 미저장(마스킹 정책 준수)

## 운영 검증
- `OPS-01`: 결제 실패 메시지 분류(승인실패/통신실패/상태미확정)
- `OPS-02`: 로컬/서버 소스 구분 가능(local vs server)
- `OPS-03`: 장애 후 재시도 시도 횟수 및 오류 원인 추적 가능

---

## GrabFood 1차 테스트 매트릭스 (사전 준비)

### 공통 전제
- 범위: Essential API 중심(v1), STO/Loyalty/Campaign 제외
- 시간 기준: 방콕시간(UTC+7)
- 웹훅 응답 목표: 10초 이내
- 요청 ID 추적: `x-request-id`, `x-grabkit-grab-requestid`

### 인증/보안
- `AUTH-01`: Partner OAuth 토큰 웹훅 정상 응답(200, access_token 반환)
- `AUTH-02`: OAuth 본문 `grant_type != client_credentials` -> 400
- `AUTH-03`: Authorization Bearer 누락 -> 401
- `AUTH-04`: Bearer 불일치 -> 401

### 주문 웹훅 (Grab -> 파트너)
- `ORD-01`: Submit order 정상 수신 -> 204
- `ORD-02`: 동일 `orderID` 재전송 -> 멱등 처리(중복 저장/중복 전파 없음)
- `ORD-03`: Submit order JSON 손상 -> 400
- `ORD-04`: Push order state 정상 수신(`DRIVER_ALLOCATED`/`COLLECTED`/`DELIVERED`) -> 204
- `ORD-05`: 취소 상태(`CANCELLED`) 수신 시 주문 상태 일관 반영
- `ORD-06`: 상태 순서 역전 수신(예: `DELIVERED` 후 `COLLECTED`) -> 경고 로그 + 정책 처리

### 메뉴 웹훅 (Grab -> 파트너)
- `MENU-01`: Get menu 요청(merchantID, partnerMerchantID 포함) -> 200 + 유효 구조 JSON
- `MENU-02`: Get menu 필수 쿼리 누락 -> 400
- `MENU-03`: Push Grab menu 수신 -> 204 + body size 로그
- `MENU-04`: Menu sync state `SUCCESS` -> 204 + `requestID`, `jobID` 저장
- `MENU-05`: Menu sync state `FAILED` + errors -> 204 + 오류 원인 로그

### 온보딩/통합 상태
- `ONB-01`: Push integration status `SYNCING` 수신 -> 204
- `ONB-02`: Push integration status `ACTIVE` 수신 -> 204
- `ONB-03`: Push integration status `FAILED` 수신 -> 204 + 경고 알림 후보 기록

### Outbound API (파트너 -> Grab) 사전 검증
- `OUT-01`: Update menu notification 동일 요청 연속 호출 -> 409 대응(락 120초)
- `OUT-02`: Update menu record 동일 요청 연속 호출 -> 409 대응(락 10초)
- `OUT-03`: 401 응답 시 토큰 재발급 후 1회 재시도 성공
- `OUT-04`: 429/5xx 응답 시 지수 백오프 + jitter 재시도
- `OUT-05`: 4xx(400/403/404/409) 비재시도 분기 확인

### 관측성/운영
- `OBS-01`: 모든 웹훅에서 요청 ID 헤더 로그 저장
- `OBS-02`: 엔드포인트별 응답 status, 처리시간(ms), 재시도 횟수 기록
- `OBS-03`: 실패 건은 원인 코드별 분류(인증/파싱/타임아웃/외부5xx)
- `OBS-04`: 운영 리포트에 주문 누락 건수 0 유지 확인
