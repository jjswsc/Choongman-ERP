/**
 * 충만(Choongman) 매장별 KBank Merchant ID 기본값.
 * 은행 개통: HUAMAK / SEACON SQUARE (2026-08), FUTURE PARK / EKKAMAI / SILOM (2026-08-28)
 * 확인·저장은 SaaS가 아니라 관리자 > POS 프린터 설정 > 결제·돈통 탭.
 * resolve 우선순위: 코드 기본값 < SaaS store 설정 < pos_printer_settings(관리자).
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
  {
    label: 'CHOONGMAN FUTURE PARK',
    storeCodes: ['CM Future Park', 'Future Park', 'CM Future Park Rangsit'],
    merchantId: 'KB000002346593',
    partnerShopId: 'SJGLB00005',
  },
  {
    label: 'CHOONGMAN EKKAMAI',
    storeCodes: ['CM Ekkamai', 'Ekkamai', 'CM Ekamai'],
    merchantId: 'KB000002346592',
    partnerShopId: 'SJGLB00004',
  },
  {
    label: 'CHOONGMAN SILOM',
    storeCodes: ['CM Silom', 'Silom'],
    merchantId: 'KB000002346591',
    partnerShopId: 'SJGLB00003',
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
      (key.includes('seacon') && row.merchantId === 'KB000002340299') ||
      ((key.includes('future park') || key.includes('futurepark')) &&
        row.merchantId === 'KB000002346593') ||
      ((key.includes('ekkamai') || key.includes('ekamai')) &&
        row.merchantId === 'KB000002346592') ||
      (key.includes('silom') && row.merchantId === 'KB000002346591')
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
