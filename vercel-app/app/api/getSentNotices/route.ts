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

  if (!sender) {
    return NextResponse.json([], { headers })
  }

  try {
    let filter = `sender=ilike.${encodeURIComponent(sender)}`
    if (startStr) filter += `&created_at=gte.${startStr}`
    if (endStr) {
      const endPlus = endStr + 'T23:59:59'
      filter += `&created_at=lte.${endPlus}`
    }

    const rows = (await supabaseSelectFilter('notices', filter, {
      order: 'created_at.desc',
      limit: 200,
    })) as {
      id: number
      title?: string
      content?: string
      target_store?: string
      target_role?: string
      created_at?: string
    }[]

    const empList = (await supabaseSelect('employees', { order: 'id.asc' })) as {
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
      title: string
      date: string
      recipients: string[]
      preview: string
      readCount: number
      totalCount: number
    }[] = []

    for (const row of rows || []) {
      const targetStores = String(row.target_store || '전체').trim()
      const targetRoles = String(row.target_role || '전체').trim()
      const roleList = targetRoles
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
        if (!eStore || eStore === '매장명') continue
        const eRole = (String(e.job || e.role || '').trim() || 'Staff').toLowerCase()
        const storeMatch = targetStores === '전체' || targetStores.split(',').map((s) => s.trim()).includes(eStore)
        const roleMatch = roleList.length === 0 || roleList.some((r) => eRole === r || eRole.indexOf(r) >= 0 || r.indexOf(eRole) >= 0)
        if (storeMatch && roleMatch) {
          totalCount += 1
          recipientSet.add(eStore)
        }
      }

      const readCount = readCountByNotice[row.id] || 0

      const recipients = Array.from(recipientSet).sort()
      if (targetStores !== '전체' && recipients.length === 0) {
        recipients.push(...targetStores.split(',').map((s) => s.trim()).filter(Boolean))
      }
      if (recipients.length === 0) recipients.push('전체')

      list.push({
        id: String(row.id),
        title: row.title || '',
        date: toDateStr(row.created_at),
        recipients,
        preview: (row.content || '').slice(0, 100),
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
