import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpdateByFilterReturning,
} from '@/lib/supabase-server'
import {
  CRYPTO_ASSET_DEFS,
  CRYPTO_ASSET_KEYS,
  defaultPosCryptoPaymentSettings,
  isCryptoAssetKey,
  listUsableCryptoAssets,
  parseCryptoAssetsEnabled,
  parseCryptoWallets,
  validateCryptoWalletAddress,
  type CryptoAssetKey,
  type PosCryptoPaymentSettings,
} from '@/lib/payments/crypto-assets'
import { cryptoExplorerKeysPresent, fetchCryptoWatchTxs } from '@/lib/payments/crypto-watch/explorers'
import { findCryptoWatchAmountMismatch, matchCryptoWatchDeposit, normalizeTxHash } from '@/lib/payments/crypto-watch/match'
import { fetchCryptoRateThb } from '@/lib/payments/crypto-rates'
import { allocateUniqueCryptoAmount, thbToCryptoAmount } from '@/lib/payments/crypto-unique-amount'
import type { CryptoAttemptStatus, CryptoPaymentAttempt } from '@/lib/payments/crypto-attempt-types'

export class CryptoPaymentError extends Error {
  readonly key: string
  constructor(key: string) {
    super(key)
    this.name = 'CryptoPaymentError'
    this.key = key
  }
}

export type { CryptoAttemptStatus, CryptoPaymentAttempt } from '@/lib/payments/crypto-attempt-types'

export const CRYPTO_ATTEMPT_TTL_MS = 15 * 60 * 1000

type AttemptRow = {
  id?: number
  store_code?: string
  order_id?: number | null
  status?: string
  asset?: string
  network?: string
  wallet_address?: string
  amount_thb?: number
  amount_crypto?: number
  rate_thb?: number | null
  tx_hash?: string | null
  confirmations?: number
  confirmed_by?: string | null
  expires_at?: string
  created_at?: string
}

function rowToAttempt(row: AttemptRow): CryptoPaymentAttempt | null {
  const asset = String(row.asset || '').trim()
  if (!isCryptoAssetKey(asset)) return null
  return {
    id: String(row.id ?? ''),
    storeCode: String(row.store_code || '').trim(),
    orderId: row.order_id != null ? Number(row.order_id) : null,
    status: (String(row.status || 'pending') as CryptoAttemptStatus) || 'pending',
    asset,
    network: String(row.network || CRYPTO_ASSET_DEFS[asset].network),
    walletAddress: String(row.wallet_address || '').trim(),
    amountThb: Math.max(0, Number(row.amount_thb) || 0),
    amountCrypto: Math.max(0, Number(row.amount_crypto) || 0),
    rateThb: row.rate_thb != null ? Number(row.rate_thb) : null,
    txHash: row.tx_hash ? String(row.tx_hash) : null,
    confirmations: Math.max(0, Number(row.confirmations) || 0),
    confirmedBy: row.confirmed_by ? String(row.confirmed_by) : null,
    expiresAt: String(row.expires_at || ''),
    createdAt: String(row.created_at || ''),
    watchHint: null,
  }
}

export async function loadPosCryptoPaymentSettings(storeCode: string): Promise<PosCryptoPaymentSettings> {
  const code = String(storeCode || '').trim()
  const fallback = defaultPosCryptoPaymentSettings()
  fallback.explorerKeys = cryptoExplorerKeysPresent()
  if (!code) return fallback
  try {
    const rows = (await supabaseSelectFilter('pos_payment_settings', `store_code=eq.${encodeURIComponent(code)}`, {
      limit: 1,
      select: 'crypto_payment_enabled,crypto_wallets,crypto_assets_enabled,crypto_rate_source',
    })) as {
      crypto_payment_enabled?: boolean
      crypto_wallets?: unknown
      crypto_assets_enabled?: unknown
      crypto_rate_source?: string
    }[] | null
    const raw = rows?.[0]
    if (!raw) return fallback
    const rateSource = String(raw.crypto_rate_source || 'manual').trim() === 'coingecko' ? 'coingecko' : 'manual'
    return {
      enabled: raw.crypto_payment_enabled === true,
      wallets: parseCryptoWallets(raw.crypto_wallets),
      assetsEnabled: parseCryptoAssetsEnabled(raw.crypto_assets_enabled),
      rateSource,
      explorerKeys: cryptoExplorerKeysPresent(),
    }
  } catch {
    return fallback
  }
}

