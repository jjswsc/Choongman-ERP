import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'

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
  description?: string
}

const ITEMS_SELECT = 'code,category,name,spec,price,cost,tax,image,description'

async function getItems(storeName: string, scope?: string): Promise<AppItem[]> {
  const isOrderScope = String(scope || '').toLowerCase().trim() === 'order'
  let rows: {
    code?: string
    category?: string
    name?: string
    spec?: string
    price?: number
    cost?: number
    tax?: string
    image?: string
    description?: string
  }[] | null

  if (isOrderScope) {
    rows = (await supabaseSelectFilter(
      'items',
      `or=(purchase_source.eq.hq,purchase_source.is.null)`,
      { order: 'id.asc', select: ITEMS_SELECT }
    )) as typeof rows
  } else {
    rows = (await supabaseSelect('items', { order: 'id.asc', select: ITEMS_SELECT })) as typeof rows
  }

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
      description: row.description ? String(row.description).trim() : undefined,
    })
  }
  return list
}

const OFFICE_LOCATIONS = ['office', '본사', '오피스', '본점']

async function getStoreStock(store: string, asOfDate?: string): Promise<Record<string, number>> {
  try {
    const storeNorm = String(store || '').toLowerCase().trim()
    if (!storeNorm) return {}

    const isOffice = OFFICE_LOCATIONS.some((x) => storeNorm === x || storeNorm.includes(x))
    const locFilter = isOffice
      ? `or=(${OFFICE_LOCATIONS.map((l) => `location.ilike.${l}`).join(',')})`
      : `location=ilike.${encodeURIComponent(storeNorm)}`
    const dateSuffix = asOfDate?.trim()
      ? `&log_date=lte.${encodeURIComponent(asOfDate.trim() + 'T23:59:59.999Z')}`
      : ''
    const filter = `${locFilter}${dateSuffix}`

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
  const scope = String(searchParams.get('scope') || '').trim()

  const auth = await getVerifiedAuth(request)
  const userRole = (auth?.role || '').toLowerCase()
  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  const userStore = (auth?.store || '').trim()
  if (isManager && userStore && storeName) {
    const storeNorm = storeName.toLowerCase().trim()
    const userNorm = userStore.toLowerCase().trim()
    const matches = storeNorm === userNorm || userNorm.includes(storeNorm) || storeNorm.includes(userNorm)
    if (!matches) {
      return NextResponse.json({ items: [], stock: {} }, { headers })
    }
  }

  try {
    const [items, stock] = await Promise.all([
      getItems(storeName, scope || undefined),
      getStoreStock(storeName, asOfDate || undefined),
    ])
    return NextResponse.json({ items, stock }, { headers })
  } catch (e) {
    console.error('getAppData:', e)
    return NextResponse.json({ items: [], stock: {} }, { headers })
  }
}
