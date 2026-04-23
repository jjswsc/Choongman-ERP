/**
 * POS 터미널 “데모/교육” 모드 URL 규칙
 *
 * - `?demo=1` (또는 `demo=true`) + 선택적 `&scenario=<id>` 로 데모를 켭니다.
 * - `/pos`(첫 화면)에서 `scenario` 생략 시 `DEFAULT_POS_HOME_TOUR_SCENARIO_ID` — `/pos/terminal`에선 `DEFAULT_POS_TOUR_SCENARIO_ID` (각 페이지에서 `getPosTourScenarioIdFromQuery`에 넘기는 기본값).
 * - 시나리오는 `getPosTourScenario`로 조회 (존재하지 않으면 기본 시나리오로 대체).
 *
 * 쓰기 API(주문/결제/상태)는 터미널에서 가드됩니다(데모 ON 시).
 */
export const POS_DEMO_QUERY_PARAM = 'demo'
export const POS_TOUR_SCENARIO_QUERY_PARAM = 'scenario'
/** `?demo=1` + `/pos/terminal` 에서 `scenario` 생략 시 */
export const DEFAULT_POS_TOUR_SCENARIO_ID = 'terminal-full-walkthrough'
/** `?demo=1` + `/pos`(첫 화면)에서 `scenario` 생략 시 */
export const DEFAULT_POS_HOME_TOUR_SCENARIO_ID = 'pos-main-walkthrough'

export const POS_TOUR_KNOWN_SCENARIOS = [
  'pos-main-walkthrough',
  'terminal-full-walkthrough',
  'terminal-tables-intro',
] as const
export type PosTourKnownScenarioId = (typeof POS_TOUR_KNOWN_SCENARIOS)[number]
