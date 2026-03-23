import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'

function normalizePhotoUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((u) => String(u || '').trim()).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown
      if (Array.isArray(j)) return j.map((u) => String(u || '').trim()).filter(Boolean)
    } catch {
      return [raw.trim()]
    }
  }
  return []
}

/** 수리 건 진행 로그 추가 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body.dataStr ? JSON.parse(body.dataStr) : (body.data || body)
    const ticketId = Number(data.ticketId ?? data.ticket_id)
    if (!ticketId || ticketId <= 0) {
      return NextResponse.json({ success: false, message: 'ticketId가 필요합니다.' }, { status: 400 })
    }

    const rows = (await supabaseSelectFilter('store_repair_tickets', `id=eq.${ticketId}`, { limit: 1 })) as {
      id?: number
    }[]
    if (!rows?.[0]) {
      return NextResponse.json({ success: false, message: '해당 티켓을 찾을 수 없습니다.' }, { status: 404 })
    }

    const note = String(data.note || '').trim()
    if (!note) {
      return NextResponse.json({ success: false, message: '진행 내용을 입력하세요.' }, { status: 400 })
    }

    const photoUrls = normalizePhotoUrls(data.photoUrls ?? data.photo_urls)

    await supabaseInsert('store_repair_progress_logs', {
      ticket_id: ticketId,
      author: String(data.author || '').trim(),
      note,
      photo_urls: photoUrls,
    })

    return NextResponse.json({ success: true, message: '진행 기록이 저장되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('addStoreRepairProgressLog:', msg)
    return NextResponse.json({ success: false, message: '저장 실패: ' + msg }, { status: 500 })
  }
}
