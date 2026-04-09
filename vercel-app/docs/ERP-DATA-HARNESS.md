# ERP Data Harness

직원/거래처 데이터 처리 규칙 + 업무 플로우(인사, 메뉴원가, 마케팅)의 회귀를 빠르게 잡기 위한 하네스입니다.

## 실행

```bash
cd vercel-app
npm run harness:erp-data
npm run harness:flows
```

## 현재 검증 범위

- 직원(근태/급여)
  - 방콕시간 00:00~07:59 기록의 전날 근무일 귀속
  - 근무일 경계(다음날 08:00 미만) 구간 판정
  - 야간 근무 계획 시간(예: 18:00~02:00) 계산 정확성
  - `plan_in_prev_day` 플래그에 따른 익일 퇴근 계획 분 처리
  - 휴게 시작/종료 시각 역전·동일 시 휴게 미차감
  - 퇴근 승인 상태의 급여 반영 규칙
  - 승인 조정(late/early/ot)의 before/after 기록 조건
  - `early_min=0` + 조정이력 유무에 따른 급여 조퇴 반영 분기
  - 30분 미만 OT 미인정 규칙
  - `employee_id` 우선 스케줄 매칭
  - 급여 모드의 모호한 퍼지 스케줄 미선택(과도한 자동 매칭 방지)

- 거래처(미수 원장)
  - 인보이스 번호 포맷 규칙
  - 청구/수금 처리 후 잔액 일관성
  - 동일 이벤트 재전송(idempotency) 중복 반영 방지
  - 과수금(잔액 음수) 방지 불변식

## 파일

- 테스트 파일: `harness/erp-data-harness.test.ts`
- 조정 전용 테스트: `harness/attendance-adjustment-harness.test.ts`
- 업무 플로우 테스트:
  - `harness/hr-flow-harness.test.ts`
  - `harness/menu-cost-flow-harness.test.ts`
  - `harness/marketing-campaign-harness.test.ts`
  - `harness/payable-flow-harness.test.ts`
  - `harness/rls-scope-harness.test.ts`
- 실행 스크립트:
  - `harness:erp-data` (기본 직원/거래처 불변식)
  - `harness:flows` (인사/메뉴원가/마케팅 + payable + RLS 스코프)
  - `harness:all` (harness 디렉토리 전체)

## 확장 추천

- 미지급(Payable) 이벤트 시나리오 추가
- 매장 스코프/권한(RLS) 경계 케이스 추가
- 월말/윤년/입퇴사월 급여 프로레이트 케이스 추가
