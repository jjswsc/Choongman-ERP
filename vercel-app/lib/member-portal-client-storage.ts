/** 회원별로 기기 localStorage에 남기면 안 되는 키 (공용 폰 대비) */
export const MEMBER_FAVORITE_STORE_KEY = 'cm_member_favorite_store'

export function clearMemberPortalMemberLocalData(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(MEMBER_FAVORITE_STORE_KEY)
  } catch {
    /* ignore */
  }
}
