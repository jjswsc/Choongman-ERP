import { NextRequest, NextResponse } from 'next/server'
import { mapComplaintLogRowToDto, type ComplaintLogDbRow } from '@/lib/complaint-log-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 컴플레인 일지 목록 조회 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const storeFilter = searchParams.get('store')?.trim() || searchParams.get('storeFilter')?.trim() || ''
  const visitPath = searchParams.get('visitPath')?.trim() || ''
  const typeFilter = searchParams.get('typeFilter')?.trim() || ''
  const statusFilter = searchParams.get('statusFilter')?.trim() || ''
  const sourceChannel = searchParams.get('sourceChannel')?.trim() || ''

  const filters: string[] = []
  if (startStr) filters.push(`log_date=gte.${startStr}`)
  if (endStr) filters.push(`log_date=lte.${endStr}`)
  if (storeFilter && storeFilter !== 'All') filters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
  if (visitPath) filters.push(`visit_path=eq.${encodeURIComponent(visitPath)}`)
  if (typeFilter) filters.push(`complaint_type=eq.${encodeURIComponent(typeFilter)}`)
  if (statusFilter) filters.push(`status=eq.${encodeURIComponent(statusFilter)}`)
  if (sourceChannel === '__empty__') {
    filters.push('source_channel=eq.')
  } else if (sourceChannel) {
    filters.push(`source_channel=eq.${encodeURIComponent(sourceChannel)}`)
  }

  const filterStr = filters.length ? filters.join('&') : 'id=gt.0'

  try {
    const list = (await supabaseSelectFilter('complaint_logs', filterStr, {
      order: 'log_date.desc,id.desc',
      limit: 2000,
    })) as ComplaintLogDbRow[]

    const result = (list || []).map((d) => mapComplaintLogRowToDto(d))

    result.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    return NextResponse.json(result)
  } catch (e) {
    console.error('getComplaintLogList:', e)
    return NextResponse.json([], { status: 500 })
  }
}
