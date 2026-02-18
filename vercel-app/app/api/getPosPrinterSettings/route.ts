import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 프린터 설정 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  if (!storeCode) {
    return NextResponse.json(
      { kitchenMode: 1, kitchen1Categories: [], kitchen2Categories: [], autoStockDeduction: false },
      { headers }
    )
  }

  try {
    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as {
      store_code?: string
      kitchen_mode?: number
      kitchen1_categories?: unknown
      kitchen2_categories?: unknown
      auto_stock_deduction?: boolean
    }[] | null

    const raw = rows?.[0]
    const kitchen1 = Array.isArray(raw?.kitchen1_categories)
      ? (raw.kitchen1_categories as string[]).filter((c) => typeof c === 'string')
      : []
    const kitchen2 = Array.isArray(raw?.kitchen2_categories)
      ? (raw.kitchen2_categories as string[]).filter((c) => typeof c === 'string')
      : []

    return NextResponse.json({
      storeCode,
      kitchenMode: Number(raw?.kitchen_mode) || 1,
      kitchen1Categories: kitchen1.filter((c) => typeof c === 'string'),
      kitchen2Categories: kitchen2.filter((c) => typeof c === 'string'),
      autoStockDeduction: Boolean(raw?.auto_stock_deduction),
    }, { headers })
  } catch (e) {
    console.error('getPosPrinterSettings:', e)
    return NextResponse.json(
      { kitchenMode: 1, kitchen1Categories: [], kitchen2Categories: [], autoStockDeduction: false },
      { headers }
    )
  }
}
