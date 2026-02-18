import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** POS 프린터 설정 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const storeCode = String(body?.storeCode ?? '').trim()
    const kitchenMode = Math.min(2, Math.max(1, Number(body?.kitchenMode) || 1))
    const kitchen1Categories = Array.isArray(body?.kitchen1Categories)
      ? body.kitchen1Categories.filter((c: unknown) => typeof c === 'string')
      : []
    const kitchen2Categories = Array.isArray(body?.kitchen2Categories)
      ? body.kitchen2Categories.filter((c: unknown) => typeof c === 'string')
      : []

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    const existing = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as { store_code?: string }[] | null

    const patch = {
      kitchen_mode: kitchenMode,
      kitchen1_categories: kitchen1Categories,
      kitchen2_categories: kitchen2Categories,
      updated_at: new Date().toISOString(),
    }

    if (existing?.length) {
      await supabaseUpdateByFilter(
        'pos_printer_settings',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        patch
      )
    } else {
      await supabaseInsert('pos_printer_settings', {
        store_code: storeCode,
        ...patch,
      })
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosPrinterSettings:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
