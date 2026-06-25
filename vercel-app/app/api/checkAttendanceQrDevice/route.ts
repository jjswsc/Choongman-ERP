import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAttendanceQrDevice,
  fetchAttendanceQrDeviceByToken,
} from '@/lib/attendance-qr-device-server'
import { ATTENDANCE_QR_DEVICE_HEADERS } from '@/lib/attendance-qr-device-client'

/** QR 키오스크: 이 기기가 등록되어 있는지 확인 (JWT 불필요) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store')

  try {
    const storeCode =
      String(req.headers.get(ATTENDANCE_QR_DEVICE_HEADERS.storeCode) || '').trim() ||
      String(req.nextUrl.searchParams.get('storeCode') ?? '').trim()
    const deviceToken =
      String(req.headers.get(ATTENDANCE_QR_DEVICE_HEADERS.deviceToken) || '').trim() ||
      String(req.nextUrl.searchParams.get('deviceToken') ?? '').trim()

    if (!deviceToken) {
      return NextResponse.json(
        { success: true, registered: false, reason: 'missing_credentials' },
        { headers }
      )
    }

    let device = storeCode ? await fetchAttendanceQrDevice(storeCode, deviceToken) : null
    if (!device) {
      device = await fetchAttendanceQrDeviceByToken(deviceToken)
    }
    if (!device) {
      return NextResponse.json(
        { success: true, registered: false, reason: 'not_registered' },
        { headers }
      )
    }

    return NextResponse.json(
      {
        success: true,
        registered: true,
        storeCode: device.store_code,
        displayLabel: device.display_label ?? null,
        lastSeenAt: device.last_seen_at,
      },
      { headers }
    )
  } catch (e) {
    console.error('checkAttendanceQrDevice:', e)
    return NextResponse.json({ success: false, message: 'server_error' }, { headers, status: 500 })
  }
}
