import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const dateStr = String(searchParams.get('date') || searchParams.get('dateStr') || '').trim().slice(0, 10)

  if (!dateStr || dateStr.length < 10) {
    return NextResponse.json([], { headers })
  }

  try {
    const isAll = !store || store.toLowerCase() === 'all' || store === '전체' || store === '전체 매장'
    type AttRow = { log_at?: string; store_name?: string; name?: string; log_type?: string; late_min?: number; early_min?: number; ot_min?: number; break_min?: number; status?: string; approved?: string; id?: number }
    let rows: AttRow[] = []
    if (isAll) {
      rows = (await supabaseSelect('attendance_logs', { order: 'log_at.desc', limit: 500 })) as AttRow[]
    } else {
      rows = (await supabaseSelectFilter('attendance_logs', `store_name=ilike.${encodeURIComponent(store)}`, { order: 'log_at.desc', limit: 300 })) as AttRow[]
    }
    const filtered = (rows || []).filter((r) => toDateStr(r.log_at) === dateStr)

    const byKey: Record<string, { store: string; name: string; inTime: string | null; outTime: string | null; lateMin: number; earlyMin: number; otMin: number; breakMin: number; status: string; approval: string; onlyIn: boolean }> = {}

    for (const r of filtered) {
      const rowDate = toDateStr(r.log_at)
      if (rowDate !== dateStr) continue
      const rowStore = String(r.store_name || '').trim()
      if (!isAll && rowStore.toLowerCase() !== store.toLowerCase()) continue
      const name = String(r.name || '').trim()
      const key = `${rowStore}|${name}`
      const type = String(r.log_type || '').trim()

      if (!byKey[key]) {
        byKey[key] = {
          store: rowStore,
          name,
          inTime: null,
          outTime: null,
          lateMin: 0,
          earlyMin: 0,
          otMin: 0,
          breakMin: 0,
          status: '',
          approval: '대기',
          onlyIn: false,
        }
      }
      const rec = byKey[key]
      const logAt = r.log_at || ''

      if (type === '출근') {
        if (!rec.inTime || (logAt && (!rec.inTime || logAt < rec.inTime))) {
          rec.inTime = logAt
          rec.lateMin = Number(r.late_min) || 0
        }
      } else if (type === '퇴근') {
        if (!rec.outTime || (logAt && (!rec.outTime || logAt > rec.outTime))) {
          rec.outTime = logAt
          rec.earlyMin = Number(r.early_min) || 0
          rec.otMin = Number(r.ot_min) || 0
          rec.status = String(r.status || '').trim() || rec.status
          rec.approval = String(r.approved || '').trim() || '대기'
        }
      } else if (type === '휴식종료') {
        rec.breakMin += Number(r.break_min) || 0
      }
    }

    const result = Object.values(byKey)
      .filter((r) => r.inTime != null)
      .map((r) => ({
        store: r.store,
        name: r.name,
        inTimeStr: r.inTime ? new Date(r.inTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '',
        outTimeStr: r.outTime ? new Date(r.outTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '미기록',
        lateMin: r.lateMin,
        status: r.outTime ? r.status : '퇴근미기록',
        onlyIn: !r.outTime,
      }))

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getTodayAttendanceSummary:', e)
    return NextResponse.json([], { headers })
  }
}
