/**
 * 원가 분석 조회 상태 — 다른 메뉴로 나갔다 와도 같은 브라우저 탭에서 복원.
 * keep-alive가 풀려 페이지가 다시 마운트돼도 기간·매장·결과 표를 유지한다.
 */
import type { IngredientUsageVarianceRow } from '@/lib/api-client/stock'
import type {
  PosCostSalesWeightedChannelFilter,
  PosCostSalesWeightedResult,
} from '@/lib/api-client/pos-menu-cost'
import type { PosCostIssueFilter, PosCostSaleFilter } from '@/lib/pos-cost-analysis-shared'
import type { StoreNormalCostReport } from '@/lib/pos-store-normal-cost'

export const POS_COST_VIEW_SESSION_KEY = 'cm-pos-cost-view-v1'

const TABS = new Set(['list', 'actual', 'variance', 'storeNormal', 'sauce', 'calculator', 'audit'])
const CHANNELS = new Set<PosCostSalesWeightedChannelFilter>(['all', 'dine_in', 'takeout', 'delivery', 'other'])
const SALE_FILTERS = new Set<PosCostSaleFilter>(['active', 'all', 'inactive'])
const ISSUE_FILTERS = new Set<PosCostIssueFilter>(['all', 'zero_cost', 'no_bom', 'high_ratio'])
const TYPE_FILTERS = new Set(['all', 'food', 'packaging'])

export type PosCostListViewState = {
  searchTerm: string
  saleFilter: PosCostSaleFilter
  categoryFilter: string
  mainCategoryFilter: string
  issueFilter: PosCostIssueFilter
}

export type PosCostStoreNormalViewState = {
  startStr: string
  endStr: string
  storeFilter: string
  result: StoreNormalCostReport | null
}

export type PosCostActualViewState = {
  startStr: string
  endStr: string
  storeFilter: string
  channel: PosCostSalesWeightedChannelFilter
  result: PosCostSalesWeightedResult | null
}

export type PosCostVarianceMeta = {
  orderCount: number
  unmatchedOrderLines: number
  actualSource: string
  warnings: string[]
  posTruncated: boolean
}

export type PosCostVarianceViewState = {
  startYmd: string
  endYmd: string
  storeFilter: string
  searchTerm: string
  typeFilter: 'all' | 'food' | 'packaging'
  minAbsVarPct: number
  rows: IngredientUsageVarianceRow[]
  meta: PosCostVarianceMeta | null
}

