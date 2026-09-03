import { canonicalSalesStoreRowKey, rowMatchesSalesStoreSelection } from '@/lib/pos-sales-store-filter'
import { shouldExcludeAdvanceFromSalesAggregate } from '@/lib/pos-deposit-domain'

const COMPLETED_STATUSES = new Set(['completed', 'paid', 'ready'])
const PENDING_STATUSES = new Set(['pending', 'cooking'])

export type PosTodaySalesSummary = {
  completedCount: number
  completedTotal: number
  completedCash: number
  pendingCount: number
}

export type PosTodaySalesRow = {
  store_code?: string | null
  status?: string | null
  total?: number | string | null
  payment_cash?: number | string | null
  is_advance?: boolean | null
}

export function emptyPosTodaySalesSummary(): PosTodaySalesSummary {
  return { completedCount: 0, completedTotal: 0, completedCash: 0, pendingCount: 0 }
}

export function aggregatePosTodaySalesFromRows(rows: PosTodaySalesRow[]): PosTodaySalesSummary {
  const out = emptyPosTodaySalesSummary()
  for (const r of rows) {
    const status = String(r.status ?? '').toLowerCase()
    const total = Number(r.total) || 0
    if (shouldExcludeAdvanceFromSalesAggregate(r)) {
      if (PENDING_STATUSES.has(status) || status === 'ready' || status === 'pending') {
        out.pendingCount += 1
      }
      continue
    }
    if (COMPLETED_STATUSES.has(status)) {
      out.completedCount += 1
      out.completedTotal += total
      out.completedCash += Number(r.payment_cash) || 0
    } else if (PENDING_STATUSES.has(status)) {
      out.pendingCount += 1
    }
  }
  return out
}

/** DB store_code → 요청 매장 코드 1개. 정확 일치 우선, 없으면 별칭(CM 접두 등) 첫 매칭. */
export function matchRequestedStoreCodeForTodaySales(
  dbStoreCode: unknown,
  storeCodes: string[]
): string | null {
  const raw = String(dbStoreCode ?? '').trim()
  if (!raw || storeCodes.length === 0) return null
  const exact = storeCodes.find(
    (code) => code.localeCompare(raw, undefined, { sensitivity: 'accent' }) === 0
  )
  if (exact) return exact
  return storeCodes.find((code) => rowMatchesSalesStoreSelection(raw, code)) ?? null
}

/**
 * 요청한 매장 코드별로 당일 요약을 채운다. 한 주문은 한 코드에만 들어가 이중 집계를 막는다.
 */
export function groupPosTodaySalesByStoreCodes(
  rows: PosTodaySalesRow[],
  storeCodes: string[]
): Record<string, PosTodaySalesSummary> {
  const buckets = new Map<string, PosTodaySalesRow[]>()
  for (const code of storeCodes) {
    buckets.set(code, [])
  }
  for (const row of rows) {
    const key = matchRequestedStoreCodeForTodaySales(row.store_code, storeCodes)
    if (!key) continue
    buckets.get(key)?.push(row)
  }
  const out: Record<string, PosTodaySalesSummary> = {}
  for (const code of storeCodes) {
    out[code] = aggregatePosTodaySalesFromRows(buckets.get(code) ?? [])
  }
  return out
}

/** 요청 매장 목록이 없을 때 DB canonical 키로 묶음 */
export function groupPosTodaySalesByCanonicalStore(
  rows: PosTodaySalesRow[]
): Record<string, PosTodaySalesSummary> {
  const buckets = new Map<string, PosTodaySalesRow[]>()
  for (const row of rows) {
    const raw = String(row.store_code ?? '').trim() || '(미지정)'
    const key = canonicalSalesStoreRowKey(raw)
    const list = buckets.get(key)
    if (list) list.push(row)
    else buckets.set(key, [row])
  }
  const out: Record<string, PosTodaySalesSummary> = {}
  for (const [key, list] of buckets) {
    out[key] = aggregatePosTodaySalesFromRows(list)
  }
  return out
}
