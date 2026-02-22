import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']
function isOfficeStore(s: string): boolean {
  const x = String(s || '').trim()
  return OFFICE_STORES.some((o) => x === o || x.toLowerCase().includes('office'))
}

/** 1단계: 손익계산서 집계 (매출 - 매입 - 비용)
 * [매장] 매출: pos_orders | 매입: orders(Approved) | 비용: petty_cash
 * [본사] 매출: orders(출고완료=배송완료/일부배송완료) | 매입: purchase_orders | 비용: Office petty
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const yearMonth = String(searchParams.get('yearMonth') || searchParams.get('month') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  // Office 역할: storeFilter 그대로 사용. 매니저: 자기 매장으로 고정
  const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
  if (!isOffice && userStore) storeFilter = userStore

  // 기본값: 이번 달
  let startStr = ''
  let endStr = ''
  if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
    const [y, m] = yearMonth.split('-').map(Number)
    startStr = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  } else {
    const n = new Date()
    startStr = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-01'
    const lastDay = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()
    endStr = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')
  }

  const dayStart = startStr + 'T00:00:00.000Z'
  const dayEnd = endStr + 'T23:59:59.999Z'
  const nextDay = new Date(endStr)
  nextDay.setDate(nextDay.getDate() + 1)
  const nextDayStr = nextDay.toISOString().slice(0, 10) + 'T00:00:00.000Z'

  const isHQ = isOfficeStore(storeFilter)

  try {
    let sales = 0
    let purchases = 0
    let expenses = 0

    if (isHQ) {
      // ─── 본사: 출고 완료 기준 매출, purchase_orders 매입, Office 비용 ───
      // 1. 매출: orders 출고 완료 (delivery_status = 배송완료/일부배송완료)
      const outboundFilter =
        `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
        `&or=(delivery_status.eq.${encodeURIComponent('배송완료')},delivery_status.eq.${encodeURIComponent('일부배송완료')})`
      const outboundOrders = (await supabaseSelectFilter('orders', outboundFilter, {
        select: 'total',
        limit: 5000,
      })) as { total?: number }[] | null
      for (const o of outboundOrders || []) {
        sales += Number(o.total) || 0
      }

      // 2. 매입: purchase_orders (본사→공급업체)
      const poFilter = `created_at=gte.${dayStart}&created_at=lt.${nextDayStr}`
      const poRows = (await supabaseSelectFilter('purchase_orders', poFilter, {
        select: 'total,status',
        limit: 5000,
      })) as { total?: number; status?: string }[] | null
      const poApproved = ['Approved', 'approved', '완료']
      for (const r of poRows || []) {
        if (!poApproved.includes(r.status || '')) continue
        purchases += Number(r.total) || 0
      }

      // 3. 비용: Office petty (store = Office, 본사, Office-xxx 등)
      const pettyAll = (await supabaseSelectFilter('petty_cash_transactions',
        `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`,
        { select: 'store,amount,trans_type', limit: 5000 }
      )) as { store?: string; amount?: number; trans_type?: string }[] | null
      for (const r of pettyAll || []) {
        if ((r.trans_type || '').toLowerCase() !== 'expense') continue
        const st = String(r.store || '').trim()
        if (isOfficeStore(st) || st.startsWith('Office-')) {
          expenses += Number(r.amount) || 0
        }
      }
    } else {
      // ─── 매장: POS 매출, orders 매입, petty 비용 ───
      // 1. 매출: pos_orders
      const posFilter =
        `created_at=gte.${dayStart}&created_at=lt.${nextDayStr}` +
        (storeFilter && storeFilter !== 'All' ? `&store_code=ilike.${encodeURIComponent(storeFilter)}` : '')
      const posOrders = (await supabaseSelectFilter('pos_orders', posFilter, {
        select: 'total,status',
        limit: 10000,
      })) as { total?: number; status?: string }[] | null
      const completedStatuses = ['completed', 'paid', 'ready']
      for (const o of posOrders || []) {
        if (!completedStatuses.includes(o.status || '')) continue
        sales += Number(o.total) || 0
      }

      // 2. 매입: orders (Approved 발주 - 매장이 본사에 낸 돈)
      const orderFilter =
        `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
        (storeFilter && storeFilter !== 'All' ? `&store_name=eq.${encodeURIComponent(storeFilter)}` : '')
      const orders = (await supabaseSelectFilter('orders', orderFilter, {
        select: 'total',
        limit: 5000,
      })) as { total?: number }[] | null
      for (const o of orders || []) {
        purchases += Number(o.total) || 0
      }

      // 3. 비용: petty_cash (해당 매장)
      let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
      if (storeFilter && storeFilter !== 'All') {
        pettyFilter += `&store=eq.${encodeURIComponent(storeFilter)}`
      }
      const pettyRows = (await supabaseSelectFilter('petty_cash_transactions', pettyFilter, {
        select: 'store,amount,trans_type',
        limit: 5000,
      })) as { store?: string; amount?: number; trans_type?: string }[] | null
      for (const r of pettyRows || []) {
        if ((r.trans_type || '').toLowerCase() !== 'expense') continue
        expenses += Number(r.amount) || 0
      }
    }

    const grossProfit = sales - purchases
    const netProfit = grossProfit - expenses

    return NextResponse.json(
      {
        yearMonth: startStr.slice(0, 7),
        startStr,
        endStr,
        storeFilter: storeFilter || 'All',
        sales,
        purchases,
        expenses,
        grossProfit,
        netProfit,
      },
      { headers }
    )
  } catch (e) {
    console.error('getIncomeStatement:', e)
    return NextResponse.json(
      {
        yearMonth: startStr.slice(0, 7),
        startStr,
        endStr,
        storeFilter: storeFilter || 'All',
        sales: 0,
        purchases: 0,
        expenses: 0,
        grossProfit: 0,
        netProfit: 0,
        error: String(e),
      },
      { headers }
    )
  }
}
