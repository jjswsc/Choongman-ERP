import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'

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

    const staffList = ((await supabaseSelect('employees', { order: 'id.asc', select: 'name,nick' })) || []) as { name?: string; nick?: string }[]
    let matchedFull = ''
    let matchedNick = ''
    const searchKey = String(name).toLowerCase().replace(/\s+/g, '')
    let matchIdx = -1
    // 1) 완전 일치 (employees.name 또는 employees.nick과 정확히 일치)
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
    // 2) 부분 일치 (닉네임 3자 이상만 - "Mo" 같은 짧은 닉 오매칭 방지)
    if (matchIdx < 0) {
      for (let k = 0; k < staffList.length; k++) {
        const fName = String(staffList[k].name || '').toLowerCase().replace(/\s+/g, '')
        const nName = String(staffList[k].nick || '').toLowerCase().replace(/\s+/g, '')
        const nickMatch = nName && nName.length >= 3 && searchKey.includes(nName)
        if (searchKey.includes(fName) || fName.includes(searchKey) || nickMatch) {
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
      status?: string
      content?: string
      progress?: number
      priority?: string
      manager_check?: string
      manager_comment?: string
    }
    const rowById = new Map<string, LogRowLite>()
    const mergeRows = async (key: string) => {
      if (!key) return
      const rr = (await supabaseSelectFilter(
        'work_logs',
        `name=eq.${encodeURIComponent(key)}`,
        { order: 'log_date.desc', limit: 2000 }
      )) as LogRowLite[] | null
      for (const r of rr || []) {
        const id = String((r as { id?: unknown }).id ?? '').trim()
        if (id && !rowById.has(id)) rowById.set(id, r)
      }
    }
    if (matchIdx >= 0) {
      if (matchedFull) await mergeRows(matchedFull)
      const nickOk =
        matchedNick &&
        matchedNick !== matchedFull &&
        nickIsUniqueAcrossStaff(staffList, matchedNick)
      if (nickOk) await mergeRows(matchedNick)
    } else if (name) {
      await mergeRows(String(name).trim())
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

    const finish: { id: string; content: string; progress: number; status: string; priority: string; managerCheck: string; managerComment: string }[] = []
    const continueItems: typeof finish = []
    const todayItems: typeof finish = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as { id: string; log_date: string | Date; name: string; content?: string; progress?: number; status?: string; priority?: string; manager_check?: string; manager_comment?: string }
      const rowDateStr = toDateStr(r.log_date)
      if (!rowDateStr || !acceptedNames.has(String(r.name ?? '').trim())) continue
      const item = { id: r.id, content: r.content || '', progress: Number(r.progress) || 0, status: String(r.status || ''), priority: r.priority || '', managerCheck: r.manager_check || '', managerComment: r.manager_comment || '' }
      if (rowDateStr === dateStr) {
        if (item.status === 'Finish' || item.progress >= 100) finish.push(item)
        else if (item.status === 'Continue') continueItems.push(item)
        else todayItems.push(item)
      }
    }

    const existingContent = continueItems.map((x) => x.content)
    for (let j = 0; j < rows.length; j++) {
      const r2 = rows[j] as { log_date: string | Date; name: string; status?: string; content?: string }
      const rowDateStr2 = toDateStr(r2.log_date)
      if (!acceptedNames.has(String(r2.name ?? '').trim()) || rowDateStr2 >= dateStr || String(r2.status) !== 'Continue')
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
