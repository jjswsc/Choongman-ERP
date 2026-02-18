import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export interface AppItem {
  code: string
  category: string
  name: string
  spec: string
  price: number
  cost: number
  taxType: string
  safeQty: number
  image: string
}

async function getItems(storeName: string): Promise<AppItem[]> {
  const rows = (await supabaseSelect('items', { order: 'id.asc', select: 'code,category,name,spec,price,cost,tax,image' })) as {
    code?: string
    category?: string
    name?: string
    spec?: string
    price?: number
    cost?: number
    tax?: string
    image?: string
  }[] | null
  const safeMap: Record<string, number> = {}
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
      cost: Number(row.cost) || 0,
      taxType,
      safeQty: safeMap[row.code] || 0,
      image: String(row.image || ''),
    })
  }
  return list
}

async function getStoreStock(store: string, asOfDate?: string): Promise<Record<string, number>> {
  try {
    const storeNorm = String(store || '').toLowerCase().trim()
    if (!storeNorm) return {}
    let filter = `location=ilike.${encodeURIComponent(storeNorm)}`
    if (asOfDate && asOfDate.trim()) {
      const endOfDay = asOfDate.trim() + 'T23:59:59.999Z'
      filter += `&log_date=lte.${encodeURIComponent(endOfDay)}`
    }
    const rows = (await supabaseSelectFilter(
      'stock_logs',
      filter
    )) as { item_code?: string; qty?: number }[] | null
    const m: Record<string, number> = {}
    for (let i = 0; i < (rows || []).length; i++) {
      const code = rows![i].item_code
      if (!code) continue
      m[code] = (m[code] || 0) + Number(rows![i].qty || 0)
    }
    return m
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()
  const asOfDate = String(searchParams.get('asOfDate') || searchParams.get('date') || '').trim()

  try {
    const [items, stock] = await Promise.all([
      getItems(storeName),
      getStoreStock(storeName, asOfDate || undefined),
    ])
    return NextResponse.json({ items, stock }, { headers })
  } catch (e) {
    console.error('getAppData:', e)
    return NextResponse.json({ items: [], stock: {} }, { headers })
  }
}
