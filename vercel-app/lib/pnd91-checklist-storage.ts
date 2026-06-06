export type Pnd91ChecklistStatus = 'pending' | 'notified' | 'filed'

export type Pnd91ChecklistEntry = {
  status: Pnd91ChecklistStatus
  note?: string
  updatedAt: string
}

const STORAGE_KEY = 'cm_erp_pnd91_checklist_v1'

function scopeKey(year: number, storeFilter: string, employeeKey: string): string {
  const store = String(storeFilter || 'All').trim() || 'All'
  return `${year}|${store}|${employeeKey}`
}

function readAll(): Record<string, Pnd91ChecklistEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Pnd91ChecklistEntry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, Pnd91ChecklistEntry>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function readPnd91ChecklistEntry(
  year: number,
  storeFilter: string,
  employeeKey: string
): Pnd91ChecklistEntry | null {
  const map = readAll()
  return map[scopeKey(year, storeFilter, employeeKey)] || null
}

export function readPnd91ChecklistForScope(
  year: number,
  storeFilter: string
): Record<string, Pnd91ChecklistEntry> {
  const prefix = `${year}|${String(storeFilter || 'All').trim() || 'All'}|`
  const map = readAll()
  const out: Record<string, Pnd91ChecklistEntry> = {}
  for (const [k, v] of Object.entries(map)) {
    if (!k.startsWith(prefix)) continue
    const employeeKey = k.slice(prefix.length)
    if (employeeKey) out[employeeKey] = v
  }
  return out
}

export function writePnd91ChecklistEntry(
  year: number,
  storeFilter: string,
  employeeKey: string,
  status: Pnd91ChecklistStatus,
  note?: string
): void {
  const map = readAll()
  map[scopeKey(year, storeFilter, employeeKey)] = {
    status,
    note: note?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  }
  writeAll(map)
}
