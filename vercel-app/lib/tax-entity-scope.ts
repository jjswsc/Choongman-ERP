import { resolveErpStoreIdentity } from '@/lib/erp-store-identity'
import { normalizeStoreTaxId } from '@/lib/store-tax-filing-profile'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type TaxEntityStoreRow = {
  entity_code?: string | null
  store_code?: string | null
}

type StoreTaxProfileRow = {
  store_code?: string | null
  tax_id?: string | null
}

function normalizeScopeToken(raw: string): string {
  return String(raw || '').trim()
}

function parseTaxScopeFilter(filter: string): { kind: 'all' | 'store' | 'taxid' | 'entity'; value: string } {
  const raw = normalizeScopeToken(filter)
  if (!raw || raw === 'All' || raw === '*') return { kind: 'all', value: '' }
  const lower = raw.toLowerCase()
  if (lower.startsWith('taxid:')) {
    return { kind: 'taxid', value: normalizeStoreTaxId(raw.slice(6)) }
  }
  if (lower.startsWith('entity:')) {
    return { kind: 'entity', value: raw.slice(7).trim().toLowerCase() }
  }
  return { kind: 'store', value: raw }
}

async function loadEntityStoreCodes(entityCode: string): Promise<Set<string>> {
  if (!entityCode) return new Set<string>()
  try {
    const rows = (await supabaseSelectFilter(
      'tax_entity_stores',
      `entity_code=eq.${encodeURIComponent(entityCode)}`,
      { select: 'entity_code,store_code', limit: 5000 }
    )) as TaxEntityStoreRow[] | null
    return new Set(
      (rows || [])
        .map((r) => String(r.store_code || '').trim())
        .filter(Boolean)
    )
  } catch {
    return new Set<string>()
  }
}

async function loadStoreCodesByTaxId(taxId: string): Promise<Set<string>> {
  if (!taxId) return new Set<string>()
  try {
    const rows = (await supabaseSelectFilter(
      'store_tax_filing_profiles',
      `tax_id=eq.${encodeURIComponent(taxId)}`,
      { select: 'store_code,tax_id', limit: 5000 }
    )) as StoreTaxProfileRow[] | null
    return new Set(
      (rows || [])
        .map((r) => String(r.store_code || '').trim())
        .filter(Boolean)
    )
  } catch {
    return new Set<string>()
  }
}

export type TaxStoreScopeMatcher = (row: { storeCode?: string | null; storeName?: string | null }) => Promise<boolean>

export type TaxScopeStoreCodes = {
  /** null = 전체(필터 없음) */
  storeCodes: string[] | null
  kind: 'all' | 'store' | 'taxid' | 'entity'
  /** UI/로그용 원본 스코프 */
  rawFilter: string
}

/**
 * 스코프 → DB IN 조건용 매장코드 목록.
 * - All: storeCodes=null
 * - store/taxid/entity: storeCodes=매핑된 코드 배열(없으면 빈 배열)
 */
export async function resolveTaxScopeStoreCodes(scopeFilter: string): Promise<TaxScopeStoreCodes> {
  const rawFilter = normalizeScopeToken(scopeFilter)
  const parsed = parseTaxScopeFilter(rawFilter)
  if (parsed.kind === 'all') {
    return { storeCodes: null, kind: 'all', rawFilter }
  }
  if (parsed.kind === 'store') {
    const raw = parsed.value
    const id = await resolveErpStoreIdentity(raw)
    const codes = Array.from(
      new Set([raw, String(id.storeCode || '').trim(), String(id.displayName || '').trim()].filter(Boolean))
    )
    return { storeCodes: codes, kind: 'store', rawFilter }
  }
  const set =
    parsed.kind === 'taxid'
      ? await loadStoreCodesByTaxId(parsed.value)
      : await loadEntityStoreCodes(parsed.value)
  return { storeCodes: Array.from(set), kind: parsed.kind, rawFilter }
}

/** taxpayer_name 끝의 (00001)/(Head Office) 등 지점 표기 제거 */
export function cleanTaxEntityDisplayName(raw: string): string {
  return String(raw || '')
    .replace(/\s*\((?:head\s*office|สำนักงานใหญ่|\d{5})\)\s*$/i, '')
    .replace(/\s*\(\d{1,5}\)\s*$/g, '')
    .trim()
}

/**
 * UI용 법인 스코프 라벨 — value는 entity:... 이지만 화면에는 회사명·TIN·매장수만 표시
 * 예: 법인 · Aisa Commerce & Trade Co.,Ltd. (TIN 0105568080622 · 3개 매장)
 */
export function formatTaxEntityScopeLabel(input: {
  entityName?: string | null
  entityCode?: string | null
  taxId?: string | null
  storeCount?: number | null
}): string {
  const name =
    cleanTaxEntityDisplayName(String(input.entityName || '')) ||
    String(input.entityCode || '').trim() ||
    '법인'
  const taxId = String(input.taxId || '').replace(/\D/g, '').trim()
  const storeCount = Math.max(0, Number(input.storeCount) || 0)
  const parts = [
    taxId ? `TIN ${taxId}` : '',
    storeCount > 0 ? `${storeCount}개 매장` : '',
  ].filter(Boolean)
  return parts.length ? `법인 · ${name} (${parts.join(' · ')})` : `법인 · ${name}`
}

/**
 * 세무 스코프 해석:
 * - All / *: 전체
 * - 일반 문자열: 매장명/코드 단건
 * - taxid:0105...: 같은 사업자번호 묶음
 * - entity:omni-foodtech-01: 법인 엔티티 매핑 묶음
 */
export async function createTaxStoreScopeMatcher(scopeFilter: string): Promise<TaxStoreScopeMatcher> {
  const resolved = await resolveTaxScopeStoreCodes(scopeFilter)
  if (resolved.kind === 'all') return async () => true
  if (!resolved.storeCodes || resolved.storeCodes.length === 0) return async () => false

  const codeSet = new Set(resolved.storeCodes.map((c) => c.trim().toLowerCase()).filter(Boolean))

  const matchByCode = async (storeCode: string): Promise<boolean> => {
    const raw = String(storeCode || '').trim()
    if (!raw) return false
    if (codeSet.has(raw.toLowerCase())) return true
    const id = await resolveErpStoreIdentity(raw)
    const sc = String(id.storeCode || '').trim().toLowerCase()
    const dn = String(id.displayName || '').trim().toLowerCase()
    return (!!sc && codeSet.has(sc)) || (!!dn && codeSet.has(dn))
  }

  return async ({ storeCode, storeName }) => {
    if (await matchByCode(String(storeCode || ''))) return true
    const fallback = String(storeName || '').trim()
    if (!fallback) return false
    if (codeSet.has(fallback.toLowerCase())) return true
    return matchByCode(fallback)
  }
}
