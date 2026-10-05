/**
 * 미수금 보조원장 — 클라이언트·서버 공용 순수 함수 (supabase 없음)
 */
import { isOfficeStoreVariant } from '@/lib/office-store-canonical'
import { normalizeReceivableStoreKey, pickReceivableDisplayStoreName, receivableStoreGroupKey } from '@/lib/receivable-store-key'

export const RECEIVABLE_LEDGER_SELECT =
  'id,store_name,creditor_store,amount,ref_type,ref_id,trans_date,memo,invoice_no,created_at,receive_checked,bank_transaction_id'

export type ReceivableTransactionRow = {
  id?: number
  store_name?: string
  /** 회계 PO 매장 발행 시 청구 주체 매장 — null이면 본사 */
  creditor_store?: string | null
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

export type ReceivableVendorEntry = {
  code: string
  /** 법인명(거래처 자막·매칭용) */
  name: string
  /** 매장/표시용 — sales_outlet → gps_name → name */
  label: string
}
export type ReceivableVendorMaps = {
  storeToVendor: Map<string, ReceivableVendorEntry>
  vendorCodeToStores: Map<string, Set<string>>
}

/** store_name이 거래처 코드만 있을 때 사람이 읽는 이름으로 치환 */
export function resolveReceivableStoreDisplayName(
  raw: string,
  vendorMaps: ReceivableVendorMaps
): string {
  const store = String(raw || '').trim()
  if (!store) return ''
  const vendor =
    vendorMaps.storeToVendor.get(normalizeReceivableStoreKey(store)) ||
    vendorMaps.storeToVendor.get(normalizeVendorCode(store))
  if (!vendor) return store
  const code = String(vendor.code || '').trim()
  const storeIsCode =
    normalizeReceivableStoreKey(store) === normalizeReceivableStoreKey(code) ||
    store.toLowerCase() === code.toLowerCase()
  if (!storeIsCode) return store
  const label = String(vendor.label || vendor.name || '').trim()
  if (!label) return store
  if (normalizeReceivableStoreKey(label) === normalizeReceivableStoreKey(code)) return store
  if (label.toLowerCase() === code.toLowerCase()) return store
  return label
}

export type ReceivableAttributionMaps = {
  /** @deprecated 추측 귀속 제거 — 빈 맵. resolve는 store_name만 사용 */
  accrualStoreByDateAmount: Map<string, string>
}

function isAllFilterToken(v: string): boolean {
  const n = normalizeReceivableStoreKey(v)
  return !n || n === 'all'
}

function normalizeVendorCode(v: string): string {
  return String(v || '').trim().toLowerCase()
}

export function buildReceivableAccrualStoreIndex(_rows: ReceivableTransactionRow[]): ReceivableAttributionMaps {
  return { accrualStoreByDateAmount: new Map() }
}

/** 채권자가 비어 있거나 본사면 본사 장부. 매장 발행 청구는 그 매장 장부. */
export function isHqOwnedReceivable(r: ReceivableTransactionRow): boolean {
  const creditor = String(r.creditor_store ?? '').trim()
  if (!creditor) return true
  return isOfficeStoreVariant(creditor)
}

/** 미수금 행의 필터·집계용 store_name — 행에 기록된 채무자(거래처)만 */
export function resolveReceivableAttributedStore(
  r: ReceivableTransactionRow,
  _maps?: ReceivableAttributionMaps
): string {
  return String(r.store_name || '').trim()
}

export function matchesReceivableStoreNorm(storeName: string | null | undefined, storeFilter: string): boolean {
  const filterNorm = normalizeReceivableStoreKey(storeFilter)
  if (isAllFilterToken(filterNorm)) return true
  const storeNorm = normalizeReceivableStoreKey(storeName || '')
  if (!storeNorm) return false
  return storeNorm === filterNorm
}

/**
 * 매장 매니저 미수금 조회: 본사→자기매장 청구(채무) + 자기매장→타매장 청구(채권) 모두 포함.
 */
export function receivableRowVisibleToStoreManager(
  r: ReceivableTransactionRow,
  userStore: string
): boolean {
  const scope = String(userStore || '').trim()
  if (!scope) return false
  const creditor = String(r.creditor_store ?? '').trim()
  const debtor = String(r.store_name ?? '').trim()
  if (creditor && matchesReceivableStoreNorm(creditor, scope)) return true
  if (!creditor && matchesReceivableStoreNorm(debtor, scope)) return true
  return false
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

function matchesReceivableParty(
  partyName: string | null | undefined,
  storeFilter: string,
  vendorMaps: ReceivableVendorMaps,
  filterByVendorLink: boolean
): boolean {
  if (matchesReceivableStoreNorm(partyName, storeFilter)) return true
  return filterByVendorLink
    ? matchesReceivableStoreByVendorLink(partyName, storeFilter, vendorMaps)
    : false
}

export function filterReceivableRows(
  rows: ReceivableTransactionRow[],
  params: {
    storeFilter?: string
    storeManagerScope?: string
    vendorMaps: ReceivableVendorMaps
    attributionMaps: ReceivableAttributionMaps
    filterByVendorLink: boolean
  }
): ReceivableTransactionRow[] {
  const { storeFilter, storeManagerScope, vendorMaps, attributionMaps, filterByVendorLink } = params
  if (storeManagerScope?.trim()) {
    return rows.filter((r) => receivableRowVisibleToStoreManager(r, storeManagerScope))
  }
  if (!storeFilter?.trim() || isAllFilterToken(storeFilter)) {
    // 전체: 본사가 각 거래처에 가진 미수. 매장이 발행한 청구는 그 매장 장부에만 둔다.
    if (!filterByVendorLink) return rows
    return rows.filter((r) => isHqOwnedReceivable(r))
  }

  if (!filterByVendorLink) {
    return rows.filter((r) =>
      matchesReceivableParty(
        resolveReceivableAttributedStore(r, attributionMaps),
        storeFilter,
        vendorMaps,
        false
      )
    )
  }

  // 매장을 고르면 그 매장 장부. 거래처(채무자)별 미수만. 본사→그 매장 청구는 넣지 않는다.
  return rows.filter((r) => {
    const creditor = String(r.creditor_store ?? '').trim()
    if (!creditor || isOfficeStoreVariant(creditor)) return false
    return matchesReceivableParty(creditor, storeFilter, vendorMaps, true)
  })
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
  groupKey: string
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
    const rawStoreName = v.displayName
    const vendor =
      vendorMaps.storeToVendor.get(normalizeReceivableStoreKey(rawStoreName)) ||
      vendorMaps.storeToVendor.get(normalizeVendorCode(rawStoreName))
    const storeName = resolveReceivableStoreDisplayName(rawStoreName, vendorMaps)
    return {
      storeName,
      vendorCode: vendor?.code,
      vendorName: vendor?.name,
      balance: v.total,
      cumulativeBalance: cumulativeByStoreGroup[groupKey] ?? v.total,
      items: v.items.sort((a, b) => String(b.trans_date || '').localeCompare(String(a.trans_date || ''))),
      groupKey,
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

export function buildReceivableVendorMapsFromRows(
  vendors: { code?: string; name?: string; gps_name?: string; sales_outlet?: string }[]
): ReceivableVendorMaps {
  const storeToVendor = new Map<string, ReceivableVendorEntry>()
  const vendorCodeToStores = new Map<string, Set<string>>()
  for (const v of vendors || []) {
    const codeRaw = String(v.code || '').trim()
    const code = codeRaw.toLowerCase()
    const legalName = String(v.name || '').trim()
    const gpsName = String(v.gps_name || '').trim()
    const salesOutlet = String(v.sales_outlet || '').trim()
    if (!code) continue
    const label = salesOutlet || gpsName || legalName || codeRaw
    const name = legalName || label
    const entry: ReceivableVendorEntry = { code, name, label }
    // store_name에 코드만 들어 있는 행도 이름으로 매칭·표시
    addVendorStoreAlias(storeToVendor, vendorCodeToStores, codeRaw, entry)
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
