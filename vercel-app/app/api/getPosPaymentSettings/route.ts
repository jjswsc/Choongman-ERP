import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const DEFAULT_CARD_KEYS = ['Visa', 'Master', 'Amex', 'JCB', 'Other']
const DEFAULT_QR_KEYS = ['TrueMoney', 'WeChat', 'Alipay', 'PromptPay', 'LINE Pay', 'Shopee Pay', 'Other']

/** POS 결제 수단 설정 조회 (카드/QR breakdown 키) - pos_payment_method_items 우선, 없으면 pos_payment_settings 폴백 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  if (!storeCode) {
    return NextResponse.json(
      { storeCode: '', cardKeys: DEFAULT_CARD_KEYS, qrKeys: DEFAULT_QR_KEYS },
      { headers }
    )
  }

  try {
    const filter = `or(store_code.eq.${encodeURIComponent(storeCode)},store_code.is.null)`
    type PaymentItem = { store_code: string | null; category: string; name: string; hidden: boolean; sort_order: number }
    const itemRows = (await supabaseSelectFilter('pos_payment_method_items', filter, {
      limit: 300,
      select: 'id,store_code,category,name,hidden,sort_order',
      order: 'category.asc,sort_order.asc,name.asc',
    })) as PaymentItem[] | null

    const globalItems: PaymentItem[] = []
    const storeItems: PaymentItem[] = []
    for (const r of itemRows || []) {
      if (r.store_code) storeItems.push(r)
      else globalItems.push(r)
    }
    const byKey = new Map<string, PaymentItem>()
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

    if (cardKeys.length > 0 || qrKeys.length > 0) {
      return NextResponse.json(
        {
          storeCode,
          cardKeys: cardKeys.length > 0 ? cardKeys : DEFAULT_CARD_KEYS,
          qrKeys: qrKeys.length > 0 ? qrKeys : DEFAULT_QR_KEYS,
        },
        { headers }
      )
    }
  } catch (_) {
    /* pos_payment_method_items 실패 시 pos_payment_settings 폴백 */
  }

  try {
    const rows = (await supabaseSelectFilter('pos_payment_settings', `store_code=eq.${encodeURIComponent(storeCode)}`, {
      limit: 1,
      select: 'store_code,card_keys,qr_keys',
    })) as { store_code?: string; card_keys?: string[]; qr_keys?: string[] }[] | null

    const raw = rows?.[0]
    const cardKeys = Array.isArray(raw?.card_keys) ? raw.card_keys.filter((k) => typeof k === 'string') : DEFAULT_CARD_KEYS
    const qrKeys = Array.isArray(raw?.qr_keys) ? raw.qr_keys.filter((k) => typeof k === 'string') : DEFAULT_QR_KEYS

    return NextResponse.json(
      {
        storeCode: String(raw?.store_code ?? storeCode),
        cardKeys: cardKeys.length > 0 ? cardKeys : DEFAULT_CARD_KEYS,
        qrKeys: qrKeys.length > 0 ? qrKeys : DEFAULT_QR_KEYS,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosPaymentSettings:', e)
    return NextResponse.json(
      { storeCode, cardKeys: DEFAULT_CARD_KEYS, qrKeys: DEFAULT_QR_KEYS },
      { headers }
    )
  }
}
