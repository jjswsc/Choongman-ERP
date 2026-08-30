import { apiFetchWithOffline } from '../api/fetch-offline'
import type { CryptoAssetKey, PosCryptoPaymentSettings } from '@/lib/payments/crypto-assets'
import type { CryptoPaymentAttempt } from '@/lib/payments/crypto-attempt-types'

export async function getPosCryptoPaymentSettings(storeCode: string): Promise<PosCryptoPaymentSettings & { storeCode: string }> {
  const q = new URLSearchParams({ storeCode: String(storeCode || '').trim() })
  const res = await apiFetchWithOffline('/api/posCryptoPaymentSettings?' + q.toString())
  return res.json()
}

export async function savePosCryptoPaymentSettings(params: {
  storeCode: string
  enabled: boolean
  wallets: PosCryptoPaymentSettings['wallets']
  assetsEnabled: PosCryptoPaymentSettings['assetsEnabled']
  rateSource: PosCryptoPaymentSettings['rateSource']
}): Promise<{ success: boolean; message?: string }> {
  const res = await apiFetchWithOffline('/api/posCryptoPaymentSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json()
}

export async function createPosCryptoAttempt(params: {
  storeCode: string
  asset: CryptoAssetKey
  amountThb: number
  amountCrypto?: number
  orderId?: number | null
}): Promise<{ success: boolean; attempt?: CryptoPaymentAttempt; message?: string }> {
  const res = await apiFetchWithOffline('/api/posCryptoAttempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', ...params }),
  })
  return res.json()
}

export async function pollPosCryptoAttempt(params: {
  id: string
  storeCode: string
  watch: boolean
}): Promise<{ success: boolean; attempt?: CryptoPaymentAttempt; message?: string }> {
  const q = new URLSearchParams({
    id: params.id,
    storeCode: params.storeCode,
    ...(params.watch ? { watch: '1' } : {}),
  })
  const res = await apiFetchWithOffline('/api/posCryptoAttempt?' + q.toString())
  return res.json()
}

export async function confirmPosCryptoAttempt(params: {
  id: string
  storeCode: string
  confirmedBy?: string
}): Promise<{ success: boolean; attempt?: CryptoPaymentAttempt; message?: string }> {
  const res = await apiFetchWithOffline('/api/posCryptoAttempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm', ...params }),
  })
  return res.json()
}

export async function cancelPosCryptoAttempt(params: {
  id: string
  storeCode: string
}): Promise<{ success: boolean; attempt?: CryptoPaymentAttempt; message?: string }> {
  const res = await apiFetchWithOffline('/api/posCryptoAttempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', ...params }),
  })
  return res.json()
}
