import 'server-only'

import { supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  listUnallocatedBankReceives,
  sumUnallocatedBankReceiveByStoreGroup,
  type UnallocatedBankReceiveItem,
} from '@/lib/receivable-unallocated-bank'
import {
  buildReceivableAccrualStoreIndex,
  buildReceivableVendorMapsFromRows,
  cumulativeBalanceByStoreGroup,
  filterReceivableRows,
  groupReceivableRowsByStore,
  mergeReceivableSummaryRows,
  receivableRowsOnOrAfterStart,
  resolveReceivableAttributedStore,
  RECEIVABLE_LEDGER_SELECT,
  type ReceivableAttributionMaps,
  type ReceivableTransactionRow,
  type ReceivableVendorMaps,
} from '@/lib/receivable-ledger-pure'
import { normalizeReceivableStoreKey, pickReceivableDisplayStoreName, receivableStoreGroupKey } from '@/lib/receivable-store-key'
import { rowMatchesInvoiceFilter } from '@/lib/receivable-payable-invoice-filter'

export {
  buildReceivableAccrualStoreIndex,
  cumulativeBalanceByStoreGroup,
  filterReceivableRows,
  groupReceivableRowsByStore,
  matchesReceivableStoreByVendorLink,
  matchesReceivableStoreNorm,
  mergeReceivableSummaryRows,
  receivableRowsOnOrAfterStart,
  resolveReceivableAttributedStore,
  RECEIVABLE_LEDGER_SELECT,
  type ReceivableAttributionMaps,
  type ReceivableTransactionRow,
  type ReceivableVendorEntry,
  type ReceivableVendorMaps,
} from '@/lib/receivable-ledger-pure'

export async function getReceivableVendorMaps(): Promise<ReceivableVendorMaps> {
  const vendors = (await supabaseSelect('vendors', {
    select: 'code,name,gps_name,sales_outlet',
    limit: 10000,
  })) as { code?: string; name?: string; gps_name?: string; sales_outlet?: string }[] | null
  return buildReceivableVendorMapsFromRows(vendors || [])
}

export async function loadReceivableTransactionsToEnd(endStr: string): Promise<ReceivableTransactionRow[]> {
  const filter = endStr ? `trans_date=lte.${endStr}` : 'id=gt.0'
  return (await supabaseSelectFilterAllPages('receivable_transactions', filter, {
    select: RECEIVABLE_LEDGER_SELECT,
    pageSize: 8000,
    maxRows: 2_000_000,
  })) as ReceivableTransactionRow[]
}

function storeDisplayNamesByGroupKey(
  rows: ReceivableTransactionRow[],
  attributionMaps: ReceivableAttributionMaps
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const sn = resolveReceivableAttributedStore(r, attributionMaps)
    if (!sn) continue
    const groupKey = receivableStoreGroupKey(sn)
    out[groupKey] = pickReceivableDisplayStoreName(out[groupKey] || '', sn)
  }
  return out
}

const LEDGER_BALANCE_EPS = 0.01

