import { CRYPTO_ASSET_DEFS, type CryptoAssetKey } from '@/lib/payments/crypto-assets'

export function roundCryptoAmount(raw: number, decimals: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0
  const f = 10 ** decimals
  return Math.round(raw * f) / f
}

export function thbToCryptoAmount(amountThb: number, rateThbPerCoin: number, asset: CryptoAssetKey): number {
  const thb = Math.max(0, Number(amountThb) || 0)
  const rate = Math.max(0, Number(rateThbPerCoin) || 0)
  if (thb <= 0 || rate <= 0) return 0
  return roundCryptoAmount(thb / rate, CRYPTO_ASSET_DEFS[asset].decimals)
}

/** pending 수량과 겹치지 않게 unique step을 더함 */
export function allocateUniqueCryptoAmount(params: {
  asset: CryptoAssetKey
  baseAmount: number
  takenAmounts: number[]
}): { amount: number; adjusted: boolean } {
  const def = CRYPTO_ASSET_DEFS[params.asset]
  const base = roundCryptoAmount(params.baseAmount, def.decimals)
  if (base <= 0) return { amount: 0, adjusted: false }
  const taken = new Set(
    params.takenAmounts
      .map((n) => roundCryptoAmount(Number(n) || 0, def.decimals))
      .filter((n) => n > 0)
  )
  for (let i = 0; i < 400; i++) {
    const candidate = roundCryptoAmount(base + i * def.uniqueStep, def.decimals)
    if (candidate > 0 && !taken.has(candidate)) {
      return { amount: candidate, adjusted: i > 0 }
    }
  }
  return {
    amount: roundCryptoAmount(base + (Date.now() % 90) * def.uniqueStep, def.decimals),
    adjusted: true,
  }
}

export function cryptoAmountsMatch(asset: CryptoAssetKey, expected: number, incoming: number): boolean {
  const def = CRYPTO_ASSET_DEFS[asset]
  const a = roundCryptoAmount(expected, def.decimals)
  const b = roundCryptoAmount(incoming, def.decimals)
  if (a <= 0 || b <= 0) return false
  return Math.abs(a - b) <= def.matchEps
}
