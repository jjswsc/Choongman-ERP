import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export interface TillItem {
  id: number
  store: string
  trans_date: string
  trans_type: string
  amount: number
  balance_after: number | null
  memo: string
  user_name: string
  /** 매출액 출금일 때만: 해당 현금 매출의 영업일 */
  sales_date?: string | null
}

/** 시재(카운터 현금) 입출금 목록 - pos_till_transactions */
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
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)
  const typeFilter = String(searchParams.get('typeFilter') || searchParams.get('type') || 'all').toLowerCase()

  if (storeFilter === 'undefined' || storeFilter === 'null' || storeFilter === 'All') storeFilter = ''

  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)
  if (!isOffice) {
    if (!storeFilter || storeFilter === 'All' || storeFilter === '전체') {
      const fallbackStore = String(allowedStores[0] || '').trim()
      if (!fallbackStore) return NextResponse.json([], { status: 403, headers })
      storeFilter = fallbackStore
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
      if (!allowed) return NextResponse.json([], { status: 403, headers })
    }
  }
  const effectiveStore = storeFilter || ''

  if (!effectiveStore) {
    return NextResponse.json([], { headers })
  }

  try {
    const rows = (await supabaseSelectFilter(
      'pos_till_transactions',
      'store_code=eq.' + encodeURIComponent(effectiveStore),
      { order: 'trans_date.asc,id.asc', limit: 20000, select: 'id,store_code,trans_date,trans_type,amount,memo,user_name,sales_date' }
    )) as { id: number; store_code?: string; trans_date?: string; trans_type?: string; amount?: number; memo?: string; user_name?: string; sales_date?: string | null }[] | null

    const startD = startStr ? new Date(startStr + 'T00:00:00') : null
    const endD = endStr ? new Date(endStr + 'T23:59:59') : null

    let balance = 0
    const list: TillItem[] = []

    for (const r of rows || []) {
      const transType = String(r.trans_type || 'deposit').trim()
      if (typeFilter === 'till_only' && transType === 'sales_withdrawal') continue
      if (typeFilter === 'sales_withdrawal_only' && transType !== 'sales_withdrawal') continue

      const dt = toDateStr(r.trans_date)
      if (!dt) continue
      const dtD = new Date(dt + 'T12:00:00')
      const inRange = (!startD || dtD >= startD) && (!endD || dtD <= endD)

      const amt = Number(r.amount) || 0
      if (typeFilter !== 'sales_withdrawal_only') balance += amt

      if (inRange) {
        list.push({
          id: r.id,
          store: String(r.store_code || '').trim(),
          trans_date: dt,
          trans_type: transType,
          amount: amt,
          balance_after: typeFilter === 'sales_withdrawal_only' ? null : balance,
          memo: String(r.memo || '').trim(),
          user_name: String(r.user_name || '').trim(),
          sales_date: r.sales_date ? toDateStr(r.sales_date) : null,
        })
      }
    }

    list.sort((a, b) => b.trans_date.localeCompare(a.trans_date) || b.id - a.id)
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getTillList:', e)
    return NextResponse.json([], { headers })
  }
}
