import { NextRequest, NextResponse } from 'next/server'
import { isCryptoAssetKey } from '@/lib/payments/crypto-assets'
import {
  cancelCryptoPaymentAttempt,
  confirmCryptoPaymentAttemptManual,
  createCryptoPaymentAttempt,
  CryptoPaymentError,
  getCryptoPaymentAttempt,
} from '@/lib/payments/crypto-provider'

function cors() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  return headers
}

/** 입금 대기 중 GET만 체인 조회. watch=1 이고 pending/seen일 때. */
export async function GET(request: NextRequest) {
  const headers = cors()
  const q = new URL(request.url).searchParams
  const id = String(q.get('id') || '').trim()
  const storeCode = String(q.get('storeCode') || '').trim()
  const watch = q.get('watch') === '1'
  if (!id || !storeCode) {
    return NextResponse.json({ success: false, message: 'posCryptoErrNotFound' }, { headers, status: 400 })
  }
  const attempt = await getCryptoPaymentAttempt({ id, storeCode, watch })
  if (!attempt) {
    return NextResponse.json({ success: false, message: 'posCryptoErrNotFound' }, { headers, status: 404 })
  }
  return NextResponse.json({ success: true, attempt }, { headers })
}

export async function POST(request: NextRequest) {
  const headers = cors()
  try {
    const body = await request.json()
    const action = String(body?.action || 'create').trim()
    const storeCode = String(body?.storeCode || '').trim()
    if (action === 'create') {
      const asset = String(body?.asset || '').trim()
      if (!isCryptoAssetKey(asset)) {
        return NextResponse.json({ success: false, message: 'posCryptoErrAssetOff' }, { headers, status: 400 })
      }
      const attempt = await createCryptoPaymentAttempt({
        storeCode,
        asset,
        amountThb: Number(body?.amountThb) || 0,
        amountCryptoOverride: Number(body?.amountCrypto) || 0,
        orderId: Number(body?.orderId) || null,
      })
      return NextResponse.json({ success: true, attempt }, { headers })
    }
    const id = String(body?.id || '').trim()
    if (action === 'confirm') {
      const attempt = await confirmCryptoPaymentAttemptManual({
        id,
        storeCode,
        confirmedBy: String(body?.confirmedBy || 'staff'),
      })
      return NextResponse.json({ success: true, attempt }, { headers })
    }
    if (action === 'cancel') {
      const attempt = await cancelCryptoPaymentAttempt({ id, storeCode })
      return NextResponse.json({ success: true, attempt }, { headers })
    }
    return NextResponse.json({ success: false, message: '알 수 없는 동작입니다.' }, { headers, status: 400 })
  } catch (e) {
    const message = e instanceof CryptoPaymentError ? e.key : e instanceof Error ? e.message : 'posCryptoErrCreate'
    return NextResponse.json({ success: false, message }, { headers, status: 400 })
  }
}
