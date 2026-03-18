import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 결제 수단 항목 조회 (매장별 or 전역) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  try {
    const filter = storeCode
      ? `or(store_code.eq.${encodeURIComponent(storeCode)},store_code.is.null)`
      : 'store_code=is.null'
    const rows = (await supabaseSelectFilter('pos_payment_method_items', filter, {
      order: 'category.asc,sort_order.asc,name.asc',
      limit: 2000,
      select: 'id,store_code,category,name,hidden,sort_order',
    })) as {
      id: number
      store_code: string | null
      category: string
      name: string
      hidden: boolean
      sort_order: number
    }[]

    const byStore = new Map<string, typeof rows>()
    const globalItems: typeof rows = []
    for (const r of rows || []) {
      if (r.store_code) {
        const list = byStore.get(r.store_code) || []
        list.push(r)
        byStore.set(r.store_code, list)
      } else {
        globalItems.push(r)
      }
    }
    const storeItems = storeCode ? (byStore.get(storeCode) || []) : []
    const merged = mergeItems(globalItems, storeItems)

    return NextResponse.json(
      merged.map((r) => ({
        id: String(r.id),
        storeCode: r.store_code,
        category: r.category,
        name: r.name,
        hidden: Boolean(r.hidden),
        sortOrder: Number(r.sort_order) || 0,
      })),
      { headers }
    )
  } catch (e) {
    console.error('getPosPaymentMethodItems:', e)
    return NextResponse.json([], { headers })
  }
}

function mergeItems(
  globalItems: { id: number; store_code: string | null; category: string; name: string; hidden: boolean; sort_order: number }[],
  storeItems: { id: number; store_code: string | null; category: string; name: string; hidden: boolean; sort_order: number }[]
) {
  const byKey = new Map<string, (typeof globalItems)[0]>()
  for (const r of globalItems) {
    byKey.set(`${r.category}:${r.name}`, r)
  }
  for (const r of storeItems) {
    byKey.set(`${r.category}:${r.name}`, r)
  }
  return Array.from(byKey.values()).sort(
    (a, b) =>
      (a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  )
}
