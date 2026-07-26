import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { syncLegacyMainDeviceToken } from '@/lib/pos-main-devices-server'
import { assertCanSelfRegisterMain, listStoreDevicesForRoleLimits } from '@/lib/pos-device-role-limits-server'
import {
  assertSaasPosDeviceRegistrationAllowed,
  resolveSaasPosDeviceNewForTenant,
} from '@/lib/saas/saas-pos-device-limit-server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'

/** 포스 터미널: 이 기기를 해당 매장 메인 포스로 등록 (해당 매장 설정 행이 있을 때만 반영) */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = String(body?.deviceToken ?? '').trim()
    if (!storeCode || !deviceToken) {
      return NextResponse.json({ success: false, message: 'storeCode and deviceToken required' }, { headers })
    }

    const authGate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!authGate.ok) return authGate.response

    const rows = await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )
    const exists = Array.isArray(rows) ? rows.length > 0 : !!rows

    if (exists) {
      const deviceRows = await listStoreDevicesForRoleLimits(storeCode)
      const storeTokens = deviceRows.map((r) => String(r.device_token ?? '').trim()).filter(Boolean)
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

      const limitCheck = await assertCanSelfRegisterMain(storeCode, deviceToken)
      if (!limitCheck.ok) {
        return NextResponse.json(
          { success: false, message: limitCheck.message, code: limitCheck.code },
          { headers }
        )
      }

      const now = new Date().toISOString()
      await supabaseUpsert(
        'pos_connected_devices',
        [
          {
            store_code: storeCode,
            device_token: deviceToken,
            role: 'main',
            last_seen_at: now,
          },
        ],
        'store_code,device_token'
      )
      await syncLegacyMainDeviceToken(storeCode)
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('registerPosMainDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
