import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { syncLegacyMainDeviceToken } from '@/lib/pos-main-devices-server'

/**
 * 메인(프론트) 포스 해제.
 * - deviceToken 없음: 해당 매장의 모든 메인 기기 → 주문 단말
 * - deviceToken 있음: 해당 기기만 주문 단말로
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken =
      typeof body?.deviceToken === 'string' && body.deviceToken.trim()
        ? body.deviceToken.trim()
        : undefined
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    if (deviceToken) {
      await supabaseUpdateByFilter(
        'pos_connected_devices',
        `store_code=eq.${encodeURIComponent(storeCode)}&device_token=eq.${encodeURIComponent(deviceToken)}`,
        { role: 'order' }
      )
    } else {
      await supabaseUpdateByFilter(
        'pos_connected_devices',
        `store_code=eq.${encodeURIComponent(storeCode)}&role=eq.main`,
        { role: 'order' }
      )
    }
    await syncLegacyMainDeviceToken(storeCode)

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('clearPosMainDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
