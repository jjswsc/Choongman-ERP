import {
  DEFAULT_POS_TOUR_SCENARIO_ID,
  POS_DEMO_QUERY_PARAM,
  POS_TOUR_SCENARIO_QUERY_PARAM,
} from './pos-tour-constants'

function queryTruthy(raw: string | null): boolean {
  if (raw == null) return false
  const v = raw.toLowerCase().trim()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/**
 * `useSearchParams()` / `URLSearchParams` 모두에 사용.
 */
export function isPosDemoFromQuery(searchParams: {
  get: (name: string) => string | null
} | null | undefined): boolean {
  if (!searchParams) return false
  return queryTruthy(searchParams.get(POS_DEMO_QUERY_PARAM))
}

export function getPosTourScenarioIdFromQuery(
  searchParams: { get: (name: string) => string | null } | null | undefined,
  /** `scenario` 쿼리 없을 때(예: `/pos?demo=1` 는 홈 시나리오) */
  defaultWhenMissing: string = DEFAULT_POS_TOUR_SCENARIO_ID
): string {
  if (!searchParams) return defaultWhenMissing
  return String(searchParams.get(POS_TOUR_SCENARIO_QUERY_PARAM) || '').trim() || defaultWhenMissing
}
