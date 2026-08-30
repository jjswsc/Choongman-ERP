import { NextRequest, NextResponse } from 'next/server'
import {
  defaultPosCryptoPaymentSettings,
  emptyCryptoAssetsEnabled,
  emptyCryptoWallets,
  parseCryptoAssetsEnabled,
  parseCryptoWallets,
} from '@/lib/payments/crypto-assets'
import {
  CryptoPaymentError,
  loadPosCryptoPaymentSettings,
  savePosCryptoPaymentSettings,
} from '@/lib/payments/crypto-provider'

function cors() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  return headers
}

export async function GET(request: NextRequest) {
  const headers = cors()
  const storeCode = String(new URL(request.url).searchParams.get('storeCode') || '').trim()
  if (!storeCode) {
    return NextResponse.json({ ...defaultPosCryptoPaymentSettings(), storeCode: '' }, { headers })
  }
  const settings = await loadPosCryptoPaymentSettings(storeCode)
  return NextResponse.json({ storeCode, ...settings }, { headers })
}

export async function POST(request: NextRequest) {
  const headers = cors()
  try {
    const body = await request.json()
    const storeCode = String(body?.storeCode || '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'posCryptoErrCreate' }, { headers, status: 400 })
    }
    const wallets = parseCryptoWallets(body?.wallets ?? emptyCryptoWallets())
    const assetsEnabled = parseCryptoAssetsEnabled(body?.assetsEnabled ?? emptyCryptoAssetsEnabled())
    const enabled = body?.enabled === true
    const hasUsable = Object.entries(assetsEnabled).some(
      ([key, on]) => on === true && Boolean(String(wallets[key as keyof typeof wallets] || '').trim())
    )
    if (enabled && !hasUsable) {
      return NextResponse.json(
        { success: false, message: 'posCryptoNoAsset' },
        { headers, status: 400 }
      )
    }
    await savePosCryptoPaymentSettings({
      storeCode,
      enabled,
      wallets,
      assetsEnabled,
      rateSource: body?.rateSource === 'coingecko' ? 'coingecko' : 'manual',
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    const message = e instanceof CryptoPaymentError ? e.key : e instanceof Error ? e.message : 'posCryptoErrCreate'
    return NextResponse.json({ success: false, message }, { headers, status: 400 })
  }
}
