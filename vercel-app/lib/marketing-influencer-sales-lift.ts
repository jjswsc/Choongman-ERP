/**
 * 인플루언서 업로드 매출 효과 — 업로드일 기준 협업 매장의 전 N일 vs 후 N일 비교. 순수 함수.
 * 날짜는 방콕 영업일 YYYY-MM-DD.
 */

export const SALES_LIFT_WINDOW_OPTIONS = [7, 14, 30] as const
export type SalesLiftWindowDays = (typeof SALES_LIFT_WINDOW_OPTIONS)[number]

export function normalizeSalesLiftWindow(raw: unknown): SalesLiftWindowDays {
  const n = Number(raw)
  return (SALES_LIFT_WINDOW_OPTIONS as readonly number[]).includes(n) ? (n as SalesLiftWindowDays) : 7
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function diffDaysYmd(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000
  )
}

export type DailyStoreSales = { sales: number; orders: number }

export type SalesLiftWindows = {
  preFrom: string
  preTo: string
  postFrom: string
  postTo: string
}

/** 전: [업로드-N, 업로드-1], 후: [업로드, 업로드+N-1] */
export function salesLiftWindows(publishYmd: string, windowDays: number): SalesLiftWindows {
  return {
    preFrom: addDaysYmd(publishYmd, -windowDays),
    preTo: addDaysYmd(publishYmd, -1),
    postFrom: publishYmd,
    postTo: addDaysYmd(publishYmd, windowDays - 1),
  }
}

export type SalesLiftResult = SalesLiftWindows & {
  windowDays: number
  /** 후 구간 중 집계된(어제까지) 일수 */
  postDaysCounted: number
  preTotal: number
  postTotal: number
  preAvg: number
  postAvg: number
  /** 증감률(%) — 전 일평균이 0이면 null */
  liftPct: number | null
  preOrdersAvg: number
  postOrdersAvg: number
  ordersLiftPct: number | null
  /** (후 일평균 − 전 일평균) × N */
  incrementalSales: number
  cost: number
  /** 증분 매출 ÷ 비용 — 비용 0이면 null */
  roi: number | null
  pending: boolean
  overlap: boolean
  noSales: boolean
  /** 업로드일이 미래라 계산 불가 */
  notStarted: boolean
  /** 대조군(같은 기간 다른 매장 합계) 증감률(%) — 대조군 없으면 null */
  controlLiftPct: number | null
  /** 대조군 추세를 뺀 순증감률(%) = 후 일평균 ÷ (전 일평균 × 대조군 증감비) − 1 */
  netLiftPct: number | null
  /** 대조군 보정 증분 매출 = (후 일평균 − 전 일평균 × 대조군 증감비) × N */
  netIncrementalSales: number | null
  netRoi: number | null
}

export type SalesLiftSeriesPoint = {
  date: string
  /** 업로드일 이후(후 구간) */
  post: boolean
  sales: number
  /** 대조군 일매출(전 구간 일평균 = 매장 전 구간 일평균이 되도록 스케일) */
  control: number | null
}

export type InfluencerSalesLiftRow = {
  id: string
  profileId: string | null
  campaignId: string | null
  name: string
  contactName: string
  store: string
  publishDate: string
  actualCost: number
  /** 매장 권한 없음·매출 RPC 실패 */
  unavailable: boolean
  lift: SalesLiftResult | null
  /** 업로드일을 TikTok 영상 링크 시각으로 추정 */
  publishDateEstimated?: boolean
  series?: SalesLiftSeriesPoint[]
}

function sumRange(
  daily: ReadonlyMap<string, DailyStoreSales>,
  from: string,
  to: string
): { sales: number; orders: number; days: number } {
  let sales = 0
  let orders = 0
  let days = 0
  if (to < from) return { sales, orders, days }
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) {
    const row = daily.get(d)
    if (row) {
      sales += row.sales
      orders += row.orders
    }
    days++
  }
  return { sales, orders, days }
}

function pct(after: number, before: number): number | null {
  if (!(before > 0)) return null
  return ((after - before) / before) * 100
}

