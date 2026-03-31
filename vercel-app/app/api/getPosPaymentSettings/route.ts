import { NextRequest, NextResponse } from 'next/server'
import {
  DEFAULT_CARD_KEYS,
  DEFAULT_DELIVERY_KEYS,
  DEFAULT_OTHER_KEYS,
  DEFAULT_QR_KEYS,
  resolvePosPaymentKeysForStore,
} from '@/lib/pos-payment-settings-resolve'

/** POS 결제 수단 설정 조회 (카드/QR/배달앱 breakdown 키) - pos_payment_method_items 우선, 없으면 pos_payment_settings 폴백 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  try {
    const keys = await resolvePosPaymentKeysForStore(storeCode)
    return NextResponse.json(
      {
        storeCode,
        cardKeys: keys.cardKeys,
        qrKeys: keys.qrKeys,
        otherKeys: keys.otherKeys,
        deliveryKeys: keys.deliveryKeys,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosPaymentSettings:', e)
    return NextResponse.json(
      {
        storeCode,
        cardKeys: [...DEFAULT_CARD_KEYS],
        qrKeys: [...DEFAULT_QR_KEYS],
        otherKeys: [...DEFAULT_OTHER_KEYS],
        deliveryKeys: [...DEFAULT_DELIVERY_KEYS],
      },
      { headers }
    )
  }
}
