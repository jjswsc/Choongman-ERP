import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokDateRangeUtc, getBangkokTodayDateString } from '@/lib/bangkok-time'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { auth, errorResponse } = await requireAuth(req, 'any')
    if (errorResponse) return errorResponse

    const qs = new URL(req.url).searchParams
    const ymd = String(qs.get('date') || getBangkokTodayDateString()).slice(0, 10)
    const requestedStore = String(qs.get('storeCode') || '').trim()
    const isOffice = isOfficeRole(auth.role || '')
    if (isOffice) {
      if (!requestedStore || requestedStore === 'All') {
        return NextResponse.json(
          {
            success: false,
            message: '본사·오피스 조회에는 storeCode(단일 매장)가 필요합니다.',
          },
          { status: 400, headers }
        )
      }
    }
    const storeCode = isOffice ? requestedStore : String(auth.store || '').trim()

    if (!isOffice && !storeCode) {
      return NextResponse.json(
        { success: false, message: '로그인 매장 정보가 없어 집계할 수 없습니다.' },
        { status: 400, headers }
      )
    }

    const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(ymd, ymd)
    const dayRangeFilter = `created_at=gte.${encodeURIComponent(dayStartUtcIso)}&created_at=lt.${encodeURIComponent(nextDayStartUtcIso)}`
    const orderFilter = dayRangeFilter + (storeCode ? `&store_code=eq.${encodeURIComponent(storeCode)}` : '')
    const orders = (await supabaseSelectFilter('pos_orders', orderFilter, {
      limit: 20000,
      select: 'id,status,total',
    })) as { id?: number; status?: string; total?: number }[] | null

    let orderSuccess = 0
    let orderFailed = 0
    let paymentFailed = 0
    for (const o of orders || []) {
      const status = String(o.status || '').toLowerCase()
      if (['paid', 'completed', 'ready', 'preparing', 'cooking', 'pending'].includes(status)) orderSuccess += 1
      if (['cancelled', 'canceled', 'refunded'].includes(status)) orderFailed += 1
    }

    const attemptsFilter =
      dayRangeFilter +
      (storeCode ? `&pos_orders.store_code=eq.${encodeURIComponent(storeCode)}` : '')
    const attempts = (await supabaseSelectFilter('pos_payment_attempts', attemptsFilter, {
      limit: 20000,
      select: 'response_code',
    }).catch(() => [])) as { response_code?: string }[] | null
    for (const a of attempts || []) {
      if (String(a.response_code || '') !== '00') paymentFailed += 1
    }

    const printJobs = (await supabaseSelectFilter(
      'pos_print_jobs',
      dayRangeFilter + (storeCode ? `&store_code=eq.${encodeURIComponent(storeCode)}` : ''),
      {
        limit: 20000,
        select: 'status',
      }
    ).catch(() => [])) as { status?: string }[] | null
    let printFailed = 0
    let printQueued = 0
    for (const j of printJobs || []) {
      const st = String(j.status || '')
      if (st === 'failed') printFailed += 1
      if (st === 'queued' || st === 'claimed') printQueued += 1
    }

    const closeRuns = (await supabaseSelectFilter(
      'pos_close_runs',
      `business_date=eq.${encodeURIComponent(ymd)}` + (storeCode ? `&store_code=eq.${encodeURIComponent(storeCode)}` : ''),
      {
        limit: 1000,
        select: 'status',
      }
    ).catch(() => [])) as { status?: string }[] | null
    const closePending = (closeRuns || []).filter((r) => !['locked', 'posted'].includes(String(r.status || ''))).length

    return NextResponse.json(
      {
        success: true,
        date: ymd,
        storeCode: storeCode || '',
        kpi: {
          orderSuccess,
          orderFailed,
          paymentFailed,
          printFailed,
          printQueued,
          closePending,
        },
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 300) }, { headers })
  }
}
