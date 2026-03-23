import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'

function lastNYearMonths(n: number): string[] {
  const end = getBangkokTodayDateString()
  const y = Number(end.slice(0, 4))
  const m = Number(end.slice(5, 7))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    let yy = y
    let mm = m - i
    while (mm < 1) {
      mm += 12
      yy -= 1
    }
    out.push(`${yy}-${String(mm).padStart(2, '0')}`)
  }
  return out
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const months = lastNYearMonths(36)
    const rows = (await supabaseSelect('accounting_periods', {
      select: 'year_month,is_closed,closed_at,closed_by',
      limit: 500,
      order: 'year_month.desc',
    })) as { year_month?: string; is_closed?: boolean; closed_at?: string | null; closed_by?: string | null }[] | null

    const byMonth: Record<string, { is_closed: boolean; closed_at: string | null; closed_by: string | null }> = {}
    for (const r of rows || []) {
      const ym = String(r.year_month || '').slice(0, 7)
      if (!ym) continue
      byMonth[ym] = {
        is_closed: Boolean(r.is_closed),
        closed_at: r.closed_at != null ? String(r.closed_at) : null,
        closed_by: r.closed_by != null ? String(r.closed_by) : null,
      }
    }

    const list = months.map((yearMonth) => ({
      yearMonth,
      isClosed: byMonth[yearMonth]?.is_closed ?? false,
      closedAt: byMonth[yearMonth]?.closed_at ?? null,
      closedBy: byMonth[yearMonth]?.closed_by ?? null,
    }))

    return NextResponse.json({ periods: list }, { headers })
  } catch (e) {
    console.error('getAccountingPeriods:', e)
    const months = lastNYearMonths(36)
    return NextResponse.json(
      {
        periods: months.map((yearMonth) => ({
          yearMonth,
          isClosed: false,
          closedAt: null,
          closedBy: null,
        })),
      },
      { headers }
    )
  }
}
