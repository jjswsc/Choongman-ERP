import { supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  normalizeReceivableStoreKey,
  pickReceivableDisplayStoreName,
  receivableStoreGroupKey,
} from '@/lib/receivable-store-key'

const RECEIVABLE_LEDGER_SELECT =
  'id,store_name,amount,ref_type,ref_id,trans_date,memo,invoice_no,created_at,receive_checked,bank_transaction_id'

export type ReceivableTransactionRow = {
  id?: number
  store_name?: string
  amount?: number
  ref_type?: string
  ref_id?: number
  trans_date?: string
  memo?: string
  invoice_no?: string
  created_at?: string
  receive_checked?: boolean
  bank_transaction_id?: number | null
}

export type ReceivableVendorEntry = { code: string; name: string }
export type ReceivableVendorMaps = {
  storeToVendor: Map<string, ReceivableVendorEntry>
  vendorCodeToStores: Map<string, Set<string>>
}

export type ReceivableAttributionMaps = {
  /** 통장 수령(Receive) → 같은 일자·금액 매출 발생 store_name */
  accrualStoreByDateAmount: Map<string, string>
}

function isAllFilterToken(v: string): boolean {
  const n = normalizeReceivableStoreKey(v)
  return !n || n === 'all'
}

function normalizeVendorCode(v: string): string {
  return String(v || '').trim().toLowerCase()
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function dateAmountKey(transDate: string, amountAbs: number): string {
  const dt = String(transDate || '').trim().slice(0, 10)
  return `${dt}|${roundMoney(Math.abs(amountAbs))}`
}

function isReceivableAccrualRefType(refType: string | undefined): boolean {
  const t = String(refType || '')
  return t === 'Order' || t === 'AccountingPO' || t === 'ForceOutbound' || t === 'Opening'
}

function isReceiveRow(r: ReceivableTransactionRow): boolean {
  if (String(r.ref_type || '') === 'Receive') return true
  if (r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0) {
    return Number(r.amount ?? 0) < 0
  }
  return false
}

function addVendorStoreAlias(
  storeToVendor: Map<string, ReceivableVendorEntry>,
  vendorCodeToStores: Map<string, Set<string>>,
  aliasRaw: string,
  entry: ReceivableVendorEntry
): void {
  const alias = normalizeReceivableStoreKey(aliasRaw)
  if (!alias) return
  storeToVendor.set(alias, entry)
  const byCode = vendorCodeToStores.get(entry.code) || new Set<string>()
  byCode.add(alias)
  vendorCodeToStores.set(entry.code, byCode)
}

export async function getReceivableVendorMaps(): Promise<ReceivableVendorMaps> {
  const vendors = (await supabaseSelect('vendors', {
    select: 'code,name,gps_name,sales_outlet',
    limit: 10000,
  })) as { code?: string; name?: string; gps_name?: string; sales_outlet?: string }[] | null
  const storeToVendor = new Map<string, ReceivableVendorEntry>()
  const vendorCodeToStores = new Map<string, Set<string>>()
  for (const v of vendors || []) {
    const code = String(v.code || '').trim().toLowerCase()
    const name = String(v.name || '').trim() || String(v.code || '').trim()
    const gpsName = String(v.gps_name || '').trim()
    const salesOutlet = String(v.sales_outlet || '').trim()
    if (!code) continue
    const entry = { code, name }
    if (salesOutlet) addVendorStoreAlias(storeToVendor, vendorCodeToStores, salesOutlet, entry)
    if (gpsName) addVendorStoreAlias(storeToVendor, vendorCodeToStores, gpsName, entry)
    if (name) addVendorStoreAlias(storeToVendor, vendorCodeToStores, name, entry)
    if (salesOutlet && salesOutlet.startsWith('CM ')) {
      addVendorStoreAlias(storeToVendor, vendorCodeToStores, salesOutlet.slice(3).trim(), entry)
    }
    if (salesOutlet && !salesOutlet.startsWith('CM ')) {
      addVendorStoreAlias(storeToVendor, vendorCodeToStores, `CM ${salesOutlet}`, entry)
    }
    if (gpsName && gpsName.startsWith('CM ')) {
      addVendorStoreAlias(storeToVendor, vendorCodeToStores, gpsName.slice(3).trim(), entry)
    }
    if (gpsName && !gpsName.startsWith('CM ')) {
      addVendorStoreAlias(storeToVendor, vendorCodeToStores, `CM ${gpsName}`, entry)
    }
  }
  return { storeToVendor, vendorCodeToStores }
}

export function buildReceivableAccrualStoreIndex(rows: ReceivableTransactionRow[]): ReceivableAttributionMaps {
  const accrualStoreByDateAmount = new Map<string, string>()
  for (const r of rows || []) {
    if (!isReceivableAccrualRefType(r.ref_type)) continue
    const amount = Number(r.amount ?? 0)
    if (amount <= 0) continue
    const store = String(r.store_name || '').trim()
    const dt = String(r.trans_date || '').trim().slice(0, 10)
    if (!store || dt.length !== 10) continue
    accrualStoreByDateAmount.set(dateAmountKey(dt, amount), store)
  }
  return { accrualStoreByDateAmount }
}

/** 미수금 행의 필터·집계용 store_name (통장 수령은 매출 발생 매장 우선) */
export function resolveReceivableAttributedStore(
  r: ReceivableTransactionRow,
  maps: ReceivableAttributionMaps
): string {
  const direct = String(r.store_name || '').trim()
  if (!isReceiveRow(r)) return direct
  const dt = String(r.trans_date || '').trim().slice(0, 10)
  const amountAbs = Math.abs(Number(r.amount ?? 0))
  if (dt.length === 10 && amountAbs > 0) {
    const matched = maps.accrualStoreByDateAmount.get(dateAmountKey(dt, amountAbs))
    if (matched) return matched
  }
  return direct
}

export function matchesReceivableStoreNorm(storeName: string | null | undefined, storeFilter: string): boolean {
  const filterNorm = normalizeReceivableStoreKey(storeFilter)
  if (isAllFilterToken(filterNorm)) return true
  const storeNorm = normalizeReceivableStoreKey(storeName || '')
  if (!storeNorm) return false
  return storeNorm === filterNorm
}

/** 매출처(거래처 code) 필터 — vendors.sales_outlet/gps_name 등에 연결된 store_name만 */
export function matchesReceivableStoreByVendorLink(
  storeName: string | null | undefined,
  vendorCodeFilter: string,
  maps: ReceivableVendorMaps
): boolean {
  const vendorCode = normalizeVendorCode(vendorCodeFilter)
  if (isAllFilterToken(vendorCode)) return true
  const storeNorm = normalizeReceivableStoreKey(storeName || '')
  if (!storeNorm) return false
  const aliasesByCode = maps.vendorCodeToStores.get(vendorCode)
  if (!aliasesByCode || aliasesByCode.size === 0) return false
  return aliasesByCode.has(storeNorm)
}

export function filterReceivableRows(
  rows: ReceivableTransactionRow[],
  params: {
    storeFilter?: string
    vendorMaps: ReceivableVendorMaps
    attributionMaps: ReceivableAttributionMaps
    filterByVendorLink: boolean
  }
): ReceivableTransactionRow[] {
  const { storeFilter, vendorMaps, attributionMaps, filterByVendorLink } = params
  if (!storeFilter?.trim() || isAllFilterToken(storeFilter)) return rows
  return rows.filter((r) => {
    const resolvedStore = resolveReceivableAttributedStore(r, attributionMaps)
    return filterByVendorLink
      ? matchesReceivableStoreByVendorLink(resolvedStore, storeFilter, vendorMaps)
      : matchesReceivableStoreNorm(resolvedStore, storeFilter)
  })
}

export async function loadReceivableTransactionsToEnd(endStr: string): Promise<ReceivableTransactionRow[]> {
  const filter = endStr ? `trans_date=lte.${endStr}` : 'id=gt.0'
  return (await supabaseSelectFilterAllPages('receivable_transactions', filter, {
    select: RECEIVABLE_LEDGER_SELECT,
    pageSize: 8000,
    maxRows: 2_000_000,
  })) as ReceivableTransactionRow[]
}

export function receivableRowsOnOrAfterStart(
  rows: ReceivableTransactionRow[],
  startStr: string | undefined
): ReceivableTransactionRow[] {
  if (!startStr) return rows
  return rows.filter((r) => String(r.trans_date || '').slice(0, 10) >= startStr)
}

export function cumulativeBalanceByStoreGroup(
  rows: ReceivableTransactionRow[],
  attributionMaps: ReceivableAttributionMaps
): Record<string, number> {
  const byGroup: Record<string, number> = {}
  for (const r of rows) {
    const sn = resolveReceivableAttributedStore(r, attributionMaps)
    if (!sn) continue
    const groupKey = receivableStoreGroupKey(sn)
    byGroup[groupKey] = (byGroup[groupKey] || 0) + Number(r.amount ?? 0)
  }
  return byGroup
}

export function groupReceivableRowsByStore(
  rows: ReceivableTransactionRow[],
  vendorMaps: ReceivableVendorMaps,
  attributionMaps: ReceivableAttributionMaps,
  cumulativeByStoreGroup: Record<string, number>
): {
  storeName: string
  vendorCode?: string
  vendorName?: string
  balance: number
  cumulativeBalance: number
  items: ReceivableTransactionRow[]
}[] {
  const byStore: Record<string, { displayName: string; total: number; items: ReceivableTransactionRow[] }> = {}
  for (const r of rows) {
    const sn = resolveReceivableAttributedStore(r, attributionMaps)
    if (!sn) continue
    const groupKey = receivableStoreGroupKey(sn)
    if (!byStore[groupKey]) byStore[groupKey] = { displayName: sn, total: 0, items: [] }
    byStore[groupKey].displayName = pickReceivableDisplayStoreName(byStore[groupKey].displayName, sn)
    byStore[groupKey].items.push(r)
    byStore[groupKey].total += Number(r.amount ?? 0)
  }
  return Object.entries(byStore).map(([groupKey, v]) => {
    const storeName = v.displayName
    const vendor = vendorMaps.storeToVendor.get(normalizeReceivableStoreKey(storeName))
    return {
      storeName,
      vendorCode: vendor?.code,
      vendorName: vendor?.name,
      balance: v.total,
      cumulativeBalance: cumulativeByStoreGroup[groupKey] ?? v.total,
      items: v.items.sort((a, b) => String(b.trans_date || '').localeCompare(String(a.trans_date || ''))),
    }
  })
}

export function mergeReceivableSummaryRows(
  rows: { store_name?: string; balance?: number; item_count?: number }[]
): { storeName: string; balance: number; count: number }[] {
  const merged = new Map<string, { storeName: string; balance: number; count: number }>()
  for (const r of rows || []) {
    const storeName = String(r.store_name ?? '').trim()
    if (!storeName) continue
    const groupKey = receivableStoreGroupKey(storeName)
    const prev = merged.get(groupKey)
    const balance = Number(r.balance ?? 0)
    const count = Number(r.item_count ?? 0)
    if (prev) {
      prev.storeName = pickReceivableDisplayStoreName(prev.storeName, storeName)
      prev.balance += balance
      prev.count += count
    } else {
      merged.set(groupKey, { storeName, balance, count })
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.balance - a.balance)
}

export async function scopeReceivableLedger(params: {
  endStr: string
  startStr?: string
  storeFilter?: string
  filterByVendorLink: boolean
}): Promise<{
  vendorMaps: ReceivableVendorMaps
  attributionMaps: ReceivableAttributionMaps
  scopedRows: ReceivableTransactionRow[]
  periodRows: ReceivableTransactionRow[]
  cumulativeByStoreGroup: Record<string, number>
}> {
  const ledgerRows = await loadReceivableTransactionsToEnd(params.endStr)
  const vendorMaps = await getReceivableVendorMaps()
  const attributionMaps = buildReceivableAccrualStoreIndex(ledgerRows)
  const scopedRows = filterReceivableRows(ledgerRows, {
    storeFilter: params.storeFilter,
    vendorMaps,
    attributionMaps,
    filterByVendorLink: params.filterByVendorLink,
  })
  const periodRows = receivableRowsOnOrAfterStart(scopedRows, params.startStr)
  const cumulativeByStoreGroup = cumulativeBalanceByStoreGroup(scopedRows, attributionMaps)
  return { vendorMaps, attributionMaps, scopedRows, periodRows, cumulativeByStoreGroup }
}
