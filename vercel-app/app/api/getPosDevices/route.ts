import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type PosDeviceItem = {
  deviceToken: string
  role: 'main' | 'order'
  lastSeenAt: string
  createdAt: string
  isMain: boolean
  displayLabel: string | null
  clientHint: string | null
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

    const devices = (await supabaseSelectFilter(
      'pos_connected_devices',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { order: 'last_seen_at.desc', limit: 100 }
    )) as {
      device_token: string
      role: string
      last_seen_at: string
      created_at: string
      display_label?: string | null
      client_hint?: string | null
    }[] | null

    const list = Array.isArray(devices) ? devices : []

    const items: PosDeviceItem[] = list
      .filter((row) => row.role !== 'attendance_display')
      .map((row) => ({
      deviceToken: row.device_token,
      role: (row.role === 'main' ? 'main' : 'order') as 'main' | 'order',
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      isMain: row.role === 'main',
      displayLabel:
        row.display_label != null && String(row.display_label).trim()
          ? String(row.display_label).trim()
          : null,
      clientHint:
        row.client_hint != null && String(row.client_hint).trim()
          ? String(row.client_hint).trim()
          : null,
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
