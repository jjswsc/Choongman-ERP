import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'

const MAX_LABEL = 80

/** 관리자: 접속 기기 표시 이름 저장(빈 문자열이면 표시 이름 제거) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = String(body?.deviceToken ?? '').trim()
    const displayLabel = String(body?.displayLabel ?? '').trim()

    if (!storeCode || !deviceToken) {
      return NextResponse.json(
        { success: false, message: 'storeCode and deviceToken required' },
        { headers }
      )
    }

    const value = displayLabel.length > 0 ? displayLabel.slice(0, MAX_LABEL) : null

    await supabaseUpdateByFilter(
      'pos_connected_devices',
      `store_code=eq.${encodeURIComponent(storeCode)}&device_token=eq.${encodeURIComponent(deviceToken)}`,
      { display_label: value }
    )

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updatePosDeviceDisplayLabel:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
