import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function parseAreaFromMemo(memo: string | null | undefined): string {
  const m = String(memo || '').trim().toLowerCase()
  if (m.indexOf('kitchen') !== -1 || m.indexOf('주방') !== -1) return 'Kitchen'
  if (m.indexOf('office') !== -1 || m.indexOf('오피스') !== -1) return 'Office'
  if (m.indexOf('service') !== -1 || m.indexOf('서비스') !== -1) return 'Service'
  return 'Service'
}

function formatTime(v: string | null | undefined): string {
  if (v == null || (typeof v === 'string' && !v.trim())) return ''
  const s = String(v).trim()
  const match = s.match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (match) return ('0' + match[1]).slice(-2) + ':' + ('0' + match[2]).slice(-2)
  if (s.indexOf('T') !== -1) {
    const tPart = s.split('T')[1]
    if (tPart) {
      const m = tPart.match(/(\d{1,2}):(\d{2})/)
      if (m) return ('0' + m[1]).slice(-2) + ':' + m[2]
    }
  }
  return s.length >= 5 && s.charAt(2) === ':' ? s.substring(0, 5) : s
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
    type SchRow = { schedule_date?: string; store_name?: string; name?: string; plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; memo?: string }
    let scheduleRows: SchRow[] = []
    const dateFilter = `schedule_date=eq.${dateStr}`
    if (isAll) {
      scheduleRows = (await supabaseSelectFilter('schedules', dateFilter, { order: 'schedule_date.asc', limit: 100 })) as SchRow[]
    } else {
      const filter = `${dateFilter}&store_name=ilike.${encodeURIComponent(store)}`
      scheduleRows = (await supabaseSelectFilter('schedules', filter, { order: 'schedule_date.asc', limit: 100 })) as SchRow[]
    }

    const empList = (await supabaseSelect('employees', { order: 'id.asc', limit: 500 })) as { name?: string; nick?: string; store?: string }[]
    const nameToNick: Record<string, string> = {}
    for (const e of empList || []) {
      const nm = String(e.name || '').trim()
      if (nm) nameToNick[nm] = String(e.nick || e.name || nm).trim() || nm
    }

    const list = (scheduleRows || []).map((r) => {
      const area = parseAreaFromMemo(r.memo)
      return {
        date: toDateStr(r.schedule_date),
        store: String(r.store_name || '').trim(),
        name: String(r.name || '').trim(),
        nick: nameToNick[String(r.name || '').trim()] || String(r.name || '').trim(),
        pIn: formatTime(r.plan_in) || '09:00',
        pOut: formatTime(r.plan_out) || '18:00',
        pBS: formatTime(r.break_start),
        pBE: formatTime(r.break_end),
        area,
      }
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getTodaySchedule:', e)
    return NextResponse.json([], { headers })
  }
}
