import { NextRequest, NextResponse } from 'next/server'
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

  const filters: string[] = []
  if (startStr) filters.push(`log_date=gte.${startStr}`)
  if (endStr) filters.push(`log_date=lte.${endStr}`)
  if (storeFilter && storeFilter !== 'All') filters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
  if (visitPath) filters.push(`visit_path=eq.${encodeURIComponent(visitPath)}`)
  if (typeFilter) filters.push(`complaint_type=eq.${encodeURIComponent(typeFilter)}`)
  if (statusFilter) filters.push(`status=eq.${encodeURIComponent(statusFilter)}`)

  const filterStr = filters.length ? filters.join('&') : 'id=gt.0'

  try {
    const list = (await supabaseSelectFilter('complaint_logs', filterStr, {
      order: 'log_date.desc,id.desc',
      limit: 2000,
    })) as {
      id?: number
      number?: string
      log_date?: string
      log_time?: string
      store_name?: string
      writer?: string
      customer?: string
      contact?: string
      visit_path?: string
      platform?: string
      complaint_type?: string
      menu?: string
      title?: string
      content?: string
      severity?: string
      action?: string
      status?: string
      handler?: string
      done_date?: string
      photo_url?: string
      remark?: string
    }[]

    const result = (list || []).map((d) => ({
      row: d.id,
      id: d.id,
      number: String(d.number || ''),
      date: d.log_date ? String(d.log_date).slice(0, 10) : '',
      time: String(d.log_time || ''),
      store: String(d.store_name || ''),
      writer: String(d.writer || ''),
      customer: String(d.customer || ''),
      contact: String(d.contact || ''),
      visitPath: String(d.visit_path || ''),
      platform: String(d.platform || ''),
      type: String(d.complaint_type || ''),
      menu: String(d.menu || ''),
      title: String(d.title || ''),
      content: String(d.content || ''),
      severity: String(d.severity || ''),
      action: String(d.action || ''),
      status: String(d.status || ''),
      handler: String(d.handler || ''),
      doneDate: d.done_date ? String(d.done_date).slice(0, 10) : '',
      photoUrl: String(d.photo_url || ''),
      remark: String(d.remark || ''),
    }))

    result.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    return NextResponse.json(result)
  } catch (e) {
    console.error('getComplaintLogList:', e)
    return NextResponse.json([], { status: 500 })
  }
}
