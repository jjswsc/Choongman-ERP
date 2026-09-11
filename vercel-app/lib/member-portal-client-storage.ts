import { dedupeFavoriteStoreCodes } from '@/lib/member-portal-favorite-stores'

/** 회원별로 기기 localStorage에 남기면 안 되는 키 (공용 폰 대비) */
export const MEMBER_FAVORITE_STORES_KEY = 'cm_member_favorite_stores'
/** @deprecated 단일 즐겨찾기 — cm_member_favorite_stores 로 이전 */
export const MEMBER_FAVORITE_STORE_KEY = 'cm_member_favorite_store'
/** 홈 「프로모션 & 할인」에서 마지막으로 본 매장 */
export const MEMBER_PROMO_STORE_KEY = 'cm_member_promo_store'

export function readFavoriteStoreCodesFromLocalStorage(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(MEMBER_FAVORITE_STORES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return dedupeFavoriteStoreCodes(parsed.map((code) => String(code || '').trim()))
      }
    }
    const legacy = String(localStorage.getItem(MEMBER_FAVORITE_STORE_KEY) || '').trim()
    return legacy ? dedupeFavoriteStoreCodes([legacy]) : []
  } catch {
    return []
  }
}

export function writeFavoriteStoreCodesToLocalStorage(codes: string[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MEMBER_FAVORITE_STORES_KEY, JSON.stringify(dedupeFavoriteStoreCodes(codes)))
    localStorage.removeItem(MEMBER_FAVORITE_STORE_KEY)
  } catch {
    /* ignore */
  }
}

export function readMemberPortalPromoStoreCodeFromLocalStorage(): string {
  if (typeof window === 'undefined') return ''
  try {
    return String(localStorage.getItem(MEMBER_PROMO_STORE_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function writeMemberPortalPromoStoreCodeToLocalStorage(storeCode: string): void {
  if (typeof window === 'undefined') return
  try {
    const code = String(storeCode || '').trim()
    if (code) localStorage.setItem(MEMBER_PROMO_STORE_KEY, code)
    else localStorage.removeItem(MEMBER_PROMO_STORE_KEY)
  } catch {
    /* ignore */
  }
}

export function clearMemberPortalMemberLocalData(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(MEMBER_FAVORITE_STORES_KEY)
    localStorage.removeItem(MEMBER_FAVORITE_STORE_KEY)
    localStorage.removeItem(MEMBER_PROMO_STORE_KEY)
  } catch {
    /* ignore */
  }
}
