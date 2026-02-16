import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { parseOr400, requestLeaveSchema } from '@/lib/api-validate'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const d = body.d || body
    const bodyForValidation = {
      store: d.store || '',
      name: d.name || '',
      type: d.type || '',
      date: (d.date || d.leave_date || '').slice(0, 10),
      reason: d.reason,
    }
    const validated = parseOr400(requestLeaveSchema, bodyForValidation, headers)
    if (validated.errorResponse) return validated.errorResponse
    const { store, name, type, date: leaveDate, reason } = validated.parsed

    await supabaseInsert('leave_requests', {
      store,
      name,
      type: type.trim(),
      leave_date: leaveDate,
      reason: String(reason || '').trim(),
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
