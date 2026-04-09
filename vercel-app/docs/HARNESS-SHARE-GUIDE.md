# Harness 공유 가이드 (친구/동료 데모용)

이 문서는 ERP 하네스가 "완성 상태"임을 빠르게 보여주기 위한 데모 가이드입니다.

## 1) 하네스 구성 요약

### A. AI Eval Harness

- 목적: AI 응답 품질 회귀 검증
- 핵심 파일
  - `scripts/ai-eval-harness.mjs`
  - `scripts/ai-eval-cases.json`
  - `docs/AI-EVAL-HARNESS.md`
- 실행
  - `npm run ai:harness`
  - `npm run ai:harness:strict`

### B. ERP Data/Flow Harness

- 목적: 실제 업무 흐름(인사/원가/마케팅/거래처/권한)의 회귀 검증
- 핵심 파일
  - `harness/erp-data-harness.test.ts`
  - `harness/attendance-adjustment-harness.test.ts`
  - `harness/hr-flow-harness.test.ts`
  - `harness/menu-cost-flow-harness.test.ts`
  - `harness/marketing-campaign-harness.test.ts`
  - `harness/payable-flow-harness.test.ts`
  - `harness/rls-scope-harness.test.ts`
  - `docs/ERP-DATA-HARNESS.md`
- 실행
  - `npm run harness:attendance-adjustment`
  - `npm run harness:flows`
  - `npm run harness:all`

## 2) 5분 데모 시나리오

1. 문서 오픈
   - `docs/ERP-DATA-HARNESS.md`
   - `docs/AI-EVAL-HARNESS.md`
2. 테스트 파일 샘플 확인
   - `harness/hr-flow-harness.test.ts`
   - `harness/menu-cost-flow-harness.test.ts`
   - `harness/rls-scope-harness.test.ts`
3. 터미널 실행
   - `cd vercel-app`
   - `npm run harness:flows`
   - `npm run test`
   - (선택) `npm run ai:harness`
4. CI 확인
   - `/.github/workflows/build-vercel.yml`에서 테스트 후 빌드 확인

## 3) 영역별 검증 포인트

- 인사(코드 중심): 직원코드 유일성, 퇴사자 제외, 방콕시간 귀속, 승인/OT 규칙
- 품목->메뉴->원가: 원재료 단가 변경의 연쇄 반영, 원가율/마진 계산
- 마케팅(캠페인): 차수 기간 파싱, 기간 교차, KPI/ROI 추적
- 거래처(미지급): 발주/지급 잔액 일관성, 중복 요청(idempotency), 음수 잔액 방지
- 권한/RLS 스코프: role/store 범위 강제, POS 전용 역할 경로 차단

## 4) 실행 명령 모음

```bash
cd vercel-app
npm run harness:flows
npm run harness:all
npm run test
npm run ai:harness
```

## 5) 자주 받는 질문

### Q1. 이걸 하네스라고 불러도 되나?

네. 테스트 케이스 기반 자동 실행, pass/fail 판정, CI 연동 가능 구조이므로 하네스가 맞습니다.

### Q2. 지금 완성도는 어느 수준인가?

"Lite를 지난 Standard 초입" 수준입니다. 기능 단위 + 업무 흐름 단위가 모두 포함되어 있습니다.

### Q3. 다음 확장 우선순위는?

1. 실DB 샘플 리플레이 케이스 추가
2. 실패 리포트(JSON/Markdown) 자동 저장
3. PR 코멘트 자동화(GitHub Actions)
