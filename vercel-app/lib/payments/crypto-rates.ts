import { CRYPTO_ASSET_DEFS, type CryptoAssetKey } from '@/lib/payments/crypto-assets'

export type CryptoRateQuote = {
  asset: CryptoAssetKey
  rateThb: number
  source: 'coingecko' | 'manual'
}

/** attempt 생성 시에만 호출. 매장 OFF·대기 전 호출 금지. */
export async function fetchCryptoRateThb(asset: CryptoAssetKey): Promise<CryptoRateQuote | null> {
  const id = CRYPTO_ASSET_DEFS[asset].rateId
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=thb`,
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    const json = (await res.json()) as Record<string, { thb?: number }>
    const rate = Number(json?.[id]?.thb)
    if (!Number.isFinite(rate) || rate <= 0) return null
    return { asset, rateThb: rate, source: 'coingecko' }
  } catch {
    return null
  }
}
