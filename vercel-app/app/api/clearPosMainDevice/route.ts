import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** 관리자: 해당 매장 메인 포스 등록 해제 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = typeof body?.deviceToken === 'string' ? body.deviceToken.trim() : undefined
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as { main_device_token?: string | null }[] | null
    const row = Array.isArray(rows) ? rows[0] : rows
    const currentToken = row?.main_device_token ?? null
    if (deviceToken !== undefined && currentToken !== deviceToken) {
      return NextResponse.json({ success: true }, { headers })
    }
    if (currentToken != null) {
      await supabaseUpdateByFilter(
        'pos_printer_settings',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        { main_device_token: null }
      )
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('clearPosMainDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
