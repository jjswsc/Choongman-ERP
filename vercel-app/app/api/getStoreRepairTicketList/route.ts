import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokDateRangeUtc, getBangkokTodayDateString } from '@/lib/bangkok-time'

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

function subtractDaysBangkok(endYmd: string, days: number): string {
  const { dayStartUtcIso } = getBangkokDateRangeUtc(endYmd, endYmd)
  const t = new Date(dayStartUtcIso).getTime() - days * 86400000
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** 매장 수리·수선 신고 목록 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  let endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const storeFilter = searchParams.get('store')?.trim() || ''
  const statusFilter = searchParams.get('status')?.trim() || ''
  const categoryFilter = searchParams.get('category')?.trim() || ''
  const priorityFilter = searchParams.get('priority')?.trim() || ''
  const q = searchParams.get('q')?.trim() || ''

  if (!endStr) endStr = getBangkokTodayDateString()
  if (!startStr) startStr = subtractDaysBangkok(endStr, 90)

  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)

  const filters: string[] = [
    `reported_at=gte.${encodeURIComponent(dayStartUtcIso)}`,
    `reported_at=lt.${encodeURIComponent(nextDayStartUtcIso)}`,
  ]
  if (storeFilter && storeFilter !== 'All') filters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
  if (statusFilter) filters.push(`status=eq.${encodeURIComponent(statusFilter)}`)
  if (categoryFilter) filters.push(`category=eq.${encodeURIComponent(categoryFilter)}`)
  if (priorityFilter) filters.push(`priority=eq.${encodeURIComponent(priorityFilter)}`)

  const filterStr = filters.join('&')
  const qLow = q.replace(/[*(),]/g, ' ').trim().slice(0, 80).toLowerCase()

  try {
    let list = (await supabaseSelectFilter('store_repair_tickets', filterStr, {
      order: 'reported_at.desc,id.desc',
      limit: 3000,
    })) as {
      id?: number
      ticket_number?: string
      store_name?: string
      reporter?: string
      category?: string
      priority?: string
      area?: string
      title?: string
      description?: string
      photo_urls?: unknown
      status?: string
      handler?: string
      reported_at?: string
      started_at?: string
      completed_at?: string
      resolution_note?: string
      vendor_name?: string
      estimated_cost?: number | null
      actual_cost?: number | null
    }[]

    if (qLow) {
      list = (list || []).filter((d) => {
        const title = String(d.title || '').toLowerCase()
        const desc = String(d.description || '').toLowerCase()
        return title.includes(qLow) || desc.includes(qLow)
      })
    }

    const result = (list || []).map((d) => {
      const photos = parsePhotoUrls(d.photo_urls)
      return {
        row: d.id,
        id: d.id,
        ticketNumber: String(d.ticket_number || ''),
        store: String(d.store_name || ''),
        reporter: String(d.reporter || ''),
        category: String(d.category || ''),
        priority: String(d.priority || ''),
        area: String(d.area || ''),
        title: String(d.title || ''),
        description: String(d.description || ''),
        photoUrls: photos,
        status: String(d.status || ''),
        handler: String(d.handler || ''),
        reportedAt: d.reported_at ? String(d.reported_at) : '',
        startedAt: d.started_at ? String(d.started_at) : '',
        completedAt: d.completed_at ? String(d.completed_at) : '',
        resolutionNote: String(d.resolution_note || ''),
        vendorName: String(d.vendor_name || ''),
        estimatedCost: d.estimated_cost != null ? Number(d.estimated_cost) : null,
        actualCost: d.actual_cost != null ? Number(d.actual_cost) : null,
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error('getStoreRepairTicketList:', e)
    return NextResponse.json([], { status: 500 })
  }
}
