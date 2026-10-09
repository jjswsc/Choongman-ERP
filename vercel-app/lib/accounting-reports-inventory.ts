import {
  loadHqOutboundProcessedLines,
  resolveHqOutboundSalesCustomerFilter,
} from '@/lib/hq-outbound-income-total'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { supabaseRpc, supabaseSelectAllPages, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  resolveInventoryAsOfUtcIso,
  resolveStockValuationUnitCost,
} from '@/lib/accounting-inventory-asof'
import { appendInventoryTenantFilter } from '@/lib/inventory-tenant-scope'
import { fetchStockLogsItemQtySum } from '@/lib/stock-logs-active-filter'
import {
  accumulateNetByItemTax,
  sumInventoryQtyCostBuckets,
  emptyNetVatBuckets,
  netTotalFromBuckets,
  type ItemTaxType,
  type NetVatBuckets,
} from '@/lib/income-statement-item-vat'
import { INBOUND_HQ_LOCATION, getStockLocationPatterns } from '@/lib/stock-location-patterns'
import type { AccountSubjectMetaRow } from '@/lib/accounting-reports-expense-routing'
import {
  ACCOUNTING_ROWS_MAX,
  type IncomeStatementLineDetail,
  isHqAccountingStoreRow,
  round2,
} from '@/lib/accounting-reports-shared'

function isExcludedHqStockLocation(location: string): boolean {
  const n = String(location || '').trim().toLowerCase()
  if (!n) return true
  if (n === INBOUND_HQ_LOCATION.toLowerCase()) return true
  return isHqAccountingStoreRow(location)
}

async function resolveInventoryLocationPatterns(
  locationFilter: string | null,
  excludeHq: boolean,
  tenantId?: string
): Promise<string[]> {
  if (locationFilter) return getStockLocationPatterns(locationFilter)
  if (!excludeHq) return []
  try {
    const rows = (await supabaseRpc<{ location: string }[]>('get_distinct_stock_locations', {
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    })) as
      | { location?: string }[]
      | null
    const patterns = (rows || [])
      .map((r) => String(r.location || '').trim())
      .filter((loc) => loc && !isExcludedHqStockLocation(loc))
    // 빈 패턴이면 RPC/fallback이 전 location을 읽어버리는 것을 방지
    return patterns.length > 0 ? patterns : ['__pl_no_store_locations__']
  } catch {
    return ['__pl_no_store_locations__']
  }
}

