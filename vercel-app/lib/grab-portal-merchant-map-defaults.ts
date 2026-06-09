/**
 * Grab Prod portal merchantID ↔ partner store ID 기본 매핑.
 * Vercel `GRAB_PORTAL_MERCHANT_MAP` 미설정·부분 설정 시 env가 우선, 없는 키는 여기서 보완.
 *
 * Vercel에 전체를 넣으려면 `GET /api/grab/debugEnvConfig` 의 `vercelEnv` 값을 복사.
 */

export type GrabPortalMerchantEntry = {
  grabMerchantId: string
  partnerMerchantId: string
  /** ERP `erp_stores.store_code` — `GRAB_STORE_MAP_JSON` `"1041":"…"` 와 일치해야 함 */
  erpStoreCode: string
  labelEn: string
}

/** Choongman Thailand Grab Food — Prod portal map (2026-06) */
export const GRAB_PORTAL_MERCHANT_ENTRIES: GrabPortalMerchantEntry[] = [
  {
    grabMerchantId: '3-C6DWPB4VCKK1GT',
    partnerMerchantId: '1040',
    erpStoreCode: 'CM True Digital',
    labelEn: 'True Digital Park',
  },
  {
    grabMerchantId: '3-C4NKAA4FCNCUGA',
    partnerMerchantId: '1042',
    erpStoreCode: 'CM Silom',
    labelEn: 'Silom',
  },
  {
    grabMerchantId: '3-C7JGN2B2DFJ1AE',
    partnerMerchantId: '1043',
    erpStoreCode: 'CM Ekkamai',
    labelEn: 'Ekkamai',
  },
  {
    grabMerchantId: '3-C6N2V4AYTLAYJJ',
    partnerMerchantId: '1041',
    erpStoreCode: 'CM MBK',
    labelEn: 'MBK Center',
  },
  {
    grabMerchantId: '3-C7TTGAKJJPLBEA',
    partnerMerchantId: '1044',
    erpStoreCode: 'CM Future Park',
    labelEn: 'Future Park',
  },
  {
    grabMerchantId: '3-C63UHBKTG64CLJ',
    partnerMerchantId: '1045',
    erpStoreCode: 'CM Seacon Srinakarin',
    labelEn: 'Seacon Square Srinagarindra',
  },
  {
    grabMerchantId: '3-C72GUGC1VGJDSE',
    partnerMerchantId: '1046',
    erpStoreCode: 'CM Huamak',
    labelEn: 'Huamark (Hua Mak)',
  },
  {
    grabMerchantId: '3-C4NJC62TEU6UA2',
    partnerMerchantId: '1047',
    erpStoreCode: 'CM Union Mall',
    labelEn: 'Union Mall',
  },
  {
    grabMerchantId: '3-C6DAVNDVSE61VT',
    partnerMerchantId: '1048',
    erpStoreCode: 'CM Asoke',
    labelEn: 'Sukhumvit 12',
  },
  {
    grabMerchantId: '3-C7JGPF6YC2VVPA',
    partnerMerchantId: '1049',
    erpStoreCode: 'CM Bangna',
    labelEn: 'Bangna',
  },
  {
    grabMerchantId: '3-C7KJGBUEJND1VX',
    partnerMerchantId: '1050',
    erpStoreCode: 'CM The Street Ratchada',
    labelEn: 'The Street Ratchada',
  },
]

/** 레거시 sandbox merchantID → partner (구 주문 store_code 보정용, 신규 메뉴 sync는 portal ID 사용) */
export const GRAB_LEGACY_MERCHANT_TO_PARTNER_DEFAULTS: Record<string, string> = {
  'GFSBPOS-204-253': '1048',
}

export function buildGrabPortalMerchantMapDefaults(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of GRAB_PORTAL_MERCHANT_ENTRIES) {
    out[row.grabMerchantId] = row.partnerMerchantId
  }
  return out
}

/** `GRAB_STORE_MAP_JSON` 에 넣을 partner→ERP + 레거시 merchant→partner */
export function buildGrabStoreMapJsonDefaults(): Record<string, string> {
  const out: Record<string, string> = { ...GRAB_LEGACY_MERCHANT_TO_PARTNER_DEFAULTS }
  for (const row of GRAB_PORTAL_MERCHANT_ENTRIES) {
    out[row.partnerMerchantId] = row.erpStoreCode
  }
  return out
}

/** Vercel Environment Variables 에 붙여넣기용 한 줄 */
export function formatGrabPortalMerchantMapEnvValue(): string {
  return GRAB_PORTAL_MERCHANT_ENTRIES.map(
    (r) => `${r.grabMerchantId}=${r.partnerMerchantId}`
  ).join(',')
}

export function formatGrabStoreMapJsonEnvValue(): string {
  return JSON.stringify(buildGrabStoreMapJsonDefaults())
}

export function listGrabPartnerStoreCodesFromDefaults(): string[] {
  return GRAB_PORTAL_MERCHANT_ENTRIES.map((r) => r.partnerMerchantId).sort()
}
