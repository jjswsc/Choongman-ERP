import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 프린터 설정 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || '').trim()

  if (!storeCode) {
    return NextResponse.json(
      { kitchenCount: 1, kitchen1Categories: [], kitchen2Categories: [] },
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
      kitchen_count?: number
      kitchen1_categories?: string[]
      kitchen2_categories?: string[]
    }[] | null

    const raw = rows?.[0]
    const kitchen1 = Array.isArray(raw?.kitchen1_categories) ? raw.kitchen1_categories : []
    const kitchen2 = Array.isArray(raw?.kitchen2_categories) ? raw.kitchen2_categories : []

    return NextResponse.json({
      storeCode,
      kitchenCount: raw?.kitchen_count ?? 1,
      kitchen1Categories: kitchen1.map(String),
      kitchen2Categories: kitchen2.map(String),
    }, { headers })
  } catch (e) {
    console.error('getPosPrinterSettings:', e)
    return NextResponse.json(
      { kitchenCount: 1, kitchen1Categories: [], kitchen2Categories: [] },
      { headers }
    )
  }
}
