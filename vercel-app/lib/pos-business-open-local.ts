/**
 * 영업 시작(시제) — sessionStorage 빠른 경로
 * IndexedDB 지연·실패 시에도 터미널·주문 게이트가 즉시 통과할 수 있게 함.
 */

import { isPosBusinessOpenRecorded } from '@/lib/pos-business-open-gate'
import type { PosSettlement } from '@/lib/api-client'
import { settlementStoreCacheKeys } from '@/lib/offline/settlement-offline'
import { normStoreKey } from '@/lib/store-list-keys'

const STORAGE_PREFIX = 'cm_pos_business_open_v1'

type LocalBusinessOpenRecord = {
  settleDate: string
  cashActual: number
  savedAt: number
}

function storageKeyForStore(storeCode: string): string {
  return `${STORAGE_PREFIX}:${normStoreKey(storeCode)}`
}

export function writePosBusinessOpenLocal(params: {
  storeCode: string
  settleDate: string
  cashActual: number
}): void {
  if (typeof sessionStorage === 'undefined') return
  const settleDate = String(params.settleDate || '').trim().slice(0, 10)
  if (!settleDate || !Number.isFinite(params.cashActual)) return
  const record: LocalBusinessOpenRecord = {
    settleDate,
    cashActual: params.cashActual,
    savedAt: Date.now(),
  }
  const payload = JSON.stringify(record)
  for (const sc of settlementStoreCacheKeys(params.storeCode)) {
    try {
      sessionStorage.setItem(storageKeyForStore(sc), payload)
    } catch {
      /* quota / private mode */
    }
  }
}

export function readPosBusinessOpenLocal(storeCode: string, settleDate: string): boolean {
  if (typeof sessionStorage === 'undefined') return false
  const targetDate = String(settleDate || '').trim().slice(0, 10)
  if (!targetDate) return false
  for (const sc of settlementStoreCacheKeys(storeCode)) {
    try {
      const raw = sessionStorage.getItem(storageKeyForStore(sc))
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<LocalBusinessOpenRecord>
      if (String(parsed.settleDate || '').trim().slice(0, 10) !== targetDate) continue
      if (isPosBusinessOpenRecorded({ cashActual: Number(parsed.cashActual) } as PosSettlement)) return true
    } catch {
      /* ignore */
    }
  }
  return false
}
