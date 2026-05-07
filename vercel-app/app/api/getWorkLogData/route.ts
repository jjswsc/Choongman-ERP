import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'
import { resolveWorkLogEmployeeById } from '@/lib/work-log-name-server'

function toDateStr(v: string | Date | null): string {
  if (!v) return ''
  return typeof v === 'string' ? v.slice(0, 10) : String(v).slice(0, 10)
}

/** 동일 nick 을 여러 명이 쓰면 닉 레거시 조회로 섞임 → 풀네임만 허용 */
function nickIsUniqueAcrossStaff(
  staffList: { name?: string; nick?: string }[],
  nickRaw: string
): boolean {
  const nk = String(nickRaw || '')
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!nk) return false
  let hits = 0
  for (const e of staffList) {
    const nn = String(e.nick || '')
      .toLowerCase()
      .replace(/\s+/g, '')
    if (nn === nk) hits++
  }
  return hits === 1
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('dateStr') || searchParams.get('date') || ''
    const name = searchParams.get('name') || ''
    const employeeIdRaw = searchParams.get('employeeId') || searchParams.get('employee_id') || ''
    const parsedEmployeeId = Math.floor(Number(employeeIdRaw))
    const hasEmployeeId =
      String(employeeIdRaw).trim() !== '' && Number.isFinite(parsedEmployeeId) && parsedEmployeeId > 0

    const staffList = ((await supabaseSelect('employees', { order: 'id.asc', select: 'name,nick' })) || []) as { name?: string; nick?: string }[]
    let matchedFull = ''
    let matchedNick = ''
    const searchKey = String(name).toLowerCase().replace(/\s+/g, '')
    let matchIdx = -1

    const empFromId = hasEmployeeId ? await resolveWorkLogEmployeeById(parsedEmployeeId) : null
    if (empFromId) {
      matchIdx = 0
      matchedFull = empFromId.name
      matchedNick = empFromId.nick
    } else {
      for (let k = 0; k < staffList.length; k++) {
        const fName = String(staffList[k].name || '').toLowerCase().replace(/\s+/g, '')
        const nName = String(staffList[k].nick || '').toLowerCase().replace(/\s+/g, '')
        if (searchKey === fName || (nName && searchKey === nName)) {
          matchIdx = k
          matchedFull = workLogStoredNameFromEmployeeMaster(staffList[k].name)
          matchedNick = String(staffList[k].nick || '').trim()
          break
        }
      }
    }

    type LogRowLite = {
      id: string
      log_date?: string | Date
      name?: string
      employee_id?: number | null
      status?: string
      content?: string
      progress?: number
      priority?: string
      manager_check?: string
      manager_comment?: string
    }
    const rowById = new Map<string, LogRowLite>()
    const mergeRows = async (filter: string) => {
      const rr = (await supabaseSelectFilter('work_logs', filter, {
        order: 'log_date.desc',
        limit: 2000,
      })) as LogRowLite[] | null
      for (const r of rr || []) {
        const id = String((r as { id?: unknown }).id ?? '').trim()
        if (id && !rowById.has(id)) rowById.set(id, r)
      }
    }
    if (empFromId) {
      await mergeRows(`employee_id=eq.${empFromId.id}`)
    }
    if (matchIdx >= 0) {
      if (matchedFull) await mergeRows(`name=eq.${encodeURIComponent(matchedFull)}`)
      const nickOk =
        matchedNick &&
        matchedNick !== matchedFull &&
        nickIsUniqueAcrossStaff(staffList, matchedNick)
      if (nickOk) await mergeRows(`name=eq.${encodeURIComponent(matchedNick)}`)
    } else if (name) {
      await mergeRows(`name=eq.${encodeURIComponent(String(name).trim())}`)
    }
    const rows = Array.from(rowById.values()).sort(
      (a, b) => String(b.log_date || '').localeCompare(String(a.log_date || ''))
    )
    const acceptedNames = new Set<string>()
    if (matchedFull) acceptedNames.add(matchedFull)
    if (matchedNick && matchedNick !== matchedFull && nickIsUniqueAcrossStaff(staffList, matchedNick)) {
      acceptedNames.add(matchedNick)
    }
    if (!matchedFull && name) acceptedNames.add(String(name).trim())
    if (acceptedNames.size === 0 && (matchedFull || name))
      acceptedNames.add(matchedFull || String(name).trim())

    const primaryEmployeeId = empFromId ? empFromId.id : null

    const rowMatchesViewer = (r: { name?: string; employee_id?: number | null }) => {
      const rowName = String(r.name ?? '').trim()
      const reRaw = r.employee_id
      const rowEid = reRaw == null ? NaN : Math.floor(Number(reRaw))
      if (primaryEmployeeId != null) {
        if (Number.isFinite(rowEid) && rowEid === primaryEmployeeId) return true
        if ((!Number.isFinite(rowEid) || reRaw == null) && acceptedNames.has(rowName)) return true
        return false
      }
      return acceptedNames.has(rowName)
    }

    const finish: { id: string; content: string; progress: number; status: string; priority: string; managerCheck: string; managerComment: string }[] = []
    const continueItems: typeof finish = []
    const todayItems: typeof finish = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as {
        id: string
        log_date: string | Date
        name: string
        employee_id?: number | null
        content?: string
        progress?: number
        status?: string
        priority?: string
        manager_check?: string
        manager_comment?: string
      }
      const rowDateStr = toDateStr(r.log_date)
      if (!rowDateStr || !rowMatchesViewer(r)) continue
      const item = { id: r.id, content: r.content || '', progress: Number(r.progress) || 0, status: String(r.status || ''), priority: r.priority || '', managerCheck: r.manager_check || '', managerComment: r.manager_comment || '' }
      if (rowDateStr === dateStr) {
        if (item.status === 'Finish' || item.progress >= 100) finish.push(item)
        else if (item.status === 'Continue') continueItems.push(item)
        else todayItems.push(item)
      }
    }

    const existingContent = continueItems.map((x) => x.content)
    for (let j = 0; j < rows.length; j++) {
      const r2 = rows[j] as {
        log_date: string | Date
        name: string
        employee_id?: number | null
        status?: string
        content?: string
      }
      const rowDateStr2 = toDateStr(r2.log_date)
      if (!rowMatchesViewer(r2) || rowDateStr2 >= dateStr || String(r2.status) !== 'Continue')
        continue
      if (existingContent.indexOf(r2.content || '') !== -1) continue
      continueItems.push({
        id: (rows[j] as { id: string }).id,
        content: r2.content || '',
        progress: Number((rows[j] as { progress?: number }).progress) || 0,
        priority: (rows[j] as { priority?: string }).priority || '',
        status: 'Continue',
        managerCheck: '',
        managerComment: '⚡ 이월됨 (' + rowDateStr2 + ')',
      })
      existingContent.push(r2.content || '')
      if (continueItems.length >= 20) break
    }

    return NextResponse.json({ finish, continueItems, todayItems }, { headers })
  } catch (e) {
    console.error('getWorkLogData:', e)
    return NextResponse.json({ finish: [], continueItems: [], todayItems: [] }, { headers })
  }
}
