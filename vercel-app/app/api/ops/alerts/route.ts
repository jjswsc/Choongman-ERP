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

    const alerts: Array<{ code: string; severity: 'warning' | 'critical'; message: string }> = []

    const printJobs = (await supabaseSelectFilter(
      'pos_print_jobs',
      dayRangeFilter + (storeCode ? `&store_code=eq.${encodeURIComponent(storeCode)}` : ''),
      {
        limit: 20000,
        select: 'status',
      }
    ).catch(() => [])) as { status?: string }[] | null
    const failedPrint = (printJobs || []).filter((j) => String(j.status || '') === 'failed').length
    const queuedPrint = (printJobs || []).filter((j) => ['queued', 'claimed'].includes(String(j.status || ''))).length
    if (failedPrint > 0) {
      alerts.push({
        code: 'PRINT_FAILED',
        severity: failedPrint >= 10 ? 'critical' : 'warning',
        message: `주방/영수증 인쇄 실패 ${failedPrint}건`,
      })
    }
    if (queuedPrint >= 20) {
      alerts.push({
        code: 'PRINT_BACKLOG',
        severity: queuedPrint >= 50 ? 'critical' : 'warning',
        message: `인쇄 대기열 ${queuedPrint}건`,
      })
    }

    const closeRuns = (await supabaseSelectFilter(
      'pos_close_runs',
      `business_date=eq.${encodeURIComponent(ymd)}` + (storeCode ? `&store_code=eq.${encodeURIComponent(storeCode)}` : ''),
      {
        limit: 1000,
        select: 'status,store_code',
      }
    ).catch(() => [])) as { status?: string; store_code?: string }[] | null
    const notFinalized = (closeRuns || []).filter((r) => !['locked', 'posted'].includes(String(r.status || '')))
    if (notFinalized.length > 0) {
      alerts.push({
        code: 'CLOSE_PENDING',
        severity: 'warning',
        message: `일마감 검증/확정 대기 ${notFinalized.length}건`,
      })
    }

    return NextResponse.json(
      {
        success: true,
        date: ymd,
        storeCode: storeCode || '',
        alerts,
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 300) }, { headers })
  }
}
