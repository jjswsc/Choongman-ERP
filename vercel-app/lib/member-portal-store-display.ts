export type MemberPortalStoreDisplayFields = {
  storeCode: string
  displayName: string
  displayNameKo?: string
  displayNameEn?: string
  displayNameTh?: string
}

export function resolveMemberPortalStoreDisplayName(
  store: MemberPortalStoreDisplayFields,
  lang: string
): string {
  const code = String(store.storeCode || '').trim()
  const fallback = String(store.displayName || '').trim() || code
  const l = String(lang || 'ko').trim().toLowerCase()
  if (l === 'ko') return String(store.displayNameKo || '').trim() || fallback
  if (l === 'en') return String(store.displayNameEn || '').trim() || fallback
  if (l === 'th') return String(store.displayNameTh || '').trim() || fallback
  return fallback
}
