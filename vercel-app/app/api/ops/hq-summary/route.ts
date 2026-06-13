import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokDateRangeUtc, getBangkokTodayDateString } from '@/lib/bangkok-time'

type StoreOpsScore = {
  storeCode: string
  printFailed: number
  printQueued: number
  closePending: number
  score: number
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { auth, errorResponse } = await requireAuth(req, 'any')
    if (errorResponse) return errorResponse

    if (!isOfficeRole(auth.role || '')) {
      return NextResponse.json(
        { success: false, message: '본사·오피스 권한이 필요합니다.' },
        { status: 403, headers }
      )
    }

    const qs = new URL(req.url).searchParams
    const ymd = String(qs.get('date') || getBangkokTodayDateString()).slice(0, 10)
    const limit = Math.min(20, Math.max(3, Number(qs.get('limit') || 8) || 8))
    const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(ymd, ymd)
    const dayRangeFilter = `created_at=gte.${encodeURIComponent(dayStartUtcIso)}&created_at=lt.${encodeURIComponent(nextDayStartUtcIso)}`

    const [printJobs, closeRuns] = await Promise.all([
      supabaseSelectFilter('pos_print_jobs', dayRangeFilter, {
        limit: 50000,
        select: 'store_code,status',
      }).catch(() => []) as Promise<{ store_code?: string; status?: string }[]>,
      supabaseSelectFilter(
        'pos_close_runs',
        `business_date=eq.${encodeURIComponent(ymd)}`,
        { limit: 5000, select: 'store_code,status' }
      ).catch(() => []) as Promise<{ store_code?: string; status?: string }[]>,
    ])

    const byStore = new Map<string, StoreOpsScore>()

    const ensure = (code: string): StoreOpsScore => {
      const key = String(code || '').trim()
      let row = byStore.get(key)
      if (!row) {
        row = { storeCode: key, printFailed: 0, printQueued: 0, closePending: 0, score: 0 }
        byStore.set(key, row)
      }
      return row
    }

    for (const j of printJobs || []) {
      const code = String(j.store_code || '').trim()
      if (!code) continue
      const row = ensure(code)
      const st = String(j.status || '')
      if (st === 'failed') row.printFailed += 1
      if (st === 'queued' || st === 'claimed') row.printQueued += 1
    }

    for (const r of closeRuns || []) {
      const code = String(r.store_code || '').trim()
      if (!code) continue
      if (['locked', 'posted'].includes(String(r.status || ''))) continue
      ensure(code).closePending += 1
    }

    const stores = [...byStore.values()]
      .map((s) => ({
        ...s,
        score: s.printFailed * 3 + (s.printQueued >= 20 ? 2 : 0) + s.closePending * 2,
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.printFailed - a.printFailed)
      .slice(0, limit)

    return NextResponse.json(
      {
        success: true,
        date: ymd,
        stores,
        generatedAt: new Date().toISOString(),
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 300) }, { headers })
  }
}
