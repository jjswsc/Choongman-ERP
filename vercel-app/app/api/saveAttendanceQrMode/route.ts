import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { canManageAttendanceQrDevices } from '@/lib/permissions'
import { canAuthManageAttendanceQrStore } from '@/lib/attendance-qr-device-server'
import {
  isMissingAttendanceQrSettingsTable,
  saveAttendanceQrStoreMode,
} from '@/lib/attendance-qr-mode-server'
import type { AttendanceQrMode } from '@/lib/attendance-qr-token'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'

/** 매니저·본사: 매장 출퇴근 QR을 변동(2시간) 또는 고정으로 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth || !canManageAttendanceQrDevices(auth.role || '')) {
      return NextResponse.json({ success: false, message: 'forbidden' }, { headers, status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { storeCode?: string; mode?: string }
    const storeCode = String(body.storeCode || '').trim()
    const mode = String(body.mode || '').trim()
    if (!storeCode) {
      return NextResponse.json(
        { success: false, message: 'storeCode required' },
        { headers, status: 400 }
      )
    }
    if (mode !== 'rotating' && mode !== 'fixed') {
      return NextResponse.json({ success: false, message: 'invalid_mode' }, { headers, status: 400 })
    }

    if (
      !canAuthManageAttendanceQrStore({
        authStore: auth.store || '',
        authRole: auth.role || '',
        allowedStores: auth.allowedStores,
        targetStore: storeCode,
      })
    ) {
      return NextResponse.json({ success: false, message: 'store_forbidden' }, { headers, status: 403 })
    }

    const tenantScope = await resolveSaasTenantScope({
      auth: { tenantId: auth.tenantId, company: auth.company },
      storeCode,
    })
    await saveAttendanceQrStoreMode({
      storeCode,
      mode: mode as AttendanceQrMode,
      scope: tenantScope,
    })
    return NextResponse.json({ success: true, mode }, { headers })
  } catch (e) {
    if (isMissingAttendanceQrSettingsTable(e)) {
      return NextResponse.json(
        { success: false, message: 'attendance_qr_mode_schema_missing' },
        { headers, status: 503 }
      )
    }
    console.error('saveAttendanceQrMode:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers, status: 500 })
  }
}