/**
 * @param daily 해당 매장의 일별 매출(키 YYYY-MM-DD). 없는 날은 0으로 본다.
 * @param todayYmd 방콕 기준 오늘 — 오늘은 영업 중이라 후 구간 집계에서 제외
 */
export function computeSalesLift(params: {
  publishYmd: string
  windowDays: number
  todayYmd: string
  daily: ReadonlyMap<string, DailyStoreSales>
  cost: number
  overlap?: boolean
  /** 대조군 일별 매출(다른 매장 합계). 없으면 순효과 null */
  controlDaily?: ReadonlyMap<string, DailyStoreSales> | null
}): SalesLiftResult {
  const { publishYmd, windowDays, todayYmd, daily, controlDaily } = params
  const w = salesLiftWindows(publishYmd, windowDays)
  const yesterday = addDaysYmd(todayYmd, -1)
  const notStarted = publishYmd > yesterday
  const postEnd = w.postTo <= yesterday ? w.postTo : yesterday
  const pending = w.postTo > yesterday

  const pre = sumRange(daily, w.preFrom, w.preTo)
  const post = notStarted ? { sales: 0, orders: 0, days: 0 } : sumRange(daily, w.postFrom, postEnd)

  const preAvg = pre.days > 0 ? pre.sales / pre.days : 0
  const postAvg = post.days > 0 ? post.sales / post.days : 0
  const preOrdersAvg = pre.days > 0 ? pre.orders / pre.days : 0
  const postOrdersAvg = post.days > 0 ? post.orders / post.days : 0
  const cost = Math.max(0, Number(params.cost) || 0)
  const incrementalSales = post.days > 0 ? (postAvg - preAvg) * windowDays : 0

  let controlLiftPct: number | null = null
  let netLiftPct: number | null = null
  let netIncrementalSales: number | null = null
  if (controlDaily && post.days > 0) {
    const cPre = sumRange(controlDaily, w.preFrom, w.preTo)
    const cPost = sumRange(controlDaily, w.postFrom, postEnd)
    const cPreAvg = cPre.days > 0 ? cPre.sales / cPre.days : 0
    const cPostAvg = cPost.days > 0 ? cPost.sales / cPost.days : 0
    if (cPreAvg > 0) {
      const ratio = cPostAvg / cPreAvg
      controlLiftPct = (ratio - 1) * 100
      const expectedPostAvg = preAvg * ratio
      netIncrementalSales = (postAvg - expectedPostAvg) * windowDays
      netLiftPct = pct(postAvg, expectedPostAvg)
    }
  }

  return {
    ...w,
    windowDays,
    postDaysCounted: post.days,
    preTotal: pre.sales,
    postTotal: post.sales,
    preAvg,
    postAvg,
    liftPct: post.days > 0 ? pct(postAvg, preAvg) : null,
    preOrdersAvg,
    postOrdersAvg,
    ordersLiftPct: post.days > 0 ? pct(postOrdersAvg, preOrdersAvg) : null,
    incrementalSales,
    cost,
    roi: cost > 0 && post.days > 0 ? incrementalSales / cost : null,
    pending,
    overlap: Boolean(params.overlap),
    noSales: pre.sales <= 0 && post.sales <= 0,
    notStarted,
    controlLiftPct,
    netLiftPct,
    netIncrementalSales,
    netRoi: netIncrementalSales != null && cost > 0 ? netIncrementalSales / cost : null,
  }
}

/** 미니 차트용 일별 시리즈(전 N일 + 후 N일 중 어제까지). 대조군은 전 구간 평균을 매장 전 구간 평균에 맞춰 스케일 */
export function salesLiftSeries(params: {
  publishYmd: string
  windowDays: number
  todayYmd: string
  daily: ReadonlyMap<string, DailyStoreSales>
  controlDaily?: ReadonlyMap<string, DailyStoreSales> | null
}): SalesLiftSeriesPoint[] {
  const { publishYmd, windowDays, todayYmd, daily, controlDaily } = params
  const w = salesLiftWindows(publishYmd, windowDays)
  const yesterday = addDaysYmd(todayYmd, -1)
  const end = w.postTo <= yesterday ? w.postTo : yesterday
  if (end < w.preFrom) return []
  let scale: number | null = null
  if (controlDaily) {
    const pre = sumRange(daily, w.preFrom, w.preTo)
    const cPre = sumRange(controlDaily, w.preFrom, w.preTo)
    scale = cPre.sales > 0 ? pre.sales / cPre.sales : null
  }
  const out: SalesLiftSeriesPoint[] = []
  for (let d = w.preFrom; d <= end; d = addDaysYmd(d, 1)) {
    out.push({
      date: d,
      post: d >= w.postFrom,
      sales: daily.get(d)?.sales ?? 0,
      control: scale != null && controlDaily ? (controlDaily.get(d)?.sales ?? 0) * scale : null,
    })
  }
  return out
}

