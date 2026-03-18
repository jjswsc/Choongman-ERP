import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type PosDeviceItem = {
  deviceToken: string
  role: 'main' | 'order'
  lastSeenAt: string
  createdAt: string
  isMain: boolean
}

/** 관리자: 해당 매장 POS 접속 기기 목록 (메인/주문 단말) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const storeCode = String(req.nextUrl.searchParams.get('storeCode') ?? '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    const [devices, settingsRows] = await Promise.all([
      supabaseSelectFilter(
        'pos_connected_devices',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        { order: 'last_seen_at.desc', limit: 100 }
      ) as Promise<{ device_token: string; role: string; last_seen_at: string; created_at: string }[] | null>,
      supabaseSelectFilter(
        'pos_printer_settings',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        { limit: 1, select: 'main_device_token' }
      ) as Promise<{ main_device_token?: string | null }[] | null>,
    ])

    const mainToken = (Array.isArray(settingsRows) ? settingsRows[0] : settingsRows)?.main_device_token ?? null
    const list = Array.isArray(devices) ? devices : []

    const items: PosDeviceItem[] = list.map((row) => ({
      deviceToken: row.device_token,
      role: (row.role === 'main' ? 'main' : 'order') as 'main' | 'order',
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      isMain: mainToken != null && row.device_token === mainToken,
    }))

    return NextResponse.json({ success: true, devices: items }, { headers })
  } catch (e) {
    console.error('getPosDevices:', e)
    return NextResponse.json(
      { success: false, message: String(e), devices: [] },
      { headers }
    )
  }
}
