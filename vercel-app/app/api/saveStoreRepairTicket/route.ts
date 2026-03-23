import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'

async function nextTicketNumber(): Promise<string> {
  const ymd = getBangkokTodayDateString()
  const prefix = ymd.replace(/-/g, '')
  const list = (await supabaseSelectFilter('store_repair_tickets', `ticket_number=like.${prefix}*`, {
    limit: 500,
    order: 'ticket_number.desc',
  })) as { ticket_number?: string }[]

  let max = 0
  for (const row of list || []) {
    const numCell = String(row.ticket_number || '')
    const m = /^(\d{8})-(\d{3})$/.exec(numCell)
    if (m && m[1] === prefix) {
      const seq = parseInt(m[2], 10)
      if (seq > max) max = seq
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

function normalizePhotoUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u || '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown
      if (Array.isArray(j)) return j.map((u) => String(u || '').trim()).filter(Boolean)
    } catch {
      if (raw.trim()) return [raw.trim()]
    }
  }
  return []
}

/** 매장 수리·수선 신고 저장 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body.dataStr ? JSON.parse(body.dataStr) : (body.data || body)

    const store = String(data.store || '').trim()
    if (!store) {
      return NextResponse.json({ success: false, message: '매장을 선택하세요.' }, { status: 400 })
    }

    const ticketNumber = await nextTicketNumber()
    const photoUrls = normalizePhotoUrls(data.photoUrls ?? data.photo_urls)

    await supabaseInsert('store_repair_tickets', {
      ticket_number: ticketNumber,
      store_name: store,
      reporter: String(data.reporter || '').trim(),
      category: String(data.category || '').trim(),
      priority: String(data.priority || '보통').trim(),
      area: String(data.area || '').trim(),
      title: String(data.title || '').trim(),
      description: String(data.description || '').trim(),
      photo_urls: photoUrls,
      status: String(data.status || '접수').trim(),
      handler: String(data.handler || '').trim(),
      resolution_note: String(data.resolutionNote || data.resolution_note || '').trim(),
      vendor_name: String(data.vendorName || data.vendor_name || '').trim(),
      estimated_cost: data.estimatedCost != null && data.estimatedCost !== '' ? Number(data.estimatedCost) : null,
      actual_cost: data.actualCost != null && data.actualCost !== '' ? Number(data.actualCost) : null,
    })

    return NextResponse.json({ success: true, message: '저장되었습니다.', ticketNumber })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('saveStoreRepairTicket:', msg)
    return NextResponse.json({ success: false, message: '저장 실패: ' + msg }, { status: 500 })
  }
}
