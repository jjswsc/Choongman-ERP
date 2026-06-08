import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAttendanceQrDevice,
  touchAttendanceQrDevice,
} from '@/lib/attendance-qr-device-server'
import { buildAttendanceQrPayload, ATTENDANCE_QR_BUCKET_HOURS } from '@/lib/attendance-qr-token'
import {
  ATTENDANCE_QR_DEVICE_HEADERS,
} from '@/lib/attendance-qr-device-client'

function readDeviceAuth(req: NextRequest): { storeCode: string; deviceToken: string } {
  const fromHeaderStore = String(req.headers.get(ATTENDANCE_QR_DEVICE_HEADERS.storeCode) || '').trim()
  const fromHeaderToken = String(req.headers.get(ATTENDANCE_QR_DEVICE_HEADERS.deviceToken) || '').trim()
  const storeCode = fromHeaderStore || String(req.nextUrl.searchParams.get('storeCode') ?? '').trim()
  const deviceToken = fromHeaderToken || String(req.nextUrl.searchParams.get('deviceToken') ?? '').trim()
  return { storeCode, deviceToken }
}

/** 등록된 QR 키오스크 단말 — 현재 매장용 동적 QR payload */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store')

  try {
    const { storeCode, deviceToken } = readDeviceAuth(req)
    if (!storeCode || !deviceToken) {
      return NextResponse.json(
        { success: false, message: 'device_auth_required' },
        { headers, status: 401 }
      )
    }

    const device = await fetchAttendanceQrDevice(storeCode, deviceToken)
    if (!device) {
      return NextResponse.json(
        { success: false, message: 'attendance_qr_device_not_registered' },
        { headers, status: 403 }
      )
    }

    const clientHint = String(req.headers.get('X-Cm-Client-Hint') || '').trim()
    await touchAttendanceQrDevice({
      storeCode,
      deviceToken,
      ...(clientHint ? { clientHint } : {}),
    })

    const { qrPayload, expiresAt, bucketStartMs } = buildAttendanceQrPayload(storeCode)
    return NextResponse.json(
      {
        success: true,
        storeCode,
        qrPayload,
        expiresAt,
        bucketStartMs,
        bucketHours: ATTENDANCE_QR_BUCKET_HOURS,
        displayLabel: device.display_label ?? null,
      },
      { headers }
    )
  } catch (e) {
    console.error('getAttendanceQrDisplay:', e)
    return NextResponse.json({ success: false, message: 'server_error' }, { headers, status: 500 })
  }
}
