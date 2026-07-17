/** 관리자 화면 공통 UI 토큰 (점진 적용) */
export const ADMIN_BADGE_BASE_CN = 'rounded px-2 py-0.5 text-xs font-medium'
export const ADMIN_BADGE_SUCCESS_CN = 'bg-emerald-50 text-emerald-700'
export const ADMIN_BADGE_WARNING_CN = 'bg-amber-50 text-amber-700'
export const ADMIN_BADGE_DANGER_CN = 'bg-rose-50 text-rose-700'
export const ADMIN_BADGE_NEUTRAL_CN = 'bg-muted text-muted-foreground'

export const ADMIN_DIALOG_SCROLL_CN = 'max-h-[90vh] overflow-y-auto'
export const ADMIN_PANEL_WARNING_CN =
  'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100'

/** 관리자 액션 버튼(소형) 표준 */
export const ADMIN_BTN_XS_CN = 'h-8 gap-1.5 px-2 text-xs'

/** 금액·건수·비율 등 숫자 표시 (globals.css `.font-erp-numeric`) */
export const ADMIN_NUMERIC_CN = 'font-erp-numeric tabular-nums lining-nums'

/**
 * 테이블·매트릭스 스크롤 영역 — 가로·세로를 한 컨테이너에서 처리해
 * 세로 스크롤 시 가로 스크롤바가 화면 밖으로 사라지지 않게 한다.
 */
export const ADMIN_TABLE_SCROLL_CN = 'min-h-0 overflow-auto [scrollbar-gutter:stable]'

/** 필터·탭이 있는 관리자 목록 테이블 (뷰포트 높이 기준) */
export const ADMIN_TABLE_SCROLL_VIEWPORT_CN =
  'min-h-[200px] max-h-[calc(100vh-380px)] overflow-auto [scrollbar-gutter:stable]'

/** 필터·요약이 많은 목록 테이블 (출고 내역 등) */
export const ADMIN_TABLE_SCROLL_VIEWPORT_TALL_CN =
  'min-h-[200px] max-h-[calc(100vh-440px)] overflow-auto [scrollbar-gutter:stable]'

/** 중형 패널·요약 테이블 */
export const ADMIN_TABLE_SCROLL_PANEL_CN =
  'min-h-0 max-h-[480px] overflow-auto [scrollbar-gutter:stable]'

/** 소형 패널·카트 테이블 */
export const ADMIN_TABLE_SCROLL_PANEL_SM_CN =
  'min-h-0 max-h-[400px] overflow-auto [scrollbar-gutter:stable]'

/** Recharts 축·툴팁 숫자 */
export const ERP_NUMERIC_CHART_TICK = {
  fontFamily: 'var(--font-pretendard), var(--font-inter), ui-sans-serif, system-ui, sans-serif',
  fontFeatureSettings: '"tnum", "lnum"',
} as const

/** 관리자 매출·분석 차트 공통 팔레트 */
export const ADMIN_CHART_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#64748b',
] as const