/** get_store_stock RPC 우선, 미배포 시 getAppData와 동일한 select fallback */
async function fetchStoreStockQtyByItem(
  locationPatterns: string[],
  asOfUtcIso: string,
  tenantId?: string
): Promise<Record<string, number>> {
  if (locationPatterns.length === 0) return {}
  try {
    const rows = (await supabaseRpc<{ item_code: string; total_qty: number }[]>('get_store_stock', {
      p_location_patterns: locationPatterns,
      p_as_of_date: asOfUtcIso,
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    })) as { item_code?: string; total_qty?: number }[] | null

    const m: Record<string, number> = {}
    for (const r of rows || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      m[code] = Number(r.total_qty ?? 0)
    }
    return m
  } catch {
    let locFilter = 'id=gt.0'
    if (locationPatterns.length === 1) {
      locFilter = `location=ilike.${encodeURIComponent(locationPatterns[0])}`
    } else if (locationPatterns.length > 1) {
      locFilter = `or=(${locationPatterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
    }
    const dateSuffix = `&log_date=lte.${encodeURIComponent(asOfUtcIso)}`
    const tenantScope = { enforce: Boolean(tenantId), tenantId: tenantId || '' }
    return await fetchStockLogsItemQtySum(
      appendInventoryTenantFilter(`${locFilter}${dateSuffix}`, tenantScope),
      { pageSize: 8000, maxRows: ACCOUNTING_ROWS_MAX }
    )
  }
}

export async function loadItemValuationUnitCostMap(): Promise<Record<string, number>> {
  const rows = (await supabaseSelectAllPages('items', {
    order: 'id.asc',
    pageSize: 8000,
    maxRows: ACCOUNTING_ROWS_MAX,
    select: 'code,cost,price',
  })) as
    | { code?: string; cost?: number | null; price?: number | null }[]
    | null
  const out: Record<string, number> = {}
  for (const r of rows || []) {
    const code = String(r.code || '').trim()
    if (!code) continue
    out[code] = resolveStockValuationUnitCost(r.cost, r.price)
  }
  return out
}

/** 재고 금액 — 재고 현황(getAppData·stock-table)과 동일: 전 품목 × (cost ?? price) */
export async function getInventoryValue(
  locationFilter: string | null,
  cutoffDate: string,
  isBefore: boolean,
  itemUnitCostMap: Record<string, number>,
  excludeHq = false
): Promise<number> {
  const buckets = await getInventoryVatBuckets(
    locationFilter,
    cutoffDate,
    isBefore,
    itemUnitCostMap,
    new Map<string, ItemTaxType>(),
    excludeHq
  )
  return netTotalFromBuckets(buckets)
}

export async function getInventoryVatBuckets(
  locationFilter: string | null,
  cutoffDate: string,
  isBefore: boolean,
  itemUnitCostMap: Record<string, number>,
  itemTaxMap: Map<string, ItemTaxType>,
  excludeHq = false,
  tenantId?: string
): Promise<NetVatBuckets> {
  const asOfUtcIso = resolveInventoryAsOfUtcIso(cutoffDate, isBefore)
  const locationPatterns = await resolveInventoryLocationPatterns(locationFilter, excludeHq, tenantId)
  const byItem = await fetchStoreStockQtyByItem(locationPatterns, asOfUtcIso, tenantId)
  return sumInventoryQtyCostBuckets(byItem, itemUnitCostMap, itemTaxMap)
}

export async function getHqOutboundSalesVatBuckets(
  storeFilter: string,
  startStr: string,
  endStr: string,
  itemTaxMap: Map<string, ItemTaxType>
): Promise<NetVatBuckets> {
  const customerFilter = resolveHqOutboundSalesCustomerFilter(storeFilter)
  const { lines } = await loadHqOutboundProcessedLines({
    startStr,
    endStr,
    storeFilter: customerFilter,
  })
  const buckets = emptyNetVatBuckets()
  for (const line of lines) {
    const store = String(line.targetStore || '').trim()
    if (!store || isHeadOfficeLikeStoreName(store)) continue
    accumulateNetByItemTax(buckets, line.itemCode, line.lineAmount, itemTaxMap)
  }
  return buckets
}

export async function getHqOutboundPurchaseVatBuckets(
  storeFilter: string | null,
  startStr: string,
  endStr: string,
  itemTaxMap: Map<string, ItemTaxType>
): Promise<NetVatBuckets> {
  const { lines } = await loadHqOutboundProcessedLines({
    startStr,
    endStr,
    storeFilter,
  })
  const buckets = emptyNetVatBuckets()
  for (const line of lines) {
    const target = String(line.targetStore || '').trim()
    if (isHeadOfficeLikeStoreName(target)) continue
    if (storeFilter && storeFilter !== 'All' && target && !storeMatchesIncomeFilter(target, storeFilter)) {
      continue
    }
    accumulateNetByItemTax(buckets, line.itemCode, line.lineAmount, itemTaxMap)
  }
  return buckets
}

export async function sumDepreciationForIncomeStatement(
  yearMonth: string,
  storeFilter: string,
  isHQ: boolean,
  subjectMeta: Map<number, AccountSubjectMetaRow>
): Promise<{ total: number; byAccountSubjectId: Map<number | null, number> }> {
  const byAccountSubjectId = new Map<number | null, number>()
  const empty = { total: 0, byAccountSubjectId }
  try {
    const entries = (await supabaseSelectFilter(
      'depreciation_entries',
      `year_month=eq.${encodeURIComponent(yearMonth)}`,
      { select: 'amount,fixed_asset_id', limit: 5000 }
    )) as { amount?: number; fixed_asset_id?: number }[] | null
    if (!entries?.length) return empty
    const assetIds = [
      ...new Set(entries.map((e) => e.fixed_asset_id).filter((id): id is number => id != null)),
    ]
    if (assetIds.length === 0) return empty
    const assets = (await supabaseSelectFilter(
      'fixed_assets',
      `id=in.(${assetIds.join(',')})`,
      { select: 'id,store_name,depreciation_expense_account_code', limit: 5000 }
    )) as { id?: number; store_name?: string; depreciation_expense_account_code?: string | null }[] | null
    const storeByAsset = new Map<number, string>()
    const expenseCodeByAsset = new Map<number, string>()
    for (const a of assets || []) {
      if (a.id == null) continue
      storeByAsset.set(a.id, String(a.store_name || '').trim())
      expenseCodeByAsset.set(a.id, String(a.depreciation_expense_account_code || '5500').trim() || '5500')
    }
    const codeToSubjectId = new Map<string, number>()
    for (const [id, meta] of subjectMeta) {
      const code = String(meta.code || '').trim()
      if (code) codeToSubjectId.set(code, id)
    }
    let sum = 0
    for (const e of entries) {
      const aid = e.fixed_asset_id
      if (aid == null) continue
      const st = storeByAsset.get(aid) || ''
      if (isHQ) {
        if (st && !isHqAccountingStoreRow(st)) continue
      } else if (storeFilter !== 'All') {
        if (st && !storeMatchesIncomeFilter(st, storeFilter)) continue
      }
      const amt = Math.abs(Number(e.amount) || 0)
      if (!amt) continue
      sum += amt
      const code = expenseCodeByAsset.get(aid) || '5500'
      const sid = codeToSubjectId.get(code) ?? null
      byAccountSubjectId.set(sid, (byAccountSubjectId.get(sid) || 0) + amt)
    }
    return { total: round2(sum), byAccountSubjectId }
  } catch {
    return empty
  }
}

export function tagPurchaseVendorBasis(
  rows: IncomeStatementLineDetail[],
  bankVendorKeys: Set<string>
): IncomeStatementLineDetail[] {
  return rows.map((row) => {
    if (row.amountBasis) return row
    if (row.key === '__pl_hq_orders__') {
      return { ...row, amountBasis: 'stock_net' as const }
    }
    if (bankVendorKeys.has(row.key)) {
      return { ...row, amountBasis: 'cash_gross' as const }
    }
    return { ...row, amountBasis: 'stock_net' as const }
  })
}
