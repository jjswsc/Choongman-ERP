import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const id = String(body.id || '').trim()
    const status = String(body.status || '').trim()
    const comment =
      body.comment != null ? String(body.comment).trim() : undefined

    const patch: Record<string, string> = { manager_check: status }
    if (comment != null) patch.manager_comment = comment

    await supabaseUpdate('work_logs', id, patch)

    return NextResponse.json(
      { success: true, message: 'UPDATED' },
      { headers }
    )
  } catch (e) {
    console.error('updateManagerCheck:', e)
    return NextResponse.json(
      { success: false, message: 'ERROR' },
      { headers }
    )
  }
}