/** 합계에 넣을 수 있는(후 구간 완료·전후 구간 비겹침·매출 있음·권한 있음) 행 */
export function isSalesLiftRowSettled(r: InfluencerSalesLiftRow): boolean {
  const l = r.lift
  return Boolean(l && !r.unavailable && !l.pending && !l.overlap && !l.noSales && !l.notStarted && l.postDaysCounted > 0)
}

/** 여러 업로드 행 → KPI 합계(정산된 행만 ROI·증분 합산) */
export function summarizeSalesLiftRows(rows: readonly InfluencerSalesLiftRow[]): {
  total: number
  settled: number
  cost: number
  incremental: number
  netIncremental: number | null
  roi: number | null
  netRoi: number | null
  avgLiftPct: number | null
  avgNetLiftPct: number | null
} {
  let settled = 0
  let cost = 0
  let incremental = 0
  let netIncremental = 0
  let netCount = 0
  let liftSum = 0
  let liftCount = 0
  let netLiftSum = 0
  let netLiftCount = 0
  for (const r of rows) {
    const l = r.lift
    if (!l || !isSalesLiftRowSettled(r)) continue
    settled++
    cost += l.cost
    incremental += l.incrementalSales
    if (l.netIncrementalSales != null) {
      netIncremental += l.netIncrementalSales
      netCount++
    }
    if (l.liftPct != null) {
      liftSum += l.liftPct
      liftCount++
    }
    if (l.netLiftPct != null) {
      netLiftSum += l.netLiftPct
      netLiftCount++
    }
  }
  return {
    total: rows.length,
    settled,
    cost,
    incremental,
    netIncremental: netCount > 0 ? netIncremental : null,
    roi: cost > 0 && settled > 0 ? incremental / cost : null,
    netRoi: cost > 0 && netCount > 0 ? netIncremental / cost : null,
    avgLiftPct: liftCount > 0 ? liftSum / liftCount : null,
    avgNetLiftPct: netLiftCount > 0 ? netLiftSum / netLiftCount : null,
  }
}

/**
 * 같은 매장에서 업로드일 간격이 N일 미만인 업로드 → 서로의 전후 구간이 겹쳐 효과가 섞임.
 */
export function detectSalesLiftOverlaps(
  posts: readonly { id: string; store: string; publishYmd: string }[],
  windowDays: number
): Set<string> {
  const out = new Set<string>()
  const byStore = new Map<string, { id: string; publishYmd: string }[]>()
  for (const p of posts) {
    const k = p.store.trim()
    if (!k || !p.publishYmd) continue
    const list = byStore.get(k) || []
    list.push(p)
    byStore.set(k, list)
  }
  for (const list of byStore.values()) {
    list.sort((a, b) => a.publishYmd.localeCompare(b.publishYmd))
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!
      const b = list[i]!
      if (Math.abs(diffDaysYmd(b.publishYmd, a.publishYmd)) < windowDays) {
        out.add(a.id)
        out.add(b.id)
      }
    }
  }
  return out
}

/** 업로드 비용 = 실지출 + 제공 메뉴 금액(단가×수량) */
export function influencerPostCost(post: {
  actualCost?: number | null
  providedMenus?: readonly { price?: number; quantity?: number }[] | null
}): number {
  let menu = 0
  for (const m of post.providedMenus || []) {
    menu += (Number(m.price) || 0) * Math.max(1, Math.floor(Number(m.quantity) || 1))
  }
  return Math.max(0, Number(post.actualCost) || 0) + menu
}
