import { normStoreKey } from '@/lib/store-list-keys'

/** 거래처 마스터 + 매장 세무 프로필 연동 판정 (클라이언트·서버 공통, DB 없음) */
export type VendorTaxLinkInput = {
  code: string
  name?: string
  taxId?: string
  tax_no?: string
  gpsName?: string
  gps_name?: string
  salesOutlet?: string
  sales_outlet?: string
  address?: string
}

export type StoreTaxProfileLinkInput = {
  storeCode: string
  vendorCode?: string
  taxpayerName?: string
  taxId?: string
}

export type StoreVendorLinkStatus = 'linked' | 'inferred' | 'profile_only' | 'missing'

export type StoreVendorLinkEvaluation = {
  status: StoreVendorLinkStatus
  vendorCode: string
  vendorName: string
  taxId: string
  matchVia: 'vendor_code' | 'sales_outlet' | 'gps_name' | 'profile_fields' | null
}

function vendorTaxId(v: VendorTaxLinkInput): string {
  return String(v.taxId ?? v.tax_no ?? '')
    .replace(/\D/g, '')
    .trim()
    .slice(0, 13)
}

function vendorGps(v: VendorTaxLinkInput): string {
  return String(v.gpsName ?? v.gps_name ?? '').trim()
}

function vendorSalesOutlet(v: VendorTaxLinkInput): string {
  return String(v.salesOutlet ?? v.sales_outlet ?? '').trim()
}

function vendorCodeOf(v: VendorTaxLinkInput): string {
  return String(v.code || '').trim()
}

/** 매장 키(코드·표시명·별칭)와 거래처 sales_outlet / gps_name 비교 */
export function vendorMatchesStore(
  vendor: VendorTaxLinkInput,
  storeKey: string,
  extraStoreKeys: string[] = []
): boolean {
  const keys = new Set<string>()
  const add = (raw: string) => {
    const t = String(raw || '').trim()
    if (!t) return
    keys.add(normStoreKey(t))
  }
  add(storeKey)
  for (const k of extraStoreKeys) add(k)

  const outlet = normStoreKey(vendorSalesOutlet(vendor))
  const gps = normStoreKey(vendorGps(vendor))
  if (!outlet && !gps) return false
  for (const k of keys) {
    if (!k) continue
    if (outlet && outlet === k) return true
    if (gps && gps === k) return true
  }
  return false
}

export function findVendorsMatchingStore(
  storeKey: string,
  vendors: VendorTaxLinkInput[],
  extraStoreKeys: string[] = []
): VendorTaxLinkInput[] {
  const code = String(storeKey || '').trim()
  if (!code) return []
  return vendors.filter((v) => vendorCodeOf(v) && vendorMatchesStore(v, code, extraStoreKeys))
}

export function findExplicitVendorForStore(
  storeKey: string,
  vendors: VendorTaxLinkInput[],
  explicitVendorCode?: string
): VendorTaxLinkInput | null {
  const code = normalizeVendorCode(explicitVendorCode)
  if (code) {
    const hit = vendors.find((v) => vendorCodeOf(v) === code)
    if (hit) return hit
  }
  const matches = findVendorsMatchingStore(storeKey, vendors)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    const withTin = matches.filter((v) => vendorTaxId(v).length === 13)
    if (withTin.length === 1) return withTin[0]
  }
  return matches[0] || null
}

export function normalizeVendorCode(raw: unknown): string {
  return String(raw || '').trim().slice(0, 80)
}

export function evaluateStoreTaxLink(
  storeKey: string,
  profile: StoreTaxProfileLinkInput | null | undefined,
  vendors: VendorTaxLinkInput[],
  extraStoreKeys: string[] = []
): StoreVendorLinkEvaluation {
  const storeCode = String(storeKey || '').trim()
  const explicitCode = normalizeVendorCode(profile?.vendorCode)
  const profileName = String(profile?.taxpayerName || '').trim()
  const profileTaxId = String(profile?.taxId || '')
    .replace(/\D/g, '')
    .trim()

  if (explicitCode) {
    const v = vendors.find((x) => vendorCodeOf(x) === explicitCode)
    if (v) {
      return {
        status: 'linked',
        vendorCode: explicitCode,
        vendorName: String(v.name || '').trim() || explicitCode,
        taxId: vendorTaxId(v) || profileTaxId,
        matchVia: 'vendor_code',
      }
    }
    if (profileName && profileTaxId.length === 13) {
      return {
        status: 'profile_only',
        vendorCode: explicitCode,
        vendorName: profileName,
        taxId: profileTaxId,
        matchVia: 'profile_fields',
      }
    }
    return {
      status: 'missing',
      vendorCode: explicitCode,
      vendorName: profileName,
      taxId: profileTaxId,
      matchVia: null,
    }
  }

  const inferred = findVendorsMatchingStore(storeCode, vendors, extraStoreKeys)[0] ?? null
  if (inferred) {
    const key = normStoreKey(storeCode)
    const via =
      normStoreKey(vendorSalesOutlet(inferred)) === key
        ? 'sales_outlet'
        : normStoreKey(vendorGps(inferred)) === key
          ? 'gps_name'
          : 'sales_outlet'
    return {
      status: 'inferred',
      vendorCode: vendorCodeOf(inferred),
      vendorName: String(inferred.name || '').trim() || vendorCodeOf(inferred),
      taxId: vendorTaxId(inferred) || profileTaxId,
      matchVia: via,
    }
  }

  if (profileName && profileTaxId.length === 13) {
    return {
      status: 'profile_only',
      vendorCode: explicitCode,
      vendorName: profileName,
      taxId: profileTaxId,
      matchVia: 'profile_fields',
    }
  }

  return {
    status: 'missing',
    vendorCode: explicitCode,
    vendorName: profileName,
    taxId: profileTaxId,
    matchVia: null,
  }
}

