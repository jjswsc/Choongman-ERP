import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { syncLegacyMainDeviceToken } from '@/lib/pos-main-devices-server'

/** 포스 터미널: 이 기기를 해당 매장에 메인/주문 단말로 등록·갱신 (last_seen_at 갱신) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = String(body?.deviceToken ?? '').trim()
    const role = String(body?.role ?? 'order').toLowerCase() === 'main' ? 'main' : 'order'
    if (!storeCode || !deviceToken) {
      return NextResponse.json(
        { success: false, message: 'storeCode and deviceToken required' },
        { headers }
      )
    }

    const hintRaw = String(body?.clientHint ?? '').trim()
    const clientHint = hintRaw.length > 0 ? hintRaw.slice(0, 240) : undefined

    const now = new Date().toISOString()
    await supabaseUpsert(
      'pos_connected_devices',
      [
        {
          store_code: storeCode,
          device_token: deviceToken,
          role,
          last_seen_at: now,
          ...(clientHint != null ? { client_hint: clientHint } : {}),
        },
      ],
      'store_code,device_token'
    )

    await syncLegacyMainDeviceToken(storeCode)

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('registerPosDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
