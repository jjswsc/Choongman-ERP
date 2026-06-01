/**
 * erp_stores 단일 소스 — POS·입고·직원·VAT 원장·재무제표 매장 키 통일.
 * store_code = 내부 키, display_name = vat_ledger·분개 store_name 저장 표기.
 */
import {
  buildLegacyToCanonicalMap,
  fetchErpStoresMaster,
  type ErpStoreMasterRow,
} from '@/lib/erp-store-master'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { extractStoreDisplayTail, normStoreKey } from '@/lib/store-list-keys'

export type ErpStoreIdentity = {
  raw: string
  storeCode: string
  displayName: string
  fromMaster: boolean
}

export type ErpStoreMatchIndex = {
  masters: ErpStoreMasterRow[]
  legacyToCanonical: Record<string, string>
}

function canonicalizeStoreCode(value: string, legacyToCanonical: Record<string, string>): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return legacyToCanonical[normStoreKey(raw)] || raw
}

function masterRowMatchesScopeKey(
  row: ErpStoreMasterRow,
  key: string,
  legacyToCanonical: Record<string, string>
): boolean {
  const probe = String(key || '').trim()
  if (!probe) return false
  const canonical = canonicalizeStoreCode(probe, legacyToCanonical)
  const candidates = Array.from(new Set([probe, canonical].filter(Boolean)))
  const sc = String(row.store_code || '').trim()
  const dn = String(row.display_name || '').trim()
  for (const c of candidates) {
    if (sc && storesMatchForGradeLookup(sc, c)) return true
    if (dn && storesMatchForGradeLookup(dn, c)) return true
    for (const alias of row.aliases || []) {
      const a = String(alias || '').trim()
      if (a && storesMatchForGradeLookup(a, c)) return true
    }
  }
  return false
}

/** display_name·별칭·레거시 입력으로 erp_stores 행 찾기 */
export function findErpStoreMasterForScopeKey(
  key: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): ErpStoreMasterRow | null {
  const raw = String(key || '').trim()
  if (!raw) return null
  for (const row of masters || []) {
    if (masterRowMatchesScopeKey(row, raw, legacyToCanonical)) return row
  }
  return null
}

export function resolveErpStoreIdentitySync(
  rawKey: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): ErpStoreIdentity {
  const raw = String(rawKey || '').trim()
  if (!raw) return { raw: '', storeCode: '', displayName: '', fromMaster: false }
  const master = findErpStoreMasterForScopeKey(raw, masters, legacyToCanonical)
  if (master) {
    const storeCode = String(master.store_code || '').trim()
    const displayName = String(master.display_name || '').trim() || storeCode
    return { raw, storeCode, displayName, fromMaster: true }
  }
  const tail = extractStoreDisplayTail(raw)
  const storeCode =
    canonicalizeStoreCode(raw, legacyToCanonical) ||
    (tail ? canonicalizeStoreCode(tail, legacyToCanonical) : '') ||
    raw
  return { raw, storeCode, displayName: raw, fromMaster: false }
}

export async function loadErpStoreMatchIndex(): Promise<ErpStoreMatchIndex> {
  const masters = await fetchErpStoresMaster()
  return { masters, legacyToCanonical: buildLegacyToCanonicalMap(masters || []) }
}

export async function resolveErpStoreIdentity(rawKey: string): Promise<ErpStoreIdentity> {
  const index = await loadErpStoreMatchIndex()
  return resolveErpStoreIdentitySync(rawKey, index.masters, index.legacyToCanonical)
}

function isOfficePair(a: string, b: string): boolean {
  const aa = String(a || '').trim()
  const bb = String(b || '').trim()
  if (!aa || !bb) return false
  return isHeadOfficeLikeStoreName(aa) && isHeadOfficeLikeStoreName(bb)
}

/**
 * erp_stores 기준 동일 매장 여부 — PP30·시산·손익 공통.
 * 마스터 없으면 storesMatchForGradeLookup(CM 접두 등) 폴백.
 */
export function erpStoreKeysMatch(
  valueA: string,
  valueB: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): boolean {
  const a = String(valueA || '').trim()
  const b = String(valueB || '').trim()
  if (!a || !b) return false
  if (isOfficePair(a, b)) return true

  const idA = resolveErpStoreIdentitySync(a, masters, legacyToCanonical)
  const idB = resolveErpStoreIdentitySync(b, masters, legacyToCanonical)

  if (idA.storeCode && idB.storeCode) {
    if (idA.storeCode === idB.storeCode) return true
    if (storesMatchForGradeLookup(idA.storeCode, idB.storeCode)) return true
  }

  if (masters.length > 0) {
    return (
      storesMatchForGradeLookup(idA.displayName, idB.displayName) ||
      storesMatchForGradeLookup(idA.raw, idB.raw)
    )
  }

  return storesMatchForGradeLookup(a, b)
}

/** VAT 원장·분개 store_name — erp_stores.display_name 단일 표기 */
export async function canonicalLedgerStoreName(rawKey: string): Promise<string> {
  const id = await resolveErpStoreIdentity(rawKey)
  return id.displayName || id.storeCode || String(rawKey || '').trim()
}

export function canonicalLedgerStoreNameSync(
  rawKey: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): string {
  const id = resolveErpStoreIdentitySync(rawKey, masters, legacyToCanonical)
  return id.displayName || id.storeCode || String(rawKey || '').trim()
}