export function aliasKeysForStore(
  storeCode: string,
  storeLabels?: Record<string, string>,
  legacyToCanonical?: Record<string, string>
): string[] {
  const extras: string[] = []
  const label = String(storeLabels?.[storeCode] || '').trim()
  if (label && label !== storeCode) extras.push(label)
  if (legacyToCanonical) {
    for (const [legacy, canonical] of Object.entries(legacyToCanonical)) {
      if (String(canonical || '').trim() === storeCode) {
        const leg = String(legacy || '').trim()
        if (leg) extras.push(leg)
      }
    }
  }
  return extras
}

/** 거래처에 연결된 매장 코드 목록 (프로필 FK + sales_outlet/gps_name 추정) */
export function storesLinkedToVendor(
  vendor: VendorTaxLinkInput,
  storeCodes: string[],
  profiles: StoreTaxProfileLinkInput[],
  storeLabels?: Record<string, string>,
  legacyToCanonical?: Record<string, string>
): { storeCode: string; via: 'vendor_code' | 'sales_outlet' | 'gps_name' }[] {
  const vCode = vendorCodeOf(vendor)
  if (!vCode) return []

  const out: { storeCode: string; via: 'vendor_code' | 'sales_outlet' | 'gps_name' }[] = []
  const seen = new Set<string>()

  for (const p of profiles) {
    const sc = String(p.storeCode || '').trim()
    if (!sc || normalizeVendorCode(p.vendorCode) !== vCode) continue
    if (seen.has(sc)) continue
    seen.add(sc)
    out.push({ storeCode: sc, via: 'vendor_code' })
  }

  for (const sc of storeCodes) {
    if (!sc || sc === 'All' || seen.has(sc)) continue
    const extras = aliasKeysForStore(sc, storeLabels, legacyToCanonical)
    if (!vendorMatchesStore(vendor, sc, extras)) continue
    seen.add(sc)
    const outlet = normStoreKey(vendorSalesOutlet(vendor))
    const gps = normStoreKey(vendorGps(vendor))
    const key = normStoreKey(sc)
    const via: 'sales_outlet' | 'gps_name' =
      outlet === key ? 'sales_outlet' : gps === key ? 'gps_name' : 'gps_name'
    out.push({ storeCode: sc, via })
  }

  return out.sort((a, b) => a.storeCode.localeCompare(b.storeCode))
}

export function countStoresMissingVendorLink(
  storeCodes: string[],
  profilesByStore: Record<string, StoreTaxProfileLinkInput>,
  vendors: VendorTaxLinkInput[],
  storeLabels?: Record<string, string>,
  legacyToCanonical?: Record<string, string>
): { missing: number; inferred: number; total: number } {
  let missing = 0
  let inferred = 0
  const codes = storeCodes.filter((c) => c && c !== 'All')
  for (const sc of codes) {
    const extras = aliasKeysForStore(sc, storeLabels, legacyToCanonical)
    const ev = evaluateStoreTaxLink(sc, profilesByStore[sc], vendors, extras)
    if (ev.status === 'missing') missing += 1
    else if (ev.status === 'inferred') inferred += 1
  }
  return { missing, inferred, total: codes.length }
}

function payeeTaxIdValid(raw: unknown): boolean {
  return String(raw || '')
    .replace(/\D/g, '')
    .trim().length === 13
}

/** 원천 원장 행 중 수취인 TIN(13자리) 누락 건수 (매장 필터 optional) */
export function countWhtPayeeTinGaps(
  rows: { payee_tax_id?: string; store_name?: string }[],
  storeFilter: string,
  storeLabels?: Record<string, string>,
  legacyToCanonical?: Record<string, string>
): number {
  const filter = String(storeFilter || '').trim()
  const scoped =
    !filter || filter === 'All'
      ? rows
      : rows.filter((r) => {
          const sn = String(r.store_name || '').trim()
          if (!sn) return false
          const keys = new Set<string>([normStoreKey(filter)])
          for (const k of aliasKeysForStore(filter, storeLabels, legacyToCanonical)) {
            keys.add(normStoreKey(k))
          }
          return keys.has(normStoreKey(sn))
        })
  return scoped.filter((r) => !payeeTaxIdValid(r.payee_tax_id)).length
}

export function isThaiTaxId13(raw: unknown): boolean {
  return payeeTaxIdValid(raw)
}
