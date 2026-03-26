import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'
import { syncLegacyMainDeviceToken } from '@/lib/pos-main-devices-server'

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

    await supabaseDeleteByFilter(
      'pos_connected_devices',
      `store_code=eq.${encodeURIComponent(storeCode)}&device_token=eq.${encodeURIComponent(deviceToken)}`
    )
    await syncLegacyMainDeviceToken(storeCode)

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('revokePosDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
