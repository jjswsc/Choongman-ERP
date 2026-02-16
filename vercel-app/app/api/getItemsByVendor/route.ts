import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 본사 발주용: vendor 코드로 품목 목록 조회 (items.vendor = vendorCode) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const vendorCode = String(searchParams.get('vendorCode') || searchParams.get('vendor') || '').trim()

  if (!vendorCode) {
    return NextResponse.json([], { headers })
  }

  try {
    const enc = encodeURIComponent(vendorCode)
    const rows = (await supabaseSelectFilter(
      'items',
      `vendor=eq.${enc}`,
      { order: 'code.asc', limit: 1000 }
    )) as {
      code?: string
      name?: string
      spec?: string
      price?: number
      cost?: number
      category?: string
      image?: string
    }[] | null

    const list = (rows || []).map((row) => ({
      code: String(row.code || ''),
      name: String(row.name || ''),
      spec: String(row.spec || ''),
      price: Number(row.price) || 0,
      cost: Number(row.cost) || 0,
      category: String(row.category || ''),
      image: String(row.image || ''),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getItemsByVendor:', e)
    return NextResponse.json([], { headers })
  }
}
