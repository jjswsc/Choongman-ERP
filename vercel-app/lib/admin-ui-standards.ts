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

/** Recharts 축·툴팁 숫자 */
export const ERP_NUMERIC_CHART_TICK = {
  fontFamily: 'var(--font-pretendard), var(--font-inter), ui-sans-serif, system-ui, sans-serif',
  fontFeatureSettings: '"tnum", "lnum"',
} as const
