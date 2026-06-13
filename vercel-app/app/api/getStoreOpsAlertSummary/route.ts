import { NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokTodayDateString, getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import { fetchErpStoresMaster, buildStoreListFromEmployees } from '@/lib/erp-store-master'
import { filterPosSalesStoreOptionsForManagement } from '@/lib/pos-sales-test-office'

function subtractDaysBangkok(endYmd: string, days: number): string {
  const { dayStartUtcIso } = getBangkokDateRangeUtc(endYmd, endYmd)
  const t = new Date(dayStartUtcIso).getTime() - days * 86400000
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** 매장 운영 허브·사이드바 배지용 KPI 집계 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const today = getBangkokTodayDateString()
    const staleCutoff = subtractDaysBangkok(today, 3)
    const complaintStart = subtractDaysBangkok(today, 90)

    const [checkRows, repairRows, complaintRows, empList] = await Promise.all([
      supabaseSelectFilter('check_results', `check_date=eq.${today}`, {
        select: 'store_name',
        limit: 500,
      }) as Promise<{ store_name?: string }[]>,
      supabaseSelectFilter(
        'store_repair_tickets',
        `status=eq.${encodeURIComponent('접수')}&reported_at=lt.${encodeURIComponent(getBangkokDateRangeUtc(staleCutoff, staleCutoff).nextDayStartUtcIso)}`,
        { select: 'id', limit: 500 }
      ) as Promise<{ id?: number }[]>,
      supabaseSelectFilter(
        'complaint_logs',
        `log_date=gte.${complaintStart}&status=in.(${encodeURIComponent('접수')},${encodeURIComponent('조사중')})`,
        { select: 'id', limit: 500 }
      ) as Promise<{ id?: number }[]>,
      supabaseSelect('employees', {
        order: 'id.asc',
        select: 'store,name,nick,job,role,resign_date,employment_status',
        limit: 5000,
      }) as Promise<
        {
          store?: string
          name?: string
          nick?: string
          job?: string
          role?: string
          resign_date?: string | null
          employment_status?: string | null
        }[]
      >,
    ])

    const masters = await fetchErpStoresMaster()
    const built = buildStoreListFromEmployees(empList, masters)
    const operationalStores = filterPosSalesStoreOptionsForManagement(built.stores).filter(
      (s) => s && s !== 'All' && !/^cm office$/i.test(s)
    )
    const checkedStores = new Set(
      (checkRows || []).map((r) => String(r.store_name || '').trim()).filter(Boolean)
    )
    const uncheckedToday = Math.max(0, operationalStores.length - checkedStores.size)

    return NextResponse.json(
      {
        today,
        totalStores: operationalStores.length,
        checkedToday: checkedStores.size,
        uncheckedToday,
        staleRepairs: (repairRows || []).length,
        openComplaints: (complaintRows || []).length,
      },
      { headers }
    )
  } catch (e) {
    console.error('getStoreOpsAlertSummary:', e)
    return NextResponse.json(
      {
        today: getBangkokTodayDateString(),
        totalStores: 0,
        checkedToday: 0,
        uncheckedToday: 0,
        staleRepairs: 0,
        openComplaints: 0,
      },
      { status: 500, headers }
    )
  }
}
