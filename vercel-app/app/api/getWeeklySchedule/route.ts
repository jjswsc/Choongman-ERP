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

/** 월요일 날짜로 해당 주 일요일까지 구간 계산 */
function getWeekRange(mondayStr: string): { start: string; end: string } {
  const m = mondayStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return { start: '', end: '' }
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  const startDate = new Date(y, mo - 1, d)
  const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)
  const start = startDate.toISOString().slice(0, 10)
  const end = endDate.toISOString().slice(0, 10)
  return { start, end }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const mondayStr = String(searchParams.get('monday') || searchParams.get('weekMonday') || '').trim().slice(0, 10)
  const areaFilter = String(searchParams.get('area') || searchParams.get('areaFilter') || 'All').trim()

  if (!mondayStr || mondayStr.length < 10) {
    return NextResponse.json([], { headers })
  }

  const { start, end } = getWeekRange(mondayStr)
  if (!start || !end) {
    return NextResponse.json([], { headers })
  }

  try {
    const isAll = !store || store.toLowerCase() === 'all' || store === '전체' || store === '전체 매장'
    type SchRow = { schedule_date?: string; store_name?: string; name?: string; plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; memo?: string; plan_in_prev_day?: boolean }
    let scheduleRows: SchRow[] = []
    const dateFilter = `schedule_date=gte.${start}&schedule_date=lte.${end}`
    if (isAll) {
      scheduleRows = (await supabaseSelectFilter('schedules', dateFilter, { order: 'schedule_date.asc', limit: 500 })) as SchRow[]
    } else {
      const filter = `${dateFilter}&store_name=ilike.${encodeURIComponent(store)}`
      scheduleRows = (await supabaseSelectFilter('schedules', filter, { order: 'schedule_date.asc', limit: 500 })) as SchRow[]
    }

    const empList = (await supabaseSelect('employees', { order: 'id.asc', limit: 500, select: 'name,nick,store,job' })) as { name?: string; nick?: string; store?: string; job?: string }[]
    const nameToNick: Record<string, string> = {}
    const storeNameToJob: Record<string, string> = {}
    for (const e of empList || []) {
      const nm = String(e.name || '').trim()
      const st = String(e.store || '').trim()
      if (nm) {
        nameToNick[nm] = String(e.nick || e.name || nm).trim() || nm
        if (st) storeNameToJob[st + '|' + nm] = String(e.job || '').trim()
      }
    }

    const scheduleKeySet = new Set<string>()
    for (const r of scheduleRows || []) {
      const d = toDateStr(r.schedule_date)
      const st = String(r.store_name || '').trim()
      const nm = String(r.name || '').trim()
      if (d && st && nm) scheduleKeySet.add(`${d}|${st}|${nm}`)
    }

    // 승인된 휴가: schedules에 없고 leave에만 있는 (date, store, name) → 휴가 행 병합
    let leaveFilter = `leave_date=gte.${start}&leave_date=lte.${end}&status=eq.승인`
    if (!isAll && store) {
      leaveFilter += `&store=ilike.${encodeURIComponent(store)}`
    }
    const leaveRows = (await supabaseSelectFilter(
      'leave_requests',
      leaveFilter,
      { order: 'leave_date.asc', limit: 200, select: 'store,name,leave_date,type' }
    )) as { store?: string; name?: string; leave_date?: string; type?: string }[]
    const leaveMerged: { date: string; store: string; name: string; nick: string; pIn: string; pOut: string; pBS: string; pBE: string; area: string; plan_in_prev_day: boolean; leaveType?: string }[] = []
    for (const lr of leaveRows || []) {
      const date = toDateStr(lr.leave_date)
      const store = String(lr.store || '').trim()
      const name = String(lr.name || '').trim()
      const type = String(lr.type || '').trim() || '휴가'
      if (!date || !store || !name || date < start || date > end) continue
      const key = `${date}|${store}|${name}`
      if (scheduleKeySet.has(key)) continue // 이미 스케줄에 있으면 휴가 행 추가 안 함
      const area = parseAreaFromMemo(storeNameToJob[store + '|' + name] || '')
      leaveMerged.push({
        date,
        store,
        name,
        nick: nameToNick[name] || name,
        pIn: '09:00',
        pOut: '18:00',
        pBS: '',
        pBE: '',
        area: area || 'Service',
        plan_in_prev_day: false,
        leaveType: type,
      })
    }

    let list = (scheduleRows || []).map((r) => {
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
        plan_in_prev_day: !!r.plan_in_prev_day,
      }
    })

    list = [...list, ...leaveMerged]

    if (areaFilter && areaFilter.toLowerCase() !== 'all' && areaFilter !== '전체') {
      list = list.filter((r) => (r.area || 'Service') === areaFilter)
    }

    list.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      const an = (a as { leaveType?: string }).leaveType ? '휴가' : ''
      const bn = (b as { leaveType?: string }).leaveType ? '휴가' : ''
      if (an !== bn) return an < bn ? -1 : 1
      return (a.name || '').localeCompare(b.name || '')
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getWeeklySchedule:', e)
    return NextResponse.json([], { headers })
  }
}
