import 'server-only'

import { tryFetchPosSalesAnalyticsAggIgnoreTimeout } from '@/lib/pos-sales-analytics-rpc-server'
import { loadHqOutboundProcessedLines } from '@/lib/hq-outbound-income-total'
import { sumCompletedPosSalesTotal } from '@/lib/accounting-pos-sales'
import { sumHqOutboundSubtotalMatchingOutboundManagement } from '@/lib/hq-outbound-income-total'
import { getBangkokTodayDateString, addBangkokCalendarDays } from '@/lib/bangkok-time'
import { isOfficeRole } from '@/lib/permissions'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isPosSalesTestOfficeStoreCode } from '@/lib/pos-sales-test-office'
import type { AiScopedAuth } from '@/lib/ai/types'

export type StoreOpsStoreRow = {
  store: string
  salesTotal: number
  hqOutboundTotal: number
  ratioPct: number | null
  completedOrders: number
}

export type StoreOpsInsight = {
  summary: string
  lines: string[]
  hasData: boolean
  metrics?: {
    store: string
    start: string
    end: string
    salesTotal: number
    hqOutboundTotal: number
    ratioPct: number | null
    completedOrders: number
  }
  storeBreakdown?: StoreOpsStoreRow[]
}

export function isStoreOpsQuestion(query: string): boolean {
  const q = String(query || '').toLowerCase()
  return /(매출|매입|원가|손익|food\s*cost|cogs|본사\s*창고|출고\s*비율|매출\s*대비|매입\s*비율|purchase\s*ratio|sales\s*vs|전\s*매장|매장\s*비교|store\s*compare)/i.test(
    q
  )
}

