import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter, supabaseInsertMany } from '@/lib/supabase-server'
import {
  findStaffForScheduleSlotName,
  formatEmployeeDisplayName,
  normalizeEmployeeCodeForMatch,
  normalizeEmployeeNameFields,
  type StaffRowForScheduleMatch,
} from '@/lib/employee-display-name'

/** 타임존 영향 없이 로컬 날짜만 사용 (toISOString 시 UTC로 밀릴 수 있음 방지) */
function addDays(dateStr: string, days: number): string {
  const m = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return dateStr
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers })
  }

  try {
    const body = await request.json()
    const store = String(body?.store || body?.storeName || '').trim()
    const monday = String(body?.monday || body?.mondayStr || '').trim().slice(0, 10)
    const rows = Array.isArray(body?.rows || body?.scheduleArray) ? (body.rows || body.scheduleArray) : []

    if (!store || !monday) {
      return NextResponse.json(
        { success: false, message: '매장과 기준 월요일이 필요합니다.' },
        { headers }
      )
    }

    const startStr = monday
    const endStr = addDays(monday, 6)

    const existingFilter = `schedule_date=gte.${startStr}&schedule_date=lte.${endStr}&store_name=ilike.${encodeURIComponent(store)}`
    await supabaseDeleteByFilter('schedules', existingFilter)

    if (rows.length === 0) {
      return NextResponse.json(
        { success: true, message: `${store} 해당 주 시간표가 삭제되었습니다.` },
        { headers }
      )
    }

    type EmpRow = { id?: number; name?: string; nick?: string; name_title?: string; employee_code?: string | null }
    const empSelectCandidates = [
      'id,name,nick,name_title,employee_code',
      'id,name,nick,name_title',
      'id,name,nick',
      'id,name',
    ] as const
    let employeeRows: EmpRow[] = []
    for (const sel of empSelectCandidates) {
      try {
        employeeRows = (await supabaseSelectFilter('employees', `store=ilike.${encodeURIComponent(store)}`, {
          select: sel,
          limit: 5000,
          order: 'id.asc',
        })) as EmpRow[]
        break
      } catch {
        continue
      }
    }

    function toStaffLite(e: EmpRow): StaffRowForScheduleMatch {
      const rawName = String(e.name || '').trim()
      const rawTitle = String(e.name_title || '').trim()
      const { name: normName } = normalizeEmployeeNameFields(rawName, rawTitle)
      const nickVal = String(e.nick || normName || rawName).trim() || rawName
      return { name: normName || rawName, nick: nickVal }
    }

    const nameKeyToId = new Map<string, number>()
    const idByCode = new Map<string, number>()
    const roster: { id: number; lite: StaffRowForScheduleMatch }[] = []
    for (const e of employeeRows || []) {
      const idNum = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      if (idNum <= 0) continue
      const rawName = String(e.name || '').trim()
      const rawTitle = String(e.name_title || '').trim()
      const { name: normName } = normalizeEmployeeNameFields(rawName, rawTitle)
      const lite = toStaffLite(e)
      roster.push({ id: idNum, lite })
      const addNameKey = (k: string) => {
        const lo = String(k || '').trim().toLowerCase()
        if (!lo) return
        if (!nameKeyToId.has(lo)) nameKeyToId.set(lo, idNum)
      }
      addNameKey(rawName)
      addNameKey(normName)
      addNameKey(formatEmployeeDisplayName(normName, rawTitle))
      const nickOnly = String(e.nick || '').trim()
      if (nickOnly) addNameKey(nickOnly)
      const ck = normalizeEmployeeCodeForMatch(String(e.employee_code ?? ''))
      if (ck) idByCode.set(ck, idNum)
    }

    function resolveEmployeeId(slotName: string): number | null {
      const n = String(slotName || '').trim()
      if (!n) return null
      const lo = n.toLowerCase()
      if (nameKeyToId.has(lo)) return nameKeyToId.get(lo)!
      const ck = normalizeEmployeeCodeForMatch(n)
      if (ck && idByCode.has(ck)) return idByCode.get(ck)!
      const hit = findStaffForScheduleSlotName(
        roster.map((r) => r.lite),
        n
      )
      if (!hit) return null
      const row = roster.find((r) => r.lite.name === hit.name && r.lite.nick === hit.nick)
      return row ? row.id : null
    }

    // (schedule_date, store_name, name) 유니크: 한 직원은 같은 날 주방 또는 서비스 한 곳만 배정 가능
    const seen = new Map<string, string>()
    const duplicates: { name: string; date: string }[] = []
    for (const s of rows) {
      const dateStr = String(s.date || '').trim().slice(0, 10)
      if (!dateStr) continue
      const name = String(s.name || '').trim()
      if (!name) continue
      const key = `${dateStr}|${store}|${name}`
      const area = String(s.remark || s.memo || '').trim() || ''
      if (seen.has(key)) {
        const firstArea = seen.get(key) || ''
        if (!duplicates.some((d) => d.name === name && d.date === dateStr)) {
          duplicates.push({ name, date: dateStr })
        }
      } else {
        seen.set(key, area)
      }
    }
    if (duplicates.length > 0) {
      const namesList = [...new Set(duplicates.map((d) => d.name))].join(', ')
      return NextResponse.json(
        {
          success: false,
          message: 'schedule_dup_area',
          duplicateNames: namesList,
          duplicateCount: duplicates.length,
        },
        { headers }
      )
    }

    const toInsert: Record<string, unknown>[] = []
    for (const s of rows) {
      const dateStr = String(s.date || '').trim().slice(0, 10)
      if (!dateStr) continue
      const name = String(s.name || '').trim()
      if (!name) continue
      toInsert.push({
        schedule_date: dateStr,
        store_name: store,
        name,
        employee_id: resolveEmployeeId(name) || null,
        plan_in: String(s.pIn || s.plan_in || '09:00').trim(),
        plan_out: String(s.pOut || s.plan_out || '18:00').trim(),
        break_start: String(s.pBS || s.break_start || '').trim(),
        break_end: String(s.pBE || s.break_end || '').trim(),
        plan_in_prev_day: !!s.plan_in_prev_day,
        memo: String(s.remark || s.memo || '').trim() || '스마트스케줄러',
      })
    }

    if (toInsert.length > 0) {
      const CHUNK = 50
      for (let k = 0; k < toInsert.length; k += CHUNK) {
        const chunk = toInsert.slice(k, k + CHUNK)
        try {
          await supabaseInsertMany('schedules', chunk)
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (/employee_id|42703|column/i.test(em)) {
            const fallbackChunk = chunk.map((r) => {
              const { employee_id: _eid, ...rest } = r
              return rest
            })
            await supabaseInsertMany('schedules', fallbackChunk)
          } else {
            throw e
          }
        }
      }
    }

    return NextResponse.json(
      { success: true, message: `${store} 주간 시간표가 저장되었습니다!` },
      { headers }
    )
  } catch (e) {
    console.error('saveSchedule:', e)
    return NextResponse.json(
      {
        success: false,
        message: '저장 실패: ' + (e instanceof Error ? e.message : String(e)),
      },
      { headers }
    )
  }
}
