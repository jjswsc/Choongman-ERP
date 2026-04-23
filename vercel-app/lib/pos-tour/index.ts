/**
 * POS 데모(쓰기 API 차단) + 순서 가이드(투어)
 *
 * - 첫 화면(로그인 후): `/pos?demo=1` → 시나리오 기본 `pos-main-walkthrough`
 * - 터미널: `/pos/terminal?demo=1` → 기본 `terminal-full-walkthrough`
 * - `scenario=…`로 다른 등록 시나리오 지정
 */
export * from './pos-tour-constants'
export * from './pos-tour-types'
export * from './get-pos-tour-scenario'
export * from './pos-demo-mode'
export { PosTourProvider, usePosTour, PosTerminalTourController } from './pos-tour-context'
export { PosTourOverlay } from './pos-tour-overlay'
