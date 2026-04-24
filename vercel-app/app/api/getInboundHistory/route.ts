import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { fetchInboundBankPurchaseSyntheticRows } from '@/lib/inbound-bank-purchase-synthetic'
import { escapeIlikePattern } from '@/lib/postgrest-ilike'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole } from '@/lib/permissions'
import { createVendorNameResolver } from '@/lib/vendor-name-normalizer'

function normalizeVendorCode(v: string): string {
  return String(v || '').trim().toLowerCase()
}

/** 입고 내역 조회 - stock_logs log_type=Inbound (From HQ 제외) + 통장 매입 지급(품목 입고 없음) 보조 행 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const resolveVendorName = await createVendorNameResolver()
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const authRole = String(auth.role || '').toLowerCase()
    const isDirector = authRole.includes('director') || authRole.includes('ceo') || authRole.includes('hr')
    const isOfficeLevel = isDirector || authRole.includes('officer') || isAccountingRole(authRole)
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(String(auth.store || '').trim())
    if (!isOfficeLevel && allowedStores.length === 0) {
      return NextResponse.json({ success: false, message: '매장 접근 권한이 없습니다.' }, { status: 403, headers })
    }

    const { searchParams } = new URL(request.url)
    let startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
    let endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
    const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || '').trim()
    const vendorSearch = String(searchParams.get('vendorSearch') || '').trim()
    const itemSearch = String(searchParams.get('itemSearch') || searchParams.get('item') || '').trim()
    const requestedStoreFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
    const isAllStoreFilter = !requestedStoreFilter || requestedStoreFilter === 'All' || requestedStoreFilter === '전체 매장'
    let storeFilter = requestedStoreFilter
    if (!isOfficeLevel) {
      if (isAllStoreFilter) {
        storeFilter = String(allowedStores[0] || '').trim()
      } else {
        const requestedAllowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
        if (!requestedAllowed) {
          return NextResponse.json({ success: false, message: '허용되지 않은 매장 접근입니다.' }, { status: 403, headers })
        }
      }
    }

    if (!startStr || !endStr) {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      startStr = first.toISOString().slice(0, 10)
      endStr = last.toISOString().slice(0, 10)
    }

    let itemRows: {
      code?: string
      spec?: string
      cost?: number
      purchase_source?: string
      tax_type?: string
    }[] | null = null
    try {
      itemRows = (await supabaseSelect('items', {
        order: 'id.asc',
        limit: 5000,
        select: 'code,spec,cost,purchase_source,tax_type',
      })) as {
        code?: string
        spec?: string
        cost?: number
        purchase_source?: string
        tax_type?: string
      }[] | null
    } catch {
      itemRows = (await supabaseSelect('items', {
        order: 'id.asc',
        limit: 5000,
        select: 'code,spec,cost,purchase_source',
      })) as {
        code?: string
        spec?: string
        cost?: number
        purchase_source?: string
      }[] | null
    }
    const itemMap: Record<string, { spec: string; cost: number; purchaseSource: 'hq' | 'store'; taxRate: number }> = {}
    for (const row of itemRows || []) {
      const code = String(row.code || '').trim()
      if (code) {
        const ps = String(row.purchase_source || '').trim()
        const taxRaw = String(row.tax_type || '').trim().toLowerCase()
        const taxRate = taxRaw === 'exempt' || taxRaw === 'zero' ? 0 : 0.07
        itemMap[code] = {
          spec: row.spec || '-',
          cost: Number(row.cost) || 0,
          purchaseSource: ps === 'store' ? 'store' : 'hq',
          taxRate,
        }
      }
    }

    const vendorFilterCode = normalizeVendorCode(vendorFilter)
    let exactVendorAliases = new Set<string>()
    if (vendorFilterCode && vendorFilterCode !== 'all') {
      const vendorRows = (await supabaseSelectFilter(
        'vendors',
        `code=eq.${encodeURIComponent(vendorFilterCode)}`,
        { select: 'name,gps_name,sales_outlet', limit: 1 }
      )) as { name?: string; gps_name?: string; sales_outlet?: string }[] | null
      const v = vendorRows?.[0]
      if (v) {
        const aliases = [
          resolveVendorName(String(v.name || '').trim()),
          resolveVendorName(String(v.gps_name || '').trim()),
          resolveVendorName(String(v.sales_outlet || '').trim()),
        ].filter(Boolean)
        exactVendorAliases = new Set(aliases)
      } else {
        exactVendorAliases = new Set(['__no_match__'])
      }
    }

    const gteIso = `${startStr}T00:00:00.000`
    const lteIso = `${endStr}T23:59:59.999`

    const parts: string[] = [
      'log_type=eq.Inbound',
      `log_date=gte.${encodeURIComponent(gteIso)}`,
      `log_date=lte.${encodeURIComponent(lteIso)}`,
      `vendor_target=neq.${encodeURIComponent('From HQ')}`,
    ]
    if (vendorSearch) {
      const p = `%${escapeIlikePattern(vendorSearch)}%`
      parts.push(`vendor_target=ilike.${encodeURIComponent(p)}`)
    }
    /** 품목 검색은 코드·로그 품목명·마스터 규격(spec) 모두 대상 — DB or 만으로는 spec 불가해 루프에서 필터 */
    const stockFilter = parts.join('&')

    const logs = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
      order: 'log_date.desc',
      select: 'log_date,location,vendor_target,item_code,item_name,qty,unit_cost,inbound_batch_id',
      pageSize: 8000,
      maxRows: 80000,
    })) as {
      log_date?: string
      location?: string
      vendor_target?: string
      item_code?: string
      item_name?: string
      qty?: number
      unit_cost?: number | null
      inbound_batch_id?: number | null
    }[]

    const list: {
      date: string
      vendor: string
      name: string
      spec: string
      qty: number
      amount: number
      vatAmount?: number
      code?: string
      purchaseSource?: 'hq' | 'store'
      inbound_batch_id?: number | null
      po_no?: string | null
      invoice_no?: string | null
      invoice_received?: boolean
      po_created_at?: string | null
      bank_transaction_id?: number
      row_kind?: 'stock' | 'bank_purchase_payment'
    }[] = []
    for (const row of logs || []) {
      if (String(row.vendor_target || '').trim() === 'From HQ') continue
      const loc = String(row.location || '').trim()
      if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체 매장') {
        if (!storesMatchForGradeLookup(loc, storeFilter)) continue
      }
      const rowDate = row.log_date ? new Date(row.log_date) : null
      if (!rowDate || isNaN(rowDate.getTime())) continue

      const rowVendor = resolveVendorName(String(row.vendor_target || '').trim())
      if (exactVendorAliases.size > 0 && !exactVendorAliases.has(rowVendor)) continue

      const code = String(row.item_code || '').trim()
      const info = itemMap[code] || { spec: '-', cost: 0, purchaseSource: 'hq' as const, taxRate: 0.07 }
      if (itemSearch) {
        const q = itemSearch.trim().toLowerCase()
        const nm = String(row.item_name || '-').toLowerCase()
        const cd = code.toLowerCase()
        const sp = String(info.spec || '').toLowerCase()
        if (!cd.includes(q) && !nm.includes(q) && !sp.includes(q)) continue
      }
      const qty = Number(row.qty) || 0
      const unitCost = row.unit_cost != null && !isNaN(Number(row.unit_cost)) ? Number(row.unit_cost) : info.cost
      const amount = unitCost * qty
      const vatAmount = Math.round(amount * info.taxRate * 100) / 100
      list.push({
        date: rowDate.toISOString().slice(0, 10),
        vendor: rowVendor,
        name: row.item_name || '-',
        spec: info.spec,
        qty,
        amount,
        vatAmount,
        code: code || undefined,
        purchaseSource: info.purchaseSource,
        inbound_batch_id: row.inbound_batch_id ?? undefined,
        row_kind: 'stock',
      })
    }

    try {
      const bankSynth = await fetchInboundBankPurchaseSyntheticRows({
        startStr,
        endStr,
        storeFilter: storeFilter && storeFilter !== 'All' && storeFilter !== '전체 매장' ? storeFilter : undefined,
        vendorFilter: undefined,
        maxRows: 120,
      })
      for (const b of bankSynth) {
        if (itemSearch) {
          const q = itemSearch.toLowerCase()
          const hit =
            (b.name || '').toLowerCase().includes(q) ||
            (b.spec || '').toLowerCase().includes(q) ||
            (b.vendor || '').toLowerCase().includes(q)
          if (!hit) continue
        }
        if (exactVendorAliases.size === 0 && vendorSearch) {
          const vs = vendorSearch.toLowerCase()
          if (!(b.vendor || '').toLowerCase().includes(vs)) continue
        }
        const normalizedBankVendor = resolveVendorName(String(b.vendor || ''))
        if (exactVendorAliases.size > 0 && !exactVendorAliases.has(normalizedBankVendor)) continue
        list.push({
          date: b.date,
          vendor: normalizedBankVendor,
          name: b.name,
          spec: b.spec,
          qty: b.qty,
          amount: b.amount,
          vatAmount: b.vatAmount,
          purchaseSource: b.purchaseSource,
          inbound_batch_id: null,
          bank_transaction_id: b.bank_transaction_id,
          row_kind: 'bank_purchase_payment',
        })
      }
    } catch (e) {
      console.error('getInboundHistory bank synthetic:', e)
    }

    if (exactVendorAliases.size > 0) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (!exactVendorAliases.has(resolveVendorName(String(list[i].vendor || '')))) list.splice(i, 1)
      }
    }

    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    const batchIds = [...new Set(list.map((r) => r.inbound_batch_id).filter((id): id is number => typeof id === 'number' && id > 0))]
    const batchMap: Record<number, { po_no?: string | null; invoice_no?: string | null; invoice_received?: boolean; po_created_at?: string | null }> = {}
    if (batchIds.length > 0) {
      const batchFilter = `id=in.(${batchIds.join(',')})`
      const batches = (await supabaseSelectFilter('inbound_batches', batchFilter, {
        select: 'id,po_no,invoice_no,invoice_received,purchase_order_id',
      })) as { id?: number; po_no?: string | null; invoice_no?: string | null; invoice_received?: boolean; purchase_order_id?: number | null }[]
      const poIds = [...new Set((batches || []).map((b) => b.purchase_order_id).filter((id): id is number => typeof id === 'number' && id > 0))]
      const poCreatedMap: Record<number, string> = {}
      if (poIds.length > 0) {
        const poFilter = `id=in.(${poIds.join(',')})`
        const pos = (await supabaseSelectFilter('purchase_orders', poFilter, {
          select: 'id,created_at',
        })) as { id?: number; created_at?: string }[]
        for (const p of pos || []) {
          if (p.id && p.created_at) poCreatedMap[p.id] = p.created_at.slice(0, 10)
        }
      }
      for (const b of batches || []) {
        if (b.id) {
          const poDate = b.purchase_order_id ? (poCreatedMap[b.purchase_order_id] ?? null) : null
          batchMap[b.id] = { po_no: b.po_no, invoice_no: b.invoice_no, invoice_received: Boolean(b.invoice_received), po_created_at: poDate }
        }
      }
    }
    for (const item of list) {
      const batch = item.inbound_batch_id ? batchMap[item.inbound_batch_id] : null
      if (batch) {
        item.po_no = batch.po_no
        item.invoice_no = batch.invoice_no
        item.invoice_received = batch.invoice_received
        item.po_created_at = batch.po_created_at
      }
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInboundHistory:', e)
    return NextResponse.json([], { headers })
  }
}
