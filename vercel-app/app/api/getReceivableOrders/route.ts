/**
 * 미수금 - 출고건(주문) 단위 목록
 * - receivable_transactions (ref_type=Order) + orders 조인
 * - 매장별 주문, 금액, 수령상태(Paid/Wait to pay)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const startStr = String(searchParams.get('startStr') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || '').trim().slice(0, 10)
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  const effectiveStore = isManager && userStore ? userStore : storeFilter

  try {
    let recFilter = `ref_type=eq.Order&ref_id=not.is.null`
    if (effectiveStore) recFilter += `&store_name=ilike.${encodeURIComponent(effectiveStore)}`
    if (startStr) recFilter += `&trans_date=gte.${startStr}`
    if (endStr) recFilter += `&trans_date=lte.${endStr}`

    const recRows = (await supabaseSelectFilter('receivable_transactions', recFilter, {
      select: 'id,store_name,amount,ref_id,trans_date,memo',
      order: 'trans_date.desc',
      limit: 500,
    })) as { id?: number; store_name?: string; amount?: number; ref_id?: number; trans_date?: string; memo?: string }[]

    if (!recRows?.length) {
      return NextResponse.json({ type: 'receivable_orders', list: [], storeBalances: {} }, { headers })
    }

    const orderIds = [...new Set((recRows || []).map((r) => r.ref_id).filter((id): id is number => id != null))]
    if (orderIds.length === 0) {
      return NextResponse.json({ type: 'receivable_orders', list: [], storeBalances: {} }, { headers })
    }

    const orders = (await supabaseSelectFilter('orders', `id=in.(${orderIds.join(',')})`, {
      select: 'id,order_date,delivery_date,store_name,total,status,delivery_status',
      limit: 500,
    })) as { id?: number; order_date?: string; delivery_date?: string; store_name?: string; total?: number; status?: string; delivery_status?: string }[]

    const orderMap = new Map<number, (typeof orders)[0]>()
    for (const o of orders || []) {
      if (o.id != null) orderMap.set(o.id, o)
    }

    const list = (recRows || []).map((r) => {
      const order = r.ref_id != null ? orderMap.get(r.ref_id) : null
      const amount = Number(r.amount ?? 0)
      return {
        id: r.id,
        orderId: r.ref_id,
        storeName: r.store_name ?? order?.store_name ?? '',
        amount,
        transDate: r.trans_date ?? '',
        orderDate: order?.order_date ? String(order.order_date).slice(0, 10) : '',
        deliveryDate: order?.delivery_date ?? '',
        total: Number(order?.total ?? 0),
        status: order?.delivery_status ?? order?.status ?? '',
        memo: r.memo ?? '',
      }
    })

    const storeBalances: Record<string, number> = {}
    const storeFilterForBalance = effectiveStore ? `store_name=ilike.${encodeURIComponent(effectiveStore)}` : 'id=gt.0'
    const allRec = (await supabaseSelectFilter('receivable_transactions', storeFilterForBalance, {
      select: 'store_name,amount',
      limit: 5000,
    })) as { store_name?: string; amount?: number }[]
    for (const r of allRec || []) {
      const sn = String(r.store_name ?? '').trim()
      if (!sn) continue
      storeBalances[sn] = (storeBalances[sn] ?? 0) + Number(r.amount ?? 0)
    }

    return NextResponse.json({ type: 'receivable_orders', list, storeBalances }, { headers })
  } catch (e) {
    console.error('getReceivableOrders:', e)
    return NextResponse.json(
      { type: 'receivable_orders', list: [], storeBalances: {}, error: String(e) },
      { status: 500, headers }
    )
  }
}
