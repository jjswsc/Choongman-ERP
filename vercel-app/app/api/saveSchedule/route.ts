import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter, supabaseInsertMany } from '@/lib/supabase-server'
import { normalizeEmployeeCodeForMatch } from '@/lib/employee-display-name'
import {
  buildScheduleEmployeeRoster,
  findScheduleSaveDuplicates,
  resolveScheduleSavePayloadFromSlot,
  type ScheduleEmployeeRowInput,
} from '@/lib/schedule-employee-slot'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'

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

    const auth = await tryVerifyBearerFromRequest(request)
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: store,
    })
    const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
      tableHint: 'schedules',
      label: '스케줄',
    })
    if (tenantWriteErr) {
      return NextResponse.json({ success: false, message: tenantWriteErr }, { status: 403, headers })
    }

    const startStr = monday
    const endStr = addDays(monday, 6)

    const empSelectCandidates = [
      'id,name,nick,name_title,employee_code',
      'id,name,nick,name_title',
      'id,name,nick',
      'id,name',
    ] as const
    let employeeRows: ScheduleEmployeeRowInput[] = []
    for (const sel of empSelectCandidates) {
      try {
        employeeRows = (await supabaseSelectFilter('employees', `store=ilike.${encodeURIComponent(store)}`, {
          select: sel,
          limit: 5000,
          order: 'id.asc',
        })) as ScheduleEmployeeRowInput[]
        break
      } catch {
        continue
      }
    }

    const roster = buildScheduleEmployeeRoster(employeeRows)

    // 반드시 DELETE 전에 검증 — 예전이면 중복 오류 시에도 해당 주 시간표가 먼저 지워짐
    if (rows.length > 0) {
      const duplicates = findScheduleSaveDuplicates(rows, roster)
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
    }

    const existingFilter = appendSaasTenantFilter(
      `schedule_date=gte.${startStr}&schedule_date=lte.${endStr}&store_name=ilike.${encodeURIComponent(store)}`,
      tenantScope,
      'schedules'
    )
    await supabaseDeleteByFilter('schedules', existingFilter)

    if (rows.length === 0) {
      return NextResponse.json(
        { success: true, message: `${store} 해당 주 시간표가 삭제되었습니다.` },
        { headers }
      )
    }

    const toInsert: Record<string, unknown>[] = []
    for (const s of rows) {
      const dateStr = String(s.date || '').trim().slice(0, 10)
      if (!dateStr) continue
      const slotKey = String(s.employeeCode || s.name || '').trim()
      if (!slotKey) continue
      const resolved = resolveScheduleSavePayloadFromSlot(slotKey, roster)
      const name = resolved.name || slotKey
      const employeeCode =
        resolved.employeeCode || normalizeEmployeeCodeForMatch(String(s.employeeCode ?? ''))
      toInsert.push({
        schedule_date: dateStr,
        store_name: store,
        name,
        employee_id: resolved.employeeId,
        ...(employeeCode ? { employee_code: employeeCode } : {}),
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
        const chunk = toInsert.slice(k, k + CHUNK).map((r) =>
          stampSaasTenantId(r, tenantScope, 'schedules')
        )
        let payload = chunk
        for (;;) {
          try {
            await supabaseInsertMany('schedules', payload)
            break
          } catch (e) {
            const em = e instanceof Error ? e.message : String(e)
            if (isMissingSaasTenantColumnError(e) && payload.some((r) => 'tenant_id' in r)) {
              markSaasTenantColumnMissing('schedules')
              payload = payload.map((r) => {
                const { tenant_id: _t, ...rest } = r
                return rest
              })
              continue
            }
            if (/employee_code|42703|column/i.test(em) && payload.some((r) => 'employee_code' in r)) {
              payload = payload.map((r) => {
                const { employee_code: _c, ...rest } = r
                return rest
              })
              continue
            }
            if (/employee_id|42703|column/i.test(em) && payload.some((r) => 'employee_id' in r)) {
              payload = payload.map((r) => {
                const { employee_id: _eid, ...rest } = r
                return rest
              })
              continue
            }
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
