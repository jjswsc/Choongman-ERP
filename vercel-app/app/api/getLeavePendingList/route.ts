import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { assignLeaveRowToEmployeeForStats } from '@/lib/leave-request-utils'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 신청 시각 표시용 (Asia/Bangkok, 24h) — 짧은 통지 판단용 */
function formatRequestTimeBangkok(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = typeof val === 'string' ? new Date(val) : val
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function normEmployeeCode(c: string | null | undefined): string {
  return String(c ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5)
}

/** dateFilterType: 'request' = 신청일 기준, 'leave' = 휴가일 기준 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  let store = String(searchParams.get('store') || '').trim()
  const status = String(searchParams.get('status') || '대기').trim()
  const typeFilter = String(searchParams.get('type') || searchParams.get('typeFilter') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)
  const dateFilterType = String(searchParams.get('dateFilterType') || 'leave').trim() as 'request' | 'leave'

  if (store === 'undefined' || store === 'null') store = ''
  if (store === 'All') store = ''

  const isOfficeLevel = hasOfficeStaffScope(userRole, userStore)
  if (!isOfficeLevel) {
    if (!store) {
      store = String(allowedStores[0] || '').trim()
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, store))
      if (!allowed) {
        return NextResponse.json([], { status: 403, headers })
      }
    }
  }

  try {
    type LeaveReqDb = {
      id: number
      store?: string
      name?: string
      type?: string
      leave_date?: string
      request_at?: string
      created_at?: string
      reason?: string
      status?: string
      certificate_url?: string
      employee_id?: number | null
    }
    const selectWithEid =
      'id,store,name,type,leave_date,request_at,created_at,reason,status,certificate_url,employee_id'
    const selectLegacy =
      'id,store,name,type,leave_date,request_at,created_at,reason,status,certificate_url'

    let rows: LeaveReqDb[] = []
    try {
      if (store) {
        const filter = `store=ilike.${encodeURIComponent(store)}`
        rows = (await supabaseSelectFilter('leave_requests', filter, {
          order: 'leave_date.desc',
          limit: 500,
          select: selectWithEid,
        })) as LeaveReqDb[]
      } else {
        rows = (await supabaseSelect('leave_requests', {
          order: 'leave_date.desc',
          limit: 500,
          select: selectWithEid,
        })) as LeaveReqDb[]
      }
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/employee_id|42703|column/i.test(em)) throw e
      if (store) {
        const filter = `store=ilike.${encodeURIComponent(store)}`
        rows = (await supabaseSelectFilter('leave_requests', filter, {
          order: 'leave_date.desc',
          limit: 500,
          select: selectLegacy,
        })) as LeaveReqDb[]
      } else {
        rows = (await supabaseSelect('leave_requests', {
          order: 'leave_date.desc',
          limit: 500,
          select: selectLegacy,
        })) as LeaveReqDb[]
      }
    }

    const nickMap: Record<string, string> = {}
    const codeByStoreName: Record<string, string> = {}
    const codeByEmployeeId: Record<number, string> = {}
    const nickByEmployeeId: Record<number, string> = {}

    type EmpDb = {
      id?: number
      store?: string
      name?: string
      name_title?: string | null
      nick?: string
      employee_code?: string | null
    }

    const empSelectFull = 'id,store,name,name_title,nick,employee_code'
    const empSelectNoCode = 'id,store,name,name_title,nick'
    const empSelectNoTitle = 'id,store,name,nick,employee_code'
    const empSelectMinimal = 'id,store,name,nick'

    let empList: EmpDb[] = []
    const loadEmps = async (select: string): Promise<EmpDb[]> => {
      if (store) {
        const filter = `store=ilike.${encodeURIComponent(store)}`
        return (await supabaseSelectFilter('employees', filter, {
          order: 'id.asc',
          select,
          limit: 5000,
        })) as EmpDb[]
      }
      return (await supabaseSelect('employees', { order: 'id.asc', select, limit: 5000 })) as EmpDb[]
    }

    try {
      empList = await loadEmps(empSelectFull)
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (/name_title|42703|column/i.test(em)) {
        try {
          empList = await loadEmps(empSelectNoTitle)
        } catch (e2) {
          const em2 = e2 instanceof Error ? e2.message : String(e2)
          if (!/employee_code|42703|column/i.test(em2)) throw e2
          empList = await loadEmps(empSelectMinimal)
        }
      } else if (/employee_code|42703|column/i.test(em)) {
        try {
          empList = await loadEmps(empSelectNoCode)
        } catch (e2) {
          const em2 = e2 instanceof Error ? e2.message : String(e2)
          if (!/name_title|42703|column/i.test(em2)) throw e2
          empList = await loadEmps(empSelectMinimal)
        }
      } else {
        throw e
      }
    }

    for (const e of empList) {
      const s = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      if (s && n) nickMap[s + '|' + n] = String(e.nick || '').trim()
      const code = normEmployeeCode(e.employee_code)
      const eid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      if (eid > 0) {
        nickByEmployeeId[eid] = String(e.nick || '').trim()
        if (code) codeByEmployeeId[eid] = code
      }
      if (code && s && n) codeByStoreName[s + '|' + n] = code
    }

    const empRowsForAssign = empList.map((e) => ({
      id: e.id,
      store: e.store,
      name: e.name,
      name_title: e.name_title ?? null,
    }))

    const list: {
      id: number
      store: string
      name: string
      employeeCode: string
      nick: string
      type: string
      date: string
      requestDate: string
      requestTimeBangkok: string
      reason: string
      status: string
      certificateUrl: string
    }[] = []

    for (const r of rows || []) {
      const rowStatus = String(r.status || '').trim()
      if (status !== 'All' && status !== '전체' && rowStatus !== status) continue

      const rowType = String(r.type || '').trim()
      if (typeFilter && typeFilter !== 'All' && typeFilter !== '전체' && rowType !== typeFilter) continue

      const dateStr = toDateStr(r.leave_date)
      const rawReqAt = r.request_at || r.created_at
      const requestDateStr = toDateStr(rawReqAt)
      const requestTimeBangkok = formatRequestTimeBangkok(rawReqAt)

      const filterBy = dateFilterType === 'request' ? requestDateStr : dateStr
      if (startStr && filterBy < startStr) continue
      if (endStr && filterBy > endStr) continue

      const st = String(r.store || '').trim()
      const nm = String(r.name || '').trim()
      const eid = r.employee_id != null && Number.isFinite(Number(r.employee_id)) ? Math.floor(Number(r.employee_id)) : 0
      const codeFromId = eid > 0 ? codeByEmployeeId[eid] || '' : ''
      const codeFromName = st && nm ? codeByStoreName[st + '|' + nm] || '' : ''
      const matched = assignLeaveRowToEmployeeForStats(st, nm, r.employee_id, empRowsForAssign)
      const mid = matched?.id != null && Number.isFinite(Number(matched.id)) ? Math.floor(Number(matched.id)) : 0
      const codeFromMatch = mid > 0 ? codeByEmployeeId[mid] || '' : ''
      let employeeCode = (codeFromId || codeFromName || codeFromMatch).trim()
      // 직원은 매칭됐으나 employee_code 미입력 DB — 통계·승인 목록에서 식별용 (나중에 코드만 채우면 자동 대체)
      if (!employeeCode && mid > 0) employeeCode = `#${mid}`

      const nickExact = st && nm ? nickMap[st + '|' + nm] || '' : ''
      const nickFromMatch = mid > 0 ? nickByEmployeeId[mid] || '' : ''
      const nick = (nickFromMatch || nickExact).trim()

      list.push({
        id: r.id,
        store: st,
        name: nm,
        employeeCode,
        nick,
        type: String(r.type || '').trim(),
        date: dateStr,
        requestDate: requestDateStr,
        requestTimeBangkok,
        reason: String(r.reason || '').trim(),
        status: rowStatus,
        certificateUrl: String(r.certificate_url || '').trim(),
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getLeavePendingList:', e)
    return NextResponse.json([], { headers })
  }
}
