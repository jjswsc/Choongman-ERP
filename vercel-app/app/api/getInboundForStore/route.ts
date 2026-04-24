import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { expandStoreVariantsForGrade, escapeForIlikeExact, storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { fetchInboundBankPurchaseSyntheticRows } from '@/lib/inbound-bank-purchase-synthetic'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole } from '@/lib/permissions'
import { createVendorNameResolver } from '@/lib/vendor-name-normalizer'

/** 매장 전용 - 해당 매장의 입고 내역 (본사 수령 + 직접 구매 거래처) + 통장 매입 지급 행 */
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
    const storeName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()
    let startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
    let endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
    const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || '').trim()
    const vendorSearch = String(searchParams.get('vendorSearch') || '').trim()
    const itemSearch = String(searchParams.get('itemSearch') || searchParams.get('item') || '').trim()

    if (!storeName) {
      return NextResponse.json([], { headers })
    }
    if (!isOfficeLevel) {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeName))
      if (!allowed) {
        return NextResponse.json({ success: false, message: '허용되지 않은 매장 접근입니다.' }, { status: 403, headers })
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

    const locVariants = [...new Set(expandStoreVariantsForGrade(storeName).filter(Boolean))]
    const orLoc =
      locVariants.length === 0
        ? ''
        : locVariants.length === 1
          ? `&location=ilike.${encodeURIComponent(escapeForIlikeExact(locVariants[0]))}`
          : `&or=(${locVariants.map((v) => `location.ilike.${encodeURIComponent(escapeForIlikeExact(v))}`).join(',')})`
    const gteIso = `${startStr}T00:00:00.000`
    const lteIso = `${endStr}T23:59:59.999`
    const stockFilter = `log_type=in.(Inbound,ForcePush)${orLoc}&log_date=gte.${encodeURIComponent(gteIso)}&log_date=lte.${encodeURIComponent(lteIso)}`

    const logs = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
      order: 'log_date.desc',
      select: 'log_date,log_type,location,vendor_target,item_code,item_name,qty,unit_cost',
      pageSize: 8000,
      maxRows: 80000,
    })) as {
      log_date?: string
      log_type?: string
      location?: string
      vendor_target?: string
      item_code?: string
      item_name?: string
      qty?: number
      unit_cost?: number | null
    }[]

    const exactVendorRaw =
      vendorFilter && vendorFilter !== 'All' && vendorFilter !== '전체 매입처' ? vendorFilter : ''
    const exactVendor = resolveVendorName(exactVendorRaw)

    const list: {
      date: string
      vendor: string
      name: string
      spec: string
      qty: number
      amount: number
      vatAmount?: number
      purchaseSource?: 'hq' | 'store'
      bank_transaction_id?: number
      row_kind?: 'stock' | 'bank_purchase_payment'
    }[] = []
    for (const row of logs || []) {
      const type = String(row.log_type || '')
      const note = String(row.vendor_target || '').trim()
      const loc = String(row.location || '').trim()
      if (!storesMatchForGradeLookup(loc, storeName)) continue

      const isInbound = type === 'Inbound'
      const isForcePushFromHq = type === 'ForcePush' && note === 'HQ'
      if (!isInbound && !isForcePushFromHq) continue

      const rowDate = row.log_date ? new Date(row.log_date) : null
      if (!rowDate || isNaN(rowDate.getTime())) continue

      const rowVendorRaw = isForcePushFromHq || note === 'From HQ' ? 'From HQ' : note || '-'
      const rowVendor = resolveVendorName(rowVendorRaw)
      if (exactVendor && rowVendor !== exactVendor) continue
      if (!exactVendor && vendorSearch) {
        const vs = vendorSearch.toLowerCase()
        if (!rowVendor.toLowerCase().includes(vs)) continue
      }

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
      const vendor = rowVendor
      list.push({
        date: rowDate.toISOString().slice(0, 10),
        vendor,
        name: row.item_name || '-',
        spec: info.spec,
        qty,
        amount,
        vatAmount,
        purchaseSource: info.purchaseSource,
        row_kind: 'stock',
      })
    }

    try {
      const bankSynth = await fetchInboundBankPurchaseSyntheticRows({
        startStr,
        endStr,
        storeFilter: storeName,
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
        if (!exactVendor && vendorSearch) {
          const vs = vendorSearch.toLowerCase()
          if (!(b.vendor || '').toLowerCase().includes(vs)) continue
        }
        const normalizedBankVendor = resolveVendorName(String(b.vendor || ''))
        if (exactVendor && normalizedBankVendor !== exactVendor) continue
        list.push({
          date: b.date,
          vendor: normalizedBankVendor,
          name: b.name,
          spec: b.spec,
          qty: b.qty,
          amount: b.amount,
          vatAmount: b.vatAmount,
          purchaseSource: b.purchaseSource,
          bank_transaction_id: b.bank_transaction_id,
          row_kind: 'bank_purchase_payment',
        })
      }
    } catch (e) {
      console.error('getInboundForStore bank synthetic:', e)
    }

    if (exactVendor) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (resolveVendorName(String(list[i].vendor || '')) !== exactVendor) list.splice(i, 1)
      }
    }

    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInboundForStore:', e)
    return NextResponse.json([], { headers })
  }
}
