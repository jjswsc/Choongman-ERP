import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

/** 병가 진단서 업로드 - leave_requests.certificate_url 업데이트 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const id = Number(body.id) || 0
    const store = String(body.store || '').trim()
    const name = String(body.name || '').trim()
    const certificateUrl = body.certificateUrl || body.certificate_url ? String(body.certificateUrl || body.certificate_url).trim() : ''

    if (!id || id <= 0) {
      return NextResponse.json({ success: false, message: '휴가 신청 ID가 필요합니다.' }, { headers })
    }
    if (!certificateUrl) {
      return NextResponse.json({ success: false, message: '진단서 이미지가 필요합니다.' }, { headers })
    }
    if (!store || !name) {
      return NextResponse.json({ success: false, message: '매장·이름이 필요합니다.' }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'leave_requests',
      `id=eq.${id}`,
      { limit: 1 }
    )) as { id: number; store?: string; name?: string; type?: string; status?: string }[]

    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, message: '해당 휴가 신청을 찾을 수 없습니다.' }, { headers })
    }
    const rowStore = String(row.store || '').trim()
    const rowName = String(row.name || '').trim()
    if (rowStore !== store || rowName !== name) {
      return NextResponse.json({ success: false, message: '본인의 휴가 신청만 진단서를 업로드할 수 있습니다.' }, { headers })
    }
    const rowType = String(row.type || '').trim()
    if (rowType.indexOf('병가') === -1) {
      return NextResponse.json({ success: false, message: '병가 신청에만 진단서를 업로드할 수 있습니다.' }, { headers })
    }
    const rowStatus = String(row.status || '').trim()
    if (rowStatus !== '대기' && rowStatus !== 'Pending') {
      return NextResponse.json({ success: false, message: '승인 대기 중인 신청에만 업로드할 수 있습니다.' }, { headers })
    }

    await supabaseUpdate('leave_requests', id, { certificate_url: certificateUrl })
    return NextResponse.json({ success: true, message: '진단서가 업로드되었습니다.' }, { headers })
  } catch (e) {
    console.error('uploadLeaveCertificate:', e)
    return NextResponse.json(
      { success: false, message: '업로드 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
