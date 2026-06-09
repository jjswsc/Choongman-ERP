import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  clampMainDeviceMaxCount,
  clampOrderDeviceMaxCount,
  parseMainDeviceRoleLocked,
} from '@/lib/pos-device-role-limits'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'

/** 본사(OFFICE) 전용: 매장별 메인/주문 단말 대수·잠금 설정 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(req, 'any')
    if (!authResult.auth) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401, headers })
    }
    if (!isOfficeRole(authResult.auth.role || '')) {
      return NextResponse.json(
        { success: false, message: '단말 대수 설정은 본사(OFFICE) 직원만 변경할 수 있습니다.' },
        { status: 403, headers }
      )
    }

    const body = await req.json().catch(() => ({}))
    const storeCode = String(body?.storeCode ?? '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as { store_code?: string }[] | null
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 매장 POS 설정이 없습니다.' },
        { headers }
      )
    }

    const mainDeviceMaxCount = clampMainDeviceMaxCount(body?.mainDeviceMaxCount)
    const orderDeviceMaxCount = clampOrderDeviceMaxCount(body?.orderDeviceMaxCount)
    const mainDeviceRoleLocked = parseMainDeviceRoleLocked(body?.mainDeviceRoleLocked, false)

    await supabaseUpdateByFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      {
        main_device_max_count: mainDeviceMaxCount,
        order_device_max_count: orderDeviceMaxCount,
        main_device_role_locked: mainDeviceRoleLocked,
        updated_at: new Date().toISOString(),
      }
    )

    return NextResponse.json(
      {
        success: true,
        mainDeviceMaxCount,
        orderDeviceMaxCount,
        mainDeviceRoleLocked,
      },
      { headers }
    )
  } catch (e) {
    console.error('savePosDeviceRoleLimits:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
