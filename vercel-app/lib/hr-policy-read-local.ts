const PREFIX = 'cm_hr_policy_confirmed_v1'

export function hrPolicyConfirmedStorageKey(store: string, name: string): string {
  return `${PREFIX}:${String(store || '').trim()}:${String(name || '').trim()}`
}

export function parseLocalConfirmedHrPolicyIds(raw: string | null | undefined): number[] {
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

export function applyLocalHrPolicyReads<
  T extends { id: number; status: string; needsReconfirm?: boolean },
>(items: T[], confirmedIds: Iterable<number>): T[] {
  const set = new Set(Array.from(confirmedIds, (v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))
  if (set.size === 0) return items
  return items.map((h) =>
    set.has(Number(h.id)) ? { ...h, status: '확인', needsReconfirm: false } : h
  )
}

export function readLocalConfirmedHrPolicyIds(store: string, name: string): number[] {
  if (typeof window === 'undefined') return []
  try {
    return parseLocalConfirmedHrPolicyIds(localStorage.getItem(hrPolicyConfirmedStorageKey(store, name)))
  } catch {
    return []
  }
}

export function addLocalConfirmedHrPolicyId(store: string, name: string, policyId: number): void {
  const id = Number(policyId)
  if (!Number.isFinite(id) || id <= 0) return
  const next = [...new Set([...readLocalConfirmedHrPolicyIds(store, name), id])].slice(-2000)
  try {
    localStorage.setItem(hrPolicyConfirmedStorageKey(store, name), JSON.stringify(next))
  } catch {
    /* quota */
  }
}

export function removeLocalConfirmedHrPolicyId(store: string, name: string, policyId: number): void {
  const id = Number(policyId)
  if (!Number.isFinite(id) || id <= 0) return
  const next = readLocalConfirmedHrPolicyIds(store, name).filter((x) => x !== id)
  try {
    localStorage.setItem(hrPolicyConfirmedStorageKey(store, name), JSON.stringify(next))
  } catch {
    /* quota */
  }
}