export async function savePosCryptoPaymentSettings(params: {
  storeCode: string
  enabled: boolean
  wallets: ReturnType<typeof parseCryptoWallets>
  assetsEnabled: ReturnType<typeof parseCryptoAssetsEnabled>
  rateSource: 'manual' | 'coingecko'
}): Promise<void> {
  const storeCode = String(params.storeCode || '').trim()
  if (!storeCode) throw new CryptoPaymentError('posCryptoErrCreate')
  const wallets = parseCryptoWallets(params.wallets)
  const assetsEnabled = parseCryptoAssetsEnabled(params.assetsEnabled)
  for (const key of CRYPTO_ASSET_KEYS) {
    const addr = String(wallets[key] || '').trim()
    if (params.enabled === true && assetsEnabled[key] === true) {
      const v = validateCryptoWalletAddress(key, addr)
      if (!v.ok) throw new CryptoPaymentError(v.errorKey || 'posCryptoErrNoWallet')
      wallets[key] = v.normalized
    } else if (addr) {
      const v = validateCryptoWalletAddress(key, addr)
      wallets[key] = v.ok ? v.normalized : addr
    }
  }
  const existing = (await supabaseSelectFilter('pos_payment_settings', `store_code=eq.${encodeURIComponent(storeCode)}`, {
    limit: 1,
    select: 'store_code',
  })) as { store_code?: string }[] | null
  const row = {
    store_code: storeCode,
    crypto_payment_enabled: params.enabled === true,
    crypto_wallets: wallets,
    crypto_assets_enabled: assetsEnabled,
    crypto_rate_source: params.rateSource === 'coingecko' ? 'coingecko' : 'manual',
    updated_at: new Date().toISOString(),
  }
  if (existing?.length) {
    await supabaseUpdateByFilter('pos_payment_settings', `store_code=eq.${encodeURIComponent(storeCode)}`, row)
    return
  }
  await supabaseInsert('pos_payment_settings', {
    ...row,
    card_keys: ['Visa', 'Master', 'Amex', 'JCB', 'Other'],
    qr_keys: ['TrueMoney', 'WeChat', 'Alipay', 'PromptPay', 'LINE Pay', 'Shopee Pay', 'Other'],
  })
}

function isExpired(attempt: CryptoPaymentAttempt, nowMs = Date.now()): boolean {
  const exp = new Date(attempt.expiresAt).getTime()
  return Number.isFinite(exp) && exp <= nowMs
}

export async function createCryptoPaymentAttempt(params: {
  storeCode: string
  asset: CryptoAssetKey
  amountThb: number
  amountCryptoOverride?: number
  orderId?: number | null
}): Promise<CryptoPaymentAttempt> {
  const storeCode = String(params.storeCode || '').trim()
  const settings = await loadPosCryptoPaymentSettings(storeCode)
  if (!listUsableCryptoAssets(settings).includes(params.asset)) {
    throw new CryptoPaymentError('posCryptoErrAssetOff')
  }
  const walletCheck = validateCryptoWalletAddress(params.asset, String(settings.wallets[params.asset] || ''))
  if (!walletCheck.ok) throw new CryptoPaymentError(walletCheck.errorKey || 'posCryptoErrNoWallet')
  const wallet = walletCheck.normalized

  const amountThb = Math.round(Math.max(0, Number(params.amountThb) || 0) * 100) / 100
  if (amountThb <= 0) throw new CryptoPaymentError('posCryptoErrAmount')

  let rateThb: number | null = null
  let baseCrypto = Math.max(0, Number(params.amountCryptoOverride) || 0)
  if (baseCrypto <= 0) {
    const quote = await fetchCryptoRateThb(params.asset)
    if (quote) {
      rateThb = quote.rateThb
      baseCrypto = thbToCryptoAmount(amountThb, quote.rateThb, params.asset)
    }
  }
  if (baseCrypto <= 0) throw new CryptoPaymentError('posCryptoErrQty')

  const pending = (await supabaseSelectFilter(
    'pos_crypto_payment_attempts',
    `store_code=eq.${encodeURIComponent(storeCode)}&asset=eq.${encodeURIComponent(params.asset)}&status=in.(pending,seen)`,
    { limit: 80, select: 'amount_crypto' }
  )) as { amount_crypto?: number }[] | null
  const allocated = allocateUniqueCryptoAmount({
    asset: params.asset,
    baseAmount: baseCrypto,
    takenAmounts: (pending || []).map((r) => Number(r.amount_crypto) || 0),
  })
  const amountCrypto = allocated.amount

  const now = new Date()
  const inserted = (await supabaseInsert('pos_crypto_payment_attempts', {
    store_code: storeCode,
    order_id: params.orderId && params.orderId > 0 ? params.orderId : null,
    status: 'pending',
    asset: params.asset,
    network: CRYPTO_ASSET_DEFS[params.asset].network,
    wallet_address: wallet,
    amount_thb: amountThb,
    amount_crypto: amountCrypto,
    rate_thb: rateThb,
    expires_at: new Date(now.getTime() + CRYPTO_ATTEMPT_TTL_MS).toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  })) as AttemptRow[] | AttemptRow | null
  const row = Array.isArray(inserted) ? inserted[0] : inserted
  const attempt = row ? rowToAttempt(row) : null
  if (!attempt?.id) throw new CryptoPaymentError('posCryptoErrCreate')
  return { ...attempt, amountAdjusted: allocated.adjusted }
}

