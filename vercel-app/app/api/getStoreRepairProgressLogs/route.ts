import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function parsePhotoUrls(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((u) => String(u || '').trim()).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown
      if (Array.isArray(j)) return j.map((u) => String(u || '').trim()).filter(Boolean)
    } catch {
      return raw.trim() ? [raw.trim()] : []
    }
  }
  return []
}

/** 매장 수리 건 진행 로그 목록 (시간순 오래된 것 → 최신) */
export async function GET(request: NextRequest) {
  const ticketId = String(new URL(request.url).searchParams.get('ticketId') || '').trim()
  if (!ticketId || !/^\d+$/.test(ticketId)) {
    return NextResponse.json([], { status: 400 })
  }

  try {
    const rows = (await supabaseSelectFilter(
      'store_repair_progress_logs',
      `ticket_id=eq.${encodeURIComponent(ticketId)}`,
      { order: 'created_at.asc,id.asc', limit: 500 }
    )) as {
      id?: number
      ticket_id?: number
      author?: string
      note?: string
      photo_urls?: unknown
      created_at?: string
    }[]

    const result = (rows || []).map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      author: String(r.author || ''),
      note: String(r.note || ''),
      photoUrls: parsePhotoUrls(r.photo_urls),
      createdAt: r.created_at ? String(r.created_at) : '',
    }))

    return NextResponse.json(result)
  } catch (e) {
    console.error('getStoreRepairProgressLogs:', e)
    return NextResponse.json([], { status: 500 })
  }
}
