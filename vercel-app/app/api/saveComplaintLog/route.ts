import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'

async function nextComplaintNumber(dateStr: string): Promise<string> {
  const base = (dateStr || '').replace(/-/g, '')
  if (base.length !== 8) return base + '-001'
  const list = (await supabaseSelectFilter('complaint_logs', `log_date=eq.${dateStr}`, { limit: 500 })) as { number?: string }[]
  let max = 0
  for (const row of list || []) {
    const numCell = String(row.number || '')
    if (/^\d{8}-\d{3}$/.test(numCell)) {
      const seq = parseInt(numCell.split('-')[1], 10)
      if (seq > max) max = seq
    }
  }
  return base + '-' + String(max + 1).padStart(3, '0')
}

/** 컴플레인 일지 신규 저장 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body.dataStr ? JSON.parse(body.dataStr) : (body.data || body)
    const dateStr = String(data.date || '').trim().slice(0, 10)
    const num = await nextComplaintNumber(dateStr)

    await supabaseInsert('complaint_logs', {
      number: num,
      log_date: dateStr && dateStr.length >= 10 ? dateStr : null,
      log_time: String(data.time || '').trim(),
      store_name: String(data.store || '').trim(),
      writer: String(data.writer || '').trim(),
      customer: String(data.customer || '').trim(),
      contact: String(data.contact || '').trim(),
      visit_path: String(data.visitPath || '').trim(),
      platform: String(data.platform || '').trim(),
      complaint_type: String(data.type || '').trim(),
      menu: String(data.menu || '').trim(),
      title: String(data.title || '').trim(),
      content: String(data.content || '').trim(),
      severity: String(data.severity || '').trim(),
      action: String(data.action || '').trim(),
      status: String(data.status || '접수').trim(),
      handler: String(data.handler || '').trim(),
      done_date: (data.doneDate || '').toString().trim().slice(0, 10) || null,
      photo_url: String(data.photoUrl || '').trim(),
      remark: String(data.remark || '').trim(),
    })

    return NextResponse.json({ success: true, message: '저장되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('saveComplaintLog:', msg)
    return NextResponse.json({ success: false, message: '저장 실패: ' + msg }, { status: 500 })
  }
}
