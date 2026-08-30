import type { CryptoPaymentAttempt } from '@/lib/payments/crypto-attempt-types'

export function cryptoAttemptToOrderMeta(attempt: CryptoPaymentAttempt): Record<string, unknown> {
  return {
    asset: attempt.asset,
    network: attempt.network,
    amountThb: attempt.amountThb,
    amountCrypto: attempt.amountCrypto,
    rateThb: attempt.rateThb,
    walletAddress: attempt.walletAddress,
    attemptId: attempt.id,
    txHash: attempt.txHash,
    confirmMode: attempt.confirmedBy === 'watch' ? 'watch' : 'manual',
  }
}
