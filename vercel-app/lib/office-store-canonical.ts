import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import { INBOUND_HQ_LOCATION } from '@/lib/stock-location-patterns'

/** erp_stores·POS·회계 매장 선택 — 본사 계열 단일 표기 */
export const CANONICAL_OFFICE_STORE = 'CM Office'

/** stock_logs·inbound_batches 본사 입고 location (창고) — 화면 표기는 CM Office */
export { INBOUND_HQ_LOCATION }

/** 본사 입고·필터 PostgREST `location=in.(...)` 후보 */
export const OFFICE_INBOUND_LOCATION_VALUES = [
  INBOUND_HQ_LOCATION,
  CANONICAL_OFFICE_STORE,
  '본사',
  'Office',
  '오피스',
  '본점',
  'HQ',
  '입고등록(본사)',
] as const

/** PostgREST `in.()` 문자열 값 — 공백·괄호 안전 따옴표 */
export function postgrestQuotedInList(values: readonly string[]): string {
  return values
    .map((raw) => String(raw || '').trim())
    .filter(Boolean)
    .map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',')
}

/** `&location=in.("입고등록","CM Office",...)` */
export function officeInboundLocationInFilterSuffix(): string {
  const inner = postgrestQuotedInList(OFFICE_INBOUND_LOCATION_VALUES)
  return inner ? `&location=in.(${inner})` : ''
}
function isInboundHqLocationLabel(store: string): boolean {
  const t = store.trim()
  if (!t) return false
  const n = t.toLowerCase().replace(/\s+/g, '')
  return (
    t === INBOUND_HQ_LOCATION ||
    n === '입고등록(본사)' ||
    n === 'hqwarehouse' ||
    n.startsWith('입고등록')
  )
}

/** 본사/오피스/HQ/입고등록 등 동일 법인 본사 매장 변형인지 */
export function isOfficeStoreVariant(store: string | null | undefined): boolean {
  const t = String(store || '').trim()
  if (!t) return false
  return isInboundHqLocationLabel(t) || isOfficeStore(t) || isHeadOfficeLikeStoreName(t)
}

/** 본사 계열 → CM Office, 그 외 원문 유지 */
export function canonicalOfficeStore(store: string | null | undefined): string {
  const s = String(store || '').trim()
  if (!s) return ''
  return isOfficeStoreVariant(s) ? CANONICAL_OFFICE_STORE : s
}

/**
 * 입고·재고 DB location 저장값.
 * 화면은 CM Office로 고르더라도 stock_logs·inbound_batches 본사 창고는 입고등록으로 통일.
 */
export function inboundPersistLocation(store: string | null | undefined): string {
  const s = String(store || '').trim()
  if (!s || isOfficeStoreVariant(s)) return INBOUND_HQ_LOCATION
  return s
}

/** 두 location/매장명이 같은 본사 범위인지 (입고 필터·미지급 등) */
export function sameOfficeStoreScope(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return isOfficeStoreVariant(a) && isOfficeStoreVariant(b)
}

/** 매장 선택 드롭다운 — HQ·Office·입고등록·본사 등을 CM Office 한 줄로 합침 */
export function dedupeOfficeStoreOptions(stores: string[]): string[] {
  const result: string[] = []
  let hasOffice = false
  for (const raw of stores) {
    const s = String(raw || '').trim()
    if (!s) continue
    if (isOfficeStoreVariant(s)) {
      hasOffice = true
    } else {
      result.push(s)
    }
  }
  if (hasOffice) result.push(CANONICAL_OFFICE_STORE)
  return [...new Set(result)].sort((a, b) => a.localeCompare(b, 'ko'))
}
