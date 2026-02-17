import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const id = String(body.id || '').trim()
    if (!id) {
      return NextResponse.json(
        { success: false, messageKey: 'workLogDeleteFail' },
        { headers }
      )
    }
    await supabaseDeleteByFilter('work_logs', `id=eq.${encodeURIComponent(id)}`)

    return NextResponse.json(
      { success: true, messageKey: 'workLogDeleteDone' },
      { headers }
    )
  } catch (e) {
    console.error('deleteWorkLogItem:', e)
    return NextResponse.json(
      { success: false, messageKey: 'workLogDeleteFail' },
      { headers }
    )
  }
}
