import type { PettyCashItem } from '@/lib/api-client'
import { getBangkokMonthRange, getBangkokTodayDateString } from '@/lib/bangkok-time'

export type PettyInvoiceFilter = '' | 'all' | 'received' | 'pending'

export type PettyPeriodPreset = 'today' | 'thisMonth' | 'taxMonth' | 'custom'

export type PettyAdminViewMode = 'detail' | 'by_day' | 'by_account'

export type PettyCashClientFilterOpts = {
  filterAccountSubjectEmpty?: boolean
  filterAccountSubjectId?: string
  filterPettyTransType?: string
  filterMemoKeyword?: string
  filterInvoiceStatus?: PettyInvoiceFilter
  /** PP30 매입 VAT 대상: 지출 + VAT 금액 > 0 */
  filterPp30VatOnly?: boolean
  /** 손익 매입 드릴다운 — 매출원가(cost) 계정만 */
  filterPlCostPurchaseOnly?: boolean
  filterPlCostSubjectIds?: ReadonlySet<number>
  /** 손익 __pl_petty_cash__ — vendor_code 없는 행만 */
  filterPettyNoVendor?: boolean
}

export type PettyCashPeriodSummary = {
  expenseTotal: number
  inflowTotal: number
  netChange: number
  vatTotal: number
  vatPendingTotal: number
  vatPendingCount: number
  rowCount: number
}

export function applyPettyCashClientFilters(
  rows: PettyCashItem[],
  opts: PettyCashClientFilterOpts
): PettyCashItem[] {
  const memoNeedle = String(opts.filterMemoKeyword || '').trim().toLowerCase()
  const invoiceFilter = opts.filterInvoiceStatus || ''

  return (rows || []).filter((r) => {
    const sid = r.accountSubjectId ?? r.account_subject_id
    if (opts.filterAccountSubjectEmpty && sid != null && sid !== 0) return false
    if (opts.filterAccountSubjectId && String(sid ?? 0) !== opts.filterAccountSubjectId) return false

    if (opts.filterPettyTransType) {
      const ty = String(r.trans_type ?? '').toLowerCase()
      if (ty !== opts.filterPettyTransType.toLowerCase()) return false
    }

    if (opts.filterPlCostPurchaseOnly) {
      const sid = r.accountSubjectId ?? r.account_subject_id
      const n = sid != null ? Number(sid) : NaN
      if (!Number.isFinite(n) || !opts.filterPlCostSubjectIds?.has(n)) return false
    }

    if (opts.filterPettyNoVendor) {
      const vc = String((r as { vendor_code?: string | null }).vendor_code ?? '').trim()
      if (vc) return false
    }

    if (memoNeedle) {
      const hay = `${r.memo || ''} ${r.user_name || ''}`.toLowerCase()
      if (!hay.includes(memoNeedle)) return false
    }

    if (invoiceFilter && invoiceFilter !== 'all') {
      if (String(r.trans_type || '').toLowerCase() !== 'expense') return false
      const received = Boolean(r.invoiceReceived)
      if (invoiceFilter === 'received' && !received) return false
      if (invoiceFilter === 'pending' && received) return false
    }

    if (opts.filterPp30VatOnly) {
      if (String(r.trans_type || '').toLowerCase() !== 'expense') return false
      const vat = Math.max(0, Number(r.vatAmount ?? 0) || 0)
      if (vat <= 0) return false
    }

    return true
  })
}

/** 방콕 기준 기간 프리셋 → startStr/endStr (과세월 = 당월 1일~말일) */
export function resolvePettyPeriodPresetRange(
  preset: PettyPeriodPreset,
  base: Date = new Date()
): { startStr: string; endStr: string; yearMonth: string } {
  const today = getBangkokTodayDateString(base)
  const monthRange = getBangkokMonthRange(undefined, base)
  if (preset === 'today') {
    return { startStr: today, endStr: today, yearMonth: monthRange.yearMonth }
  }
  if (preset === 'thisMonth') {
    return { startStr: monthRange.startStr, endStr: today, yearMonth: monthRange.yearMonth }
  }
  if (preset === 'taxMonth') {
    return {
      startStr: monthRange.startStr,
      endStr: monthRange.endStr,
      yearMonth: monthRange.yearMonth,
    }
  }
  return { startStr: today, endStr: today, yearMonth: monthRange.yearMonth }
}

