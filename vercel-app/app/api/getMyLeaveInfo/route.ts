import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 연차일 수: 직원관리에서 직접 입력한 값 우선, null이면 입사 1년 이상 6일/그 외 0일 */
function getAnnualLeaveDays(emp: Record<string, unknown> | null): number {
  if (!emp) return 0
  const directVal = emp.annual_leave_days ?? emp.annualLeaveDays
  if (directVal != null) {
    const direct = Number(directVal)
    if (!Number.isNaN(direct) && direct >= 0) return direct
  }
  const joinVal = emp.join_date ?? emp.joinDate
  if (joinVal == null || (typeof joinVal === 'string' && !joinVal.trim())) return 0
  const joinStr = toDateStr(joinVal)
  if (!joinStr) return 0
  const joinDate = new Date(joinStr + 'T12:00:00')
  if (isNaN(joinDate.getTime())) return 0
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  return joinDate <= oneYearAgo ? 6 : 0
}

/** ลากิจ(태국 개인사유휴가): 연 3일 고정 */
const LAKIJ_DAYS_PER_YEAR = 3

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()

  if (!store || !name) {
    return NextResponse.json(
      { history: [], stats: { usedAnn: 0, usedSick: 0, usedUnpaid: 0, usedLakij: 0, remain: 0, remainLakij: 0, annualTotal: 0, lakijTotal: 3 } },
      { headers }
    )
  }

  try {
    const empRows = (await supabaseSelectFilter(
      'employees',
      `store=ilike.${encodeURIComponent(store)}&name=ilike.${encodeURIComponent(name)}`,
      { limit: 1, select: 'annual_leave_days,join_date' }
    )) as { annual_leave_days?: number | null; join_date?: string | null }[]
    const annualTotal = getAnnualLeaveDays(empRows?.[0] ?? null)

    const filter = `store=ilike.${encodeURIComponent(store)}&name=ilike.${encodeURIComponent(name)}`
    const rows = (await supabaseSelectFilter(
      'leave_requests',
      filter,
      { order: 'leave_date.desc', limit: 100, select: 'id,leave_date,status,type,reason,certificate_url' }
    )) as { id?: number; leave_date?: string; status?: string; type?: string; reason?: string; certificate_url?: string }[]

    const thisYear = new Date().getFullYear()
    let usedAnn = 0,
      usedSick = 0,
      usedUnpaid = 0,
      usedLakij = 0
    const history = (rows || []).map((r) => {
      const dateStr = toDateStr(r.leave_date)
      const status = String(r.status || '').trim()
      const type = String(r.type || '').trim()
      if (
        (status === '승인' || status === 'Approved') &&
        dateStr &&
        parseInt(dateStr.slice(0, 4), 10) === thisYear
      ) {
        const val = type.indexOf('반차') !== -1 ? 0.5 : 1.0
        if (type.indexOf('무급휴가') !== -1 || type.toLowerCase().indexOf('unpaid') !== -1) {
          usedUnpaid += val
        } else if (type.indexOf('ลากิจ') !== -1 || type.toLowerCase().indexOf('lakij') !== -1) {
          usedLakij += val
        } else {
          if (type.indexOf('병가') !== -1) usedSick += val
          else usedAnn += val
        }
      }
      return { id: r.id, date: dateStr, type, reason: r.reason || '', status, certificateUrl: r.certificate_url || '' }
    })

    const remain = Math.max(0, annualTotal - usedAnn)
    const remainLakij = Math.max(0, LAKIJ_DAYS_PER_YEAR - usedLakij)
    return NextResponse.json(
      {
        history,
        stats: { usedAnn, usedSick, usedUnpaid, usedLakij, remain, remainLakij, annualTotal, lakijTotal: LAKIJ_DAYS_PER_YEAR },
      },
      { headers }
    )
  } catch (e) {
    console.error('getMyLeaveInfo:', e)
    return NextResponse.json(
      { history: [], stats: { usedAnn: 0, usedSick: 0, usedUnpaid: 0, usedLakij: 0, remain: 0, remainLakij: 0, annualTotal: 0, lakijTotal: 3 } },
      { headers }
    )
  }
}
