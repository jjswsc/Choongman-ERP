/**
 * 충만(Choongman) 매장별 KBank Merchant ID 기본값.
 * 은행 개통: HUAMAK / SEACON SQUARE (2026-08), FUTURE PARK / EKKAMAI / SILOM (2026-08-28),
 * MBK (KB000002350191 / SJGLB00002) · TRUE DIGITAL PARK (KB000002350190 / SJGLB00011) — MID·Shop ID 모두 매장별.
 * 확인·저장은 SaaS가 아니라 관리자 > POS 프린터 설정 > 결제·돈통 탭.
 * resolve 우선순위: 코드 기본값 < SaaS store 설정 < pos_printer_settings(관리자).
 */
import type { StoreKbankConfig } from '@/lib/tenant-integration-types'

export type ChoongmanKbankQrDisplayMode = 'cashier' | 'edc_mirror' | 'edc_native'

export type ChoongmanKbankStoreDefault = StoreKbankConfig & {
  /** ERP store_code 후보 (첫 항목이 정식 코드) */
  storeCodes: string[]
  label: string
  /** 미설정 시 Thai QR 표시 기본값. True Digital Park는 고객 모니터 없음 → EDC. */
  qrDisplayMode?: ChoongmanKbankQrDisplayMode
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
  {
    label: 'CHOONGMAN MBK CENTER',
    storeCodes: ['CM MBK', 'MBK', 'MBK Center', 'CM MBK Center', '1041'],
    merchantId: 'KB000002350191',
    partnerShopId: 'SJGLB00002',
  },
  {
    label: 'CHOONGMAN TRUE DIGITAL PARK',
    storeCodes: ['CM True Digital', 'True Digital', 'True Digital Park', 'CM True Digital Park', '1040'],
    merchantId: 'KB000002350190',
    partnerShopId: 'SJGLB00011',
    qrDisplayMode: 'edc_mirror',
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

function storeDefaultRowMatches(row: ChoongmanKbankStoreDefault, key: string): boolean {
  const codes = row.storeCodes.map(normalizeStoreKey)
  if (codes.includes(key) || codes.some((c) => Boolean(c) && (key.includes(c) || c.includes(key)))) {
    return true
  }
  if (key.includes('huamak') && row.merchantId === 'KB000002340300') return true
  if (key.includes('seacon') && row.merchantId === 'KB000002340299') return true
  if (
    (key.includes('future park') || key.includes('futurepark')) &&
    row.merchantId === 'KB000002346593'
  ) {
    return true
  }
  if ((key.includes('ekkamai') || key.includes('ekamai')) && row.merchantId === 'KB000002346592') {
    return true
  }
  if (key.includes('silom') && row.merchantId === 'KB000002346591') return true
  if ((key.includes('mbk') || key === '1041') && row.partnerShopId === 'SJGLB00002' && row.label.includes('MBK')) {
    return true
  }
  if (
    (key.includes('true digital') || key.includes('truedigital') || key === '1040') &&
    row.partnerShopId === 'SJGLB00011' &&
    row.label.includes('TRUE DIGITAL')
  ) {
    return true
  }
  return false
}

export function lookupChoongmanKbankStoreDefaultRow(storeCode: string): ChoongmanKbankStoreDefault | null {
  const key = normalizeStoreKey(storeCode)
  if (!key) return null
  for (const row of CHOONGMAN_KBANK_STORE_DEFAULTS) {
    if (storeDefaultRowMatches(row, key)) return row
  }
  return null
}

export function lookupChoongmanKbankStoreDefaults(storeCode: string): StoreKbankConfig | null {
  const row = lookupChoongmanKbankStoreDefaultRow(storeCode)
  if (!row) return null
  return {
    merchantId: row.merchantId,
    partnerShopId: row.partnerShopId,
    terminalId: row.terminalId,
    qrEnabled: true,
  }
}

/** pos_printer_settings 조회용 — 숫자코드(1040)와 표시코드(CM True Digital)를 함께 시도 */
export function choongmanKbankPrinterStoreCodeCandidates(storeCode: string): string[] {
  const code = String(storeCode || '').trim()
  if (!code) return []
  const row = lookupChoongmanKbankStoreDefaultRow(code)
  const out: string[] = []
  const push = (v: string) => {
    const s = String(v || '').trim()
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s)
  }
  push(code)
  if (row) {
    for (const c of row.storeCodes) push(c)
  }
  return out
}

/** 다른 충만 매장에 발급된 MID/Shop ID가 이 매장에 들어가 있으면 true (Seacon 값을 MBK에 넣은 경우 등) */
export function credentialsBelongToOtherChoongmanStore(
  storeCode: string,
  merchantId: string,
  partnerShopId: string
): boolean {
  const own = lookupChoongmanKbankStoreDefaults(storeCode)
  if (!own) return false
  const mid = String(merchantId || '').trim()
  const shop = String(partnerShopId || '').trim()
  if (!mid && !shop) return false
  const ownMid = String(own.merchantId || '').trim()
  const ownShop = String(own.partnerShopId || '').trim()
  if (mid && mid === ownMid && (!shop || shop === ownShop)) return false
  if (shop && shop === ownShop && (!mid || mid === ownMid)) return false
  for (const row of CHOONGMAN_KBANK_STORE_DEFAULTS) {
    const rowMid = String(row.merchantId || '').trim()
    const rowShop = String(row.partnerShopId || '').trim()
    if (rowMid === ownMid && rowShop === ownShop) continue
    if ((mid && mid === rowMid) || (shop && shop === rowShop)) return true
  }
  return false
}

/**
 * 다른 매장 MID/Shop ID가 이 매장 설정에 들어가 있으면 코드 기본값으로 되돌린다.
 * (True Digital에 MBK KB000002350191 / SJGLB00002가 남아 QR이 MBK 계좌로 나가는 경우 등)
 */
export function sanitizeChoongmanStoreKbankOverride(
  storeCode: string,
  cfg: StoreKbankConfig
): StoreKbankConfig {
  const mid = String(cfg.merchantId || '').trim()
  const shop = String(cfg.partnerShopId || '').trim()
  if (!credentialsBelongToOtherChoongmanStore(storeCode, mid, shop)) {
    return cfg
  }
  const own = lookupChoongmanKbankStoreDefaults(storeCode)
  if (!own) return cfg
  const terminalId = String(cfg.terminalId || '').trim()
  return {
    merchantId: own.merchantId,
    partnerShopId: own.partnerShopId,
    ...(terminalId ? { terminalId } : {}),
  }
}