/** 누적 잔액 있는 모든 출고처 + 기간 내 거래처 (기간만 있고 누적 0 포함) */
export function buildReceivableListWithCumulative(params: {
  periodRows: ReceivableTransactionRow[]
  scopedRows: ReceivableTransactionRow[]
  vendorMaps: ReceivableVendorMaps
  attributionMaps: ReceivableAttributionMaps
  cumulativeByStoreGroup: Record<string, number>
}): {
  storeName: string
  vendorCode?: string
  vendorName?: string
  balance: number
  cumulativeBalance: number
  unallocatedBankReceiveTotal: number
  unallocatedBankDeposits: UnallocatedBankReceiveItem[]
  items: ReceivableTransactionRow[]
}[] {
  const { periodRows, scopedRows, vendorMaps, attributionMaps, cumulativeByStoreGroup } = params
  const unallocatedByGroup = sumUnallocatedBankReceiveByStoreGroup(scopedRows, attributionMaps)
  const periodGrouped = groupReceivableRowsByStore(
    periodRows,
    vendorMaps,
    attributionMaps,
    cumulativeByStoreGroup
  )
  const periodByKey = new Map(periodGrouped.map((g) => [g.groupKey ?? receivableStoreGroupKey(g.storeName), g]))
  const displayNames = storeDisplayNamesByGroupKey(scopedRows, attributionMaps)
  const groupKeys = new Set<string>([
    ...Object.keys(cumulativeByStoreGroup).filter(
      (gk) => Math.abs(cumulativeByStoreGroup[gk] ?? 0) > LEDGER_BALANCE_EPS
    ),
    ...periodByKey.keys(),
  ])
  return Array.from(groupKeys)
    .map((groupKey) => {
      const period = periodByKey.get(groupKey)
      const storeName = period?.storeName || displayNames[groupKey] || groupKey
      const vendor = vendorMaps.storeToVendor.get(normalizeReceivableStoreKey(storeName))
      return {
        storeName,
        vendorCode: period?.vendorCode ?? vendor?.code,
        vendorName: period?.vendorName ?? vendor?.name,
        balance: period?.balance ?? 0,
        cumulativeBalance: cumulativeByStoreGroup[groupKey] ?? 0,
        unallocatedBankReceiveTotal: unallocatedByGroup[groupKey] ?? 0,
        unallocatedBankDeposits: listUnallocatedBankReceives(scopedRows, attributionMaps, groupKey),
        items: period?.items ?? [],
      }
    })
    .sort((a, b) => Math.abs(b.cumulativeBalance) - Math.abs(a.cumulativeBalance))
}

/** 인보이스 번호 검색 — 종료일까지 이력에서 매칭 행을 보여 주고, 기간 합계는 조회 기간 내 매칭만 */
export function buildReceivableListForInvoiceFilter(params: {
  invoiceFilter: string
  scopedRows: ReceivableTransactionRow[]
  periodRows: ReceivableTransactionRow[]
  vendorMaps: ReceivableVendorMaps
  attributionMaps: ReceivableAttributionMaps
  cumulativeByStoreGroup: Record<string, number>
}): {
  storeName: string
  vendorCode?: string
  vendorName?: string
  balance: number
  cumulativeBalance: number
  unallocatedBankReceiveTotal: number
  unallocatedBankDeposits: UnallocatedBankReceiveItem[]
  items: ReceivableTransactionRow[]
}[] {
  const q = String(params.invoiceFilter || '').trim()
  if (!q) return []

  const matches = (r: ReceivableTransactionRow) => rowMatchesInvoiceFilter(r, q)
  const matchedScoped = params.scopedRows.filter(matches)
  if (matchedScoped.length === 0) return []

  const matchedPeriod = params.periodRows.filter(matches)
  const periodGrouped = groupReceivableRowsByStore(
    matchedPeriod,
    params.vendorMaps,
    params.attributionMaps,
    params.cumulativeByStoreGroup
  )
  const periodByKey = new Map(periodGrouped.map((g) => [g.groupKey, g]))
  const scopedGrouped = groupReceivableRowsByStore(
    matchedScoped,
    params.vendorMaps,
    params.attributionMaps,
    params.cumulativeByStoreGroup
  )
  const unallocatedByGroup = sumUnallocatedBankReceiveByStoreGroup(params.scopedRows, params.attributionMaps)

  return scopedGrouped
    .map((g) => ({
      storeName: g.storeName,
      vendorCode: g.vendorCode,
      vendorName: g.vendorName,
      balance: periodByKey.get(g.groupKey)?.balance ?? 0,
      cumulativeBalance: g.cumulativeBalance,
      unallocatedBankReceiveTotal: unallocatedByGroup[g.groupKey] ?? 0,
      unallocatedBankDeposits: listUnallocatedBankReceives(params.scopedRows, params.attributionMaps, g.groupKey),
      items: g.items,
    }))
    .sort((a, b) => Math.abs(b.cumulativeBalance) - Math.abs(a.cumulativeBalance))
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
