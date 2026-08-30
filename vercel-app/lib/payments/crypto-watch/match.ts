import { cryptoAmountsMatch } from '@/lib/payments/crypto-unique-amount'
import {
  CRYPTO_ASSET_DEFS,
  normalizeCryptoWalletAddress,
  type CryptoAssetKey,
} from '@/lib/payments/crypto-assets'

export type CryptoWatchTx = {
  txHash: string
  toAddress: string
  amount: number
  timestampMs: number
  confirmations: number
  asset: CryptoAssetKey
}

export type CryptoWatchAttempt = {
  id: string
  asset: CryptoAssetKey
  walletAddress: string
  amountCrypto: number
  createdAtMs: number
  status: 'pending' | 'seen' | 'confirmed' | 'expired' | 'cancelled'
  txHash?: string | null
}

export type CryptoWatchMatch = {
  attemptId: string
  txHash: string
  confirmations: number
  nextStatus: 'seen' | 'confirmed'
}

const CREATED_SLACK_MS = 30_000

export function normalizeTxHash(raw: string): string {
  return String(raw || '').trim().toLowerCase()
}

export function matchCryptoWatchDeposit(params: {
  attempts: CryptoWatchAttempt[]
  txs: CryptoWatchTx[]
  usedTxHashes: string[]
}): CryptoWatchMatch | null {
  const used = new Set(params.usedTxHashes.map(normalizeTxHash).filter(Boolean))
  const live = params.attempts
    .filter((a) => a.status === 'pending' || a.status === 'seen')
    .slice()
    .sort((a, b) => a.createdAtMs - b.createdAtMs)

  for (const attempt of live) {
    const def = CRYPTO_ASSET_DEFS[attempt.asset]
    const wallet = normalizeCryptoWalletAddress(attempt.asset, attempt.walletAddress)
    if (!wallet) continue
    const already = normalizeTxHash(String(attempt.txHash || ''))
    const candidates = params.txs.filter((tx) => {
      if (tx.asset !== attempt.asset) return false
      if (normalizeCryptoWalletAddress(tx.asset, tx.toAddress) !== wallet) return false
      if (tx.timestampMs + 1000 < attempt.createdAtMs - CREATED_SLACK_MS) return false
      if (!cryptoAmountsMatch(attempt.asset, attempt.amountCrypto, tx.amount)) return false
      const hash = normalizeTxHash(tx.txHash)
      if (!hash) return false
      if (already && hash !== already) return false
      if (!already && used.has(hash)) return false
      return true
    })
    candidates.sort((a, b) => a.timestampMs - b.timestampMs)
    const hit = candidates[0]
    if (!hit) continue
    const confirmed = hit.confirmations >= def.minConfirmations
    if (attempt.asset === 'btc' && !confirmed) {
      return {
        attemptId: attempt.id,
        txHash: normalizeTxHash(hit.txHash),
        confirmations: hit.confirmations,
        nextStatus: 'seen',
      }
    }
    if (!confirmed && attempt.status === 'pending' && attempt.asset === 'btc') {
      return {
        attemptId: attempt.id,
        txHash: normalizeTxHash(hit.txHash),
        confirmations: hit.confirmations,
        nextStatus: 'seen',
      }
    }
    if (confirmed) {
      return {
        attemptId: attempt.id,
        txHash: normalizeTxHash(hit.txHash),
        confirmations: hit.confirmations,
        nextStatus: 'confirmed',
      }
    }
  }
  return null
}

/** 같은 지갑·시간대에 금액만 다른 입금 — 과소·과대 안내 */
export function findCryptoWatchAmountMismatch(params: {
  attempt: CryptoWatchAttempt
  txs: CryptoWatchTx[]
  usedTxHashes: string[]
}): { txHash: string; amount: number } | null {
  const used = new Set(params.usedTxHashes.map(normalizeTxHash).filter(Boolean))
  const wallet = normalizeCryptoWalletAddress(params.attempt.asset, params.attempt.walletAddress)
  if (!wallet) return null
  const hits = params.txs.filter((tx) => {
    if (tx.asset !== params.attempt.asset) return false
    if (normalizeCryptoWalletAddress(tx.asset, tx.toAddress) !== wallet) return false
    if (tx.timestampMs + 1000 < params.attempt.createdAtMs - CREATED_SLACK_MS) return false
    if (cryptoAmountsMatch(params.attempt.asset, params.attempt.amountCrypto, tx.amount)) return false
    const hash = normalizeTxHash(tx.txHash)
    if (!hash || used.has(hash)) return false
    return tx.amount > 0
  })
  hits.sort((a, b) => a.timestampMs - b.timestampMs)
  const hit = hits[0]
  if (!hit) return null
  return { txHash: normalizeTxHash(hit.txHash), amount: hit.amount }
}
