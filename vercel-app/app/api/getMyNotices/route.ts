import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export interface NoticeItem {
  id: number
  date: string
  title: string
  content: string
  sender: string
  status: string
  attachments: unknown[]
}

async function getMyNoticesHandler(store: string, name: string): Promise<NoticeItem[]> {
  let myJob = ''
  const empList = (await supabaseSelect('employees', { order: 'id.asc' })) as { store?: string; name?: string; job?: string; role?: string }[] || []
  for (let i = 0; i < empList.length; i++) {
    const s = String(empList[i].store || '').trim()
    const n = String(empList[i].name || '').trim()
    if (s === store && n === name) {
      myJob = String(empList[i].job || empList[i].role || '').trim()
      break
    }
  }

  const readMap: Record<number, string> = {}
  try {
    const filter = `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`
    const readRows = (await supabaseSelectFilter('notice_reads', filter)) as { notice_id: number; status?: string }[] || []
    for (let i = 0; i < readRows.length; i++) {
      readMap[readRows[i].notice_id] = readRows[i].status || '확인'
    }
  } catch {
    /* ignore */
  }

  const list: NoticeItem[] = []
  const rows = (await supabaseSelect('notices', { order: 'created_at.desc' })) as {
    id: number
    title?: string
    content?: string
    sender?: string
    target_store?: string
    target_role?: string
    target_recipients?: string | null
    created_at?: string
    attachments?: string
  }[] || []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const recipientsRaw = row.target_recipients
    if (recipientsRaw) {
      try {
        const recipients = JSON.parse(recipientsRaw) as string[]
        if (Array.isArray(recipients) && recipients.length > 0) {
          const myKey = `${store}|${name}`
          if (!recipients.includes(myKey)) continue
        }
      } catch {
        /* fall through to store/role match */
      }
    } else {
      const targetStores = String(row.target_store || '전체').trim()
      const targetJobs = String(row.target_role || '전체').trim()
      const storeMatch = targetStores === '전체' || targetStores.indexOf(store) > -1
      const jobList = String(targetJobs || '전체').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      const jobMatch = !targetJobs || targetJobs.trim() === '전체' || jobList.length === 0 || (myJob && jobList.indexOf(myJob.toLowerCase()) >= 0)
      if (!storeMatch || !jobMatch) continue
    }

    let att: unknown[] = []
    if (row.attachments) {
      try {
        att = JSON.parse(row.attachments) as unknown[]
      } catch {
        /* ignore */
      }
    }
    const created = row.created_at ? (typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString()) : ''
    const dateStr = created ? created.slice(0, 10) : ''
    list.push({
      id: row.id,
      date: dateStr,
      title: row.title || '',
      content: row.content || '',
      sender: row.sender || '',
      status: readMap[row.id] || 'New',
      attachments: att,
    })
  }

  return list
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const name = String(searchParams.get('name') || '').trim()

  if (!store || !name) {
    return NextResponse.json([], { headers })
  }

  try {
    const list = await getMyNoticesHandler(store, name)
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getMyNotices:', e)
    return NextResponse.json([], { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const store = String(body?.store || '').trim()
    const name = String(body?.name || '').trim()

    if (!store || !name) {
      return NextResponse.json([], { headers })
    }

    const list = await getMyNoticesHandler(store, name)
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getMyNotices:', e)
    return NextResponse.json([], { headers })
  }
}
