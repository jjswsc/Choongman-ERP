import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']
function isOfficeStore(s: string): boolean {
  const x = String(s || '').trim()
  return OFFICE_STORES.some((o) => x === o || x.toLowerCase().includes('office'))
}

/** 재고 금액 = sum(qty * cost) per item at cutoff date. locationFilter=본사|매장명|null(전체). excludeHq=true면 본사 제외(매장전체) */
async function getInventoryValue(
  locationFilter: string | null,
  cutoffDate: string,
  isBefore: boolean,
  itemCostMap: Record<string, number>,
  excludeHq = false
): Promise<number> {
  const op = isBefore ? 'lt' : 'lte'
  const dayEnd = cutoffDate + (isBefore ? 'T00:00:00.000Z' : 'T23:59:59.999Z')
  let filter = `log_date=${op}.${dayEnd}`
  if (locationFilter) filter += `&location=ilike.${encodeURIComponent(locationFilter)}`

  const rows = (await supabaseSelectFilter('stock_logs', filter, {
    select: 'location,item_code,qty',
    limit: 10000,
  })) as { location?: string; item_code?: string; qty?: number }[] | null

  const byItem: Record<string, number> = {}
  for (const r of rows || []) {
    if (excludeHq && isOfficeStore(String(r.location || ''))) continue
    const code = String(r.item_code || '').trim()
    if (!code) continue
    byItem[code] = (byItem[code] || 0) + Number(r.qty || 0)
  }

  let total = 0
  for (const [code, qty] of Object.entries(byItem)) {
    const cost = itemCostMap[code] ?? 0
    total += qty * cost
  }
  return total
}

