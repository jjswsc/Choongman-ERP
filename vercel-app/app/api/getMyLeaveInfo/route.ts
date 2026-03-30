import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getAnnualLeaveDays, hasOneYearTenureAsOf } from '@/lib/annual-leave'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** ลากิจ(태국 개인사유휴가): 연 3일 고정 */
const LAKIJ_DAYS_PER_YEAR = 3

/** 병가: 연 30일 고정 */
const SICK_DAYS_PER_YEAR = 30

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()

  if (!store || !name) {
    return NextResponse.json(
      {
        history: [],
        stats: {
          usedAnn: 0,
          usedSick: 0,
          usedUnpaid: 0,
          usedLakij: 0,
          remain: 0,
          remainLakij: 0,
          remainSick: SICK_DAYS_PER_YEAR,
          annualTotal: 0,
          lakijTotal: LAKIJ_DAYS_PER_YEAR,
          sickTotal: SICK_DAYS_PER_YEAR,
        },
      },
      { headers }
    )
  }

  try {
    const empRows = (await supabaseSelectFilter(
      'employees',
      `store=ilike.${encodeURIComponent(store)}&name=ilike.${encodeURIComponent(name)}`,
      { limit: 1, select: 'annual_leave_days,join_date,sal_type' }
    )) as { annual_leave_days?: number | null; join_date?: string | null }[]
    const annualTotal = getAnnualLeaveDays(empRows?.[0] ?? null)

    const filter = `store=ilike.${encodeURIComponent(store)}&name=ilike.${encodeURIComponent(name)}`
    const rows = (await supabaseSelectFilter(
      'leave_requests',
      filter,
      { order: 'leave_date.desc', limit: 100, select: 'id,leave_date,status,type,reason,certificate_url,reject_reason' }
    )) as { id?: number; leave_date?: string; status?: string; type?: string; reason?: string; certificate_url?: string; reject_reason?: string }[]

    const thisYear = parseInt(getBangkokTodayDateString().slice(0, 4), 10)
    let usedAnn = 0,
      usedSick = 0,
      usedUnpaid = 0,
      usedLakij = 0
    const emp = empRows?.[0] ?? null
    const history = (rows || []).map((r) => {
      const dateStr = toDateStr(r.leave_date)
      const status = String(r.status || '').trim()
      const type = String(r.type || '').trim()
      const isAnnualType = type.indexOf('연차') !== -1 || type.indexOf('반차') !== -1 || type.toLowerCase().indexOf('annual') !== -1 || type.toLowerCase().indexOf('half') !== -1
      const underOneYear = dateStr && isAnnualType && !hasOneYearTenureAsOf(emp, dateStr)

      if (
        (status === '승인' || status === 'Approved') &&
        dateStr &&
        parseInt(dateStr.slice(0, 4), 10) === thisYear
      ) {
        const val = type.indexOf('반차') !== -1 ? 0.5 : 1.0
        if (type.indexOf('무급휴가') !== -1 || type.toLowerCase().indexOf('unpaid') !== -1 || underOneYear) {
          usedUnpaid += val
        } else if (type.indexOf('ลากิจ') !== -1 || type.toLowerCase().indexOf('lakij') !== -1) {
          usedLakij += val
        } else if (type.indexOf('병가') !== -1 || type.toLowerCase().indexOf('sick') !== -1) {
          usedSick += val
        } else {
          usedAnn += val
        }
      }
      const displayType = underOneYear && isAnnualType ? (type.indexOf('반차') !== -1 ? '무급휴가(반차)' : '무급휴가') : type
      return { id: r.id, date: dateStr, type: displayType, reason: r.reason || '', status, certificateUrl: r.certificate_url || '', rejectReason: (r.reject_reason ?? '').trim() || undefined }
    })

    const remain = Math.max(0, annualTotal - usedAnn)
    const remainLakij = Math.max(0, LAKIJ_DAYS_PER_YEAR - usedLakij)
    const remainSick = Math.max(0, SICK_DAYS_PER_YEAR - usedSick)
    return NextResponse.json(
      {
        history,
        stats: {
          usedAnn,
          usedSick,
          usedUnpaid,
          usedLakij,
          remain,
          remainLakij,
          remainSick,
          annualTotal,
          lakijTotal: LAKIJ_DAYS_PER_YEAR,
          sickTotal: SICK_DAYS_PER_YEAR,
        },
      },
      { headers }
    )
  } catch (e) {
    console.error('getMyLeaveInfo:', e)
    return NextResponse.json(
      {
        history: [],
        stats: {
          usedAnn: 0,
          usedSick: 0,
          usedUnpaid: 0,
          usedLakij: 0,
          remain: 0,
          remainLakij: 0,
          remainSick: SICK_DAYS_PER_YEAR,
          annualTotal: 0,
          lakijTotal: LAKIJ_DAYS_PER_YEAR,
          sickTotal: SICK_DAYS_PER_YEAR,
        },
      },
      { headers }
    )
  }
}
