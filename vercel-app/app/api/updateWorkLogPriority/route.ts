import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate } from '@/lib/supabase-server'

/** 업무일지 중요도 변경 (관리자 승인 탭) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const id = String(body.id || '').trim()
    const priority = String(body.priority || '').trim()

    if (!id) {
      return NextResponse.json(
        { success: false, messageKey: 'workLogProcessError' },
        { status: 400, headers }
      )
    }

    await supabaseUpdate('work_logs', id, { priority })

    return NextResponse.json(
      { success: true, messageKey: 'workLogSaveDone' },
      { headers }
    )
  } catch (e) {
    console.error('updateWorkLogPriority:', e)
    return NextResponse.json(
      { success: false, messageKey: 'workLogSaveFail' },
      { headers }
    )
  }
}
