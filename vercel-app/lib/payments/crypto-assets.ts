/** POS 암호화폐 자산 — 메인넷만. 개인키 없음. */

export const CRYPTO_ASSET_KEYS = ['usdt_trc20', 'usdt_erc20', 'usdc_erc20', 'btc', 'eth'] as const

export type CryptoAssetKey = (typeof CRYPTO_ASSET_KEYS)[number]

export type CryptoNetwork = 'trc20' | 'erc20' | 'bitcoin' | 'ethereum'

export type CryptoWallets = Partial<Record<CryptoAssetKey, string>>
export type CryptoAssetsEnabled = Partial<Record<CryptoAssetKey, boolean>>

export const CRYPTO_CONTRACTS = {
  usdtErc20: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  usdcErc20: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  usdtTrc20: 'TR7NHqjeKQwFCHDndysssW23hcuKqpNPSe',
} as const

export type CryptoAssetDef = {
  key: CryptoAssetKey
  asset: 'USDT' | 'USDC' | 'BTC' | 'ETH'
  network: CryptoNetwork
  networkLabel: string
  decimals: number
  uniqueStep: number
  matchEps: number
  minConfirmations: number
  rateId: 'tether' | 'usd-coin' | 'bitcoin' | 'ethereum'
}

export const CRYPTO_ASSET_DEFS: Record<CryptoAssetKey, CryptoAssetDef> = {
  usdt_trc20: {
    key: 'usdt_trc20',
    asset: 'USDT',
    network: 'trc20',
    networkLabel: 'TRON (TRC20)',
    decimals: 2,
    uniqueStep: 0.01,
    matchEps: 0.001,
    minConfirmations: 1,
    rateId: 'tether',
  },
  usdt_erc20: {
    key: 'usdt_erc20',
    asset: 'USDT',
    network: 'erc20',
    networkLabel: 'Ethereum (ERC20)',
    decimals: 2,
    uniqueStep: 0.01,
    matchEps: 0.001,
    minConfirmations: 1,
    rateId: 'tether',
  },
  usdc_erc20: {
    key: 'usdc_erc20',
    asset: 'USDC',
    network: 'erc20',
    networkLabel: 'Ethereum (ERC20)',
    decimals: 2,
    uniqueStep: 0.01,
    matchEps: 0.001,
    minConfirmations: 1,
    rateId: 'usd-coin',
  },
  btc: {
    key: 'btc',
    asset: 'BTC',
    network: 'bitcoin',
    networkLabel: 'Bitcoin',
    decimals: 8,
    uniqueStep: 0.00001,
    matchEps: 0.00000001,
    minConfirmations: 1,
    rateId: 'bitcoin',
  },
  eth: {
    key: 'eth',
    asset: 'ETH',
    network: 'ethereum',
    networkLabel: 'Ethereum',
    decimals: 6,
    uniqueStep: 0.00001,
    matchEps: 0.0000001,
    minConfirmations: 1,
    rateId: 'ethereum',
  },
}

export function isCryptoAssetKey(raw: unknown): raw is CryptoAssetKey {
  return CRYPTO_ASSET_KEYS.includes(String(raw || '').trim() as CryptoAssetKey)
}

export function normalizeCryptoWalletAddress(asset: CryptoAssetKey, raw: string): string {
  return validateCryptoWalletAddress(asset, raw).normalized
}

export function validateCryptoWalletAddress(
  asset: CryptoAssetKey,
  raw: string
): { ok: boolean; normalized: string; errorKey?: string } {
  const s = String(raw || '').trim()
  if (!s) return { ok: false, normalized: '', errorKey: 'posCryptoErrNoWallet' }
  if (asset === 'usdt_trc20') {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) {
      return { ok: false, normalized: s, errorKey: 'posCryptoErrWalletTron' }
    }
    return { ok: true, normalized: s }
  }
  if (asset === 'usdt_erc20' || asset === 'usdc_erc20' || asset === 'eth') {
    const n = s.toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(n)) {
      return { ok: false, normalized: n, errorKey: 'posCryptoErrWalletEvm' }
    }
    return { ok: true, normalized: n }
  }
  if (asset === 'btc') {
    const legacy = /^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(s)
    const bech32 = /^bc1[a-z0-9]{25,87}$/i.test(s)
    if (!legacy && !bech32) {
      return { ok: false, normalized: s, errorKey: 'posCryptoErrWalletBtc' }
    }
    return { ok: true, normalized: s }
  }
  return { ok: true, normalized: s }
}

/** 마스터가 꺼져 있으면 POS·결산·손님 화면에 암호화폐를 노출하지 않음 */
export function isPosCryptoFeatureEnabled(settings: PosCryptoPaymentSettings | null | undefined): boolean {
  return settings?.enabled === true
}

export function emptyCryptoWallets(): CryptoWallets {
  return {
    usdt_trc20: '',
    usdt_erc20: '',
    usdc_erc20: '',
    btc: '',
    eth: '',
  }
}

export function emptyCryptoAssetsEnabled(): CryptoAssetsEnabled {
  return {
    usdt_trc20: false,
    usdt_erc20: false,
    usdc_erc20: false,
    btc: false,
    eth: false,
  }
}

export function parseCryptoWallets(raw: unknown): CryptoWallets {
  const out = emptyCryptoWallets()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const o = raw as Record<string, unknown>
  for (const key of CRYPTO_ASSET_KEYS) {
    out[key] = String(o[key] ?? '').trim()
  }
  return out
}

export function parseCryptoAssetsEnabled(raw: unknown): CryptoAssetsEnabled {
  const out = emptyCryptoAssetsEnabled()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const o = raw as Record<string, unknown>
  for (const key of CRYPTO_ASSET_KEYS) {
    out[key] = o[key] === true
  }
  return out
}

export type PosCryptoPaymentSettings = {
  enabled: boolean
  wallets: CryptoWallets
  assetsEnabled: CryptoAssetsEnabled
  rateSource: 'manual' | 'coingecko'
  explorerKeys: { etherscan: boolean; trongrid: boolean }
}

export function defaultPosCryptoPaymentSettings(): PosCryptoPaymentSettings {
  return {
    enabled: false,
    wallets: emptyCryptoWallets(),
    assetsEnabled: emptyCryptoAssetsEnabled(),
    rateSource: 'coingecko',
    explorerKeys: { etherscan: false, trongrid: false },
  }
}

/** 마스터 ON + 해당 코인 ON + 주소 있음 */
export function listUsableCryptoAssets(settings: PosCryptoPaymentSettings): CryptoAssetKey[] {
  if (settings.enabled !== true) return []
  return CRYPTO_ASSET_KEYS.filter((key) => {
    if (settings.assetsEnabled[key] !== true) return false
    return Boolean(String(settings.wallets[key] || '').trim())
  })
}

export function isPosCryptoPaymentTabVisible(settings: PosCryptoPaymentSettings | null | undefined): boolean {
  if (!settings) return false
  return listUsableCryptoAssets(settings).length > 0
}

export function buildCryptoQrPayload(asset: CryptoAssetKey, address: string, amountCrypto: number): string {
  const addr = String(address || '').trim()
  if (!addr) return ''
  if (asset === 'btc') {
    const amt = Number(amountCrypto)
    if (Number.isFinite(amt) && amt > 0) return `bitcoin:${addr}?amount=${amt}`
    return `bitcoin:${addr}`
  }
  return addr
}
