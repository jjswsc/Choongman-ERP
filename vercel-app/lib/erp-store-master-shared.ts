import { todayStrBangkok } from '@/lib/attendance-utils'
import { extractStoreDisplayTail, normStoreKey } from '@/lib/store-list-keys'

const STORE_HEADER_VALUES = new Set(['store', '매장명'])

function isPlaceholderStoreValue(value: unknown): boolean {
  const raw = String(value || '').trim()
  if (!raw) return true
  return STORE_HEADER_VALUES.has(raw.toLowerCase())
}

function resignDateStr(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * getAdminEmployeeList의 normalizedEmployeeStatus와 동일한 기준:
 * 퇴사일이 방콕 기준 오늘보다 미래면 아직 재직으로 간주.
 */
export function isEffectivelyResignedForStaffRollup(
  employmentStatus: unknown,
  resignDate: unknown
): boolean {
  const today = todayStrBangkok()
  const resignStr = resignDateStr(resignDate)
  const raw = String(employmentStatus || '')
    .trim()
    .toLowerCase()
  if (raw === 'active' || raw === 'leave' || raw === 'resigned' || raw === 'suspended') {
    if (raw === 'resigned' && resignStr && resignStr > today) return false
    return raw === 'resigned'
  }
  if (!resignStr) return false
  return resignStr <= today
}

export type ErpStoreMasterRow = {
  store_code: string
  display_name: string
  display_name_ko?: string | null
  display_name_en?: string | null
  display_name_th?: string | null
  aliases?: string[] | null
  sort_order?: number | null
  is_active?: boolean | null
  photo_url?: string | null
  map_query?: string | null
  address?: string | null
}

/** display_name·aliases·code 각각 → norm → store_code */
export function buildLegacyToCanonicalMap(masters: ErpStoreMasterRow[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const row of masters) {
    const code = String(row.store_code || '').trim()
    if (!code) continue
    const keys = [code, String(row.display_name || '').trim(), ...(row.aliases || []).map((a) => String(a || '').trim())]
    for (const k of keys) {
      const nk = normStoreKey(k)
      if (nk) m[nk] = code
      const tail = extractStoreDisplayTail(k)
      if (tail) {
        const nkt = normStoreKey(tail)
        if (nkt) m[nkt] = code
      }
    }
  }
  return m
}

export function storeLabelsFromMasters(masters: ErpStoreMasterRow[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (const row of masters) {
    const code = String(row.store_code || '').trim()
    if (!code) continue
    const dn = String(row.display_name || '').trim() || code
    o[code] = dn
  }
  return o
}

/** employees.store 한 줄을 마스터가 있으면 store_code 로 정규화, 없으면 원문 */
export function legacyEmployeeStoreToCanonicalWithMap(
  empStore: string,
  legacyToCanonical: Record<string, string>,
  usedMaster: boolean
): string {
  const t = String(empStore || '').trim()
  if (!t || !usedMaster) return t
  return legacyToCanonical[normStoreKey(t)] ?? t
}

type EmpRow = {
  store?: string
  name?: string
  nick?: string
  job?: string
  role?: string
  resign_date?: string | null
  employment_status?: string | null
  deleted_at?: string | null
}

function isSoftDeletedEmployee(row: EmpRow): boolean {
  return Boolean(String(row.deleted_at || '').trim())
}

/** 로그인·비밀번호 변경: 제출된 매장 키(보통 store_code)와 employees.store 매칭 */
export function employeeRowsMatchingSubmittedStore<T extends { store?: string }>(
  rows: T[],
  submittedStore: string,
  masters: ErpStoreMasterRow[]
): T[] {
  const submitted = String(submittedStore || '').trim()
  if (!submitted) return []
  const active = (masters || []).filter((m) => m.is_active !== false)
  if (!active.length) {
    return rows.filter((r) => String(r.store || '').trim() === submitted)
  }
  const map = buildLegacyToCanonicalMap(active)
  return rows.filter((r) => {
    const st = String(r.store || '').trim()
    const canon = map[normStoreKey(st)] ?? st
    return canon === submitted || st === submitted
  })
}

export function pickBestEmployeeStoreMatch<T extends { store?: string }>(
  candidates: T[],
  submittedStore: string
): T | undefined {
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]
  const sub = String(submittedStore || '').trim()
  const exact = candidates.find((r) => String(r.store || '').trim() === sub)
  return exact || candidates[0]
}

export type StoreListBuildResult = {
  stores: string[]
  users: Record<string, string[]>
  staffByStore: Record<string, { name: string; nick: string; job?: string; role?: string }[]>
  storeLabels: Record<string, string>
  legacyToCanonical: Record<string, string>
  usedMaster: boolean
}

export function buildStoreListFromEmployees(
  empList: EmpRow[] | null,
  masters: ErpStoreMasterRow[],
  options?: { includeResignedInUserMap?: boolean }
): StoreListBuildResult {
  const activeMasters = (masters || []).filter((m) => m.is_active !== false)
  const usedMaster = activeMasters.length > 0
  const legacyToCanonical = usedMaster ? buildLegacyToCanonicalMap(activeMasters) : {}
  const baseLabels = usedMaster ? storeLabelsFromMasters(activeMasters) : {}

  const userMap: Record<string, string[]> = {}
  const staffByStore: Record<string, { name: string; nick: string; job?: string; role?: string }[]> = {}
  const allKeys = new Set<string>()

  if (usedMaster) {
    for (const m of activeMasters) {
      const c = String(m.store_code || '').trim()
      if (c) allKeys.add(c)
    }
  }

  for (const r of empList || []) {
    const rawStore = String(r.store || '').trim()
    if (isPlaceholderStoreValue(rawStore)) continue
    const key = legacyEmployeeStoreToCanonicalWithMap(rawStore, legacyToCanonical, usedMaster)
    allKeys.add(key)
  }

  const includeResigned = options?.includeResignedInUserMap === true
  for (const r of empList || []) {
    /** soft-delete는 옵션과 무관하게 로그인·스태프 맵에서 제외 */
    if (isSoftDeletedEmployee(r)) continue
    if (!includeResigned && isEffectivelyResignedForStaffRollup(r.employment_status, r.resign_date)) continue
    const rawStore = String(r.store || '').trim()
    if (isPlaceholderStoreValue(rawStore)) continue
    const name = String(r.name || '').trim()
    const nick = String(r.nick || r.name || '').trim() || name
    const job = String(r.job || r.role || '').trim() || undefined
    const role = String(r.role || '').trim().toLowerCase() || undefined
    const key = legacyEmployeeStoreToCanonicalWithMap(rawStore, legacyToCanonical, usedMaster)
    if (!key || !name) continue
    if (!userMap[key]) userMap[key] = []
    userMap[key].push(name)
    if (!staffByStore[key]) staffByStore[key] = []
    staffByStore[key].push({ name, nick, job, role })
  }

  const stores = Array.from(allKeys).filter(Boolean)
  if (usedMaster) {
    const orderIndex = new Map<string, number>()
    activeMasters.forEach((m, i) => {
      const c = String(m.store_code || '').trim()
      if (c) orderIndex.set(c, Number(m.sort_order) || i)
    })
    stores.sort((a, b) => {
      const oa = orderIndex.has(a) ? (orderIndex.get(a) as number) : 9999
      const ob = orderIndex.has(b) ? (orderIndex.get(b) as number) : 9999
      if (oa !== ob) return oa - ob
      const la = (baseLabels[a] || a).localeCompare(baseLabels[b] || b, 'ko')
      return la
    })
  } else {
    stores.sort((a, b) => a.localeCompare(b))
  }

  const storeLabels: Record<string, string> = { ...baseLabels }
  for (const s of stores) {
    if (!storeLabels[s]) storeLabels[s] = s
  }

  return { stores, users: userMap, staffByStore, storeLabels, legacyToCanonical, usedMaster }
}
