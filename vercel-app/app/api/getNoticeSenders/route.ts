import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 공지 발송자 목록 (notices.sender 기준 distinct) - 기간 필터可选 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()

  try {
    let filter = ''
    if (startStr) filter += `created_at=gte.${startStr}`
    if (endStr) {
      const endPlus = endStr + 'T23:59:59'
      if (filter) filter += '&'
      filter += `created_at=lte.${endPlus}`
    }

    const effectiveFilter = filter || 'id=gte.0'
    const rows = (await supabaseSelectFilter('notices', effectiveFilter, {
      select: 'sender',
      order: 'created_at.desc',
      limit: 500,
    })) as { sender?: string }[]

    const set = new Set<string>()
    for (const r of rows || []) {
      const s = String(r?.sender || '').trim()
      if (s) set.add(s)
    }
    const senders = Array.from(set).sort((a, b) => a.localeCompare(b))
    return NextResponse.json({ senders }, { headers })
  } catch (e) {
    console.error('getNoticeSenders:', e)
    return NextResponse.json({ senders: [] }, { headers })
  }
}
