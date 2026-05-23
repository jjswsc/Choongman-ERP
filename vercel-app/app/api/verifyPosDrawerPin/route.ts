import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { verifyPassword } from '@/lib/password'
import { isValidPosDrawerPin } from '@/lib/pos-drawer-pin'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { canAccessPosOrder } from '@/lib/permissions'

/** 금전 서랍 PIN 검증 — POS 주문·결산 권한 직원 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth || !canAccessPosOrder(auth.role || '')) {
      return NextResponse.json({ success: false, message: '권한 없음' }, { headers, status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }

    const storeCode = String(body.storeCode ?? '').trim()
    const pin = String(body.pin ?? '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'store_required' }, { headers })
    }
    if (!isValidPosDrawerPin(pin)) {
      return NextResponse.json({ success: false, message: 'pos_drawer_pin_invalid_format' }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1, select: 'drawer_pin_hash' }
    )) as { drawer_pin_hash?: string | null }[] | null

    const hash = String(rows?.[0]?.drawer_pin_hash ?? '').trim()
    if (!hash) {
      return NextResponse.json({ success: true, skipped: true }, { headers })
    }

    const ok = await verifyPassword(pin, hash)
    if (!ok) {
      return NextResponse.json({ success: false, message: 'pos_drawer_pin_wrong' }, { headers })
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('verifyPosDrawerPin:', e)
    return NextResponse.json({ success: false, message: 'server_error' }, { headers })
  }
}
