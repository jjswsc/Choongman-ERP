/**
 * 충만(Choongman) 매장별 KBank Merchant ID 기본값.
 * 은행 개통(2026-08): HUAMAK / SEACON SQUARE
 * SaaS Admin·tenant_store_integrations 가 있으면 그 값이 우선(resolve에서 DB를 뒤에 적용).
 */
import type { StoreKbankConfig } from '@/lib/tenant-integration-types'

export type ChoongmanKbankStoreDefault = StoreKbankConfig & {
  /** ERP store_code 후보 (첫 항목이 정식 코드) */
  storeCodes: string[]
  label: string
}

/** Partner ID는 공통 PTR0000115 (테넌트/env) */
export const CHOONGMAN_KBANK_STORE_DEFAULTS: ChoongmanKbankStoreDefault[] = [
  {
    label: 'CHOONGMAN HUAMAK',
    storeCodes: ['CM Huamak', 'Huamak', 'CM HUAMAK'],
    merchantId: 'KB000002340300',
    partnerShopId: 'SJGLB00007',
  },
  {
    label: 'CHOONGMAN SEACON SQUARE',
    storeCodes: ['CM Seacon Srinakarin', 'Seacon Srinakarin', 'CM Seacon Square', 'Seacon Square'],
    merchantId: 'KB000002340299',
    partnerShopId: 'SJGLB00006',
  },
]

function normalizeStoreKey(v: string): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function lookupChoongmanKbankStoreDefaults(storeCode: string): StoreKbankConfig | null {
  const key = normalizeStoreKey(storeCode)
  if (!key) return null
  for (const row of CHOONGMAN_KBANK_STORE_DEFAULTS) {
    const codes = row.storeCodes.map(normalizeStoreKey)
    const hit =
      codes.includes(key) ||
      codes.some((c) => key.includes(c) || c.includes(key)) ||
      (key.includes('huamak') && row.merchantId === 'KB000002340300') ||
      (key.includes('seacon') && row.merchantId === 'KB000002340299')
    if (!hit) continue
    return {
      merchantId: row.merchantId,
      partnerShopId: row.partnerShopId,
      terminalId: row.terminalId,
      qrEnabled: true,
    }
  }
  return null
}
