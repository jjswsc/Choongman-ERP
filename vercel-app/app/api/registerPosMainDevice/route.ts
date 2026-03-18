import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** 포스 터미널: 이 기기를 해당 매장 메인 포스로 등록 (해당 매장 설정 행이 있을 때만 반영) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = String(body?.deviceToken ?? '').trim()
    if (!storeCode || !deviceToken) {
      return NextResponse.json({ success: false, message: 'storeCode and deviceToken required' }, { headers })
    }

    const rows = await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )
    const exists = Array.isArray(rows) ? rows.length > 0 : !!rows

    if (exists) {
      await supabaseUpdateByFilter(
        'pos_printer_settings',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        { main_device_token: deviceToken }
      )
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('registerPosMainDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
