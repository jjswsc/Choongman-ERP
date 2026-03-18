import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 관리자: 해당 매장에서 기기 접속 해제 (목록에서 제거). 메인이면 메인도 해제 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = String(body?.deviceToken ?? '').trim()
    if (!storeCode || !deviceToken) {
      return NextResponse.json(
        { success: false, message: 'storeCode and deviceToken required' },
        { headers }
      )
    }

    const settingsRows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as { main_device_token?: string | null }[] | null
    const mainToken = (Array.isArray(settingsRows) ? settingsRows[0] : settingsRows)?.main_device_token ?? null
    if (mainToken === deviceToken) {
      await supabaseUpdateByFilter(
        'pos_printer_settings',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        { main_device_token: null }
      )
    }

    await supabaseDeleteByFilter(
      'pos_connected_devices',
      `store_code=eq.${encodeURIComponent(storeCode)}&device_token=eq.${encodeURIComponent(deviceToken)}`
    )

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('revokePosDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
