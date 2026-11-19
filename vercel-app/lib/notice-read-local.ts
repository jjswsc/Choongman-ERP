const PREFIX = 'cm_notice_confirmed_v1'
/** 매장 문자열 드리프트 대비 — 이름만으로도 로컬 확인분 유지 */
const PREFIX_BY_NAME = 'cm_notice_confirmed_by_name_v1'

export function noticeConfirmedStorageKey(store: string, name: string): string {
  return `${PREFIX}:${String(store || '').trim()}:${String(name || '').trim()}`
}

export function noticeConfirmedByNameStorageKey(name: string): string {
  return `${PREFIX_BY_NAME}:${String(name || '').trim()}`
}

export function parseLocalConfirmedNoticeIds(raw: string | null | undefined): number[] {
  try {
    const arr = JSON.parse(String(raw || '[]')) as unknown
    if (!Array.isArray(arr)) return []
    const ids = arr
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0)
    return [...new Set(ids)].slice(-2000)
  } catch {
    return []
  }
}

export function applyLocalNoticeReads<T extends { id: number; status: string }>(
  items: T[],
  confirmedIds: Iterable<number>
): T[] {
  const set = new Set(Array.from(confirmedIds, (v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))
  if (set.size === 0) return items
  return items.map((n) => (set.has(Number(n.id)) ? { ...n, status: '확인' } : n))
}

export function readLocalConfirmedNoticeIds(store: string, name: string): number[] {
  if (typeof window === 'undefined') return []
  try {
    const byStore = parseLocalConfirmedNoticeIds(
      localStorage.getItem(noticeConfirmedStorageKey(store, name))
    )
    const byName = parseLocalConfirmedNoticeIds(
      localStorage.getItem(noticeConfirmedByNameStorageKey(name))
    )
    return [...new Set([...byStore, ...byName])].slice(-2000)
  } catch {
    return []
  }
}

export function addLocalConfirmedNoticeId(store: string, name: string, noticeId: number): void {
  const id = Number(noticeId)
  if (!Number.isFinite(id) || id <= 0) return
  const next = [...new Set([...readLocalConfirmedNoticeIds(store, name), id])].slice(-2000)
  try {
    localStorage.setItem(noticeConfirmedStorageKey(store, name), JSON.stringify(next))
    localStorage.setItem(noticeConfirmedByNameStorageKey(name), JSON.stringify(next))
  } catch {
    /* quota */
  }
}

export function removeLocalConfirmedNoticeId(store: string, name: string, noticeId: number): void {
  const id = Number(noticeId)
  if (!Number.isFinite(id) || id <= 0) return
  const next = readLocalConfirmedNoticeIds(store, name).filter((x) => x !== id)
  try {
    localStorage.setItem(noticeConfirmedStorageKey(store, name), JSON.stringify(next))
    localStorage.setItem(noticeConfirmedByNameStorageKey(name), JSON.stringify(next))
  } catch {
    /* quota */
  }
}
