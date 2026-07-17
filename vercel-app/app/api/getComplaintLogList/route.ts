import { NextRequest, NextResponse } from 'next/server'
import { mapComplaintLogRowToDto, type ComplaintLogDbRow } from '@/lib/complaint-log-server'
import { escapeIlikePattern } from '@/lib/postgrest-ilike'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'

const OPEN_STATUSES = ['접수', '조사중', '보류'] as const

/** 컴플레인 일지 목록 조회 */
export async function GET(request: NextRequest) {
  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const storeFilter = searchParams.get('store')?.trim() || searchParams.get('storeFilter')?.trim() || ''
  const visitPath = searchParams.get('visitPath')?.trim() || ''
  const typeFilter = searchParams.get('typeFilter')?.trim() || ''
  const statusFilter = searchParams.get('statusFilter')?.trim() || ''
  const severityFilter = searchParams.get('severityFilter')?.trim() || ''
  const sourceChannel = searchParams.get('sourceChannel')?.trim() || ''
  const openOnly = searchParams.get('openOnly') === '1' || searchParams.get('openOnly') === 'true'
  const q = String(searchParams.get('q') || '').trim().slice(0, 80)
  const skipDate = searchParams.get('skipDate') === '1' || searchParams.get('skipDate') === 'true'

  const filters: string[] = []
  const tenantId = String(authRes.auth?.tenantId || '').trim()
  if (!isLegacyChoongmanErpSupabase()) {
    if (!tenantId) return NextResponse.json([], { status: 403 })
    filters.push(`tenant_id=eq.${encodeURIComponent(tenantId)}`)
  }
  if (!skipDate) {
    if (startStr) filters.push(`log_date=gte.${startStr}`)
    if (endStr) filters.push(`log_date=lte.${endStr}`)
  }
  if (storeFilter && storeFilter !== 'All') filters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
  if (visitPath) filters.push(`visit_path=eq.${encodeURIComponent(visitPath)}`)
  if (typeFilter) filters.push(`complaint_type=eq.${encodeURIComponent(typeFilter)}`)
  if (severityFilter) filters.push(`severity=eq.${encodeURIComponent(severityFilter)}`)
  if (openOnly) {
    filters.push(`status=in.(${OPEN_STATUSES.map((s) => encodeURIComponent(s)).join(',')})`)
  } else if (statusFilter) {
    filters.push(`status=eq.${encodeURIComponent(statusFilter)}`)
  }
  if (sourceChannel === '__empty__') {
    filters.push('source_channel=eq.')
  } else if (sourceChannel) {
    filters.push(`source_channel=eq.${encodeURIComponent(sourceChannel)}`)
  }
  if (q) {
    const pattern = encodeURIComponent(`%${escapeIlikePattern(q)}%`)
    filters.push(
      `or=(title.ilike.${pattern},customer.ilike.${pattern},content.ilike.${pattern},contact.ilike.${pattern},number.ilike.${pattern},menu.ilike.${pattern})`
    )
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