export type PettyCashDayAggregate = {
  date: string
  expenseTotal: number
  inflowTotal: number
  netChange: number
  vatTotal: number
  vatPendingTotal: number
  rowCount: number
}

export type PettyCashAccountAggregate = {
  accountSubjectId: number | null
  accountLabel: string
  expenseTotal: number
  vatTotal: number
  vatPendingTotal: number
  rowCount: number
}

export function aggregatePettyCashByDay(rows: PettyCashItem[]): PettyCashDayAggregate[] {
  const map = new Map<string, PettyCashDayAggregate>()
  for (const r of rows || []) {
    const date = String(r.trans_date || '').slice(0, 10)
    if (!date) continue
    let agg = map.get(date)
    if (!agg) {
      agg = {
        date,
        expenseTotal: 0,
        inflowTotal: 0,
        netChange: 0,
        vatTotal: 0,
        vatPendingTotal: 0,
        rowCount: 0,
      }
      map.set(date, agg)
    }
    const a = Number(r.amount) || 0
    agg.netChange += a
    agg.rowCount += 1
    const ty = String(r.trans_type || '').toLowerCase()
    if (ty === 'expense') {
      agg.expenseTotal += Math.abs(a)
      const vat = Math.max(0, Number(r.vatAmount ?? 0) || 0)
      if (vat > 0) {
        agg.vatTotal += vat
        if (!r.invoiceReceived) agg.vatPendingTotal += vat
      }
    } else if (ty === 'receive' || ty === 'replenish') {
      agg.inflowTotal += Math.abs(a)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export function aggregatePettyCashByAccount(
  rows: PettyCashItem[],
  labelForId?: (id: number | null) => string
): PettyCashAccountAggregate[] {
  const map = new Map<string, PettyCashAccountAggregate>()
  for (const r of rows || []) {
    if (String(r.trans_type || '').toLowerCase() !== 'expense') continue
    const sid = r.accountSubjectId ?? r.account_subject_id ?? null
    const key = sid != null && sid !== 0 ? String(sid) : '__none__'
    let agg = map.get(key)
    if (!agg) {
      agg = {
        accountSubjectId: sid != null && sid !== 0 ? Number(sid) : null,
        accountLabel: labelForId ? labelForId(sid != null && sid !== 0 ? Number(sid) : null) : key,
        expenseTotal: 0,
        vatTotal: 0,
        vatPendingTotal: 0,
        rowCount: 0,
      }
      map.set(key, agg)
    }
    const a = Math.abs(Number(r.amount) || 0)
    agg.expenseTotal += a
    agg.rowCount += 1
    const vat = Math.max(0, Number(r.vatAmount ?? 0) || 0)
    if (vat > 0) {
      agg.vatTotal += vat
      if (!r.invoiceReceived) agg.vatPendingTotal += vat
    }
  }
  return Array.from(map.values()).sort((a, b) => b.expenseTotal - a.expenseTotal)
}

export function computePettyCashPeriodSummary(rows: PettyCashItem[]): PettyCashPeriodSummary {
  let expenseTotal = 0
  let inflowTotal = 0
  let netChange = 0
  let vatTotal = 0
  let vatPendingTotal = 0
  let vatPendingCount = 0

  for (const r of rows || []) {
    const a = Number(r.amount) || 0
    netChange += a
    const ty = String(r.trans_type || '').toLowerCase()
    if (ty === 'expense') {
      expenseTotal += Math.abs(a)
      const vat = Math.max(0, Number(r.vatAmount ?? 0) || 0)
      if (vat > 0) {
        vatTotal += vat
        if (!r.invoiceReceived) {
          vatPendingTotal += vat
          vatPendingCount += 1
        }
      }
    } else if (ty === 'receive' || ty === 'replenish') {
      inflowTotal += Math.abs(a)
    }
  }

  return {
    expenseTotal,
    inflowTotal,
    netChange,
    vatTotal,
    vatPendingTotal,
    vatPendingCount,
    rowCount: (rows || []).length,
  }
}
