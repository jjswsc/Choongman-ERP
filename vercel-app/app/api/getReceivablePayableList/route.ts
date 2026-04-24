/**
 * 미수금/미지급금 목록 조회
 * - type: receivable | payable
 * - storeFilter / vendorFilter (선택)
 * - startStr, endStr (trans_date 범위)
 * - receivable: store_name으로 vendors 매칭 → vendorCode, vendorName 포함
 * - payable: storeFilter 시 입고(location)·발주(relatedStore/location)·지출(store_name)·통장(store)·패티(store)로 귀속 매장 필터
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'
import { parsePurchaseOrderCart } from '@/lib/purchase-order-cart'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

type PayableListRow = {
  id?: number
  vendor_code?: string
  amount?: number
  ref_type?: string
  ref_id?: number
  trans_date?: string
  memo?: string
  created_at?: string
  bank_transaction_id?: number | null
  expense_accrual_id?: number | null
  petty_cash_transaction_id?: number | null
}

type ReceivableVendorEntry = { code: string; name: string }
type ReceivableVendorMaps = {
  storeToVendor: Map<string, ReceivableVendorEntry>
  vendorCodeToStores: Map<string, Set<string>>
}

function normalizeReceivableStoreKey(v: string): string {
  const raw = String(v || '').trim().toLowerCase()
  if (!raw) return ''
  const noSpace = raw.replace(/\s+/g, ' ')
  const noCmPrefix = noSpace.startsWith('cm ') ? noSpace.slice(3).trim() : noSpace
  return noCmPrefix
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

function matchesPayableStoreNorm(resolved: string | null | undefined, storeFilter: string): boolean {
  const f = storeFilter.trim().toLowerCase()
  if (!f || f === 'all') return true
  const r = String(resolved || '').trim().toLowerCase()
  if (!r) return false
  return r === f || r.includes(f) || f.includes(r)
}

function poAttributedStore(po: { location_name?: string; cart_json?: string }): string | null {
  const { meta, items } = parsePurchaseOrderCart(po.cart_json)
  const rel = String(meta?.relatedStore || '').trim()
  if (rel) return rel
  const lineStore = items.map((i) => String(i.store || '').trim()).find(Boolean)
  if (lineStore) return lineStore
  const loc = String(po.location_name || '').trim()
  return loc || null
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
      // 잔액/누적 조회 기준: endStr(조회 종료일)까지 누적
      if (endStr) parts.push(`trans_date=lte.${endStr}`)
      const filter = parts.length ? parts.join('&') : 'id=gt.0'
      const rawRows = (await supabaseSelectFilter(
        'payable_transactions',
        filter,
        { order: 'trans_date.desc', limit: 20000 }
      )) as PayableListRow[]

      const inboundIdsAll = [
        ...new Set((rawRows || []).filter((r) => r.ref_type === 'Inbound' && r.ref_id != null).map((r) => Number(r.ref_id))),
      ]
      const locationByInboundId = new Map<number, string>()
      if (inboundIdsAll.length > 0) {
        const batches = (await supabaseSelectFilter(
          'inbound_batches',
          `id=in.(${inboundIdsAll.join(',')})`,
          { select: 'id,location', limit: 10000 }
        )) as { id?: number; location?: string }[] | null
        for (const b of batches || []) {
          if (b.id != null) locationByInboundId.set(Number(b.id), String(b.location || '').trim())
        }
      }

      const poIdsAll = [
        ...new Set((rawRows || []).filter((r) => r.ref_type === 'PO' && r.ref_id != null).map((r) => Number(r.ref_id))),
      ]
      const storeByPoId = new Map<number, string>()
      if (poIdsAll.length > 0) {
        const pos = (await supabaseSelectFilter('purchase_orders', `id=in.(${poIdsAll.join(',')})`, {
          select: 'id,location_name,cart_json',
          limit: 5000,
        })) as { id?: number; location_name?: string; cart_json?: string }[] | null
        for (const p of pos || []) {
          if (p.id == null) continue
          const s = poAttributedStore(p)
          if (s) storeByPoId.set(Number(p.id), s)
        }
      }

      const eids = [
        ...new Set(
          (rawRows || [])
            .filter((r) => r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0)
            .map((r) => Number(r.expense_accrual_id))
        ),
      ]
      const storeByAccrualId = new Map<number, string>()
      if (eids.length > 0) {
        const accr = (await supabaseSelectFilter('expense_accruals', `id=in.(${eids.join(',')})`, {
          select: 'id,store_name',
          limit: 10000,
        })) as { id?: number; store_name?: string | null }[] | null
        for (const a of accr || []) {
          if (a.id == null) continue
          const sn = String(a.store_name || '').trim()
          if (sn) storeByAccrualId.set(Number(a.id), sn)
        }
      }

      const pettyIds = [
        ...new Set(
          (rawRows || [])
            .filter((r) => r.petty_cash_transaction_id != null && Number(r.petty_cash_transaction_id) > 0)
            .map((r) => Number(r.petty_cash_transaction_id))
        ),
      ]
      const storeByPettyId = new Map<number, string>()
      if (pettyIds.length > 0) {
        const petty = (await supabaseSelectFilter('petty_cash_transactions', `id=in.(${pettyIds.join(',')})`, {
          select: 'id,store',
          limit: 10000,
        })) as { id?: number; store?: string | null }[] | null
        for (const p of petty || []) {
          if (p.id == null) continue
          const st = String(p.store || '').trim()
          if (st) storeByPettyId.set(Number(p.id), st)
        }
      }

      const bankIdsAll = [
        ...new Set(
          (rawRows || [])
            .filter((r) => r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0)
            .map((r) => Number(r.bank_transaction_id))
        ),
      ]
      const storeByBankId = new Map<number, string>()
      if (bankIdsAll.length > 0) {
        const banks = (await supabaseSelectFilter('bank_transactions', `id=in.(${bankIdsAll.join(',')})`, {
          select: 'id,store',
          limit: 5000,
        })) as { id?: number; store?: string | null }[] | null
        for (const bt of banks || []) {
          if (bt.id == null) continue
          const st = String(bt.store || '').trim()
          if (st) storeByBankId.set(Number(bt.id), st)
        }
      }

      function resolvePayableAttributedStore(r: PayableListRow): string | null {
        if (r.ref_type === 'Inbound' && r.ref_id != null) {
          return locationByInboundId.get(Number(r.ref_id)) || null
        }
        if (r.ref_type === 'PO' && r.ref_id != null) {
          return storeByPoId.get(Number(r.ref_id)) || null
        }
        if (r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0) {
          return storeByAccrualId.get(Number(r.expense_accrual_id)) || null
        }
        if (r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0) {
          return storeByBankId.get(Number(r.bank_transaction_id)) || null
        }
        if (r.petty_cash_transaction_id != null && Number(r.petty_cash_transaction_id) > 0) {
          return storeByPettyId.get(Number(r.petty_cash_transaction_id)) || null
        }
        return null
      }

      let rows: PayableListRow[] = rawRows || []
      const storeFilterActive =
        Boolean(storeFilter?.trim()) && storeFilter.trim().toLowerCase() !== 'all'
      if (storeFilterActive) {
        rows = rows.filter((r) => matchesPayableStoreNorm(resolvePayableAttributedStore(r), storeFilter))
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
        const attributed_store = resolvePayableAttributedStore(r) || undefined
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
    // 잔액/누적 조회 기준: endStr(조회 종료일)까지 누적
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

    const byStore: Record<string, { total: number; items: typeof rows }> = {}
    for (const r of rows || []) {
      const sn = String(r.store_name || '').trim()
      if (!sn) continue
      if (!byStore[sn]) byStore[sn] = { total: 0, items: [] }
      byStore[sn].items.push(r)
      byStore[sn].total += Number(r.amount ?? 0)
    }

    const list = Object.entries(byStore).map(([storeName, v]) => {
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
