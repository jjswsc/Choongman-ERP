/**
 * 미수금/미지급금 목록 조회
 * - type: receivable | payable
 * - storeFilter / vendorFilter (선택)
 * - startStr, endStr (trans_date 범위 — 목록·그룹 합계 모두 조회 기간 내 거래만)
 * - receivable: store_name으로 vendors 매칭 → vendorCode, vendorName 포함
 * - payable: storeFilter 시 입고(location)·발주(relatedStore/location)·지출(store_name)·통장(store)·패티(store)로 귀속 매장 필터
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  buildPayableAttributionMaps,
  filterPayableRowsByStore,
  isPayableStoreFilterActive,
  resolvePayableAttributedStore,
  type PayableTransactionRow,
} from '@/lib/payable-attributed-store'
import {
  normalizeReceivableStoreKey,
  pickReceivableDisplayStoreName,
  receivableStoreGroupKey,
} from '@/lib/receivable-store-key'

type ReceivableVendorEntry = { code: string; name: string }
type ReceivableVendorMaps = {
  storeToVendor: Map<string, ReceivableVendorEntry>
  vendorCodeToStores: Map<string, Set<string>>
}

function isAllFilterToken(v: string): boolean {
  const n = normalizeReceivableStoreKey(v)
  return !n || n === 'all'
}

function normalizeVendorCode(v: string): string {
  return String(v || '').trim().toLowerCase()
}

function matchesReceivableStoreNorm(storeName: string | null | undefined, storeFilter: string): boolean {
  const filterNorm = normalizeReceivableStoreKey(storeFilter)
  if (isAllFilterToken(filterNorm)) return true
  const storeNorm = normalizeReceivableStoreKey(storeName || '')
  if (!storeNorm) return false
  return storeNorm === filterNorm
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

function matchesReceivableStoreByVendorLink(
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

async function getReceivableVendorMaps(): Promise<ReceivableVendorMaps> {
  const vendors = (await supabaseSelect('vendors', {
    select: 'code,name,gps_name,sales_outlet',
    limit: 5000,
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

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'receivable').trim().toLowerCase()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const vendorFilter = searchParams.get('vendorFilter') || searchParams.get('vendor') || ''
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  // 본사/회계직원: 매장별 선택 가능. 매니저/가맹점주: receivable만 자기 매장, payable 조회 불가
  const canSelectStores = isOfficeRole(userRole) || isAccountingRole(userRole)
  const isManager = (userRole.includes('manager') || userRole.includes('franchisee')) && !canSelectStores
  if (type === 'receivable' && isManager && userStore) {
    if (!storeFilter || storeFilter === 'All' || storeFilter === '전체') {
      storeFilter = userStore
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
      if (!allowed) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }
  if (type === 'payable' && isManager) {
    return NextResponse.json({ type: 'payable', list: [] }, { headers })
  }

  try {
    if (type === 'payable') {
      const parts: string[] = []
      if (vendorFilter) parts.push(`vendor_code=ilike.${encodeURIComponent(vendorFilter)}`)
      if (startStr) parts.push(`trans_date=gte.${startStr}`)
      if (endStr) parts.push(`trans_date=lte.${endStr}`)
      const filter = parts.length ? parts.join('&') : 'id=gt.0'
      const rawRows = (await supabaseSelectFilter(
        'payable_transactions',
        filter,
        { order: 'trans_date.desc', limit: 20000 }
      )) as PayableTransactionRow[]

      const attributionMaps = await buildPayableAttributionMaps(rawRows || [])
      let rows: PayableTransactionRow[] = rawRows || []
      if (isPayableStoreFilterActive(storeFilter)) {
        rows = filterPayableRowsByStore(rows, storeFilter, attributionMaps)
      }

      // 인보이스 여부: Inbound→inbound_batches, PO→purchase_orders, bank_transaction_id→bank_transactions (마이그레이션 미적용 시 스킵)
      const invoiceByInbound: Record<number, { invoice_received?: boolean; invoice_no?: string | null }> = {}
      const invoiceByPo: Record<number, { invoice_received?: boolean; invoice_no?: string | null }> = {}
      const invoiceByBank: Record<number, { invoice_received?: boolean; invoice_no?: string | null }> = {}

      try {
        const inboundIds = [...new Set((rows || []).filter((r) => r.ref_type === 'Inbound' && r.ref_id).map((r) => Number(r.ref_id!)))]
        const poIds = [...new Set((rows || []).filter((r) => r.ref_type === 'PO' && r.ref_id).map((r) => Number(r.ref_id!)))]
        const bankIds = [...new Set((rows || []).filter((r) => r.bank_transaction_id).map((r) => Number(r.bank_transaction_id!)))]

        if (inboundIds.length > 0) {
          const batches = (await supabaseSelectFilter('inbound_batches', `id=in.(${inboundIds.join(',')})`, {
            limit: 5000,
          })) as { id?: number; invoice_received?: boolean; invoice_no?: string | null }[] | null
          for (const b of batches || []) {
            if (b.id) invoiceByInbound[b.id] = { invoice_received: Boolean(b.invoice_received), invoice_no: b.invoice_no }
          }
        }
        if (poIds.length > 0) {
          const pos = (await supabaseSelectFilter('purchase_orders', `id=in.(${poIds.join(',')})`, {
            limit: 5000,
          })) as { id?: number; invoice_received?: boolean; invoice_no?: string | null }[] | null
          for (const p of pos || []) {
            if (p.id) invoiceByPo[p.id] = { invoice_received: Boolean(p.invoice_received), invoice_no: p.invoice_no }
          }
        }
        if (bankIds.length > 0) {
          const banks = (await supabaseSelectFilter('bank_transactions', `id=in.(${bankIds.join(',')})`, {
            limit: 5000,
          })) as { id?: number; invoice_received?: boolean; invoice_no?: string | null }[] | null
          for (const bt of banks || []) {
            if (bt.id) invoiceByBank[bt.id] = { invoice_received: Boolean(bt.invoice_received), invoice_no: bt.invoice_no }
          }
        }
      } catch (_inv) {
        // invoice 컬럼 미존재 등 시 인보이스 정보 없이 진행
      }

      const rowsWithInvoice = (rows || []).map((r) => {
        const attributed_store = resolvePayableAttributedStore(r, attributionMaps) || undefined
        const base = { ...r, attributed_store }
        if (r.ref_type === 'Inbound' && r.ref_id) {
          const inv = invoiceByInbound[Number(r.ref_id)]
          if (inv) {
            ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_received = inv.invoice_received
            ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_no = inv.invoice_no
          }
        } else if (r.ref_type === 'PO' && r.ref_id) {
          const inv = invoiceByPo[Number(r.ref_id)]
          if (inv) {
            ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_received = inv.invoice_received
            ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_no = inv.invoice_no
          }
        } else if (r.bank_transaction_id) {
          const inv = invoiceByBank[Number(r.bank_transaction_id)]
          if (inv) {
            ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_received = inv.invoice_received
            ;(base as { invoice_received?: boolean; invoice_no?: string | null }).invoice_no = inv.invoice_no
          }
        }
        return base
      })

      const byVendor: Record<string, { total: number; items: typeof rowsWithInvoice }> = {}
      for (const r of rowsWithInvoice) {
        const vc = String(r.vendor_code || '').trim()
        if (!vc) continue
        if (!byVendor[vc]) byVendor[vc] = { total: 0, items: [] }
        byVendor[vc].items.push(r)
        byVendor[vc].total += Number(r.amount ?? 0)
      }

      const list = Object.entries(byVendor).map(([vendorCode, v]) => ({
        vendorCode,
        balance: v.total,
        items: v.items.sort((a, b) => (String(b.trans_date || '').localeCompare(String(a.trans_date || '')))),
      }))

      return NextResponse.json({ type: 'payable', list }, { headers })
    }

    // receivable
    const parts: string[] = []
    if (startStr) parts.push(`trans_date=gte.${startStr}`)
    if (endStr) parts.push(`trans_date=lte.${endStr}`)
    const filter = parts.length ? parts.join('&') : 'id=gt.0'
    let rows = (await supabaseSelectFilter(
      'receivable_transactions',
      filter,
      { order: 'trans_date.desc', limit: 20000 }
    )) as {
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
    }[]

    const receivableVendorMaps = await getReceivableVendorMaps()
    const storeFilterActive = Boolean(storeFilter?.trim()) && !isAllFilterToken(storeFilter)
    if (storeFilterActive) {
      rows = rows.filter((r) =>
        canSelectStores
          ? matchesReceivableStoreByVendorLink(r.store_name, storeFilter, receivableVendorMaps)
          : matchesReceivableStoreNorm(r.store_name, storeFilter)
      )
    }

    const byStore: Record<string, { displayName: string; total: number; items: typeof rows }> = {}
    for (const r of rows || []) {
      const sn = String(r.store_name || '').trim()
      if (!sn) continue
      const groupKey = receivableStoreGroupKey(sn)
      if (!byStore[groupKey]) byStore[groupKey] = { displayName: sn, total: 0, items: [] }
      byStore[groupKey].displayName = pickReceivableDisplayStoreName(byStore[groupKey].displayName, sn)
      byStore[groupKey].items.push(r)
      byStore[groupKey].total += Number(r.amount ?? 0)
    }

    const list = Object.entries(byStore).map(([, v]) => {
      const storeName = v.displayName
      const vendor = receivableVendorMaps.storeToVendor.get(normalizeReceivableStoreKey(storeName))
      return {
        storeName,
        vendorCode: vendor?.code,
        vendorName: vendor?.name,
        balance: v.total,
        items: v.items.sort((a, b) => (String(b.trans_date || '').localeCompare(String(a.trans_date || '')))),
      }
    })

    return NextResponse.json({ type: 'receivable', list }, { headers })
  } catch (e) {
    console.error('getReceivablePayableList:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500, headers }
    )
  }
}
