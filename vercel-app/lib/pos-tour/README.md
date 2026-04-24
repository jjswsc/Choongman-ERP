# POS Tour Demo Route Checklist

POS 데모/투어 URL을 새로 추가하거나 수정할 때, 아래 순서대로 점검합니다.

## 자동 동기화

- 문서 자동 갱신: `npm run pos:tour:doc:sync`
- 문서 동기화 검사(실패 시 exit 1): `npm run pos:tour:doc:check`
- `build:prep`에서도 자동 실행되도록 연결되어 있습니다.

## 1) 라우트 상수 먼저 추가

- 파일: `lib/pos-tour/demo-routes.ts`
- `POS_DEMO_ROUTES`에 새 엔트리 추가
- 이름 규칙:
  - `home*`: `/pos` 홈 관련
  - `business*`: 영업 시작/마감
  - `cash*`: 시재 관리
  - `terminal*`: 터미널/결제

예시:

- `businessAudit: '/pos/settlement?demo=1&scenario=pos-business-audit-tour'`

## 2) 홈 scenario 바로가기 매핑

- 파일: `lib/pos-tour/demo-routes.ts`
- `DEMO_SHORTCUT_TARGET_BY_SCENARIO`에 시나리오 ID를 상수 라우트로 연결

예시:

- `'pos-business-audit-tour': POS_DEMO_ROUTES.businessAudit`

이 단계가 없으면 `/pos?demo=1&scenario=...`로 바로 진입이 안 됩니다.

## 3) 시나리오 파일 하드코딩 제거

- 파일: `lib/pos-tour/scenarios/*.ts`
- `navigateOnNext`에 문자열 URL 직접 작성하지 말고 `POS_DEMO_ROUTES.*` 사용

예시:

- `navigateOnNext: POS_DEMO_ROUTES.cashManagement`

## 4) 실제 진입 지점 연결 확인

- 파일: `app/pos/page.tsx`
- 홈 타일/서브메뉴에서 데모일 때 공통 라우트 상수를 쓰는지 확인
- 터미널은 `getPosDemoTerminalRoute()` 사용

- 파일: `components/pos/pos-settlement-form.tsx`
- 영업 시작 화면의 “전체 결산” 등 내부 이동도 데모 라우트 상수 사용

## 5) 시나리오 등록 확인

- 파일: `lib/pos-tour/pos-tour-constants.ts`
  - `POS_TOUR_KNOWN_SCENARIOS`에 시나리오 ID 등록
- 파일: `lib/pos-tour/get-pos-tour-scenario.ts`
  - registry에 시나리오 객체 등록

## 6) 빠른 검증 URL

- 홈 기본: `/pos?demo=1`
- 홈 바로가기: `/pos?demo=1&scenario=<scenario-id>`
- 영업 시작: `/pos/settlement?mode=open&demo=1&scenario=pos-business-open-tour`
- 영업 마감: `/pos/settlement?demo=1&scenario=pos-business-close-tour`
- 시재 관리: `/pos/local/cash?demo=1&scenario=pos-cash-management-tour`

<!-- AUTO-GENERATED:POS-TOUR-ROUTES:START -->
> 아래 표는 `lib/pos-tour/demo-routes.ts`에서 자동 생성됩니다.

### Auto Synced Demo Routes

| Route Key | Path | Purpose |
| --- | --- | --- |
| `homeMain` | `/pos?demo=1` | POS 홈 진입 |
| `homeBusinessCash` | `/pos?demo=1&scenario=pos-business-cash-home` | POS 홈 진입 |
| `businessOpen` | `/pos/settlement?mode=open&demo=1&scenario=pos-business-open-tour` | 영업 시작/마감 결산 |
| `businessClose` | `/pos/settlement?demo=1&scenario=pos-business-close-tour` | 영업 시작/마감 결산 |
| `cashManagement` | `/pos/local/cash?demo=1&scenario=pos-cash-management-tour` | 시재 관리 |
| `terminalFullDineIn` | `/pos/terminal?type=dine_in&demo=1&scenario=terminal-full-walkthrough` | POS 터미널/결제 |

### Auto Synced Scenario Shortcuts

| Scenario ID | Route Key | Target Path |
| --- | --- | --- |
| `terminal-full-walkthrough` | `terminalFullDineIn` | `/pos/terminal?type=dine_in&demo=1&scenario=terminal-full-walkthrough` |
| `pos-business-open-tour` | `businessOpen` | `/pos/settlement?mode=open&demo=1&scenario=pos-business-open-tour` |
| `pos-business-close-tour` | `businessClose` | `/pos/settlement?demo=1&scenario=pos-business-close-tour` |
| `pos-cash-management-tour` | `cashManagement` | `/pos/local/cash?demo=1&scenario=pos-cash-management-tour` |
<!-- AUTO-GENERATED:POS-TOUR-ROUTES:END -->

## 7) 최소 검증 명령

- `npx vitest run lib/pos-tour/get-pos-tour-scenario.test.ts`

필요하면 다음도 확인:

- 해당 화면에서 투어 오버레이/빠른 점프(파트 바로가기) 표시 여부
- 데모 배너 표시 여부 (`?demo=1`)
