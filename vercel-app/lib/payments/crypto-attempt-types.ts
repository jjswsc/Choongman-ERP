import type { CryptoAssetKey } from '@/lib/payments/crypto-assets'

export type CryptoAttemptStatus = 'pending' | 'seen' | 'confirmed' | 'expired' | 'cancelled'

export type CryptoPaymentAttempt = {
  id: string
  storeCode: string
  orderId: number | null
  status: CryptoAttemptStatus
  asset: CryptoAssetKey
  network: string
  walletAddress: string
  amountThb: number
  amountCrypto: number
  rateThb: number | null
  txHash: string | null
  confirmations: number
  confirmedBy: string | null
  expiresAt: string
  createdAt: string
  amountAdjusted?: boolean
  watchHint?: 'amount_mismatch' | null
}
