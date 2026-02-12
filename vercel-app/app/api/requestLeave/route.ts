import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const d = body.d || body
    const store = String(d.store || '').trim()
    const name = String(d.name || '').trim()
    const leaveDate = String(d.date || d.leave_date || '').trim().slice(0, 10)

    if (!store || !name || !leaveDate) {
      return NextResponse.json(
        { success: false, message: '❌ 매장·이름·날짜가 필요합니다.' },
        { headers }
      )
    }

    await supabaseInsert('leave_requests', {
      store,
      name,
      type: String(d.type || '').trim(),
      leave_date: leaveDate,
      reason: String(d.reason || '').trim(),
      status: '대기',
    })
    return NextResponse.json(
      { success: true, message: '✅ 신청 완료' },
      { headers }
    )
  } catch (e) {
    console.error('requestLeave:', e)
    return NextResponse.json(
      {
        success: false,
        message: '❌ 신청 실패: ' + (e instanceof Error ? e.message : String(e)),
      },
      { headers }
    )
  }
}
