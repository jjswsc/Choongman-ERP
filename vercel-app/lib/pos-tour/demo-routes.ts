import type { PosTourKnownScenarioId } from './pos-tour-constants'

type TerminalOrderType = 'dine_in' | 'takeout' | 'delivery'

/**
 * POS 데모/투어 라우팅 단일 소스.
 *
 * 네이밍 규칙:
 * - `home*`: POS 홈(`/pos`)로 시작하는 진입점
 * - `business*`: 영업 시작/마감 결산 흐름
 * - `cash*`: 시재(입출금) 흐름
 * - `terminal*`: 주문/결제 터미널 흐름
 *
 * 유지보수 규칙:
 * - 데모 링크를 새로 추가할 때는 여기 상수에 먼저 등록
 * - 페이지/시나리오 파일에서는 문자열 하드코딩 대신 이 상수를 참조
 * - `scenario` 바로가기 진입이 필요하면 `DEMO_SHORTCUT_TARGET_BY_SCENARIO`에도 함께 매핑
 */
export const POS_DEMO_ROUTES = {
  homeMain: '/pos?demo=1',
  homeBusinessCash: '/pos?demo=1&scenario=pos-business-cash-home',
  businessOpen: '/pos/settlement?mode=open&demo=1&scenario=pos-business-open-tour',
  businessClose: '/pos/settlement?demo=1&scenario=pos-business-close-tour',
  cashManagement: '/pos/local/cash?demo=1&scenario=pos-cash-management-tour',
  terminalFullDineIn: '/pos/terminal?type=dine_in&demo=1&scenario=terminal-full-walkthrough',
} as const

export function getPosDemoTerminalRoute(orderType: TerminalOrderType): string {
  return `/pos/terminal?type=${orderType}&demo=1&scenario=terminal-full-walkthrough`
}

/**
 * 홈(`/pos`)로 들어왔을 때 `scenario` 값만으로 바로가기가 가능한 대상.
 * (예: `/pos?demo=1&scenario=pos-business-open-tour`)
 */
const DEMO_SHORTCUT_TARGET_BY_SCENARIO: Partial<Record<PosTourKnownScenarioId, string>> = {
  'terminal-full-walkthrough': POS_DEMO_ROUTES.terminalFullDineIn,
  'pos-business-open-tour': POS_DEMO_ROUTES.businessOpen,
  'pos-business-close-tour': POS_DEMO_ROUTES.businessClose,
  'pos-cash-management-tour': POS_DEMO_ROUTES.cashManagement,
}

/**
 * POS 홈에서 scenario 기반 데모 바로가기 대상 URL을 반환합니다.
 * 매핑이 없으면 null 반환(기본 홈 투어 유지).
 */
export function getPosDemoShortcutTargetByScenario(scenarioId: string): string | null {
  const key = String(scenarioId || '').trim() as PosTourKnownScenarioId
  return DEMO_SHORTCUT_TARGET_BY_SCENARIO[key] ?? null
}
