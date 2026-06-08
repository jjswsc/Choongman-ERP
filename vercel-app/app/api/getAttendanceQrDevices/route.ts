import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { canManageAttendanceQrDevices } from '@/lib/permissions'
import { canAuthManageAttendanceQrStore } from '@/lib/attendance-qr-device-server'

export type AttendanceQrDeviceItem = {
  deviceToken: string
  lastSeenAt: string
  createdAt: string
  displayLabel: string | null
  clientHint: string | null
}

/** 매니저·본사: 매장별 출퇴근 QR 표시 단말 목록 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth || !canManageAttendanceQrDevices(auth.role || '')) {
      return NextResponse.json(
        { success: false, message: 'forbidden', devices: [] },
        { headers, status: 403 }
      )
    }

    const storeCode = String(req.nextUrl.searchParams.get('storeCode') ?? '').trim()
    if (!storeCode) {
      return NextResponse.json(
        { success: false, message: 'storeCode required', devices: [] },
        { headers, status: 400 }
      )
    }

    if (
      !canAuthManageAttendanceQrStore({
        authStore: auth.store || '',
        authRole: auth.role || '',
        allowedStores: auth.allowedStores,
        targetStore: storeCode,
      })
    ) {
      return NextResponse.json(
        { success: false, message: 'store_forbidden', devices: [] },
        { headers, status: 403 }
      )
    }

    const rows = (await supabaseSelectFilter(
      'pos_connected_devices',
      `store_code=eq.${encodeURIComponent(storeCode)}&role=eq.attendance_display`,
      { order: 'last_seen_at.desc', limit: 50 }
    )) as {
      device_token: string
      last_seen_at: string
      created_at: string
      display_label?: string | null
      client_hint?: string | null
    }[] | null

    const devices: AttendanceQrDeviceItem[] = (rows || []).map((row) => ({
      deviceToken: row.device_token,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      displayLabel:
        row.display_label != null && String(row.display_label).trim()
          ? String(row.display_label).trim()
          : null,
      clientHint:
        row.client_hint != null && String(row.client_hint).trim()
          ? String(row.client_hint).trim()
          : null,
    }))

    return NextResponse.json({ success: true, devices }, { headers })
  } catch (e) {
    console.error('getAttendanceQrDevices:', e)
    return NextResponse.json(
      { success: false, message: String(e), devices: [] },
      { headers, status: 500 }
    )
  }
}