function formatBaht(n: number): string {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function resolveDefaultRange(): { start: string; end: string } {
  const end = getBangkokTodayDateString()
  const start = addBangkokCalendarDays(end, -29)
  return { start, end }
}

function aggregateHqOutboundByStore(lines: Awaited<ReturnType<typeof loadHqOutboundProcessedLines>>['lines']) {
  const map = new Map<string, number>()
  for (const line of lines) {
    const st = String(line.targetStore || '').trim()
    if (!st || isHeadOfficeLikeStoreName(st) || isPosSalesTestOfficeStoreCode(st)) continue
    map.set(st, (map.get(st) || 0) + Math.max(0, Number(line.lineAmount) || 0))
  }
  return map
}

async function buildStoreBreakdown(
  start: string,
  end: string,
  opts?: {
    tenantId?: string
    tenantScope?: import('@/lib/saas-tenant-scope').SaasTenantScope
    maxStores?: number
  }
): Promise<StoreOpsStoreRow[]> {
  const maxStores = opts?.maxStores ?? 30
  const [salesRows, outbound] = await Promise.all([
    tryFetchPosSalesAnalyticsAggIgnoreTimeout({
      startStr: start,
      endStr: end,
      aggMode: 'store',
      tenantScope: opts?.tenantScope,
    }),
    loadHqOutboundProcessedLines({ startStr: start, endStr: end, storeFilter: null }),
  ])
  if (!salesRows?.length) return []

  const hqByStore = aggregateHqOutboundByStore(outbound.lines)
  const rows: StoreOpsStoreRow[] = []

  for (const r of salesRows) {
    const store = String(r.bucket_key || '').trim()
    if (!store || isPosSalesTestOfficeStoreCode(store)) continue
    const salesTotal = Math.max(0, Number(r.total) || 0)
    const completedOrders = Math.max(0, Math.trunc(Number(r.order_count) || 0))
    const hqOutboundTotal = Math.max(0, hqByStore.get(store) || 0)
    const ratioPct = salesTotal > 0 ? (hqOutboundTotal / salesTotal) * 100 : null
    rows.push({ store, salesTotal, hqOutboundTotal, ratioPct, completedOrders })
  }

  // HQ만 있고 POS 매출 RPC에 없는 매장
  for (const [store, hqOutboundTotal] of hqByStore.entries()) {
    if (rows.some((x) => x.store === store)) continue
    rows.push({
      store,
      salesTotal: 0,
      hqOutboundTotal,
      ratioPct: null,
      completedOrders: 0,
    })
  }

  return rows
    .sort((a, b) => b.salesTotal - a.salesTotal || b.hqOutboundTotal - a.hqOutboundTotal)
    .slice(0, maxStores)
}

export async function buildStoreOpsInsight(params: {
  scoped: AiScopedAuth
  requestedStore: string
  start?: string
  end?: string
  includeBreakdown?: boolean
  /** Omni JWT tenantId — 생략 시 scoped.auth.tenantId */
  tenantId?: string
  tenantScope?: import('@/lib/saas-tenant-scope').SaasTenantScope
}): Promise<StoreOpsInsight> {
  const fallback = resolveDefaultRange()
  const start = String(params.start || fallback.start).trim().slice(0, 10) || fallback.start
  const end = String(params.end || fallback.end).trim().slice(0, 10) || fallback.end
  const requestedStore = String(params.requestedStore || '').trim()
  const store =
    requestedStore && requestedStore !== 'All'
      ? requestedStore
      : isOfficeRole(params.scoped.role)
        ? 'All'
        : String(params.scoped.store || '').trim() || 'All'

  if (!store || store === 'All') {
    if (!isOfficeRole(params.scoped.role) && !params.scoped.store) {
      return {
        summary: '매장 스코프가 없어 매출·본사매입 분석을 수행할 수 없습니다.',
        lines: [],
        hasData: false,
      }
    }
  }

  const storeFilter = store === 'All' ? 'All' : store
  const wantBreakdown =
    Boolean(params.includeBreakdown) ||
    (storeFilter === 'All' && isOfficeRole(params.scoped.role))

  const tenantId =
    String(params.tenantId || params.scoped.auth.tenantId || '').trim() || undefined
  let tenantScope = params.tenantScope
  if (!tenantScope && tenantId) {
    const { resolveSaasTenantScope } = await import('@/lib/saas-tenant-scope')
    tenantScope = await resolveSaasTenantScope({
      auth: { tenantId },
      storeCode: storeFilter !== 'All' ? storeFilter : null,
    })
  }

  try {
    const [sales, hq, breakdown] = await Promise.all([
      sumCompletedPosSalesTotal({ startStr: start, endStr: end, storeFilter, tenantId }),
      sumHqOutboundSubtotalMatchingOutboundManagement({
        startStr: start,
        endStr: end,
        storeFilter: storeFilter === 'All' ? null : storeFilter,
      }),
      wantBreakdown ? buildStoreBreakdown(start, end, { tenantScope, tenantId }) : Promise.resolve([] as StoreOpsStoreRow[]),
    ])

    const salesTotal = Math.max(0, Number(sales.total) || 0)
    const hqOutboundTotal = Math.max(0, Number(hq.purchaseTotal) || 0)
    const ratioPct = salesTotal > 0 ? (hqOutboundTotal / salesTotal) * 100 : null

    const lines = [
      `기간: ${start} ~ ${end} (방콕)`,
      `매장: ${storeFilter}`,
      `POS 완료 매출(total): ${formatBaht(salesTotal)} THB (${sales.completedCount}건)`,
      `본사 창고 출고(매입): ${formatBaht(hqOutboundTotal)} THB`,
      ratioPct != null
        ? `매출 대비 본사매입 비율: ${ratioPct.toFixed(1)}%`
        : '매출 대비 본사매입 비율: 매출 0 — 비율 산출 불가',
    ]

    if (breakdown.length > 0) {
      lines.push('', '매장별 요약 (매출 상위):')
      for (const row of breakdown.slice(0, 8)) {
        const ratio =
          row.ratioPct != null ? `${row.ratioPct.toFixed(1)}%` : '-'
        lines.push(
          `- ${row.store}: 매출 ${formatBaht(row.salesTotal)} / 본사매입 ${formatBaht(row.hqOutboundTotal)} (${ratio})`
        )
      }
      if (breakdown.length > 8) {
        lines.push(`- … 외 ${breakdown.length - 8}개 매장`)
      }
    }

    if (sales.truncated || hq.hitRowCap) {
      lines.push('※ 일부 데이터가 조회 상한에 도달해 합계가 과소할 수 있습니다.')
    }

    const summary =
      ratioPct != null
        ? `${storeFilter} · ${start}~${end} 매출 ${formatBaht(salesTotal)} THB, 본사매입 ${formatBaht(hqOutboundTotal)} THB (비율 ${ratioPct.toFixed(1)}%)`
        : `${storeFilter} · ${start}~${end} 매출 ${formatBaht(salesTotal)} THB, 본사매입 ${formatBaht(hqOutboundTotal)} THB`

    return {
      summary,
      lines,
      hasData: salesTotal > 0 || hqOutboundTotal > 0 || breakdown.length > 0,
      metrics: {
        store: storeFilter,
        start,
        end,
        salesTotal,
        hqOutboundTotal,
        ratioPct,
        completedOrders: sales.completedCount,
      },
      storeBreakdown: breakdown.length > 0 ? breakdown : undefined,
    }
  } catch (e) {
    return {
      summary: `매출·본사매입 분석 중 오류: ${e instanceof Error ? e.message : String(e)}`,
      lines: [],
      hasData: false,
    }
  }
}

/** API·대시보드용 — 단일/전체 매장 store-ops 스냅샷 */
export async function fetchStoreOpsSnapshot(params: {
  scoped: AiScopedAuth
  store?: string
  start?: string
  end?: string
  tenantId?: string
  tenantScope?: import('@/lib/saas-tenant-scope').SaasTenantScope
}): Promise<StoreOpsInsight> {
  return buildStoreOpsInsight({
    scoped: params.scoped,
    requestedStore: params.store || params.scoped.store || 'All',
    start: params.start,
    end: params.end,
    includeBreakdown: true,
    tenantId: params.tenantId ?? params.scoped.auth.tenantId,
    tenantScope: params.tenantScope,
  })
}
