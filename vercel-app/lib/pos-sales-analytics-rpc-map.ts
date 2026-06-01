import {
  canonicalSalesStoreRowKey,
  rowMatchesSalesStoreSelection,
} from '@/lib/pos-sales-store-filter'
import type { PosSalesAnalyticsAggRow } from '@/lib/pos-sales-analytics-rpc-server'

type StoreBucket = {
  count: number
  subtotal: number
  vat: number
  discount: number
  service: number
  total: number
  guestSum: number
  dineInOrderCount: number
  dineInTotal: number
  dineInGuestSum: number
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function int(v: unknown): number {
  return Math.max(0, Math.trunc(num(v)))
}

export function mapAnalyticsAggToStoreResults(rows: PosSalesAnalyticsAggRow[]) {
  const byStore: Record<string, StoreBucket> = {}

  for (const r of rows) {
    const rawStore = String(r.bucket_key ?? '').trim()
    if (!rawStore) continue
    const store = canonicalSalesStoreRowKey(rawStore)
    if (!byStore[store]) {
      byStore[store] = {
        count: 0,
        subtotal: 0,
        vat: 0,
        discount: 0,
        service: 0,
        total: 0,
        guestSum: 0,
        dineInOrderCount: 0,
        dineInTotal: 0,
        dineInGuestSum: 0,
      }
    }
    const b = byStore[store]
    b.count += int(r.order_count)
    b.subtotal += num(r.subtotal)
    b.vat += num(r.vat)
    b.discount += num(r.discount)
    b.service += num(r.service_amt)
    b.total += num(r.total)
    b.guestSum += int(r.guest_sum)
    b.dineInOrderCount += int(r.dine_in_order_count)
    b.dineInTotal += num(r.dine_in_total)
    b.dineInGuestSum += int(r.dine_in_guest_sum)
  }

  return Object.entries(byStore)
    .map(([storeName, v]) => ({
      storeName,
      count: v.count,
      subtotal: v.subtotal,
      vat: v.vat,
      discount: v.discount,
      service: v.service,
      total: v.total,
      guestSum: v.guestSum,
      dineInOrderCount: v.dineInOrderCount,
      dineInTotal: v.dineInTotal,
      dineInGuestSum: v.dineInGuestSum,
      salesPerDineInOrder:
        v.dineInOrderCount > 0 ? Math.round((v.dineInTotal / v.dineInOrderCount) * 100) / 100 : 0,
      salesPerGuest:
        v.dineInGuestSum > 0 ? Math.round((v.dineInTotal / v.dineInGuestSum) * 100) / 100 : 0,
      salesPerOrder: v.count > 0 ? Math.round((v.total / v.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

/** period_by_store RPC 키 → canonical store key 시리즈 */
export function canonicalizePeriodSeriesKeys(
  series: Record<string, import('@/lib/pos-sales-period-aggregate').PeriodAggRow[]>,
  selectedStores?: string[]
): Record<string, import('@/lib/pos-sales-period-aggregate').PeriodAggRow[]> {
  const out: Record<string, import('@/lib/pos-sales-period-aggregate').PeriodAggRow[]> = {}
  for (const [rawKey, rows] of Object.entries(series)) {
    const canon = canonicalSalesStoreRowKey(rawKey)
    if (selectedStores?.length) {
      const ok = selectedStores.some((code) => rowMatchesSalesStoreSelection(rawKey, code))
      if (!ok) continue
    }
    if (!out[canon]) out[canon] = rows
    else {
      const merged = new Map<string, import('@/lib/pos-sales-period-aggregate').PeriodAggRow>()
      for (const r of [...out[canon], ...rows]) {
        const prev = merged.get(r.key)
        if (!prev) merged.set(r.key, { ...r })
        else {
          merged.set(r.key, {
            ...prev,
            count: prev.count + r.count,
            subtotal: prev.subtotal + r.subtotal,
            vat: prev.vat + r.vat,
            discount: prev.discount + r.discount,
            service: prev.service + r.service,
            total: prev.total + r.total,
            sales: prev.sales + r.sales,
            guestSum: prev.guestSum + r.guestSum,
            dineInOrderCount: prev.dineInOrderCount + r.dineInOrderCount,
            dineInTotal: prev.dineInTotal + r.dineInTotal,
            dineInGuestSum: prev.dineInGuestSum + r.dineInGuestSum,
            salesPerDineInOrder: 0,
            salesPerGuest: 0,
            salesPerOrder: 0,
          })
        }
      }
      out[canon] = [...merged.values()].map((r) => ({
        ...r,
        salesPerDineInOrder:
          r.dineInOrderCount > 0 ? Math.round((r.dineInTotal / r.dineInOrderCount) * 100) / 100 : 0,
        salesPerGuest:
          r.dineInGuestSum > 0 ? Math.round((r.dineInTotal / r.dineInGuestSum) * 100) / 100 : 0,
        salesPerOrder: r.count > 0 ? Math.round((r.total / r.count) * 100) / 100 : 0,
      }))
    }
  }
  return out
}
