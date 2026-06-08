import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { canRegisterAttendanceQrDevice } from '@/lib/permissions'
import { canAuthManageAttendanceQrStore } from '@/lib/attendance-qr-device-server'

/** 매니저·본사: 이 기기를 출퇴근 QR 표시 단말로 등록 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth || !canRegisterAttendanceQrDevice(auth.role || '')) {
      return NextResponse.json(
        { success: false, message: 'attendance_qr_register_forbidden' },
        { headers, status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = String(body?.deviceToken ?? '').trim()
    const displayLabel = String(body?.displayLabel ?? '').trim().slice(0, 80)
    const clientHint = String(body?.clientHint ?? '').trim().slice(0, 240)

    if (!storeCode || !deviceToken || deviceToken.length < 10) {
      return NextResponse.json(
        { success: false, message: 'store_and_device_required' },
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
        { success: false, message: 'attendance_qr_store_forbidden' },
        { headers, status: 403 }
      )
    }

    const now = new Date().toISOString()
    await supabaseUpsert(
      'pos_connected_devices',
      [
        {
          store_code: storeCode,
          device_token: deviceToken,
          role: 'attendance_display',
          last_seen_at: now,
          ...(displayLabel ? { display_label: displayLabel } : {}),
          ...(clientHint ? { client_hint: clientHint } : {}),
        },
      ],
      'store_code,device_token'
    )

    return NextResponse.json({ success: true, storeCode, deviceToken }, { headers })
  } catch (e) {
    console.error('registerAttendanceQrDevice:', e)
    return NextResponse.json({ success: false, message: 'server_error' }, { headers, status: 500 })
  }
}

export async function OPTIONS() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return new NextResponse(null, { status: 204, headers })
}
