/**
 * 월말 실사 KPI — 방콕 달력 기준 대상 월·실사 윈도우·완료 판정.
 * 이론 vs 실소진은 기말 Adjustment가 있어야 의미가 있다.
 */
import { addBangkokCalendarDays, getBangkokMonthRange, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { getStockLocationPatterns, isOfficeStockSelection } from '@/lib/stock-location-patterns'

/** 실사 완료로 볼 최소 품목 수 (Adjustment distinct item_code) */
export const STOCK_TAKE_MIN_DISTINCT_ITEMS = 5

/** |차이%| 이 값 이상이면 고차이 품목 (식재, 이론>0) */
export const STOCK_VARIANCE_HIGH_PCT = 15

/** 실사 커버리지(조정 품목/전체)가 이 값 미만이면 실사 부족 경고 */
export const STOCK_TAKE_COVERAGE_WARN = 0.3

export type StockTakeKpiMonth = {
  yearMonth: string
  startYmd: string
  endYmd: string
  /** Adjustment 집계 = 실사 기한 (말일 2일 전 ~ 익월 5일) */
  windowStartYmd: string
  windowEndYmd: string
  dueStartYmd: string
  dueEndYmd: string
  /** 말일 2일 전~익월 5일: 실사 기한 */
  inDueWindow: boolean
}

/**
 * HQ가 볼 「이번 실사 사이클」 월.
 * - 말일 3일 전~당월 말: 이번 달
 * - 익월 1~5일: 방금 끝난 달
 * - 그 외: 직전 달 (마감 검토)
 */
export function resolveStockTakeKpiMonth(todayYmd = getBangkokTodayDateString()): StockTakeKpiMonth {
  const today = String(todayYmd || '').slice(0, 10)
  const current = getBangkokMonthRange(undefined, new Date(`${today}T12:00:00+07:00`))
  const day = Number(today.slice(8, 10))
  const lastDay = Number(current.endStr.slice(8, 10))
  const daysToEnd = lastDay - day

  let yearMonth = current.yearMonth
  if (!(daysToEnd <= 2 && daysToEnd >= 0)) {
    yearMonth = shiftYearMonth(current.yearMonth, -1)
  }

  return stockTakeWindowsForYearMonth(yearMonth, today)
}

/** 지정 달의 실사 윈도우 (API yearMonth 쿼리용) */
export function stockTakeWindowsForYearMonth(
  yearMonth: string,
  todayYmd = getBangkokTodayDateString()
): StockTakeKpiMonth {
  const range = getBangkokMonthRange(yearMonth)
  const dueStartYmd = addBangkokCalendarDays(range.endStr, -2)
  const dueEndYmd = addBangkokCalendarDays(range.endStr, 5)
  const today = String(todayYmd || '').slice(0, 10)
  return {
    yearMonth: range.yearMonth,
    startYmd: range.startStr,
    endYmd: range.endStr,
    windowStartYmd: dueStartYmd,
    windowEndYmd: dueEndYmd,
    dueStartYmd,
    dueEndYmd,
    inDueWindow: today >= dueStartYmd && today <= dueEndYmd,
  }
}

export type StockTakeNoticePhase = {
  phase: 'start' | 'nudge'
  month: StockTakeKpiMonth
}

/**
 * 자동 공지 일자 — KPI 「이번 사이클」과 별도로, 달력 월 기준으로 본다.
 * 시작: 당월 말일 − N일 / 독촉: 전월 말일 + 1일.
 * (N>2이면 KPI 사이클이 아직 전월인데 시작일이 올 수 있어 resolveStockTakeKpiMonth에 묶지 않는다.)
 */
export function resolveStockTakeNoticePhase(
  todayYmd: string,
  daysBeforeMonthEnd: number
): StockTakeNoticePhase | null {
  const today = String(todayYmd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  const n = Number.isFinite(daysBeforeMonthEnd) ? Math.max(1, Math.min(14, Math.floor(daysBeforeMonthEnd))) : 2
  const current = getBangkokMonthRange(undefined, new Date(`${today}T12:00:00+07:00`))
  const prevYm = shiftYearMonth(current.yearMonth, -1)
  const prev = getBangkokMonthRange(prevYm)
  const currentStart = addBangkokCalendarDays(current.endStr, -n)
  const prevStart = addBangkokCalendarDays(prev.endStr, -n)
  const prevNudge = addBangkokCalendarDays(prev.endStr, 1)
  if (today === currentStart) {
    return { phase: 'start', month: stockTakeWindowsForYearMonth(current.yearMonth, today) }
  }
  if (today === prevNudge && prevNudge !== prevStart) {
    return { phase: 'nudge', month: stockTakeWindowsForYearMonth(prevYm, today) }
  }
  return null
}

export function managerBelongsToMissingStore(managerStore: string, missingStores: string[]): boolean {
  const ms = String(managerStore || '').trim()
  if (!ms) return false
  return missingStores.some((s) => storesMatchForGradeLookup(ms, s))
}

/** LINE 붙여넣기용 (표 없음). th는 ครับ */
export function buildStockTakeOpsLineCopy(params: {
  yearMonth: string
  endYmd: string
  dueStartYmd: string
  dueEndYmd: string
  missingStores: string[]
  lang?: string
}): string {
  const lang = String(params.lang || 'ko').slice(0, 2).toLowerCase()
  const missing = params.missingStores.map((s) => String(s || '').trim()).filter(Boolean)
  const list =
    missing.length === 0
      ? ''
      : missing.map((s, i) => `${i + 1}. ${s}`).join('\n')

  if (lang === 'th') {
    if (missing.length === 0) {
      return `[นับสต็อกสิ้นเดือน] ${params.yearMonth}\nวันสิ้นเดือน: ${params.endYmd}\nกำหนดนับ: ${params.dueStartYmd} ~ ${params.dueEndYmd}\n\nสาขาในรอบนี้บันทึก Adjustment ครบแล้วครับ`
    }
    return `[นับสต็อกสิ้นเดือน] ${params.yearMonth}\nวันสิ้นเดือน (วันที่ตั้งในหน้าสต็อก): ${params.endYmd}\nกำหนดนับ: ${params.dueStartYmd} ~ ${params.dueEndYmd}\n\nสาขาที่ยังไม่นับ:\n${list}\n\nเข้าเมนูสต็อก ตั้งวันที่เป็นวันสิ้นเดือน แล้วกด Adjust ครับ`
  }
  if (lang === 'en') {
    if (missing.length === 0) {
      return `[Month-end stock take] ${params.yearMonth}\nMonth-end date: ${params.endYmd}\nDue: ${params.dueStartYmd} ~ ${params.dueEndYmd}\n\nAll stores in this cycle have enough Adjustment rows.`
    }
    return `[Month-end stock take] ${params.yearMonth}\nSet stock as-of date to month-end: ${params.endYmd}\nDue: ${params.dueStartYmd} ~ ${params.dueEndYmd}\n\nStores not counted yet:\n${list}\n\nOpen Stock, set the as-of date to month-end, then Adjust.`
  }
  if (missing.length === 0) {
    return `[월말 실사] ${params.yearMonth}\n말일(기준일): ${params.endYmd}\n실사 기한: ${params.dueStartYmd} ~ ${params.dueEndYmd}\n\n이번 사이클 대상 매장은 모두 실사했습니다.`
  }
  return `[월말 실사] ${params.yearMonth}\n말일(재고 기준일): ${params.endYmd}\n실사 기한: ${params.dueStartYmd} ~ ${params.dueEndYmd}\n\n아직 안 한 매장:\n${list}\n\n재고 화면에서 기준일을 말일로 맞춘 뒤 조정하세요.`
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [ys, ms] = String(yearMonth).split('-')
  let y = Number(ys)
  let m = Number(ms) + deltaMonths
  while (m > 12) {
    m -= 12
    y += 1
  }
  while (m < 1) {
    m += 12
    y -= 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

export function isStockTakeComplete(distinctItemCount: number, rowCount: number): boolean {
  return distinctItemCount >= STOCK_TAKE_MIN_DISTINCT_ITEMS || rowCount >= STOCK_TAKE_MIN_DISTINCT_ITEMS * 2
}

export function matchAdjustmentStore(location: string, stores: string[]): string | null {
  const loc = String(location || '').trim()
  if (!loc || isOfficeStockSelection(loc)) return null
  for (const store of stores) {
    const s = String(store || '').trim()
    if (!s || isOfficeStockSelection(s)) continue
    if (storesMatchForGradeLookup(s, loc)) return s
    const patterns = getStockLocationPatterns(s)
    const locL = loc.toLowerCase()
    if (patterns.some((p) => {
      const pl = p.toLowerCase()
      return locL === pl || locL.includes(pl) || pl.includes(locL)
    })) {
      return s
    }
  }
  return null
}

export type StockTakeKpiStoreRow = {
  store: string
  done: boolean
  distinctItems: number
  adjustmentRows: number
  lastAdjYmd: string
}

export function buildStockTakeKpiRows(
  stores: string[],
  adjustments: { store?: string; location?: string; itemCode?: string; date?: string }[]
): StockTakeKpiStoreRow[] {
  const byStore = new Map<string, { items: Set<string>; rows: number; last: string }>()
  for (const s of stores) {
    byStore.set(s, { items: new Set(), rows: 0, last: '' })
  }
  for (const adj of adjustments) {
    const loc = String(adj.store || adj.location || '').trim()
    const matched = matchAdjustmentStore(loc, stores)
    if (!matched) continue
    const bucket = byStore.get(matched)
    if (!bucket) continue
    bucket.rows += 1
    const code = String(adj.itemCode || '').trim()
    if (code) bucket.items.add(code)
    else bucket.items.add(`row:${bucket.rows}`)
    const d = String(adj.date || '').slice(0, 10)
    if (d && d > bucket.last) bucket.last = d
  }
  return stores.map((store) => {
    const b = byStore.get(store) || { items: new Set<string>(), rows: 0, last: '' }
    return {
      store,
      done: isStockTakeComplete(b.items.size, b.rows),
      distinctItems: b.items.size,
      adjustmentRows: b.rows,
      lastAdjYmd: b.last,
    }
  })
}

export type VarianceKpiStrip = {
  foodCount: number
  absVarianceCost: number
  avgAbsVariancePct: number | null
  highVarCount: number
  coverage: number
  adjCount: number
  rowCount: number
  coverageLow: boolean
}

/** 이미 불러온 이론 vs 실소진 행에서 KPI 스트립 계산 (추가 API 없음) */
export function summarizeVarianceKpi(
  rows: {
    ingredientType?: string
    theoreticalQty?: number
    variancePct?: number | null
    varianceCost?: number
    hasAdjustment?: boolean
  }[]
): VarianceKpiStrip {
  const list = Array.isArray(rows) ? rows : []
  const rowCount = list.length
  const adjCount = list.filter((r) => r.hasAdjustment).length
  const coverage = rowCount > 0 ? adjCount / rowCount : 0
  const food = list.filter((r) => r.ingredientType === 'food')
  let absVarianceCost = 0
  const pcts: number[] = []
  let highVarCount = 0
  for (const r of food) {
    absVarianceCost += Math.abs(Number(r.varianceCost) || 0)
    const theo = Number(r.theoreticalQty) || 0
    const pct = r.variancePct
    if (theo > 0 && pct != null && Number.isFinite(pct)) {
      const abs = Math.abs(pct)
      pcts.push(abs)
      if (abs >= STOCK_VARIANCE_HIGH_PCT) highVarCount += 1
    }
  }
  const avgAbsVariancePct =
    pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
  return {
    foodCount: food.length,
    absVarianceCost,
    avgAbsVariancePct,
    highVarCount,
    coverage,
    adjCount,
    rowCount,
    coverageLow: rowCount > 0 && coverage < STOCK_TAKE_COVERAGE_WARN,
  }
}
