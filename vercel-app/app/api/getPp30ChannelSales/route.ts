import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import { createTaxStoreScopeMatcher, resolveTaxScopeStoreCodes } from '@/lib/tax-entity-scope'

type OrderRow = {
  created_at?: string
  paid_at?: string
  total?: number
  subtotal?: number
  vat?: number
  payment_cash?: number
  payment_card?: number
  payment_qr?: number
  payment_other?: number
  payment_delivery_app?: number
  status?: string
  store_code?: string
}

type RpcDailyRow = {
  business_date?: string
  cash?: number
  card?: number
  qr?: number
  delivery_app?: number
  other_amt?: number
  total_amt?: number
  order_count?: number
}

function emptyTotals() {
  return { cash: 0, card: 0, qr: 0, deliveryApp: 0, other: 0, total: 0, count: 0 }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message.includes('ACCOUNTING_')) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const url = new URL(request.url)
    const taxMonth = String(url.searchParams.get('taxMonth') || '').trim().slice(0, 7)
    const storeFilter = String(url.searchParams.get('store') || '').trim()
    if (!taxMonth || !/^\d{4}-\d{2}$/.test(taxMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_PARAMS' }, { status: 400, headers })
    }

    const startDate = `${taxMonth}-01`
    const [y, m] = taxMonth.split('-').map(Number)
    const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const scope = await resolveTaxScopeStoreCodes(storeFilter || 'All')

    // entity/taxid인데 매핑 매장이 0이면 빈 결과
    if (scope.storeCodes && scope.storeCodes.length === 0) {
      return NextResponse.json({ success: true, dailySales: [], totals: emptyTotals(), source: 'empty_scope' }, { headers })
    }

    // 1) DB RPC 우선
    try {
      const rpcRows = await supabaseRpc<RpcDailyRow[]>('get_pp30_channel_sales_daily', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_store_codes: scope.storeCodes,
      })
      const dailySales = (Array.isArray(rpcRows) ? rpcRows : []).map((r) => ({
        date: String(r.business_date || ''),
        cash: Number(r.cash) || 0,
        card: Number(r.card) || 0,
        qr: Number(r.qr) || 0,
        deliveryApp: Number(r.delivery_app) || 0,
        other: Number(r.other_amt) || 0,
        total: Number(r.total_amt) || 0,
        count: Number(r.order_count) || 0,
      })).filter((d) => d.date)

      const totals = emptyTotals()
      for (const d of dailySales) {
        totals.cash += d.cash
        totals.card += d.card
        totals.qr += d.qr
        totals.deliveryApp += d.deliveryApp
        totals.other += d.other
        totals.total += d.total
        totals.count += d.count
      }
      return NextResponse.json({ success: true, dailySales, totals, source: 'rpc' }, { headers })
    } catch (rpcErr) {
      console.warn('[getPp30ChannelSales] RPC fallback:', rpcErr)
    }

    // 2) Fallback: select + 스코프 매처 (레거시)
    const isStoreInScope = await createTaxStoreScopeMatcher(storeFilter || 'All')
    const storeInFilter =
      scope.storeCodes && scope.storeCodes.length > 0 && scope.storeCodes.length <= 80
        ? `&store_code=in.(${scope.storeCodes.map((c) => encodeURIComponent(c)).join(',')})`
        : ''

    const rows = (await supabaseSelectFilter(
      'pos_orders',
      `status=in.(completed,paid)&paid_at=gte.${startDate}T00:00:00%2B07:00&paid_at=lte.${endDate}T23:59:59%2B07:00${storeInFilter}`,
      {
        select: 'paid_at,total,subtotal,vat,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,store_code',
        limit: 100000,
      }
    )) as OrderRow[] | null

    const filtered: OrderRow[] = []
    for (const r of rows || []) {
      if (storeInFilter) {
        filtered.push(r)
        continue
      }
      const ok = await isStoreInScope({ storeCode: r.store_code })
      if (ok) filtered.push(r)
    }

    const dailyMap = new Map<string, {
      cash: number; card: number; qr: number; deliveryApp: number; other: number; total: number; count: number
    }>()

    for (const r of filtered) {
      const paidAt = String(r.paid_at || r.created_at || '')
      const date = paidAt
        ? new Date(paidAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        : ''
      if (!date) continue

      const cash = Math.max(0, Number(r.payment_cash) || 0)
      const card = Math.max(0, Number(r.payment_card) || 0)
      const qr = Math.max(0, Number(r.payment_qr) || 0)
      const delivery = Math.max(0, Number(r.payment_delivery_app) || 0)
      const total = Math.max(0, Number(r.total) || 0)
      const otherCalc = Math.max(0, total - cash - card - qr - delivery)

      const existing = dailyMap.get(date) || { cash: 0, card: 0, qr: 0, deliveryApp: 0, other: 0, total: 0, count: 0 }
      existing.cash += cash
      existing.card += card
      existing.qr += qr
      existing.deliveryApp += delivery
      existing.other += otherCalc
      existing.total += total
      existing.count += 1
      dailyMap.set(date, existing)
    }

    const dailySales = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }))

    const totals = emptyTotals()
    for (const d of dailySales) {
      totals.cash += d.cash
      totals.card += d.card
      totals.qr += d.qr
      totals.deliveryApp += d.deliveryApp
      totals.other += d.other
      totals.total += d.total
      totals.count += d.count
    }

    return NextResponse.json({ success: true, dailySales, totals, source: 'fallback' }, { headers })
  } catch (err) {
    console.error('[getPp30ChannelSales]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'UNKNOWN' },
      { status: 500, headers }
    )
  }
}
