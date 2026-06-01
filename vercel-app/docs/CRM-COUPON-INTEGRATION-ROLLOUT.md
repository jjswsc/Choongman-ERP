# CRM Coupon Integration Rollout

## 목적
- CRM 발급, 회원 쿠폰함, POS 적용, 환불/취소 복원을 한 흐름으로 검증한다.
- 운영 배포 전에 매장/회원/회계 정합성을 동시에 점검한다.

## 사전 준비
- DB SQL 반영: `vercel-app/sql/crm_coupon_campaigns_phase1.sql`
- POS 쿠폰 마스터에서 테스트 쿠폰 4종 준비
  - `PCT10` (정률)
  - `FIX50` (정액)
  - `BOGO01` (bogo)
  - `SET100` (set_fixed, set_qty=2)
- 테스트 계정
  - 활성 회원 3명(일반/등급/GOLD)
  - 휴면 회원 1명
  - 생일월 회원 1명

## 로컬 검증 순서
1. `npx tsc --noEmit`
2. `npm run lint`
3. (배포 직전) `npm run build`

## E2E 시나리오

### 1) CRM 수동 발급 → 회원 쿠폰함 노출
- 화면: `/admin/crm/coupons`
- `memberId + couponCode`로 발급
- 회원앱 `/m` 혜택 탭에서 아래 필드 확인
  - 쿠폰코드/상태/발급시각
  - 혜택(정액/정률/BOGO/세트)
  - 최소주문/중복규칙/캠페인명(있을 때)

### 2) 캠페인 발급 (타겟)
- 화면: `/admin/crm/campaigns`
- 대상별 1회 실행
  - `tier`, `recent`, `dormant`, `birthday_month`
- 실행 결과에서 `target/issued/skipped/failed` 수치 확인
- 동일 캠페인 재실행 시 `skipped` 증가(중복 issued 방지) 확인

### 3) POS 쿠폰 규칙
- 화면: `/admin/pos-coupons` + POS 주문 화면
- 검증 항목
  - `percent`, `fixed`
  - `bogo`
  - `set_fixed` (`set_qty` 기준)
  - `item_scope(menu/category)` 제한
  - `priority` 높은 쿠폰이 먼저 재검증되는지
  - `allowWithManualDiscount=false` 시 수동할인 동시 적용 차단

### 4) 주문 완료 후 환불/취소 복원
- POS에서 쿠폰 적용 주문 완료
- 관리자에서 `cancelled` 또는 `refunded` 처리
- 검증
  - `member_coupon_issues` 상태 `issued` 복원
  - `pos_coupon_serials` 상태 `issued` 복원(시리얼 쿠폰일 때)
  - `pos_coupons.used_count` 감소
  - `pos_order_coupon_redemptions` 주문 레코드 삭제(재처리 멱등)

### 5) 회귀 체크
- 쿠폰 미사용 주문은 기존과 동일하게 저장/취소 동작
- 기존 단일쿠폰 주문(legacy `couponCode`)도 저장 성공

## 단계별 롤아웃

### Phase A (내부)
- 본사 테스트 매장 1곳, 운영자 1명만 캠페인 실행 권한
- 3일간 수동 발급 + POS 복원 시나리오 집중 모니터링

### Phase B (파일럿)
- 3개 매장 확장
- 자동 캠페인은 하루 1회만 실행
- `failed_count > 0`인 실행 로그는 당일 원인 확인

### Phase C (전체)
- 전 매장 오픈
- 월간 KPI 추적
  - 발급 수
  - 사용 수
  - 재방문 전환율(쿠폰 사용 후 30일)
  - 환불 복원률

## 장애 대응 포인트
- 캠페인 테이블 미존재 오류: SQL 미반영 상태
- 쿠폰 코드 불일치 오류: `pos_coupons.code`와 CRM 입력값 불일치
- 복원 실패: `updatePosOrderStatus` 재시도 시 `failedSideEffects` 확인