/** 1단계: 손익계산서 집계 (매출 - 매입 - 비용)
 * 매출원가(COGS) = 기초재고 + 당기매입 - 기말재고
 * [매장] 매출: pos_orders | 매입: orders | 비용: petty_cash | 재고: stock_logs(location=매장)
 * [본사] 매출: orders(출고완료) | 매입: purchase_orders | 비용: Office petty | 재고: stock_logs(location=본사)
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
    // 품목 원가 맵 (재고 평가용)
    const itemRows = (await supabaseSelect('items', { limit: 5000, select: 'code,cost' })) as { code?: string; cost?: number }[] | null
    const itemCostMap: Record<string, number> = {}
    for (const r of itemRows || []) {
      const code = String(r.code || '').trim()
      if (code) itemCostMap[code] = Number(r.cost) || 0
    }

    let sales = 0
    let purchases = 0
    let expenses = 0
    let beginningInventory = 0
    let endingInventory = 0

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

      // 3b. 비용: 통장 출금 (본사 계좌) - expense_date 우선(발생주의), 없으면 trans_date
      try {
        const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 200 })) as { id?: number; store?: string }[] | null
        const hqAccountIds = (bankAccRows || [])
          .filter((a) => isOfficeStore(String(a.store || '')) || String(a.store || '').startsWith('Office-'))
          .map((a) => a.id)
          .filter((id): id is number => id != null)
        if (hqAccountIds.length > 0) {
          const idList = hqAccountIds.join(',')
          const prevMonth = new Date(startStr)
          prevMonth.setMonth(prevMonth.getMonth() - 1)
          const nextMonth = new Date(endStr)
          nextMonth.setMonth(nextMonth.getMonth() + 1)
          const wideStart = prevMonth.toISOString().slice(0, 10)
          const wideEnd = nextMonth.toISOString().slice(0, 10)
          const btRows = (await supabaseSelectFilter('bank_transactions',
            `account_id=in.(${idList})&trans_date=gte.${wideStart}&trans_date=lte.${wideEnd}&trans_type=eq.withdraw`,
            { select: 'amount,category,trans_date,expense_date', limit: 5000 }
          )) as { amount?: number; category?: string; trans_date?: string; expense_date?: string }[] | null
          for (const r of btRows || []) {
            const cat = String(r.category || 'expense').toLowerCase()
            if (['transfer', 'correction', 'loan', 'advance', 'unclassified'].includes(cat)) continue
            const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
            const transDate = String(r.trans_date || '').slice(0, 10)
            const inRange = (d: string) => d >= startStr && d <= endStr
            if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
              expenses += Math.abs(Number(r.amount) || 0)
            }
          }
        }
      } catch (_) {
        /* bank_transactions 테이블 없을 수 있음 */
      }

      // 4. 재고: 본사(location=본사)
      beginningInventory = await getInventoryValue('본사', startStr, true, itemCostMap)
      endingInventory = await getInventoryValue('본사', endStr, false, itemCostMap)
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

      // 3b. 비용: 통장 출금 (해당 매장 계좌) - expense_date 우선(발생주의), 없으면 trans_date
      if (storeFilter && storeFilter !== 'All') {
        try {
          const bankAccRows = (await supabaseSelectFilter('bank_accounts', `store=ilike.${encodeURIComponent(storeFilter)}`, { select: 'id', limit: 200 })) as { id?: number }[] | null
          const accountIds = (bankAccRows || []).map((a) => a.id).filter((id): id is number => id != null)
          if (accountIds.length > 0) {
            const idList = accountIds.join(',')
            const prevMonth = new Date(startStr)
            prevMonth.setMonth(prevMonth.getMonth() - 1)
            const nextMonth = new Date(endStr)
            nextMonth.setMonth(nextMonth.getMonth() + 1)
            const wideStart = prevMonth.toISOString().slice(0, 10)
            const wideEnd = nextMonth.toISOString().slice(0, 10)
            const btRows = (await supabaseSelectFilter('bank_transactions',
              `account_id=in.(${idList})&trans_date=gte.${wideStart}&trans_date=lte.${wideEnd}&trans_type=eq.withdraw`,
              { select: 'amount,category,trans_date,expense_date', limit: 5000 }
            )) as { amount?: number; category?: string; trans_date?: string; expense_date?: string }[] | null
            for (const r of btRows || []) {
              const cat = String(r.category || 'expense').toLowerCase()
              if (['transfer', 'correction', 'loan', 'advance', 'unclassified'].includes(cat)) continue
              const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
              const transDate = String(r.trans_date || '').slice(0, 10)
              const inRange = (d: string) => d >= startStr && d <= endStr
              if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
                expenses += Math.abs(Number(r.amount) || 0)
              }
            }
          }
        } catch (_) {
          /* bank_transactions 테이블 없을 수 있음 */
        }
      } else {
        // 전체 매장: 본사 제외한 모든 계좌의 출금 - expense_date 우선
        try {
          const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 200 })) as { id?: number; store?: string }[] | null
          const storeAccountIds = (bankAccRows || [])
            .filter((a) => !isOfficeStore(String(a.store || '')) && !String(a.store || '').startsWith('Office-'))
            .map((a) => a.id)
            .filter((id): id is number => id != null)
          if (storeAccountIds.length > 0) {
            const idList = storeAccountIds.join(',')
            const prevMonth = new Date(startStr)
            prevMonth.setMonth(prevMonth.getMonth() - 1)
            const nextMonth = new Date(endStr)
            nextMonth.setMonth(nextMonth.getMonth() + 1)
            const wideStart = prevMonth.toISOString().slice(0, 10)
            const wideEnd = nextMonth.toISOString().slice(0, 10)
            const btRows = (await supabaseSelectFilter('bank_transactions',
              `account_id=in.(${idList})&trans_date=gte.${wideStart}&trans_date=lte.${wideEnd}&trans_type=eq.withdraw`,
              { select: 'amount,category,trans_date,expense_date', limit: 5000 }
            )) as { amount?: number; category?: string; trans_date?: string; expense_date?: string }[] | null
            for (const r of btRows || []) {
              const cat = String(r.category || 'expense').toLowerCase()
              if (['transfer', 'correction', 'loan', 'advance', 'unclassified'].includes(cat)) continue
              const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
              const transDate = String(r.trans_date || '').slice(0, 10)
              const inRange = (d: string) => d >= startStr && d <= endStr
              if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
                expenses += Math.abs(Number(r.amount) || 0)
              }
            }
          }
        } catch (_) {
          /* bank_transactions 테이블 없을 수 있음 */
        }
      }

      // 4. 재고: 매장 (location=매장명 또는 전체 매장)
      if (storeFilter && storeFilter !== 'All') {
        beginningInventory = await getInventoryValue(storeFilter, startStr, true, itemCostMap)
        endingInventory = await getInventoryValue(storeFilter, endStr, false, itemCostMap)
      } else {
        beginningInventory = await getInventoryValue(null, startStr, true, itemCostMap, true)
        endingInventory = await getInventoryValue(null, endStr, false, itemCostMap, true)
      }
    }

    const cogs = beginningInventory + purchases - endingInventory
    const grossProfit = sales - cogs
    const netProfit = grossProfit - expenses

    return NextResponse.json(
      {
        yearMonth: startStr.slice(0, 7),
        startStr,
        endStr,
        storeFilter: storeFilter || 'All',
        sales,
        purchases,
        beginningInventory,
        endingInventory,
        cogs,
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
        beginningInventory: 0,
        endingInventory: 0,
        cogs: 0,
        expenses: 0,
        grossProfit: 0,
        netProfit: 0,
        error: String(e),
      },
      { headers }
    )
  }
}
