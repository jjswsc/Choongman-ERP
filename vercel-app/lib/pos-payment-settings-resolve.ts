import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  DEFAULT_CARD_KEYS,
  DEFAULT_DELIVERY_KEYS,
  DEFAULT_OTHER_KEYS,
  DEFAULT_QR_KEYS,
} from '@/lib/pos-payment-default-keys'

export {
  DEFAULT_CARD_KEYS,
  DEFAULT_DELIVERY_KEYS,
  DEFAULT_OTHER_KEYS,
  DEFAULT_QR_KEYS,
} from '@/lib/pos-payment-default-keys'

type PaymentItemRow = {
  id?: number
  store_code: string | null
  category: string
  name: string
  hidden: boolean
  sort_order: number
}

/**
 * POS 결제 breakdown·관리 화면과 동일한 카드/QR/배달 키 목록.
 * pos_payment_method_items → (비면) pos_payment_settings → 기본값.
 */
export async function resolvePosPaymentKeysForStore(storeCode: string): Promise<{
  cardKeys: string[]
  qrKeys: string[]
  otherKeys: string[]
  deliveryKeys: string[]
}> {
  const code = String(storeCode || '').trim()
  if (!code) {
    return {
      cardKeys: [...DEFAULT_CARD_KEYS],
      qrKeys: [...DEFAULT_QR_KEYS],
      otherKeys: [...DEFAULT_OTHER_KEYS],
      deliveryKeys: [...DEFAULT_DELIVERY_KEYS],
    }
  }

  try {
    const filter = `or(store_code.eq.${encodeURIComponent(code)},store_code.is.null)`
    const itemRows = (await supabaseSelectFilter('pos_payment_method_items', filter, {
      limit: 300,
      select: 'id,store_code,category,name,hidden,sort_order',
      order: 'category.asc,sort_order.asc,name.asc',
    })) as PaymentItemRow[] | null

    const globalItems: PaymentItemRow[] = []
    const storeItems: PaymentItemRow[] = []
    for (const r of itemRows || []) {
      if (r.store_code) storeItems.push(r)
      else globalItems.push(r)
    }
    const byKey = new Map<string, PaymentItemRow>()
    for (const r of globalItems) byKey.set(`${r.category}:${r.name}`, r)
    for (const r of storeItems) byKey.set(`${r.category}:${r.name}`, r)
    const merged = Array.from(byKey.values())

    const cardKeys = merged
      .filter((r) => r.category === 'card' && !r.hidden)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((r) => r.name)
    const qrKeys = merged
      .filter((r) => r.category === 'qr' && !r.hidden)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((r) => r.name)
    const deliveryKeys = merged
      .filter((r) => r.category === 'delivery' && !r.hidden)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((r) => r.name)
    const otherKeys = merged
      .filter((r) => r.category === 'other' && !r.hidden)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((r) => r.name)

    if (cardKeys.length > 0 || qrKeys.length > 0 || deliveryKeys.length > 0 || otherKeys.length > 0) {
      return {
        cardKeys: cardKeys.length > 0 ? cardKeys : [...DEFAULT_CARD_KEYS],
        qrKeys: qrKeys.length > 0 ? qrKeys : [...DEFAULT_QR_KEYS],
        otherKeys: otherKeys.length > 0 ? otherKeys : [...DEFAULT_OTHER_KEYS],
        deliveryKeys: deliveryKeys.length > 0 ? deliveryKeys : [...DEFAULT_DELIVERY_KEYS],
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const rows = (await supabaseSelectFilter('pos_payment_settings', `store_code=eq.${encodeURIComponent(code)}`, {
      limit: 1,
      select: 'store_code,card_keys,qr_keys',
    })) as { store_code?: string; card_keys?: string[]; qr_keys?: string[] }[] | null

    const raw = rows?.[0]
    const cardKeys = Array.isArray(raw?.card_keys) ? raw.card_keys.filter((k) => typeof k === 'string') : [...DEFAULT_CARD_KEYS]
    const qrKeys = Array.isArray(raw?.qr_keys) ? raw.qr_keys.filter((k) => typeof k === 'string') : [...DEFAULT_QR_KEYS]

    return {
      cardKeys: cardKeys.length > 0 ? cardKeys : [...DEFAULT_CARD_KEYS],
      qrKeys: qrKeys.length > 0 ? qrKeys : [...DEFAULT_QR_KEYS],
      otherKeys: [...DEFAULT_OTHER_KEYS],
      deliveryKeys: [...DEFAULT_DELIVERY_KEYS],
    }
  } catch {
    return {
      cardKeys: [...DEFAULT_CARD_KEYS],
      qrKeys: [...DEFAULT_QR_KEYS],
      otherKeys: [...DEFAULT_OTHER_KEYS],
      deliveryKeys: [...DEFAULT_DELIVERY_KEYS],
    }
  }
}

export type SyntheticPosPaymentMethodItem = {
  id: string
  storeCode: string | null
  category: 'card' | 'qr' | 'delivery' | 'other'
  name: string
  hidden: boolean
  sortOrder: number
}

/** DB에 행이 없을 때 POS·결제 설정과 동일한 목록을 API 응답용으로 평탄화 */
export function syntheticPaymentMethodItemsFromKeys(
  keys: {
    cardKeys: string[]
    qrKeys: string[]
    deliveryKeys: string[]
    otherKeys: string[]
  },
  storeCode: string | null
): SyntheticPosPaymentMethodItem[] {
  const out: SyntheticPosPaymentMethodItem[] = []
  const pushCat = (category: 'card' | 'qr' | 'delivery' | 'other', names: string[]) => {
    names.forEach((name, idx) => {
      out.push({
        id: `syn:${category}:${idx}`,
        storeCode,
        category,
        name,
        hidden: false,
        sortOrder: idx,
      })
    })
  }
  pushCat('card', keys.cardKeys)
  pushCat('qr', keys.qrKeys)
  pushCat('delivery', keys.deliveryKeys)
  pushCat('other', keys.otherKeys?.length ? keys.otherKeys : [...DEFAULT_OTHER_KEYS])
  return out
}

export function isSyntheticPosPaymentMethodId(id: string): boolean {
  return String(id || '').trim().startsWith('syn:')
}

/** 결산 AUTO: payment_other_breakdown.admin id → 분류·표시명 */
export async function loadPosPaymentMethodCatalog(
  storeCode: string
): Promise<Array<{ id: string; name: string; category: 'card' | 'qr' | 'delivery' | 'other' }>> {
  const code = String(storeCode || '').trim()
  const keys = await resolvePosPaymentKeysForStore(code)
  const toCatalog = (rows: SyntheticPosPaymentMethodItem[]) =>
    rows
      .filter((r) => !r.hidden && (r.category === 'qr' || r.category === 'other'))
      .map((r) => ({ id: String(r.id), name: r.name, category: r.category }))

  if (!code) {
    return toCatalog(syntheticPaymentMethodItemsFromKeys(keys, null))
  }

  try {
    const filter = `or(store_code.eq.${encodeURIComponent(code)},store_code.is.null)`
    const itemRows = (await supabaseSelectFilter('pos_payment_method_items', filter, {
      limit: 300,
      select: 'id,store_code,category,name,hidden,sort_order',
      order: 'category.asc,sort_order.asc,name.asc',
    })) as PaymentItemRow[] | null

    const globalItems: PaymentItemRow[] = []
    const storeItems: PaymentItemRow[] = []
    for (const r of itemRows || []) {
      if (r.store_code) storeItems.push(r)
      else globalItems.push(r)
    }
    const byKey = new Map<string, PaymentItemRow>()
    for (const r of globalItems) byKey.set(`${r.category}:${r.name}`, r)
    for (const r of storeItems) byKey.set(`${r.category}:${r.name}`, r)
    const merged = Array.from(byKey.values())
    if (merged.length > 0) {
      return merged
        .filter((r) => (r.category === 'qr' || r.category === 'other') && !r.hidden)
        .map((r) => ({
          id: String(r.id),
          name: r.name,
          category: r.category as 'qr' | 'other',
        }))
    }
  } catch {
    /* synthetic fallback */
  }

  return toCatalog(syntheticPaymentMethodItemsFromKeys(keys, code))
}
