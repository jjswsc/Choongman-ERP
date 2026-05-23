import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsertMerge } from '@/lib/supabase-server'
import { hashPassword, verifyPassword } from '@/lib/password'
import { isValidPosDrawerPin } from '@/lib/pos-drawer-pin'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { canAccessPosPrinters, canAccessPosSettlement } from '@/lib/permissions'

function canManagePosDrawerPin(role: string): boolean {
  return canAccessPosPrinters(role) || canAccessPosSettlement(role)
}

/** 금전 서랍 6자리 PIN 등록·변경 — 매장 매니저/본사 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth || !canManagePosDrawerPin(auth.role || '')) {
      return NextResponse.json({ success: false, message: '권한 없음' }, { headers, status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }

    const storeCode = String(body.storeCode ?? '').trim()
    const newPin = String(body.newPin ?? '').trim()
    const currentPin = String(body.currentPin ?? '').trim()
    const clearPin = body.clearPin === true

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'store_required' }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1, select: 'drawer_pin_hash' }
    )) as { drawer_pin_hash?: string | null }[] | null

    const existingHash = String(rows?.[0]?.drawer_pin_hash ?? '').trim()

    if (clearPin) {
      if (existingHash && !currentPin) {
        return NextResponse.json({ success: false, message: 'pos_drawer_pin_current_required' }, { headers })
      }
      if (existingHash) {
        if (!isValidPosDrawerPin(currentPin)) {
          return NextResponse.json({ success: false, message: 'pos_drawer_pin_invalid_format' }, { headers })
        }
        const ok = await verifyPassword(currentPin, existingHash)
        if (!ok) {
          return NextResponse.json({ success: false, message: 'pos_drawer_pin_wrong' }, { headers })
        }
      }
      await supabaseUpsertMerge('pos_printer_settings', 'store_code', {
        store_code: storeCode,
        drawer_pin_hash: null,
        updated_at: new Date().toISOString(),
      })
      return NextResponse.json({ success: true, cleared: true }, { headers })
    }

    if (!isValidPosDrawerPin(newPin)) {
      return NextResponse.json({ success: false, message: 'pos_drawer_pin_invalid_format' }, { headers })
    }

    if (existingHash) {
      if (!isValidPosDrawerPin(currentPin)) {
        return NextResponse.json({ success: false, message: 'pos_drawer_pin_current_required' }, { headers })
      }
      const ok = await verifyPassword(currentPin, existingHash)
      if (!ok) {
        return NextResponse.json({ success: false, message: 'pos_drawer_pin_wrong' }, { headers })
      }
    }

    const drawer_pin_hash = await hashPassword(newPin)
    await supabaseUpsertMerge('pos_printer_settings', 'store_code', {
      store_code: storeCode,
      drawer_pin_hash,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosDrawerPin:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 300) }, { headers })
  }
}
