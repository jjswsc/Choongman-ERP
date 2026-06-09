import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { syncLegacyMainDeviceToken } from '@/lib/pos-main-devices-server'
import {
  getPosDeviceRoleLimits,
  listStoreDevicesForRoleLimits,
} from '@/lib/pos-device-role-limits-server'
import { resolveDeviceRoleForRegister } from '@/lib/pos-device-role-limits'

/** 포스 터미널: 이 기기를 해당 매장에 메인/주문 단말로 등록·갱신 (last_seen_at 갱신) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

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

    const limits = await getPosDeviceRoleLimits(storeCode)
    const rows = await listStoreDevicesForRoleLimits(storeCode)
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
    await supabaseUpsert(
      'pos_connected_devices',
      [
        {
          store_code: storeCode,
          device_token: deviceToken,
          role: resolved.role,
          last_seen_at: now,
          ...(clientHint != null ? { client_hint: clientHint } : {}),
        },
      ],
      'store_code,device_token'
    )

    await syncLegacyMainDeviceToken(storeCode)

    return NextResponse.json({ success: true, role: resolved.role }, { headers })
  } catch (e) {
    console.error('registerPosDevice:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