export type PosCostViewSession = {
  activeTab?: string
  list?: PosCostListViewState
  storeNormal?: PosCostStoreNormalViewState
  actual?: PosCostActualViewState
  variance?: PosCostVarianceViewState
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function isYmd(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function parseStoreNormal(v: unknown): PosCostStoreNormalViewState | undefined {
  if (!isRecord(v) || !isYmd(v.startStr) || !isYmd(v.endStr) || typeof v.storeFilter !== 'string') return undefined
  let result: StoreNormalCostReport | null = null
  if (isRecord(v.result) && isYmd(v.result.startStr) && Array.isArray(v.result.rows)) {
    result = v.result as StoreNormalCostReport
  }
  return { startStr: v.startStr, endStr: v.endStr, storeFilter: v.storeFilter, result }
}

function parseActual(v: unknown): PosCostActualViewState | undefined {
  if (!isRecord(v) || !isYmd(v.startStr) || !isYmd(v.endStr) || typeof v.storeFilter !== 'string') return undefined
  const channel = v.channel
  if (typeof channel !== 'string' || !CHANNELS.has(channel as PosCostSalesWeightedChannelFilter)) return undefined
  let result: PosCostSalesWeightedResult | null = null
  if (isRecord(v.result) && isYmd(v.result.startStr) && v.result.summary !== undefined) {
    result = v.result as PosCostSalesWeightedResult
  }
  return {
    startStr: v.startStr,
    endStr: v.endStr,
    storeFilter: v.storeFilter,
    channel: channel as PosCostSalesWeightedChannelFilter,
    result,
  }
}

function parseVariance(v: unknown): PosCostVarianceViewState | undefined {
  if (!isRecord(v) || !isYmd(v.startYmd) || !isYmd(v.endYmd)) return undefined
  const typeFilter = v.typeFilter
  if (typeof typeFilter !== 'string' || !TYPE_FILTERS.has(typeFilter)) return undefined
  const minAbsVarPct = Number(v.minAbsVarPct)
  const rows = Array.isArray(v.rows) ? (v.rows as IngredientUsageVarianceRow[]) : []
  let meta: PosCostVarianceMeta | null = null
  if (isRecord(v.meta)) {
    meta = {
      orderCount: Number(v.meta.orderCount) || 0,
      unmatchedOrderLines: Number(v.meta.unmatchedOrderLines) || 0,
      actualSource: str(v.meta.actualSource, 'none'),
      warnings: Array.isArray(v.meta.warnings) ? v.meta.warnings.map((w) => String(w)) : [],
      posTruncated: Boolean(v.meta.posTruncated),
    }
  }
  return {
    startYmd: v.startYmd,
    endYmd: v.endYmd,
    storeFilter: str(v.storeFilter),
    searchTerm: str(v.searchTerm),
    typeFilter: typeFilter as PosCostVarianceViewState['typeFilter'],
    minAbsVarPct: Number.isFinite(minAbsVarPct) ? minAbsVarPct : 0,
    rows,
    meta,
  }
}

function parseList(v: unknown): PosCostListViewState | undefined {
  if (!isRecord(v)) return undefined
  const saleFilter = v.saleFilter
  const issueFilter = v.issueFilter
  if (typeof saleFilter !== 'string' || !SALE_FILTERS.has(saleFilter as PosCostSaleFilter)) return undefined
  if (typeof issueFilter !== 'string' || !ISSUE_FILTERS.has(issueFilter as PosCostIssueFilter)) return undefined
  return {
    searchTerm: str(v.searchTerm),
    saleFilter: saleFilter as PosCostSaleFilter,
    categoryFilter: str(v.categoryFilter, 'all') || 'all',
    mainCategoryFilter: str(v.mainCategoryFilter, 'all') || 'all',
    issueFilter: issueFilter as PosCostIssueFilter,
  }
}

export function parsePosCostViewSession(raw: unknown): PosCostViewSession {
  if (!isRecord(raw)) return {}
  const out: PosCostViewSession = {}
  if (typeof raw.activeTab === 'string' && TABS.has(raw.activeTab)) out.activeTab = raw.activeTab
  const list = parseList(raw.list)
  const storeNormal = parseStoreNormal(raw.storeNormal)
  const actual = parseActual(raw.actual)
  const variance = parseVariance(raw.variance)
  if (list) out.list = list
  if (storeNormal) out.storeNormal = storeNormal
  if (actual) out.actual = actual
  if (variance) out.variance = variance
  return out
}

export function mergePosCostViewSession(
  prev: PosCostViewSession,
  patch: Partial<PosCostViewSession>
): PosCostViewSession {
  return {
    activeTab: patch.activeTab ?? prev.activeTab,
    list: patch.list ?? prev.list,
    storeNormal: patch.storeNormal ?? prev.storeNormal,
    actual: patch.actual ?? prev.actual,
    variance: patch.variance ?? prev.variance,
  }
}

export function readPosCostViewSession(): PosCostViewSession {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(POS_COST_VIEW_SESSION_KEY)
    if (!raw) return {}
    return parsePosCostViewSession(JSON.parse(raw))
  } catch {
    return {}
  }
}

function writeRaw(session: PosCostViewSession): boolean {
  sessionStorage.setItem(POS_COST_VIEW_SESSION_KEY, JSON.stringify(session))
  return true
}

export function patchPosCostViewSession(patch: Partial<PosCostViewSession>): void {
  if (typeof sessionStorage === 'undefined') return
  const next = mergePosCostViewSession(readPosCostViewSession(), patch)
  try {
    writeRaw(next)
  } catch {
    try {
      writeRaw({
        ...next,
        storeNormal: next.storeNormal ? { ...next.storeNormal, result: null } : undefined,
        actual: next.actual ? { ...next.actual, result: null } : undefined,
        variance: next.variance ? { ...next.variance, rows: [], meta: null } : undefined,
      })
    } catch {
      /* quota */
    }
  }
}
