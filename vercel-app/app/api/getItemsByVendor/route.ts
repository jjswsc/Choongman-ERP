import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 본사 발주용: vendor 코드 또는 이름으로 품목 목록 조회 (items.vendor = code 또는 name) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const vendorCode = String(searchParams.get('vendorCode') || searchParams.get('vendor') || '').trim()
  const vendorName = String(searchParams.get('vendorName') || '').trim()

  if (!vendorCode && !vendorName) {
    return NextResponse.json([], { headers })
  }

  try {
    let rows: {
      code?: string
      name?: string
      spec?: string
      price?: number
      cost?: number
      category?: string
      image?: string
    }[] | null = []

    if (vendorCode) {
      const enc = encodeURIComponent(vendorCode)
      rows = (await supabaseSelectFilter(
        'items',
        `vendor=ilike.${enc}`,
        { order: 'code.asc', limit: 1000 }
      )) as typeof rows
    }
    if ((!rows || rows.length === 0) && vendorName) {
      const encName = encodeURIComponent(vendorName)
      rows = (await supabaseSelectFilter(
        'items',
        `vendor=ilike.${encName}`,
        { order: 'code.asc', limit: 1000 }
      )) as typeof rows
    }

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
