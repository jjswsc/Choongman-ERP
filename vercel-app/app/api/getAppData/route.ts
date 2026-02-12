import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export interface AppItem {
  code: string
  category: string
  name: string
  spec: string
  price: number
  taxType: string
  safeQty: number
}

async function getItems(storeName: string): Promise<AppItem[]> {
  const rows = (await supabaseSelect('items', { order: 'id.asc' })) as {
    code?: string
    category?: string
    name?: string
    spec?: string
    price?: number
    tax?: string
  }[] | null
  let safeMap: Record<string, number> = {}
  if (storeName) {
    const storeNorm = String(storeName).toLowerCase().trim()
    const settings = (await supabaseSelectFilter(
      'store_settings',
      `store=ilike.${encodeURIComponent(storeNorm)}`
    )) as { code?: string; safe_qty?: number }[] | null
    for (let i = 0; i < (settings || []).length; i++) {
      const c = String(settings![i].code || '')
      if (c) safeMap[c] = Number(settings![i].safe_qty) || 0
    }
  }
  const list: AppItem[] = []
  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows![i]
    if (!row?.code) continue
    const taxType = row.tax === '면세' ? '면세' : '과세'
    list.push({
      code: String(row.code),
      category: String(row.category || ''),
      name: String(row.name || ''),
      spec: String(row.spec || ''),
      price: Number(row.price) || 0,
      taxType,
      safeQty: safeMap[row.code] || 0,
    })
  }
  return list
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()

  try {
    const items = await getItems(storeName)
    return NextResponse.json({ items, stock: {} }, { headers })
  } catch (e) {
    console.error('getAppData:', e)
    return NextResponse.json({ items: [], stock: {} }, { headers })
  }
}
