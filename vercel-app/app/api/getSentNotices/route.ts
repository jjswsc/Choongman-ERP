import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 16).replace('T', ' ')
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16).replace('T', ' ')
}

/** 발송한 공지 목록 (sender 기준, 날짜 필터) - readCount/totalCount 포함 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const { searchParams } = new URL(request.url)
  const sender = String(searchParams.get('sender') || '').trim()
  const startStr = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = (searchParams.get('userRole') || '').toLowerCase()

  const isAllSenders = sender === '' || sender.toLowerCase() === 'all' || sender === '전체'

  try {
    let filter = isAllSenders ? '' : `sender=ilike.${encodeURIComponent(sender)}`
    if (startStr) filter += (filter ? '&' : '') + `created_at=gte.${startStr}`
    if (endStr) {
      const endPlus = endStr + 'T23:59:59'
      filter += (filter ? '&' : '') + `created_at=lte.${endPlus}`
    }
    const effectiveFilter = filter || 'id=gte.0'

    const rows = (await supabaseSelectFilter('notices', effectiveFilter, {
      order: 'created_at.desc',
      limit: 200,
    })) as {
      id: number
      sender?: string
      title?: string
      content?: string
      target_store?: string
      target_role?: string
      created_at?: string
    }[]

    const empList = (await supabaseSelect('employees', { order: 'id.asc', select: 'store,name,job,role' })) as {
      store?: string
      name?: string
      job?: string
      role?: string
      resign_date?: string
    }[] || []

    const noticeIds = (rows || []).map((r) => r.id)
    const readCountByNotice: Record<number, number> = {}
    if (noticeIds.length > 0) {
      const allReadRows = (await supabaseSelectFilter(
        'notice_reads',
        `notice_id=in.(${noticeIds.join(',')})`,
        { limit: 5000 }
      )) as { notice_id: number }[] || []
      for (const r of allReadRows) {
        readCountByNotice[r.notice_id] = (readCountByNotice[r.notice_id] || 0) + 1
      }
    }

    const list: {
      id: string
      sender: string
      title: string
      date: string
      recipients: string[]
      preview: string
      content: string
      readCount: number
      totalCount: number
    }[] = []

    for (const row of rows || []) {
      const targetStores = String(row.target_store || '전체').trim()
      const targetRoles = String(row.target_role || '전체').trim()
      const isAllStores = targetStores === '전체' || targetStores.trim() === ''
      const isAllRoles = targetRoles === '전체' || targetRoles.trim() === ''
      const roleList = isAllRoles
        ? []
        : targetRoles
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)

      let totalCount = 0
      const recipientSet = new Set<string>()
      for (const e of empList) {
        const eStore = String(e.store || '').trim()
        const eName = String(e.name || '').trim()
        const resignDate = String(e.resign_date || '').trim()
        if (!eName || (resignDate && resignDate !== '')) continue
        if (!eStore || eStore === '매장명' || eStore === 'Store') continue
        const eRole = (String(e.job || e.role || '').trim() || 'Staff').toLowerCase()
        const storeMatch = isAllStores || targetStores.split(',').map((s) => s.trim()).includes(eStore)
        const roleMatch = isAllRoles || roleList.length === 0 || roleList.some((r) => eRole === r || eRole.indexOf(r) >= 0 || r.indexOf(eRole) >= 0)
        if (storeMatch && roleMatch) {
          totalCount += 1
          recipientSet.add(eStore)
        }
      }

      const readCount = readCountByNotice[row.id] || 0

      let recipients: string[]
      if (isAllStores) {
        recipients = ['전체']
      } else {
        recipients = Array.from(recipientSet).sort()
        if (recipients.length === 0) {
          recipients = targetStores.split(',').map((s) => s.trim()).filter(Boolean)
        }
        if (recipients.length === 0) recipients = ['전체']
      }

      list.push({
        id: String(row.id),
        sender: String(row.sender || '').trim(),
        title: row.title || '',
        date: toDateStr(row.created_at),
        recipients,
        preview: (row.content || '').slice(0, 100),
        content: row.content || '',
        readCount,
        totalCount,
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getSentNotices:', e)
    return NextResponse.json([], { headers })
  }
}