async function markAttempt(
  id: string,
  patch: Record<string, unknown>
): Promise<CryptoPaymentAttempt | null> {
  const updated = (await supabaseUpdateByFilterReturning(
    'pos_crypto_payment_attempts',
    `id=eq.${encodeURIComponent(id)}`,
    {
      ...patch,
      updated_at: new Date().toISOString(),
    }
  )) as AttemptRow[] | AttemptRow | null
  const row = Array.isArray(updated) ? updated[0] : updated
  return row ? rowToAttempt(row) : null
}

export async function watchCryptoPaymentAttempt(attempt: CryptoPaymentAttempt): Promise<CryptoPaymentAttempt> {
  if (attempt.status !== 'pending' && attempt.status !== 'seen') return attempt
  if (isExpired(attempt)) {
    const expired = await markAttempt(attempt.id, { status: 'expired' })
    return expired ?? { ...attempt, status: 'expired' }
  }

  let txs
  try {
    txs = await fetchCryptoWatchTxs({ asset: attempt.asset, walletAddress: attempt.walletAddress })
  } catch {
    return attempt
  }

  const usedRows = (await supabaseSelectFilter(
    'pos_crypto_payment_attempts',
    `tx_hash=not.is.null&id=neq.${encodeURIComponent(attempt.id)}`,
    { limit: 80, select: 'tx_hash' }
  )) as { tx_hash?: string }[] | null

  const match = matchCryptoWatchDeposit({
    attempts: [
      {
        id: attempt.id,
        asset: attempt.asset,
        walletAddress: attempt.walletAddress,
        amountCrypto: attempt.amountCrypto,
        createdAtMs: new Date(attempt.createdAt).getTime(),
        status: attempt.status,
        txHash: attempt.txHash,
      },
    ],
    txs,
    usedTxHashes: (usedRows || []).map((r) => String(r.tx_hash || '')),
  })
  if (!match || match.attemptId !== attempt.id) {
    const mismatch = findCryptoWatchAmountMismatch({
      attempt: {
        id: attempt.id,
        asset: attempt.asset,
        walletAddress: attempt.walletAddress,
        amountCrypto: attempt.amountCrypto,
        createdAtMs: new Date(attempt.createdAt).getTime(),
        status: attempt.status,
        txHash: attempt.txHash,
      },
      txs,
      usedTxHashes: (usedRows || []).map((r) => String(r.tx_hash || '')),
    })
    return mismatch ? { ...attempt, watchHint: 'amount_mismatch' } : attempt
  }

  const next = await markAttempt(attempt.id, {
    status: match.nextStatus,
    tx_hash: match.txHash,
    confirmations: match.confirmations,
    confirmed_by: match.nextStatus === 'confirmed' ? 'watch' : attempt.confirmedBy,
  })
  return next ?? attempt
}

export async function getCryptoPaymentAttempt(params: {
  id: string
  storeCode: string
  watch: boolean
}): Promise<CryptoPaymentAttempt | null> {
  const id = String(params.id || '').trim()
  const storeCode = String(params.storeCode || '').trim()
  if (!id || !storeCode) return null
  const rows = (await supabaseSelectFilter(
    'pos_crypto_payment_attempts',
    `id=eq.${encodeURIComponent(id)}&store_code=eq.${encodeURIComponent(storeCode)}`,
    { limit: 1 }
  )) as AttemptRow[] | null
  const attempt = rows?.[0] ? rowToAttempt(rows[0]) : null
  if (!attempt) return null
  if (!params.watch) return isExpired(attempt) && (attempt.status === 'pending' || attempt.status === 'seen')
    ? (await markAttempt(attempt.id, { status: 'expired' })) ?? { ...attempt, status: 'expired' }
    : attempt
  return watchCryptoPaymentAttempt(attempt)
}

export async function confirmCryptoPaymentAttemptManual(params: {
  id: string
  storeCode: string
  confirmedBy: string
}): Promise<CryptoPaymentAttempt> {
  const current = await getCryptoPaymentAttempt({ id: params.id, storeCode: params.storeCode, watch: false })
  if (!current) throw new CryptoPaymentError('posCryptoErrNotFound')
  if (current.status === 'confirmed') return current
  if (current.status === 'cancelled') throw new CryptoPaymentError('posCryptoErrCancelled')
  const next = await markAttempt(current.id, {
    status: 'confirmed',
    confirmed_by: String(params.confirmedBy || 'staff').trim() || 'staff',
  })
  if (!next) throw new CryptoPaymentError('posCryptoErrConfirm')
  return next
}

export async function cancelCryptoPaymentAttempt(params: {
  id: string
  storeCode: string
}): Promise<CryptoPaymentAttempt> {
  const current = await getCryptoPaymentAttempt({ id: params.id, storeCode: params.storeCode, watch: false })
  if (!current) throw new CryptoPaymentError('posCryptoErrNotFound')
  if (current.status === 'confirmed') return current
  const next = await markAttempt(current.id, { status: 'cancelled' })
  if (!next) throw new CryptoPaymentError('posCryptoErrCancel')
  return next
}

export { cryptoAttemptToOrderMeta } from '@/lib/payments/crypto-attempt-meta'

export function normalizeTxHashForSave(raw: unknown): string {
  return normalizeTxHash(String(raw || ''))
}
