import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { canManageAttendanceQrDevices } from '@/lib/permissions'
import { canAuthManageAttendanceQrStore } from '@/lib/attendance-qr-device-server'
import { fetchAttendanceQrStoreMode } from '@/lib/attendance-qr-mode-server'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'

/** 매니저·본사: 매장 출퇴근 QR 모드 (rotating | fixed) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth || !canManageAttendanceQrDevices(auth.role || '')) {
      return NextResponse.json(
        { success: false, message: 'forbidden', mode: 'rotating' },
        { headers, status: 403 }
      )
    }

    const storeCode = String(req.nextUrl.searchParams.get('storeCode') ?? '').trim()
    if (!storeCode) {
      return NextResponse.json(
        { success: false, message: 'storeCode required', mode: 'rotating' },
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
        { success: false, message: 'store_forbidden', mode: 'rotating' },
        { headers, status: 403 }
      )
    }

    const tenantScope = await resolveSaasTenantScope({
      auth: { tenantId: auth.tenantId, company: auth.company },
      storeCode,
    })
    const { mode, schemaMissing } = await fetchAttendanceQrStoreMode(storeCode, tenantScope)
    return NextResponse.json({ success: true, mode, schemaMissing }, { headers })
  } catch (e) {
    console.error('getAttendanceQrMode:', e)
    return NextResponse.json(
      { success: false, message: String(e), mode: 'rotating' },
      { headers, status: 500 }
    )
  }
}
