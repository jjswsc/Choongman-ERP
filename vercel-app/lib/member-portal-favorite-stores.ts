export type FavoriteStorePrefPayload =
  | { type: 'favorite_store'; storeCode: string }
  | { type: 'favorite_stores'; storeCodes: string[] }

type MemberNoteRow = {
  note?: string | null
}

export function dedupeFavoriteStoreCodes(codes: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of codes) {
    const code = String(raw || '').trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

function parseFavoriteStoreNote(note: string): FavoriteStorePrefPayload | null {
  const raw = String(note || '').trim()
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as FavoriteStorePrefPayload
    if (j.type === 'favorite_stores' && Array.isArray(j.storeCodes)) {
      return {
        type: 'favorite_stores',
        storeCodes: dedupeFavoriteStoreCodes(j.storeCodes),
      }
    }
    const storeCode = String((j as { storeCode?: string }).storeCode || '').trim()
    if (j.type === 'favorite_store' && storeCode) {
      return { type: 'favorite_store', storeCode }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** member_notes — id desc 순으로 전달 */
export function readFavoriteStoreCodesFromMemberNotes(rows: MemberNoteRow[]): string[] {
  for (const row of rows || []) {
    const parsed = parseFavoriteStoreNote(String(row.note || ''))
    if (parsed?.type === 'favorite_stores') {
      return parsed.storeCodes
    }
  }
  for (const row of rows || []) {
    const parsed = parseFavoriteStoreNote(String(row.note || ''))
    if (parsed?.type === 'favorite_store') {
      return [parsed.storeCode]
    }
  }
  return []
}

export function toggleFavoriteStoreCode(current: string[], storeCode: string): string[] {
  const code = String(storeCode || '').trim()
  if (!code) return current
  if (current.includes(code)) {
    return current.filter((c) => c !== code)
  }
  return [code, ...current.filter((c) => c !== code)]
}

export function buildFavoriteStoresNote(codes: string[]): string {
  return JSON.stringify({
    type: 'favorite_stores',
    storeCodes: dedupeFavoriteStoreCodes(codes),
  })
}

export function sortStoresWithFavoritesFirst<T extends { storeCode: string }>(
  stores: T[],
  favoriteStoreCodes: string[]
): T[] {
  const favOrder = new Map(favoriteStoreCodes.map((code, index) => [code, index]))
  return [...stores].sort((a, b) => {
    const aRank = favOrder.has(a.storeCode) ? (favOrder.get(a.storeCode) as number) : Number.MAX_SAFE_INTEGER
    const bRank = favOrder.has(b.storeCode) ? (favOrder.get(b.storeCode) as number) : Number.MAX_SAFE_INTEGER
    if (aRank !== bRank) return aRank - bRank
    return 0
  })
}
