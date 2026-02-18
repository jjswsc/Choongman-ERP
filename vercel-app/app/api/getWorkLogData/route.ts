import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(v: string | Date | null): string {
  if (!v) return ''
  return typeof v === 'string' ? v.slice(0, 10) : String(v).slice(0, 10)
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('dateStr') || searchParams.get('date') || ''
    const name = searchParams.get('name') || ''

    const staffList = ((await supabaseSelect('employees', { order: 'id.asc', select: 'name,nick' })) || []) as { name?: string; nick?: string }[]
    let targetName = name
    const searchKey = String(name).toLowerCase().replace(/\s+/g, '')
    for (let k = 0; k < staffList.length; k++) {
      const fName = String(staffList[k].name || '').toLowerCase().replace(/\s+/g, '')
      const nName = String(staffList[k].nick || '').toLowerCase().replace(/\s+/g, '')
      if (searchKey.includes(fName) || fName.includes(searchKey) || (nName && searchKey.includes(nName))) {
        targetName = (staffList[k].nick && String(staffList[k].nick).trim()) ? staffList[k].nick! : staffList[k].name!
        break
      }
    }

    const rows = (await supabaseSelectFilter('work_logs', `name=eq.${encodeURIComponent(targetName)}`, { order: 'log_date.desc' })) || []

    const finish: { id: string; content: string; progress: number; status: string; priority: string; managerCheck: string; managerComment: string }[] = []
    const continueItems: typeof finish = []
    const todayItems: typeof finish = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as { id: string; log_date: string | Date; name: string; content?: string; progress?: number; status?: string; priority?: string; manager_check?: string; manager_comment?: string }
      const rowDateStr = toDateStr(r.log_date)
      if (!rowDateStr || String(r.name) !== String(targetName)) continue
      const item = { id: r.id, content: r.content || '', progress: Number(r.progress) || 0, status: String(r.status || ''), priority: r.priority || '', managerCheck: r.manager_check || '', managerComment: r.manager_comment || '' }
      if (rowDateStr === dateStr) {
        if (item.status === 'Finish' || item.progress >= 100) finish.push(item)
        else if (item.status === 'Continue') continueItems.push(item)
        else todayItems.push(item)
      }
    }

    let existingContent = continueItems.map((x) => x.content)
    for (let j = 0; j < rows.length; j++) {
      const r2 = rows[j] as { log_date: string | Date; name: string; status?: string; content?: string }
      const rowDateStr2 = toDateStr(r2.log_date)
      if (String(r2.name) !== String(targetName) || rowDateStr2 >= dateStr || String(r2.status) !== 'Continue') continue
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
