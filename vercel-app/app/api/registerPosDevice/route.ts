import { NextRequest, NextResponse } from 'next/server'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'
import { upsertRowsTenantStore } from '@/lib/saas-store-conflict'
import { syncLegacyMainDeviceToken } from '@/lib/pos-main-devices-server'
import {
  getPosDeviceRoleLimits,
  listStoreDevicesForRoleLimits,
} from '@/lib/pos-device-role-limits-server'
import { resolveDeviceRoleForRegister } from '@/lib/pos-device-role-limits'
import {
  assertSaasPosDeviceRegistrationAllowed,
  resolveSaasPosDeviceNewForTenant,
} from '@/lib/saas/saas-pos-device-limit-server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'

/** 포스 터미널: 이 기기를 해당 매장에 메인/주문 단말로 등록·갱신 (last_seen_at 갱신) */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = String(body?.deviceToken ?? '').trim()
    const clientRole = String(body?.role ?? 'order').toLowerCase() === 'main' ? 'main' : 'order'
    if (!storeCode || !deviceToken) {
      return NextResponse.json(
        { success: false, message: 'storeCode and deviceToken required' },
        { headers }
      )
    }

    const authGate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!authGate.ok) return authGate.response

    const tenantScope = await resolveSaasTenantScope({
      auth: authGate.auth
        ? { tenantId: authGate.auth.tenantId, company: authGate.auth.company }
        : null,
      storeCode,
    })
    const limits = await getPosDeviceRoleLimits(storeCode, tenantScope.tenantId)
    const rows = await listStoreDevicesForRoleLimits(storeCode, tenantScope.tenantId)
    const storeTokens = rows.map((r) => String(r.device_token ?? '').trim()).filter(Boolean)
    const isNewForTenant = await resolveSaasPosDeviceNewForTenant({
      storeCode,
      deviceToken,
      storeDeviceTokens: storeTokens,
    })
    const saasLimit = await assertSaasPosDeviceRegistrationAllowed({
      storeCode,
      deviceToken,
      isNewDeviceForTenant: isNewForTenant,
    })
    if (!saasLimit.ok) {
      return NextResponse.json(
        { success: false, message: saasLimit.message, code: saasLimit.code },
        { headers }
      )
    }

    const existingAttendanceQr = rows.find(
      (r) =>
        String(r.device_token ?? '').trim() === deviceToken && r.role === 'attendance_display'
    )
    if (existingAttendanceQr) {
      return NextResponse.json(
        {
          success: false,
          message: 'attendance_qr_device_token_in_use',
          code: 'ATTENDANCE_QR_DEVICE',
        },
        { headers }
      )
    }

    const resolved = resolveDeviceRoleForRegister(rows, deviceToken, clientRole, limits)
    if (resolved.reject && resolved.reject.ok === false) {
      const existing = rows.some((r) => String(r.device_token ?? '').trim() === deviceToken)
      if (!existing) {
        return NextResponse.json(
          { success: false, message: resolved.reject.message, code: resolved.reject.code },
          { headers }
        )
      }
    }

    const hintRaw = String(body?.clientHint ?? '').trim()
    const clientHint = hintRaw.length > 0 ? hintRaw.slice(0, 240) : undefined

    const now = new Date().toISOString()
    await upsertRowsTenantStore(
      'pos_connected_devices',
      'store_code,device_token',
      [
        {
          store_code: storeCode,
          device_token: deviceToken,
          role: resolved.role,
          last_seen_at: now,
          ...(clientHint != null ? { client_hint: clientHint } : {}),
        },
      ],
      tenantScope
    )

    await syncLegacyMainDeviceToken(storeCode, tenantScope.tenantId)

    return NextResponse.json({ success: true, role: resolved.role }, { headers })
  } catch (e) {
    console.error('registerPosDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
