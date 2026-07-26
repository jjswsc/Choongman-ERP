import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { syncLegacyMainDeviceToken } from '@/lib/pos-main-devices-server'
import {
  assertCanAssignMain,
  demoteOtherMainDevices,
  listStoreDevicesForRoleLimits,
} from '@/lib/pos-device-role-limits-server'
import {
  assertSaasPosDeviceRegistrationAllowed,
  resolveSaasPosDeviceNewForTenant,
} from '@/lib/saas/saas-pos-device-limit-server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'

/** 관리자: 해당 기기를 해당 매장 메인 포스로 지정 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()

  try {
    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    const deviceToken = String(body?.deviceToken ?? '').trim()
    if (!storeCode || !deviceToken) {
      return NextResponse.json(
        { success: false, message: 'storeCode and deviceToken required' },
        { headers }
      )
    }

    const authGate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!authGate.ok) return authGate.response

    const settingsRows = await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )
    const exists = Array.isArray(settingsRows) ? settingsRows.length > 0 : !!settingsRows
    if (!exists) {
      return NextResponse.json(
        { success: false, message: '해당 매장 POS 설정이 없습니다.' },
        { headers }
      )
    }

    const rows = await listStoreDevicesForRoleLimits(storeCode)
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

    let limitCheck = await assertCanAssignMain(storeCode, deviceToken)
    if (!limitCheck.ok && limitCheck.code === 'MAIN_LIMIT') {
      await demoteOtherMainDevices(storeCode, deviceToken)
      limitCheck = await assertCanAssignMain(storeCode, deviceToken)
    }
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

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('setPosMainDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
