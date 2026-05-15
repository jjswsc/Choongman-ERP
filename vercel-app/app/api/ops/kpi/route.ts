import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function bangkokTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const auth = await getVerifiedAuth(req)
    const qs = new URL(req.url).searchParams
    const ymd = String(qs.get('date') || bangkokTodayYmd()).slice(0, 10)
    const requestedStore = String(qs.get('storeCode') || '').trim()
    const storeCode = isOfficeRole(auth?.role || '')
      ? requestedStore
      : String(auth?.store || '').trim()

    const orderFilter =
      `created_at=gte.${encodeURIComponent(`${ymd}T00:00:00+07:00`)}&created_at=lt.${encodeURIComponent(`${ymd}T23:59:59+07:00`)}` +
      (storeCode ? `&store_code=eq.${encodeURIComponent(storeCode)}` : '')
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

    const attempts = (await supabaseSelectFilter('pos_payment_attempts', orderFilter, {
      limit: 20000,
      select: 'response_code',
    }).catch(() => [])) as { response_code?: string }[] | null
    for (const a of attempts || []) {
      if (String(a.response_code || '') !== '00') paymentFailed += 1
    }

    const printJobs = (await supabaseSelectFilter(
      'pos_print_jobs',
      `created_at=gte.${encodeURIComponent(`${ymd}T00:00:00+07:00`)}` +
        (storeCode ? `&store_code=eq.${encodeURIComponent(storeCode)}` : ''),
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
        storeCode: storeCode || 'ALL',
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
