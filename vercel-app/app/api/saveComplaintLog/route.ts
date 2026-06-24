import { NextRequest, NextResponse } from 'next/server'
import { insertComplaintLog } from '@/lib/complaint-log-server'

/** 컴플레인 일지 신규 저장 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body.dataStr ? JSON.parse(body.dataStr) : (body.data || body)
    const dateStr = String(data.date || '').trim().slice(0, 10)

    await insertComplaintLog({
      date: dateStr,
      time: String(data.time || '').trim(),
      store: String(data.store || '').trim(),
      writer: String(data.writer || '').trim(),
      customer: String(data.customer || '').trim(),
      contact: String(data.contact || '').trim(),
      visitPath: String(data.visitPath || '').trim(),
      platform: String(data.platform || '').trim(),
      type: String(data.type || '').trim(),
      menu: String(data.menu || '').trim(),
      title: String(data.title || '').trim(),
      content: String(data.content || '').trim(),
      severity: String(data.severity || '').trim(),
      action: String(data.action || '').trim(),
      status: String(data.status || '접수').trim(),
      handler: String(data.handler || '').trim(),
      doneDate: (data.doneDate || '').toString().trim().slice(0, 10) || null,
      photoUrl: String(data.photoUrl || '').trim(),
      remark: String(data.remark || '').trim(),
      ...(String(data.sourceChannel || '').trim()
        ? { sourceChannel: String(data.sourceChannel || '').trim() }
        : {}),
      ...(data.memberId != null && Number(data.memberId) > 0 ? { memberId: Number(data.memberId) } : {}),
    })

    return NextResponse.json({ success: true, message: '저장되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('saveComplaintLog:', msg)
    return NextResponse.json({ success: false, message: '저장 실패: ' + msg }, { status: 500 })
  }
}
