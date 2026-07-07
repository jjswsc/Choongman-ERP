import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'

/** erp_stores·POS·회계 매장 선택 — 본사 계열 단일 표기 */
export const CANONICAL_OFFICE_STORE = 'CM Office'

/** 본사/오피스/HQ 등 동일 법인 본사 매장 변형인지 */
export function isOfficeStoreVariant(store: string | null | undefined): boolean {
  const t = String(store || '').trim()
  if (!t) return false
  return isOfficeStore(t) || isHeadOfficeLikeStoreName(t)
}

/** 본사 계열 → CM Office, 그 외 원문 유지 */
export function canonicalOfficeStore(store: string | null | undefined): string {
  const s = String(store || '').trim()
  if (!s) return ''
  return isOfficeStoreVariant(s) ? CANONICAL_OFFICE_STORE : s
}

/** 매장 선택 드롭다운 — HQ·Office·본사 등을 CM Office 한 줄로 합침 */
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
