/**
 * POS 데모(쓰기 API 차단) + 순서 가이드(투어)
 *
 * - 첫 화면(로그인 후): `/pos?demo=1` → 시나리오 기본 `pos-main-walkthrough`
 * - 터미널: `/pos/terminal?demo=1` → 기본 `terminal-full-walkthrough`
 * - 영업 시작: `/pos/settlement?mode=open&demo=1&scenario=pos-business-open-tour`
 * - 결산(마감): `/pos/settlement?demo=1&scenario=pos-business-close-tour` (데모에서 홈·영업 메뉴로 들어오면 위 쿼리가 붙습니다.)
 * - 데모 URL 상수/규칙은 `demo-routes.ts`에서 통합 관리
 * - `scenario=…`로 다른 등록 시나리오 지정
 */
export * from './pos-tour-constants'
export * from './pos-tour-types'
export * from './demo-routes'
export * from './get-pos-tour-scenario'
export * from './pos-demo-mode'
export {
  PosTourProvider,
  usePosTour,
  PosTerminalTourController,
  PosTourTerminalManualNextGates,
} from './pos-tour-context'
export { PosTourOverlay } from './pos-tour-overlay'
