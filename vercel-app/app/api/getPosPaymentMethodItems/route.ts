import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  resolvePosPaymentKeysForStore,
  syntheticPaymentMethodItemsFromKeys,
} from '@/lib/pos-payment-settings-resolve'

/** POS 기타·QR 탭에 항상 노출할 지갑(레거시 DEFAULT_OTHER_KEYS와 동일) */
const ENSURE_WALLET_PAYMENT_METHODS: Array<{
  category: 'qr' | 'other'
  name: string
  sortOrder: number
}> = [
  { category: 'qr', name: 'WeChat', sortOrder: 2 },
  { category: 'qr', name: 'Alipay', sortOrder: 3 },
  { category: 'qr', name: 'UnionPay', sortOrder: 4 },
]

type MergedRow = {
  id: number
  store_code: string | null
  category: string
  name: string
  hidden: boolean
  sort_order: number
}

function sortPaymentMethodApiRows<T extends { category: string; sortOrder: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  )
}

/** DB에 특정 분류 행이 전혀 없을 때 POS와 동일하게 resolve 기본 키를 syn: 행으로 채움 */
function augmentMissingCategoriesWithSynthetic(
  merged: MergedRow[],
  storeCode: string,
  keys: Awaited<ReturnType<typeof resolvePosPaymentKeysForStore>>
) {
  const mapped = merged.map((r) => ({
    id: String(r.id),
    storeCode: r.store_code,
    category: r.category,
    name: r.name,
    hidden: Boolean(r.hidden),
    sortOrder: Number(r.sort_order) || 0,
  }))
  const cats: Array<keyof Pick<typeof keys, 'cardKeys' | 'qrKeys' | 'deliveryKeys' | 'otherKeys'>> = [
    'cardKeys',
    'qrKeys',
    'deliveryKeys',
    'otherKeys',
  ]
  const catMap: Record<(typeof cats)[number], 'card' | 'qr' | 'delivery' | 'other'> = {
    cardKeys: 'card',
    qrKeys: 'qr',
    deliveryKeys: 'delivery',
    otherKeys: 'other',
  }
  for (const k of cats) {
    const cat = catMap[k]
    if (merged.some((r) => r.category === cat)) continue
    const names = keys[k]
    names.forEach((name, idx) => {
      mapped.push({
        id: `syn:${cat}:${idx}`,
        storeCode: storeCode || null,
        category: cat,
        name,
        hidden: false,
        sortOrder: idx,
      })
    })
  }
  return sortPaymentMethodApiRows(mapped)
}

/** DB에 qr/other 행은 있으나 WeChat·Alipay·UnionPay 등 레거시 지갑이 빠진 경우 syn: 행으로 보강 */
function ensureWalletPaymentMethods<T extends { category: string; name: string; hidden: boolean; sortOrder: number; id: string; storeCode: string | null }>(
  rows: T[],
  storeCode: string
): T[] {
  const out = [...rows]
  for (const ensure of ENSURE_WALLET_PAYMENT_METHODS) {
    const exists = out.some(
      (r) => r.category === ensure.category && r.name.toLowerCase() === ensure.name.toLowerCase() && !r.hidden
    )
    if (exists) continue
    out.push({
      id: `syn:${ensure.category}:ensure:${ensure.name.toLowerCase()}`,
      storeCode: storeCode || null,
      category: ensure.category,
      name: ensure.name,
      hidden: false,
      sortOrder: ensure.sortOrder,
    } as T)
  }
  return sortPaymentMethodApiRows(out)
}

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

    if (merged.length > 0) {
      const keys = await resolvePosPaymentKeysForStore(storeCode)
      const payload = ensureWalletPaymentMethods(
        augmentMissingCategoriesWithSynthetic(merged, storeCode || '', keys),
        storeCode || ''
      )
      return NextResponse.json(payload, { headers })
    }

    const keys = await resolvePosPaymentKeysForStore(storeCode)
    const synthetic = ensureWalletPaymentMethods(
      syntheticPaymentMethodItemsFromKeys(keys, storeCode ? storeCode : null),
      storeCode || ''
    )
    return NextResponse.json(synthetic, { headers })
  } catch (e) {
    console.error('getPosPaymentMethodItems:', e)
    try {
      const keys = await resolvePosPaymentKeysForStore(storeCode)
      const synthetic = ensureWalletPaymentMethods(
        syntheticPaymentMethodItemsFromKeys(keys, storeCode ? storeCode : null),
        storeCode || ''
      )
      return NextResponse.json(synthetic, { headers })
    } catch {
      return NextResponse.json([], { headers })
    }
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
